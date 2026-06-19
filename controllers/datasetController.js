const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const Dataset = require('../models/Dataset');
const SalesTransaction = require('../models/SalesTransaction');
const Customer = require('../models/Customer');
const CustomerSegment = require('../models/CustomerSegment');
const Forecast = require('../models/Forecast');
const Insight = require('../models/Insight');

// ─── Helper: Parse CSV file ───────────────────────────────────────────────────
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', (err) => reject(err));
  });
};

// ─── Helper: Normalize CSV row keys to lowercase snake_case ──────────────────
const normalizeKeys = (rows) =>
  rows.map((row) => {
    const normalized = {};
    for (const key of Object.keys(row)) {
      normalized[key.toLowerCase().replace(/\s+/g, '_')] = row[key];
    }
    return normalized;
  });

// ─── Helper: Map CSV row to SalesTransaction ─────────────────────────────────
const mapRowToTransaction = (row, datasetId, index) => ({
  dataset_id: datasetId,
  transaction_id: row.transaction_id || row.order_id || row.id || `TXN-${index}`,
  customer_id: row.customer_id || row.customer || row.client_id || 'UNKNOWN',
  date: new Date(row.date || row.order_date || row.transaction_date),
  product_id: row.product_id || row.sku || null,
  product_name: row.product_name || row.product || row.item || null,
  category: row.category || row.product_category || null,
  quantity: parseFloat(row.quantity || row.qty || 1) || 1,
  unit_price: parseFloat(row.unit_price || row.price || 0) || 0,
  total_amount:
    parseFloat(row.total_amount || row.revenue || row.total || row.amount || 0) ||
    parseFloat(row.quantity || 1) * parseFloat(row.unit_price || row.price || 0),
  region: row.region || row.country || row.location || null,
});

// ─── Helper: Aggregate customers from transactions ────────────────────────────
const aggregateCustomers = (transactions, datasetId) => {
  const map = new Map();

  for (const txn of transactions) {
    const key = txn.customer_id;
    if (!map.has(key)) {
      map.set(key, {
        dataset_id: datasetId,
        customer_id: key,
        total_spent: 0,
        transaction_count: 0,
        last_purchase_date: null,
        avg_order_value: 0,
      });
    }
    const c = map.get(key);
    c.total_spent += txn.total_amount;
    c.transaction_count += 1;
    if (!c.last_purchase_date || txn.date > c.last_purchase_date) {
      c.last_purchase_date = txn.date;
    }
  }

  return Array.from(map.values()).map((c) => ({
    ...c,
    avg_order_value: c.transaction_count > 0 ? c.total_spent / c.transaction_count : 0,
  }));
};

// ─── Helper: Generate plain-English insights ─────────────────────────────────
const generateInsights = (transactions, segments) => {
  const insights = [];
  const now = new Date();

  // Total revenue
  const totalRevenue = transactions.reduce((s, t) => s + t.total_amount, 0);
  insights.push({
    category: 'revenue',
    priority: 'high',
    text: `Total revenue across all transactions is $${totalRevenue.toFixed(2)}.`,
  });

  // Top month
  const monthlyRevenue = {};
  for (const txn of transactions) {
    const key = `${txn.date.getFullYear()}-${String(txn.date.getMonth() + 1).padStart(2, '0')}`;
    monthlyRevenue[key] = (monthlyRevenue[key] || 0) + txn.total_amount;
  }
  const topMonth = Object.entries(monthlyRevenue).sort((a, b) => b[1] - a[1])[0];
  if (topMonth) {
    insights.push({
      category: 'revenue',
      priority: 'medium',
      text: `Best performing month was ${topMonth[0]} with $${topMonth[1].toFixed(2)} in revenue.`,
    });
  }

  // Segment breakdown
  const segmentCounts = segments.reduce((acc, s) => {
    acc[s.segment_name] = (acc[s.segment_name] || 0) + 1;
    return acc;
  }, {});
  const premiumCount = segmentCounts['Premium'] || 0;
  const atRiskCount = segmentCounts['At-Risk'] || 0;

  if (premiumCount > 0) {
    insights.push({
      category: 'customers',
      priority: 'high',
      text: `${premiumCount} Premium customers identified — focus retention strategies on these high-value clients.`,
    });
  }
  if (atRiskCount > 0) {
    insights.push({
      category: 'customers',
      priority: 'high',
      text: `${atRiskCount} At-Risk customers detected — consider re-engagement campaigns to recover potential churn.`,
    });
  }

  // Unique customers
  const uniqueCustomers = new Set(transactions.map((t) => t.customer_id)).size;
  insights.push({
    category: 'customers',
    priority: 'low',
    text: `Dataset contains ${uniqueCustomers} unique customers across ${transactions.length} transactions.`,
  });

  return insights.map((i) => ({ ...i, date: now.toISOString().substring(0, 7) }));
};

// ─── CONTROLLER: Upload CSV ───────────────────────────────────────────────────
// @route   POST /api/datasets/upload
// @access  Private
exports.uploadDataset = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  let dataset;
  try {
    // 1. Save dataset record
    dataset = await Dataset.create({
      user_id: req.user._id,
      file_name: req.file.filename,
      original_name: req.file.originalname,
      file_path: req.file.path,
      file_size: req.file.size,
      status: 'processing',
    });

    res.status(202).json({
      success: true,
      message: 'File uploaded, processing started',
      dataset: { id: dataset._id, status: dataset.status },
    });

    // 2. Parse CSV (async, after response sent)
    const rawRows = await parseCSV(req.file.path);
    const rows = normalizeKeys(rawRows);

    if (rows.length === 0) throw new Error('CSV file is empty or has no valid rows');

    // 3. Map to transactions
    const transactionDocs = rows
      .map((row, i) => mapRowToTransaction(row, dataset._id, i))
      .filter((t) => !isNaN(t.date.getTime()) && t.total_amount >= 0);

    await SalesTransaction.insertMany(transactionDocs, { ordered: false });

    // 4. Aggregate and save customers
    const customerDocs = aggregateCustomers(transactionDocs, dataset._id);
    await Customer.insertMany(customerDocs, { ordered: false });

    // 5. Update dataset meta
    const columns = Object.keys(rows[0]);
    await Dataset.findByIdAndUpdate(dataset._id, {
      row_count: transactionDocs.length,
      columns,
    });

    // 6. Call ML service for clustering + forecasting
    let segments = [];
    let forecasts = [];

    try {
      const mlPayload = {
        dataset_id: dataset._id.toString(),
        customers: customerDocs,
        transactions: transactionDocs.map((t) => ({
          date: t.date.toISOString().substring(0, 10),
          total_amount: t.total_amount,
          customer_id: t.customer_id,
        })),
      };

      const mlResponse = await axios.post(
        `${process.env.ML_SERVICE_URL}/analyze`,
        mlPayload,
        { timeout: 60000 }
      );

      // 7. Save segments
      if (mlResponse.data.segments?.length) {
        const segmentDocs = mlResponse.data.segments.map((s) => ({
          dataset_id: dataset._id,
          customer_id: s.customer_id,
          segment_name: s.segment_name,
          cluster_label: s.cluster_label,
          recency_score: s.recency_score || 0,
          frequency_score: s.frequency_score || 0,
          monetary_score: s.monetary_score || 0,
          score: s.score || 0,
        }));
        segments = await CustomerSegment.insertMany(segmentDocs, { ordered: false });
      }

      // 8. Save forecasts
      if (mlResponse.data.forecasts?.length) {
        const forecastDocs = mlResponse.data.forecasts.map((f) => ({
          dataset_id: dataset._id,
          type: f.type,
          date: new Date(f.date),
          predicted_revenue: f.predicted_revenue,
          lower_bound: f.lower_bound || null,
          upper_bound: f.upper_bound || null,
          model_used: f.model_used || 'linear_regression',
          confidence: f.confidence || null,
        }));
        forecasts = await Forecast.insertMany(forecastDocs, { ordered: false });
      }
    } catch (mlErr) {
      console.error('ML service error (non-fatal):', mlErr.message);
      // Continue — insights can still be generated from local data
    }

    // 9. Generate and save insights
    const insightTexts = generateInsights(transactionDocs, segments);
    if (insightTexts.length) {
      await Insight.insertMany(
        insightTexts.map((i) => ({ ...i, dataset_id: dataset._id })),
        { ordered: false }
      );
    }

    // 10. Mark dataset as completed
    await Dataset.findByIdAndUpdate(dataset._id, { status: 'completed' });
    console.log(`Dataset ${dataset._id} processed successfully`);
  } catch (err) {
    console.error('Dataset processing error:', err.message);
    if (dataset?._id) {
      await Dataset.findByIdAndUpdate(dataset._id, {
        status: 'failed',
        error_message: err.message,
      });
    }
  }
};

// @desc    Get all datasets for logged-in user
// @route   GET /api/datasets
// @access  Private
exports.getDatasets = async (req, res) => {
  try {
    const datasets = await Dataset.find({ user_id: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: datasets.length, data: datasets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get single dataset by ID
// @route   GET /api/datasets/:id
// @access  Private
exports.getDatasetById = async (req, res) => {
  try {
    const dataset = await Dataset.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!dataset) {
      return res.status(404).json({ success: false, message: 'Dataset not found' });
    }
    res.status(200).json({ success: true, data: dataset });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Delete a dataset and all related data
// @route   DELETE /api/datasets/:id
// @access  Private
exports.deleteDataset = async (req, res) => {
  try {
    const dataset = await Dataset.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!dataset) {
      return res.status(404).json({ success: false, message: 'Dataset not found' });
    }

    // Delete file from disk
    if (fs.existsSync(dataset.file_path)) {
      fs.unlinkSync(dataset.file_path);
    }

    // Cascade delete all related documents
    const datasetId = dataset._id;
    await Promise.all([
      SalesTransaction.deleteMany({ dataset_id: datasetId }),
      Customer.deleteMany({ dataset_id: datasetId }),
      CustomerSegment.deleteMany({ dataset_id: datasetId }),
      Forecast.deleteMany({ dataset_id: datasetId }),
      Insight.deleteMany({ dataset_id: datasetId }),
      Dataset.findByIdAndDelete(datasetId),
    ]);

    res.status(200).json({ success: true, message: 'Dataset and all related data deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
