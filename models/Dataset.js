/**
 * Dataset.js
 *
 * Acts as the central link between a User and all their uploaded files.
 * Every CSV a business owner uploads creates one Dataset record, which
 * then anchors all downstream data — transactions, segments, forecasts,
 * and insights — to that specific upload.
 *
 * Tracks the file's metadata (name, size, upload date) and a processing
 * status so the frontend knows when analysis is ready.
 *
 * Relationships:
 *   User    (1) ──uploads──>  (N) Dataset
 *   Dataset (1) ──contains──> (N) SalesTransaction
 *   Dataset (1) ──generates─> (N) CustomerSegment
 *   Dataset (1) ──generates─> (N) Forecast
 *   Dataset (1) ──generates─> (N) Insight
 */

const mongoose = require('mongoose');

const datasetSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    file_name: {
      type: String,
      required: true,
      trim: true,
    },
    original_name: {
      type: String,
      required: true,
    },
    file_path: {
      type: String,
      required: true,
    },
    file_size: {
      type: Number,
      required: true,
    },
    upload_date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'completed', 'failed'],
      default: 'uploaded',
    },
    row_count: {
      type: Number,
      default: 0,
    },
    columns: {
      type: [String],
      default: [],
    },
    error_message: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dataset', datasetSchema);
