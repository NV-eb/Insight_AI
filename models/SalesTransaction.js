/**
 * SalesTransaction.js
 *
 * Stores the raw parsed data rows from a business owner's uploaded CSV,
 * tied to a specific Dataset. Each row in the CSV becomes one
 * SalesTransaction document.
 *
 * This is the foundation of all analytics — customer segmentation,
 * revenue forecasting, and insight generation are all derived from
 * the transaction records stored here.
 *
 * Fields are mapped flexibly from common CSV column name variants
 * (e.g. "order_id", "transaction_id", "qty", "total_amount") so the
 * platform works with real-world sales exports without modification.
 *
 * Relationships:
 *   Dataset (1) ──contains──> (N) SalesTransaction
 */

const mongoose = require('mongoose');

const salesTransactionSchema = new mongoose.Schema(
  {
    dataset_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
    },
    transaction_id: {
      type: String,
      required: true,
    },
    customer_id: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    product_id: {
      type: String,
      default: null,
    },
    product_name: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit_price: {
      type: Number,
      required: true,
      min: 0,
    },
    total_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    region: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for common query patterns
salesTransactionSchema.index({ dataset_id: 1 });
salesTransactionSchema.index({ dataset_id: 1, customer_id: 1 });
salesTransactionSchema.index({ dataset_id: 1, date: 1 });

module.exports = mongoose.model('SalesTransaction', salesTransactionSchema);
