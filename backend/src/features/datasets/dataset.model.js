// backend/src/features/datasets/dataset.model.js
const mongoose = require('mongoose');

const ColumnSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, default: 'string' },
}, { _id: false });

const DatasetSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  gcsPath: {
    type: String,
    required: true,
    unique: true,
  },
  originalFilename: {
      type: String,
      required: true,
  },
  fileSizeBytes: {
      type: Number,
      required: false,
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    index: true,
    default: null,
  },
  schemaInfo: [ColumnSchema],
  columnDescriptions: {
    type: Map,
    of: String,
    default: {},
  },
  isIgnored: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now,
  },
  // --- NEW: Parsed Data Status Fields ---
  parsedDataStatus: {
    type: String,
    enum: ['not_parsed', 'queued', 'processing', 'completed', 'error'],
    default: 'not_parsed',
    index: true,
  },
  parsedDataGridFSId: { // Store the ID of the parsed JSON file in GridFS
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  parsedDataError: { // Store parsing error messages
    type: String,
    default: null,
  },
  // --- END NEW ---
  // Quality audit related fields
  qualityStatus: {
    type: String,
    enum: ['not_run', 'processing', 'ok', 'warning', 'error'],
    default: 'not_run',
    index: true,
  },
  qualityAuditRequestedAt: {
    type: Date,
    default: null,
  },
  qualityAuditCompletedAt: {
    type: Date,
    default: null,
  },
  qualityReport: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  }
});

// Update lastUpdatedAt on save
DatasetSchema.pre('save', function(next) {
  this.lastUpdatedAt = new Date();
  next();
});

module.exports = mongoose.model('Dataset', DatasetSchema);