// backend/src/features/datasets/dataset.model.js
// ** UPDATED FILE - Added quality audit fields **
const mongoose = require('mongoose');

const ColumnSchema = new mongoose.Schema({
    name: { type: String, required: true }, // Original header name
    type: { type: String, default: 'string' }, // Inferred type (keep simple for now)
    // Add more like 'format' later if needed
}, { _id: false });

const DatasetSchema = new mongoose.Schema({
  name: { // User-provided name or filename initially
    type: String,
    required: true,
    trim: true,
  },
  description: { // Optional description added later
    type: String,
    trim: true,
    default: '',
  },
  gcsPath: { // Path within the GCS bucket (e.g., 'user_id/uuid_filename.csv')
    type: String,
    required: true,
    unique: true,
  },
  originalFilename: { // The original name of the uploaded file
      type: String,
      required: true,
  },
  fileSizeBytes: {
      type: Number,
      required: false, // Can be added during metadata creation
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  teamId: { // For team sharing
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    index: true,
    default: null,
  },
  schemaInfo: [ColumnSchema], // Array of columns derived from headers
  columnDescriptions: { // User-provided descriptions (Phase 8)
    type: Map,
    of: String,
    default: {},
  },
  isIgnored: { // Flag to hide dataset from prompt selection maybe?
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
  // NEW: Quality audit related fields
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