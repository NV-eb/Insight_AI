const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    dataset_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
    },
    customer_id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
    // Aggregated RFM metrics (Recency, Frequency, Monetary)
    total_spent: {
      type: Number,
      default: 0,
    },
    transaction_count: {
      type: Number,
      default: 0,
    },
    last_purchase_date: {
      type: Date,
      default: null,
    },
    avg_order_value: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

customerSchema.index({ dataset_id: 1, customer_id: 1 }, { unique: true });

module.exports = mongoose.model('Customer', customerSchema);
