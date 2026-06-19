const mongoose = require('mongoose');

const insightSchema = new mongoose.Schema(
  {
    dataset_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
    },
    date: {
      type: String, // e.g. "2024-06"
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['revenue', 'customers', 'products', 'forecast', 'general'],
      default: 'general',
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
  },
  { timestamps: true }
);

insightSchema.index({ dataset_id: 1 });

module.exports = mongoose.model('Insight', insightSchema);
