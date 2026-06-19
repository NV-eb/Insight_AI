const Dataset = require('../models/Dataset');
const SalesTransaction = require('../models/SalesTransaction');
const Customer = require('../models/Customer');
const CustomerSegment = require('../models/CustomerSegment');
const Forecast = require('../models/Forecast');
const Insight = require('../models/Insight');

// ─── Helper: verify dataset belongs to user ───────────────────────────────────
const verifyDatasetOwnership = async (datasetId, userId) => {
  const dataset = await Dataset.findOne({ _id: datasetId, user_id: userId });
  return dataset;
};

// @desc    Get summary/overview stats for a dataset
// @route   GET /api/analytics/:datasetId/summary
// @access  Private
exports.getSummary = async (req, res) => {
  try {
    const dataset = await verifyDatasetOwnership(req.params.datasetId, req.user._id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const [transactions, customerCount, segmentCounts] = await Promise.all([
      SalesTransaction.find({ dataset_id: dataset._id }),
      Customer.countDocuments({ dataset_id: dataset._id }),
      CustomerSegment.aggregate([
        { $match: { dataset_id: dataset._id } },
        { $group: { _id: '$segment_name', count: { $sum: 1 } } },
      ]),
    ]);

    const totalRevenue = transactions.reduce((s, t) => s + t.total_amount, 0);
    const avgOrderValue = transactions.length > 0 ? totalRevenue / transactions.length : 0;

    // Monthly revenue trend
    const monthlyRevenue = {};
    for (const txn of transactions) {
      const key = `${txn.date.getFullYear()}-${String(txn.date.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue[key] = (monthlyRevenue[key] || 0) + txn.total_amount;
    }
    const revenueTrend = Object.entries(monthlyRevenue)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({ month, revenue: parseFloat(revenue.toFixed(2)) }));

    // Segment breakdown map
    const segments = segmentCounts.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        dataset: { id: dataset._id, name: dataset.original_name, status: dataset.status },
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalTransactions: transactions.length,
        totalCustomers: customerCount,
        avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
        revenueTrend,
        customerSegments: {
          Premium: segments['Premium'] || 0,
          Regular: segments['Regular'] || 0,
          'At-Risk': segments['At-Risk'] || 0,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get customer segments for a dataset
// @route   GET /api/analytics/:datasetId/segments
// @access  Private
exports.getSegments = async (req, res) => {
  try {
    const dataset = await verifyDatasetOwnership(req.params.datasetId, req.user._id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const { segment, page = 1, limit = 50 } = req.query;
    const filter = { dataset_id: dataset._id };
    if (segment) filter.segment_name = segment;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [segments, total] = await Promise.all([
      CustomerSegment.find(filter).skip(skip).limit(parseInt(limit)).sort({ score: -1 }),
      CustomerSegment.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: segments,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get revenue forecasts for a dataset
// @route   GET /api/analytics/:datasetId/forecasts
// @access  Private
exports.getForecasts = async (req, res) => {
  try {
    const dataset = await verifyDatasetOwnership(req.params.datasetId, req.user._id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const { type } = req.query; // 'monthly' | 'quarterly'
    const filter = { dataset_id: dataset._id };
    if (type) filter.type = type;

    const forecasts = await Forecast.find(filter).sort({ date: 1 });

    res.status(200).json({ success: true, count: forecasts.length, data: forecasts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get AI-generated insights for a dataset
// @route   GET /api/analytics/:datasetId/insights
// @access  Private
exports.getInsights = async (req, res) => {
  try {
    const dataset = await verifyDatasetOwnership(req.params.datasetId, req.user._id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const insights = await Insight.find({ dataset_id: dataset._id }).sort({
      priority: 1,
      createdAt: -1,
    });

    res.status(200).json({ success: true, count: insights.length, data: insights });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get top products by revenue for a dataset
// @route   GET /api/analytics/:datasetId/top-products
// @access  Private
exports.getTopProducts = async (req, res) => {
  try {
    const dataset = await verifyDatasetOwnership(req.params.datasetId, req.user._id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const topProducts = await SalesTransaction.aggregate([
      { $match: { dataset_id: dataset._id, product_name: { $ne: null } } },
      {
        $group: {
          _id: '$product_name',
          total_revenue: { $sum: '$total_amount' },
          total_quantity: { $sum: '$quantity' },
          transaction_count: { $sum: 1 },
        },
      },
      { $sort: { total_revenue: -1 } },
      { $limit: parseInt(req.query.limit) || 10 },
      {
        $project: {
          product_name: '$_id',
          total_revenue: { $round: ['$total_revenue', 2] },
          total_quantity: 1,
          transaction_count: 1,
          _id: 0,
        },
      },
    ]);

    res.status(200).json({ success: true, data: topProducts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get revenue by category
// @route   GET /api/analytics/:datasetId/categories
// @access  Private
exports.getRevenueByCategory = async (req, res) => {
  try {
    const dataset = await verifyDatasetOwnership(req.params.datasetId, req.user._id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const categories = await SalesTransaction.aggregate([
      { $match: { dataset_id: dataset._id, category: { $ne: null } } },
      {
        $group: {
          _id: '$category',
          total_revenue: { $sum: '$total_amount' },
          transaction_count: { $sum: 1 },
        },
      },
      { $sort: { total_revenue: -1 } },
      {
        $project: {
          category: '$_id',
          total_revenue: { $round: ['$total_revenue', 2] },
          transaction_count: 1,
          _id: 0,
        },
      },
    ]);

    res.status(200).json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
