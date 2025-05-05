Okay, here are the complete, updated code files reflecting the implementation of parsing datasets after upload and storing the results in MongoDB GridFS, consolidating all changes from the 5 phases of the plan.

**Phase 0: Prerequisites & Setup**

```javascript
// backend/package.json
// (Only showing relevant dependencies section)
{
  "name": "backend",
  "version": "1.0.0",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.26.0",
    "@google-cloud/storage": "^7.15.2",
    "@google-cloud/tasks": "^6.0.1",
    "@google/generative-ai": "^0.24.0",
    "cors": "^2.8.5",
    "date-fns": "^4.1.0",
    "dotenv": "^16.4.7",
    "express": "^5.1.0",
    "firebase-admin": "^13.2.0",
    "google-auth-library": "^9.15.1",
    "lodash": "^4.17.21",
    "mongoose": "^8.13.1",
    "morgan": "^1.10.0",
    "multer": "^1.4.5-lts.2",
    "ajv": "^8.17.1",
    "tiktoken": "^1.0.15",
    "openai": "^4.53.2",
    "papaparse": "^5.5.2",
    "puppeteer": "^24.6.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-syntax-highlighter": "^15.6.1",
    "recharts": "^2.13.0",
    "socket.io": "^4.8.1",
    "socket.io-client": "^4.8.1",
    "uuid": "^11.1.0",
    "xlsx": "^0.18.5",
    "mongodb": "^6.8.0" // Added mongodb driver
  },
  "devDependencies": {
    "nodemon": "^3.1.9"
  }
}
```

```dotenv
# backend/.env
# (Showing relevant additions/existing needed vars)
PORT=5001
MONGODB_URI="mongodb+srv://alexgavrilyuk97:42x1QcCT1kfs8Yqi@cluster0.ktohy8t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
FIREBASE_PROJECT_ID="neuroledger-1a0ed"
GCS_BUCKET_NAME=file_storage_bucket_neuro
OPENAI_API_KEY=...
GEMINI_API_KEY=...
CLAUDE_API_KEY=...
INTERNAL_API_TOKEN="..."
GOOGLE_CLOUD_PROJECT="neuroledger-1a0ed"
GOOGLE_CLOUD_TASKS_LOCATION=europe-west2
GOOGLE_CLOUD_TASKS_QUEUE=neuroledger-quality-audit-queue
QUALITY_WORKER_TARGET_URL=...
CLOUD_TASKS_SERVICE_ACCOUNT=neuroledger-quality-worker@neuroledger-1a0ed.iam.gserviceaccount.com
SERVICE_URL=https://9e4b-2a0c-b381-531-6d00-20a9-6cde-4b8e-bee0.ngrok-free.app # Your backend service URL accessible by Cloud Tasks
CHAT_AI_QUEUE_NAME=neuroledger-chat-ai-queue
FRONTEND_URL=http://localhost:5173

# --- NEW FOR DATASET PARSING ---
DATASET_PARSER_QUEUE=neuroledger-dataset-parser-queue
# DATASET_PARSER_WORKER_URL is usually the same as SERVICE_URL
```

```dotenv
# backend/.env.example
# (Showing relevant additions/existing needed vars)
PORT=5001
MONGODB_URI=
GCS_BUCKET_NAME=
OPENAI_API_KEY=
GEMINI_API_KEY=
CLAUDE_API_KEY=
INTERNAL_API_TOKEN=
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_TASKS_LOCATION=
GOOGLE_CLOUD_TASKS_QUEUE=
QUALITY_WORKER_TARGET_URL=
CLOUD_TASKS_SERVICE_ACCOUNT=
SERVICE_URL=
CHAT_AI_QUEUE_NAME=
FRONTEND_URL=

# --- NEW FOR DATASET PARSING ---
DATASET_PARSER_QUEUE=
```

```javascript
// backend/src/shared/config/index.js
require('dotenv').config();

// Validate essential environment variables
const requiredEnv = [
  'PORT',
  'MONGODB_URI',
  'FIREBASE_PROJECT_ID',
  'GCS_BUCKET_NAME',
  'CLAUDE_API_KEY',
  'SERVICE_URL', // Ensure SERVICE_URL is required for task handlers
  'CLOUD_TASKS_LOCATION',
  'GOOGLE_CLOUD_PROJECT',
  'CLOUD_TASKS_SERVICE_ACCOUNT' // Required for OIDC token generation
];

requiredEnv.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Error: Environment variable ${varName} is missing.`);
    process.exit(1);
  }
});

module.exports = {
  port: process.env.PORT || 5001,
  mongoURI: process.env.MONGODB_URI,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  gcsBucketName: process.env.GCS_BUCKET_NAME,
  claudeApiKey: process.env.CLAUDE_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Cloud Tasks configuration
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  cloudTasksLocation: process.env.CLOUD_TASKS_LOCATION,
  qualityAuditQueueName: process.env.QUALITY_AUDIT_QUEUE || 'neuroledger-quality-audit-queue',
  chatAiQueueName: process.env.CHAT_AI_QUEUE_NAME || 'neuroledger-chat-ai-queue',
  datasetParserQueueName: process.env.DATASET_PARSER_QUEUE || 'neuroledger-dataset-parser-queue', // Added
  cloudTasksServiceAccount: process.env.CLOUD_TASKS_SERVICE_ACCOUNT,
  serviceUrl: process.env.SERVICE_URL, // Base URL of the deployed service

  // Add other configurations as needed
};
```

---

**Phase 1: Background Parsing & GridFS Storage**

```javascript
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
```

```javascript
// backend/src/features/datasets/dataset.parser.service.js
// NEW FILE
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb'); // Use driver's GridFSBucket
const Dataset = require('./dataset.model');
const logger = require('../../shared/utils/logger');
const Papa = require('papaparse');
const XLSX = require('xlsx');
const path = require('path');
const { Readable } = require('stream');
const { getBucket: getGCSBucket } = require('../../shared/external_apis/gcs.client'); // GCS bucket

// Helper to create a readable stream from JSON array for GridFS upload
function jsonArrayStream(dataArray) {
    let index = 0;
    const readable = new Readable({
        read() {
            if (index === 0) this.push('['); // Start JSON array
            if (index < dataArray.length) {
                const obj = dataArray[index];
                const jsonString = JSON.stringify(obj);
                this.push(index === 0 ? jsonString : `,${jsonString}`);
                index++;
            } else {
                this.push(']'); // End JSON array
                this.push(null); // Signal end of stream
            }
        }
    });
    return readable;
}

/**
 * Downloads, parses, and stores dataset content as JSON in GridFS.
 * Updates the Dataset document status and GridFS ID reference.
 * @param {string} datasetId - The ID of the dataset document.
 */
const parseAndStoreDataset = async (datasetId) => {
    logger.info(`[Parser Service] Starting parsing for Dataset ${datasetId}`);
    const dataset = await Dataset.findById(datasetId);
    if (!dataset || !dataset.gcsPath) {
        throw new Error(`Dataset ${datasetId} not found or missing GCS path.`);
    }
    // Allow retrying if status is 'error' or 'not_parsed'
    if (dataset.parsedDataStatus === 'completed') {
        logger.warn(`[Parser Service] Dataset ${datasetId} status is already 'completed', skipping parsing.`);
        return;
    }
    if (dataset.parsedDataStatus === 'processing') {
         logger.warn(`[Parser Service] Dataset ${datasetId} status is already 'processing', skipping duplicate task.`);
         return;
    }

    // Mark as processing
    dataset.parsedDataStatus = 'processing';
    dataset.parsedDataError = null;
    dataset.parsedDataGridFSId = null;
    await dataset.save();

    let parsedData = null;
    const gcsPath = dataset.gcsPath;
    const fileExtension = path.extname(gcsPath).toLowerCase();
    let gridFsFileId = null; // To store the ID for cleanup on error

    try {
        // 1. Download from GCS
        logger.debug(`[Parser Service] Downloading ${gcsPath} from GCS for Dataset ${datasetId}`);
        const bucket = getGCSBucket();
        const file = bucket.file(gcsPath);
        const [exists] = await file.exists();
        if (!exists) {
            throw new Error(`GCS file not found at path: ${gcsPath}`);
        }
        const [buffer] = await file.download();
        logger.debug(`[Parser Service] Downloaded ${buffer.length} bytes for Dataset ${datasetId}`);

        // 2. Parse based on extension
        if (fileExtension === '.csv' || fileExtension === '.tsv') {
            const fileContent = buffer.toString('utf8');
            const result = Papa.parse(fileContent, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                transformHeader: header => header.trim()
            });
            if (result.errors.length > 0) {
                 throw new Error(`CSV parsing errors: ${result.errors.map(e => e.message).join(', ')}`);
            }
            parsedData = result.data;
            logger.debug(`[Parser Service] Parsed CSV for Dataset ${datasetId}, Rows: ${parsedData?.length}`);
        } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) throw new Error('Excel file contains no sheets.');
            const worksheet = workbook.Sheets[firstSheetName];
            // Use sheet_to_json with header: 1 to get array of arrays
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

            if (!rawData || rawData.length < 1) throw new Error('Excel sheet is empty or unreadable.');

            // Convert array of arrays to array of objects using the first row as headers
            const headers = rawData[0].map(h => String(h || '').trim());
            const jsonData = rawData.slice(1).map(row => {
                const obj = {};
                headers.forEach((header, index) => {
                    // Ensure header is valid before assigning
                    if (header) {
                         obj[header] = row[index] !== undefined ? row[index] : null;
                    }
                });
                return obj;
            });
             parsedData = jsonData;
            logger.debug(`[Parser Service] Parsed Excel for Dataset ${datasetId}, Rows: ${parsedData?.length}`);
        } else {
            throw new Error(`Unsupported file type for parsing: ${fileExtension}`);
        }

        if (!parsedData || !Array.isArray(parsedData)) {
            throw new Error('Parsing resulted in invalid data structure.');
        }

        // 3. Stream parsed data to GridFS
        logger.debug(`[Parser Service] Uploading parsed JSON (${parsedData.length} rows) to GridFS for Dataset ${datasetId}`);
        const db = mongoose.connection.db;
        const bucketName = 'parsed_datasets'; // Define a bucket name
        const gridfsBucket = new GridFSBucket(db, { bucketName: bucketName });
        const filename = `${datasetId}.json`; // Use dataset ID as filename

        // Delete existing GridFS file if it exists (e.g., from a previous failed attempt)
        const existingFiles = await gridfsBucket.find({ filename: filename }).toArray();
        for (const existingFile of existingFiles) {
            logger.warn(`[Parser Service] Deleting existing GridFS file ${existingFile._id} for ${filename}`);
            await gridfsBucket.delete(existingFile._id);
        }

        // Create a readable stream from the JSON array
        const sourceStream = jsonArrayStream(parsedData);

        const uploadStream = gridfsBucket.openUploadStream(filename, {
            contentType: 'application/json',
            metadata: { datasetId: datasetId.toString(), originalGcsPath: gcsPath }
        });
        gridFsFileId = uploadStream.id; // Store ID immediately

        await new Promise((resolve, reject) => {
            sourceStream.pipe(uploadStream)
                .on('error', (err) => {
                    logger.error(`[Parser Service] GridFS upload stream error for ${filename}: ${err.message}`);
                    reject(new Error(`GridFS upload failed: ${err.message}`));
                })
                .on('finish', () => {
                    logger.info(`[Parser Service] GridFS upload finished for ${filename}, ID: ${uploadStream.id}`);
                    resolve();
                });
        });

        // 4. Update Dataset Document
        dataset.parsedDataStatus = 'completed';
        dataset.parsedDataGridFSId = gridFsFileId; // Use the stored ID
        dataset.parsedDataError = null;
        // Optionally update schemaInfo based on parsed headers/data here
        // dataset.schemaInfo = ...
        await dataset.save();
        logger.info(`[Parser Service] Dataset ${datasetId} marked as parsing completed. GridFS ID: ${gridFsFileId}`);

    } catch (error) {
        logger.error(`[Parser Service] Failed to parse/store Dataset ${datasetId}: ${error.message}`, error);
        // Attempt to clean up GridFS file if upload started but failed later
        if (gridFsFileId) {
            try {
                const db = mongoose.connection.db;
                const bucket = new GridFSBucket(db, { bucketName: 'parsed_datasets' });
                await bucket.delete(gridFsFileId);
                logger.info(`[Parser Service] Cleaned up GridFS file ${gridFsFileId} after error.`);
            } catch (cleanupError) {
                logger.error(`[Parser Service] Failed to cleanup GridFS file ${gridFsFileId} after error: ${cleanupError.message}`);
            }
        }
        // Update dataset with error status
        try {
            await Dataset.findByIdAndUpdate(datasetId, {
                $set: {
                    parsedDataStatus: 'error',
                    parsedDataError: error.message,
                    parsedDataGridFSId: null // Ensure ID is cleared on error
                }
            });
        } catch (dbError) {
            logger.error(`[Parser Service] CRITICAL: Failed to update dataset ${datasetId} with parsing error: ${dbError.message}`);
        }
        // Re-throw the error for the task handler
        throw error;
    }
};

module.exports = { parseAndStoreDataset };
```

```javascript
// backend/src/features/datasets/dataset.taskHandler.js
// NEW FILE
const { parseAndStoreDataset } = require('./dataset.parser.service');
const logger = require('../../shared/utils/logger');
const Dataset = require('./dataset.model'); // For error status update

/**
 * Handles the worker request from Cloud Tasks for dataset parsing.
 * @param {Object} payload - Task payload containing datasetId.
 */
const workerHandler = async (payload) => {
    const { datasetId } = payload || {};
    logger.info(`[Dataset Task Handler] Parser worker started with payload: ${JSON.stringify(payload)}`);

    if (!datasetId) {
        logger.error('[Dataset Task Handler] Invalid payload: missing datasetId.');
        // Acknowledge the task even if payload is bad to prevent retries
        return;
    }

    try {
        await parseAndStoreDataset(datasetId);
        logger.info(`[Dataset Task Handler] Successfully completed parsing task for dataset ${datasetId}`);
    } catch (error) {
        logger.error(`[Dataset Task Handler] Parsing failed for dataset ${datasetId}: ${error.message}`);
        // The service already attempts to update the status, but log here too.
        // IMPORTANT: Do NOT re-throw the error here, otherwise Cloud Tasks might retry indefinitely.
        // The error state is saved in the Dataset document.
    }
};

module.exports = { workerHandler };
```

```javascript
// backend/src/features/datasets/dataset.controller.js
const datasetService = require('./dataset.service');
const logger = require('../../shared/utils/logger');
const mongoose = require('mongoose');
const { createTask } = require('../../shared/services/cloudTasks.service'); // Import task creator
const config = require('../../shared/config'); // Import config
const { workerHandler: datasetParserWorkerHandler } = require('./dataset.taskHandler'); // Import the new handler

// getUploadUrl (no changes)
const getUploadUrl = async (req, res, next) => {
    const { filename, fileSize } = req.query;
    if (!filename) return res.status(400).json({ status: 'error', message: 'Filename query parameter is required.' });
    if (!fileSize || isNaN(parseInt(fileSize)) || parseInt(fileSize) <= 0) return res.status(400).json({ status: 'error', message: 'Valid FileSize query parameter is required.' });
    try {
        const userId = req.user._id;
        const result = await datasetService.generateUploadUrl(userId, filename, fileSize);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        if (error.message === 'Valid file size is required to generate upload URL.') return res.status(400).json({ status: 'error', message: error.message });
        next(error);
    }
};

// createDataset (Metadata creation after direct GCS upload)
const createDataset = async (req, res, next) => {
    const { name, gcsPath, originalFilename, fileSizeBytes, teamId } = req.body;
    if (!gcsPath || !originalFilename) return res.status(400).json({ status: 'error', message: 'gcsPath and originalFilename are required.' });
    try {
        const userId = req.user._id;
        const datasetData = { name, gcsPath, originalFilename, fileSizeBytes, teamId };
        // Service now just creates metadata with 'not_parsed' status
        const newDataset = await datasetService.createDatasetMetadata(userId, datasetData);

        // --- TRIGGER PARSING TASK ---
        if (newDataset?._id) {
            const payload = { datasetId: newDataset._id.toString() };
            try {
                await createTask(config.datasetParserQueueName, '/internal/datasets/parse-worker', payload);
                 // Update status to 'queued' after task creation
                 await require('./dataset.model').findByIdAndUpdate(newDataset._id, { parsedDataStatus: 'queued' });
                 logger.info(`[Controller:createDataset] Parsing task queued for dataset ${newDataset._id}`);
            } catch (taskError) {
                 logger.error(`[Controller:createDataset] Failed to queue parsing task for dataset ${newDataset._id}: ${taskError.message}`);
                 // Mark dataset as error if task queueing fails
                 await require('./dataset.model').findByIdAndUpdate(newDataset._id, { parsedDataStatus: 'error', parsedDataError: 'Failed to queue parsing task.' });
            }
        }
        // --- END TRIGGER ---

        res.status(201).json({ status: 'success', data: newDataset });
    } catch (error) {
         // Handle specific errors from service (like permission denied)
         if (error.message === 'You are not a member of this team' || error.message === 'Only team admins can upload datasets to a team') {
             return res.status(403).json({ status: 'error', message: error.message });
         }
         logger.error(`[Controller:createDataset] Error: ${error.message}`, error);
        next(error);
    }
};

// listDatasets (no changes)
const listDatasets = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const datasets = await datasetService.listDatasetsByUser(userId);
        res.status(200).json({ status: 'success', data: datasets });
    } catch (error) {
        next(error);
    }
};

// getReadUrl (no changes)
const getReadUrl = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' }); }
    try {
        const dataset = await require('./dataset.model').findOne({ _id: id, ownerId: userId }).lean();
        if (!dataset) { logger.warn(`User ${userId} attempted to get read URL for inaccessible dataset ID: ${id}`); return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' }); }
        if (!dataset.gcsPath) { logger.error(`Dataset ${id} found but missing gcsPath for user ${userId}.`); return res.status(500).json({ status: 'error', message: 'Dataset configuration error.' }); }
        const signedUrl = await datasetService.getSignedUrlForDataset(dataset.gcsPath);
        if (!signedUrl) { throw new Error('Failed to generate read URL.'); }
        res.status(200).json({ status: 'success', data: { signedUrl } });
    } catch (error) {
         if (error.message.includes('Dataset file not found')) { return res.status(404).json({ status: 'error', message: error.message }); }
         logger.error(`Error generating read URL for dataset ${id}, user ${userId}: ${error.message}`);
         next(error);
    }
};

// getDataset (no changes)
const getDataset = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' }); }
    try {
        const TeamMember = require('../teams/team-member.model');
        const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
        const teamIds = teamMemberships.map(tm => tm.teamId);
        const dataset = await require('./dataset.model').findOne({ _id: id, $or: [{ ownerId: userId }, { teamId: { $in: teamIds } }] });
        if (!dataset) { logger.warn(`User ${userId} attempted to access inaccessible dataset ID: ${id}`); return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' }); }
        res.status(200).json({ status: 'success', data: dataset });
    } catch (error) {
        logger.error(`Error fetching dataset ${id} for user ${userId}: ${error.message}`);
        next(error);
    }
};

// getSchema (no changes)
const getSchema = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' }); }
    try {
        const TeamMember = require('../teams/team-member.model');
        const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
        const teamIds = teamMemberships.map(tm => tm.teamId);
        const dataset = await require('./dataset.model').findOne({ _id: id, $or: [{ ownerId: userId }, { teamId: { $in: teamIds } }] });
        if (!dataset) { logger.warn(`User ${userId} attempted to access schema for inaccessible dataset ID: ${id}`); return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' }); }
        res.status(200).json({ status: 'success', data: { schemaInfo: dataset.schemaInfo || [], columnDescriptions: dataset.columnDescriptions || {}, description: dataset.description || '' } });
    } catch (error) {
        logger.error(`Error fetching schema for dataset ${id}, user ${userId}: ${error.message}`);
        next(error);
    }
};

// updateDataset (no changes)
const updateDataset = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    const { columnDescriptions, description, schemaInfo } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' }); }
    try {
        const TeamMember = require('../teams/team-member.model');
        const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
        const teamIds = teamMemberships.map(tm => tm.teamId);
        const dataset = await require('./dataset.model').findOne({ _id: id, $or: [{ ownerId: userId }, { teamId: { $in: teamIds } }] });
        if (!dataset) { logger.warn(`User ${userId} attempted to update inaccessible dataset ID: ${id}`); return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' }); }
        if (columnDescriptions !== undefined) dataset.columnDescriptions = columnDescriptions;
        if (description !== undefined) dataset.description = description;
        if (schemaInfo !== undefined) {
            if (!Array.isArray(schemaInfo)) return res.status(400).json({ status: 'error', message: 'schemaInfo must be an array' });
            for (const item of schemaInfo) {
                if (!item.name || typeof item.name !== 'string') return res.status(400).json({ status: 'error', message: 'Each schema item must have a name property of type string' });
                if (!item.type || typeof item.type !== 'string') return res.status(400).json({ status: 'error', message: 'Each schema item must have a type property of type string' });
            }
            const originalColumnNames = dataset.schemaInfo.map(col => col.name);
            const newColumnNames = schemaInfo.map(col => col.name);
            const missingColumns = originalColumnNames.filter(name => !newColumnNames.includes(name));
            if (missingColumns.length > 0) return res.status(400).json({ status: 'error', message: `Cannot remove existing columns. Missing columns: ${missingColumns.join(', ')}` });
            dataset.schemaInfo = schemaInfo;
        }
        dataset.lastUpdatedAt = new Date();
        await dataset.save();
        logger.info(`User ${userId} updated dataset ${id} with context, column descriptions, and/or schema info`);
        res.status(200).json({ status: 'success', data: dataset });
    } catch (error) {
        logger.error(`Error updating dataset ${id} for user ${userId}: ${error.message}`);
        next(error);
    }
};

// deleteDataset (no changes needed in controller, service handles logic)
const deleteDataset = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' }); }
    try {
        await datasetService.deleteDatasetById(id, userId);
        logger.info(`User ${userId} successfully initiated deletion for dataset ${id}`);
        res.status(200).json({ status: 'success', message: 'Dataset deleted successfully' });
    } catch (error) {
        if (error.message === 'Dataset not found or not accessible.' || error.message.includes('permission to delete')) {
            return res.status(error.message.includes('permission') ? 403 : 404).json({ status: 'error', message: error.message });
        }
        logger.error(`Error deleting dataset ${id} via controller: ${error.message}`);
        next(error);
    }
};

// proxyUpload (Modified to trigger parsing task)
const proxyUpload = async (req, res, next) => {
    try {
        if (!req.file) { return res.status(400).json({ status: 'error', message: 'No file provided' }); }
        const userId = req.user._id;
        const { teamId } = req.body;
        const file = req.file;
        const { v4: uuidv4 } = require('uuid');
        const uniqueFilename = `${uuidv4()}-${file.originalname}`;
        const gcsPath = `${userId}/${uniqueFilename}`;
        const { getBucket } = require('../../shared/external_apis/gcs.client');
        const bucket = getBucket();
        const blob = bucket.file(gcsPath);
        const blobStream = blob.createWriteStream({ resumable: false, contentType: file.mimetype });

        blobStream.on('error', (error) => {
            logger.error(`Error uploading to GCS via proxy: ${error}`);
            if (!res.headersSent) { res.status(500).json({ status: 'error', message: 'Error uploading file to storage' }); }
            else { logger.error(`Headers already sent before GCS error for ${gcsPath}`); }
        });

        blobStream.on('finish', async () => {
            logger.info(`GCS upload finished via proxy for ${gcsPath}`);
            try {
                const datasetData = {
                    name: file.originalname, gcsPath, originalFilename: file.originalname,
                    fileSizeBytes: file.size, teamId: teamId || null
                };
                // Service creates metadata with 'not_parsed' status
                const newDataset = await datasetService.createDatasetMetadata(userId, datasetData);

                 // --- TRIGGER PARSING TASK ---
                 if (newDataset?._id) {
                    const payload = { datasetId: newDataset._id.toString() };
                    try {
                        await createTask(config.datasetParserQueueName, '/internal/datasets/parse-worker', payload);
                         // Update status to 'queued' after task creation
                         await require('./dataset.model').findByIdAndUpdate(newDataset._id, { parsedDataStatus: 'queued' });
                         logger.info(`[Controller:proxyUpload] Parsing task queued for dataset ${newDataset._id}`);
                    } catch (taskError) {
                         logger.error(`[Controller:proxyUpload] Failed to queue parsing task for dataset ${newDataset._id}: ${taskError.message}`);
                         await require('./dataset.model').findByIdAndUpdate(newDataset._id, { parsedDataStatus: 'error', parsedDataError: 'Failed to queue parsing task.' });
                    }
                 }
                 // --- END TRIGGER ---

                 if (!res.headersSent) { res.status(201).json({ status: 'success', data: newDataset }); }

            } catch (err) {
                 if (err.message === 'You are not a member of this team' || err.message === 'Only team admins can upload datasets to a team') {
                     if (!res.headersSent) res.status(403).json({ status: 'error', message: err.message });
                 } else {
                     logger.error(`Error creating dataset metadata after proxy upload for ${gcsPath}: ${err}`);
                      if (!res.headersSent) res.status(500).json({ status: 'error', message: err.message || 'Error creating dataset metadata' });
                 }
             }
        });
        blobStream.end(req.file.buffer);
    } catch (error) {
        logger.error(`Error in proxy upload controller: ${error}`);
        next(error);
    }
};

// NEW: Worker request handler
const handleParserWorkerRequest = async (req, res, next) => {
     try {
         // Acknowledge Cloud Task immediately
         res.status(200).json({ status: 'success', message: 'Task received for parsing.' });
         // Process asynchronously
         setImmediate(async () => {
             try {
                 await datasetParserWorkerHandler(req.body);
             } catch (workerError) {
                 logger.error(`[Controller:handleParserWorkerRequest] Async worker handler failed: ${workerError.message}`);
                 // Error should be handled within workerHandler to update DB status
             }
         });
     } catch (error) {
          logger.error(`[Controller:handleParserWorkerRequest] Error handling worker request: ${error.message}`);
          // Even if this fails, send 200 to task queue if possible, worker logic handles DB state
          if (!res.headersSent) {
              res.status(200).json({ status: 'error', message: 'Error receiving task, but acknowledged.' });
          }
     }
};

module.exports = {
    getUploadUrl,
    createDataset,
    listDatasets,
    getReadUrl,
    getDataset,
    getSchema,
    updateDataset,
    deleteDataset,
    proxyUpload,
    handleParserWorkerRequest, // Add new handler
};
```

```javascript
// backend/src/features/datasets/dataset.service.js
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb'); // Import GridFSBucket
const Dataset = require('./dataset.model');
const TeamMember = require('../teams/team-member.model'); // For access check
const Team = require('../teams/team.model'); // Import Team model for population
const logger = require('../../shared/utils/logger');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getBucket: getGCSBucket } = require('../../shared/external_apis/gcs.client');
const Papa = require('papaparse');
const XLSX = require('xlsx');

const SIGNED_URL_UPLOAD_EXPIRATION = 15 * 60 * 1000; // 15 minutes
const SIGNED_URL_READ_EXPIRATION = 5 * 60 * 1000; // 5 minutes for reads

/**
 * Generates a unique GCS path and a signed URL for uploading a file (PUT).
 */
const generateUploadUrl = async (userId, originalFilename, fileSize) => {
    if (!fileSize || isNaN(parseInt(fileSize)) || parseInt(fileSize) <= 0) {
        logger.error(`Invalid fileSize provided for upload URL generation: ${fileSize}`);
        throw new Error('Valid file size is required to generate upload URL.');
    }
    const fileSizeNum = parseInt(fileSize);
    const bucket = getGCSBucket();
    const uniqueFilename = `${uuidv4()}-${originalFilename}`;
    const gcsPath = `${userId}/${uniqueFilename}`;
    try {
        const options = {
            version: 'v4', action: 'write', expires: Date.now() + SIGNED_URL_UPLOAD_EXPIRATION,
            contentLengthRange: { min: fileSizeNum, max: fileSizeNum }, method: 'PUT',
            origin: '*', responseDisposition: 'inline', responseType: 'application/json',
        };
        const [url] = await bucket.file(gcsPath).getSignedUrl(options);
        logger.info(`Generated v4 PUT signed URL for user ${userId}, path: ${gcsPath}, size: ${fileSizeNum}`);
        return { signedUrl: url, gcsPath: gcsPath };
    } catch (error) {
        logger.error(`Failed to generate PUT signed URL for ${gcsPath}:`, error);
        throw new Error('Could not generate upload URL.');
    }
};

/**
 * Generates a signed URL for reading a file (GET).
 */
const getSignedUrlForDataset = async (gcsPath) => {
     if (!gcsPath) { logger.warn("Attempted to get signed read URL for empty GCS path."); throw new Error("Cannot generate read URL: Dataset path is missing."); }
     const bucket = getGCSBucket();
     const file = bucket.file(gcsPath);
     try {
         const [exists] = await file.exists();
         if (!exists) { logger.warn(`Attempted to get read URL for non-existent file: ${gcsPath}`); throw new Error(`Dataset file not found at path: ${gcsPath}`); }
         const options = { version: 'v4', action: 'read', expires: Date.now() + SIGNED_URL_READ_EXPIRATION };
         const [url] = await file.getSignedUrl(options);
         logger.debug(`Generated v4 READ signed URL for path: ${gcsPath}`);
         return url;
     } catch (error) {
         logger.error(`Failed to generate READ signed URL for ${gcsPath}: ${error.message}`);
         if (error.message.includes('Dataset file not found')) throw error;
         throw new Error(`Could not generate read URL for dataset: ${gcsPath}. Reason: ${error.message}`);
     }
 };

/**
 * Parses headers from a file stored in GCS.
 * Used by quality audit or potentially schema update logic.
 */
const parseHeadersFromGCS = async (gcsPath) => {
    const bucket = getGCSBucket();
    const file = bucket.file(gcsPath);
    const MAX_HEADER_READ_BYTES = 1024 * 10;
    logger.debug(`Parsing headers for gcsPath: ${gcsPath}`);
    try {
        const [exists] = await file.exists();
        if (!exists) { logger.error(`File not found for header parsing: ${gcsPath}`); throw new Error(`Dataset file not found at path: ${gcsPath}`); }
        const [buffer] = await file.download({ start: 0, end: MAX_HEADER_READ_BYTES });
        const fileContent = buffer.toString('utf8');
        const fileExtension = path.extname(gcsPath).toLowerCase();
        let headers = [];
        if (fileExtension === '.csv' || fileExtension === '.tsv') {
            const parsed = Papa.parse(fileContent, { header: true, preview: 1, skipEmptyLines: true });
            if (parsed.meta?.fields?.length > 0) headers = parsed.meta.fields;
            else if (parsed.data?.[0]?.length > 0) headers = parsed.data[0];
             logger.debug(`CSV headers parsed: ${headers.length}`);
        } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
            const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
            const firstSheetName = workbook.SheetNames[0];
            if (firstSheetName) {
                const worksheet = workbook.Sheets[firstSheetName];
                const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                if (data?.[0]?.length > 0) headers = data[0].map(header => String(header).trim());
                 logger.debug(`Excel headers parsed: ${headers.length}`);
            }
        } else { logger.warn(`Unsupported file type for header parsing: ${fileExtension}`); }
        const validHeaders = headers.filter(h => h && typeof h === 'string' && h.trim() !== '');
        logger.info(`Found ${validHeaders.length} valid headers for ${gcsPath}`);
        return validHeaders;
    } catch (error) {
        logger.error(`Failed to parse headers for ${gcsPath}:`, error);
         if (error.message.includes('Dataset file not found')) throw error;
        return [];
    }
};

/**
 * Create dataset metadata document. Does NOT parse headers anymore.
 */
const createDatasetMetadata = async (userId, datasetData) => {
    const { name, gcsPath, originalFilename, fileSizeBytes, teamId } = datasetData;

    // Permission check for team uploads
    if (teamId) {
        const teamMember = await TeamMember.findOne({ teamId, userId }).lean();
        if (!teamMember) { logger.error(`User ${userId} attempted to create dataset for team ${teamId} without membership`); throw new Error('You are not a member of this team'); }
        if (teamMember.role !== 'admin') { logger.error(`User ${userId} attempted to create dataset for team ${teamId} without admin role`); throw new Error('Only team admins can upload datasets to a team'); }
    }

    const dataset = new Dataset({
        name: name || originalFilename,
        gcsPath,
        originalFilename,
        fileSizeBytes,
        ownerId: userId,
        teamId: teamId || null,
        schemaInfo: [], // Schema initially empty
        columnDescriptions: {}, // Start empty
        parsedDataStatus: 'not_parsed', // Initial status
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
    });

    try {
        const savedDataset = await dataset.save();
        logger.info(`Dataset metadata saved (parsing queued) for user ${userId}${teamId ? `, team ${teamId}` : ''}, GCS path: ${gcsPath}, DB ID: ${savedDataset._id}`);
        return savedDataset.toObject();
    } catch (error) {
        logger.error(`Failed to save dataset metadata for ${gcsPath}:`, error);
        if (error.code === 11000) throw new Error('Dataset with this path might already exist.');
        throw new Error('Could not save dataset information.');
    }
};

/**
 * List datasets the user has access to (personal + team).
 */
const listDatasetsByUser = async (userId) => {
    try {
        const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
        const teamIds = teamMemberships.map(tm => tm.teamId);
        const personalDatasets = await Dataset.find({ ownerId: userId, teamId: null }).sort({ createdAt: -1 }).lean();
        const teamDatasets = await Dataset.find({ teamId: { $in: teamIds } }).populate('teamId', 'name').sort({ createdAt: -1 }).lean();
        const datasetsWithTeamInfo = [
            ...personalDatasets.map(ds => ({ ...ds, isTeamDataset: false, teamName: null })),
            ...teamDatasets.map(ds => ({ ...ds, isTeamDataset: true, teamName: ds.teamId ? ds.teamId.name : null }))
        ];
        datasetsWithTeamInfo.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        logger.debug(`Found ${datasetsWithTeamInfo.length} datasets for user ${userId} (including team datasets)`);
        return datasetsWithTeamInfo;
    } catch (error) {
        logger.error(`Failed to list datasets for user ${userId}:`, error);
        throw new Error('Could not retrieve datasets.');
    }
};

/**
 * Get dataset schema, description, and column descriptions.
 */
const getDatasetSchema = async (datasetId, userId) => {
    const dataset = await Dataset.findById(datasetId).select('schemaInfo columnDescriptions description ownerId teamId').lean();
     if (!dataset) throw new Error('Dataset not found');
    // Access Check (owner or team member)
    let hasAccess = false;
    if (dataset.ownerId.toString() === userId.toString()) { hasAccess = true; }
    else if (dataset.teamId) { const teamMember = await TeamMember.findOne({ teamId: dataset.teamId, userId }).lean(); if (teamMember) hasAccess = true; }
    if (!hasAccess) throw new Error('Access denied');
    return { schemaInfo: dataset.schemaInfo || [], columnDescriptions: dataset.columnDescriptions || {}, description: dataset.description || '' };
};

/**
 * Retrieves and parses dataset content stored as JSON in GridFS.
 * Performs access control check.
 * @param {string} datasetId - The ID of the dataset.
 * @param {string} userId - The ID of the user requesting the data.
 * @returns {Promise<Array<object>|null>} - The parsed data array or null if not found/error.
 * @throws {Error} If access denied or other critical error.
 */
const getParsedDataFromStorage = async (datasetId, userId) => {
    logger.info(`[Service:getParsedData] Request for dataset ${datasetId} by user ${userId}`);
    const dataset = await Dataset.findById(datasetId).select('ownerId teamId parsedDataStatus parsedDataGridFSId parsedDataError').lean();

    if (!dataset) throw new Error(`Dataset ${datasetId} not found.`);

    // Access Check
    let hasAccess = false;
    if (dataset.ownerId.toString() === userId.toString()) { hasAccess = true; }
    else if (dataset.teamId) { const teamMember = await TeamMember.findOne({ teamId: dataset.teamId, userId }).lean(); if (teamMember) hasAccess = true; }
    if (!hasAccess) throw new Error(`User ${userId} access denied for dataset ${datasetId}.`);

    // Status Check
    if (dataset.parsedDataStatus !== 'completed' || !dataset.parsedDataGridFSId) {
         logger.warn(`[Service:getParsedData] Parsed data not ready for ${datasetId}. Status: ${dataset.parsedDataStatus}, GridFS ID: ${dataset.parsedDataGridFSId}`);
         if(dataset.parsedDataStatus === 'error') { throw new Error(`Dataset ${datasetId} failed previous parsing attempt: ${dataset.parsedDataError || 'Unknown parsing error'}`); }
         throw new Error(`Dataset ${datasetId} parsing is not complete (Status: ${dataset.parsedDataStatus}). Please wait or check for errors.`);
    }

    // Download and Parse from GridFS
    try {
        logger.debug(`[Service:getParsedData] Downloading GridFS file ${dataset.parsedDataGridFSId} for dataset ${datasetId}`);
        const db = mongoose.connection.db;
        const bucketName = 'parsed_datasets';
        const bucket = new GridFSBucket(db, { bucketName: bucketName });
        const downloadStream = bucket.openDownloadStream(dataset.parsedDataGridFSId);

        let jsonData = '';
        for await (const chunk of downloadStream) { jsonData += chunk.toString('utf8'); }

        logger.debug(`[Service:getParsedData] Downloaded ${jsonData.length} bytes from GridFS for dataset ${datasetId}. Parsing JSON...`);
        const parsedResult = JSON.parse(jsonData);

        if (!Array.isArray(parsedResult)) { throw new Error('Parsed data from GridFS is not a valid JSON array.'); }

        logger.info(`[Service:getParsedData] Successfully retrieved and parsed ${parsedResult.length} rows for dataset ${datasetId} from GridFS.`);
        return parsedResult;

    } catch (error) {
        logger.error(`[Service:getParsedData] Failed to retrieve/parse GridFS data for dataset ${datasetId} (GridFS ID: ${dataset.parsedDataGridFSId}): ${error.message}`, error);
         await Dataset.findByIdAndUpdate(datasetId, { parsedDataStatus: 'error', parsedDataError: `Failed to read stored parsed data: ${error.message}`});
        throw new Error(`Failed to retrieve stored parsed data for dataset ${datasetId}. It may be corrupted.`);
    }
};

/**
 * Delete a dataset and its corresponding GCS file AND GridFS parsed data file.
 */
const deleteDatasetById = async (datasetId, userId) => {
    const dataset = await Dataset.findById(datasetId);
    if (!dataset) { throw new Error('Dataset not found or not accessible.'); }

    // Permission Check (Owner or Team Admin)
     let hasPermission = false;
     if (dataset.ownerId.toString() === userId.toString()) { hasPermission = true; }
     else if (dataset.teamId) { const teamMember = await TeamMember.findOne({ teamId: dataset.teamId, userId, role: 'admin' }); if (teamMember) hasPermission = true; }
     if (!hasPermission) { throw new Error('You do not have permission to delete this dataset.'); }

    // Delete Parsed Data from GridFS (if exists)
    if (dataset.parsedDataGridFSId) {
        logger.info(`[Service:deleteDataset] Attempting to delete parsed data GridFS file ${dataset.parsedDataGridFSId} for dataset ${datasetId}`);
        try {
            const db = mongoose.connection.db;
            const bucketName = 'parsed_datasets';
            const bucket = new GridFSBucket(db, { bucketName: bucketName });
            await bucket.delete(dataset.parsedDataGridFSId);
            logger.info(`[Service:deleteDataset] Successfully deleted parsed data GridFS file ${dataset.parsedDataGridFSId}`);
        } catch (gridfsError) {
            if (gridfsError.code === 'ENOENT' || gridfsError.message?.includes('File not found')) { logger.warn(`[Service:deleteDataset] Parsed data GridFS file ${dataset.parsedDataGridFSId} not found during deletion attempt.`); }
            else { logger.error(`[Service:deleteDataset] Error deleting parsed data GridFS file ${dataset.parsedDataGridFSId}: ${gridfsError.message}`, gridfsError); }
        }
    }

    // Delete Original File from GCS (existing logic)
    if (dataset.gcsPath) {
        logger.info(`[Service:deleteDataset] Attempting to delete original GCS file ${dataset.gcsPath} for dataset ${datasetId}`);
        const gcsBucket = getGCSBucket();
        const file = gcsBucket.file(dataset.gcsPath);
        try {
            const [exists] = await file.exists();
            if (exists) { await file.delete(); logger.info(`[Service:deleteDataset] GCS file deleted: ${dataset.gcsPath}`); }
            else { logger.warn(`[Service:deleteDataset] Original GCS file not found during deletion: ${dataset.gcsPath}`); }
        } catch (gcsError) { logger.error(`[Service:deleteDataset] Error deleting GCS file ${dataset.gcsPath}:`, gcsError); }
    }

    // Delete Dataset Document from MongoDB
    try {
         logger.info(`[Service:deleteDataset] Deleting Dataset document ${datasetId}`);
         await Dataset.findByIdAndDelete(datasetId);
         logger.info(`[Service:deleteDataset] Dataset document ${datasetId} deleted by user ${userId}`);
         return true;
    } catch (dbError) {
         logger.error(`[Service:deleteDataset] Error deleting Dataset document ${datasetId}:`, dbError);
         throw new Error(`Failed to delete dataset metadata: ${dbError.message}`);
    }
};

// Keep getRawDatasetContent if used elsewhere (e.g., quality audit)
const getRawDatasetContent = async (datasetId, userId) => {
    logger.debug(`Attempting to fetch raw content for dataset ${datasetId} by user ${userId}`);
    const dataset = await Dataset.findById(datasetId).lean();
    if (!dataset) { logger.warn(`Dataset not found: ${datasetId}`); throw new Error('Dataset not found.'); }
    let hasAccess = false;
    if (dataset.ownerId.toString() === userId.toString()) { hasAccess = true; }
    else if (dataset.teamId) { const teamMember = await TeamMember.findOne({ teamId: dataset.teamId, userId }).lean(); if (teamMember) hasAccess = true; }
    if (!hasAccess) { logger.warn(`User ${userId} access denied for dataset ${datasetId}.`); throw new Error('Access denied to this dataset.'); }
    if (!dataset.gcsPath) { logger.error(`Dataset ${datasetId} is missing GCS path.`); throw new Error('Dataset file path is missing.'); }
    try {
        const bucket = getGCSBucket();
        const file = bucket.file(dataset.gcsPath);
        const [exists] = await file.exists();
        if (!exists) { logger.error(`GCS file not found for dataset ${datasetId} at path: ${dataset.gcsPath}`); throw new Error(`Dataset file not found at path: ${dataset.gcsPath}`); }
        const [buffer] = await file.download();
        const content = buffer.toString('utf8');
        logger.info(`Successfully fetched raw content for dataset ${datasetId} (Size: ${Buffer.byteLength(content, 'utf8')} bytes)`);
        return content;
    } catch (fetchErr) {
        logger.error(`Failed to fetch GCS content for dataset ${datasetId} (Path: ${dataset.gcsPath}): ${fetchErr.message}`, { fetchErr });
        throw new Error(`Failed to retrieve dataset content: ${fetchErr.message}`);
    }
};

module.exports = {
    generateUploadUrl,
    createDatasetMetadata,
    listDatasetsByUser,
    getDatasetSchema,
    parseHeadersFromGCS, // Export if needed elsewhere
    getSignedUrlForDataset,
    deleteDatasetById,
    getRawDatasetContent, // Export if needed elsewhere
    getParsedDataFromStorage, // Export new function
};
```

```javascript
// backend/src/features/datasets/dataset.routes.js
const express = require('express');
const datasetController = require('./dataset.controller');
const { protect } = require('../../shared/middleware/auth.middleware');
const { requireActiveSubscription } = require('../../shared/middleware/subscription.guard');
const { validateCloudTaskToken } = require('../../shared/middleware/cloudTask.middleware'); // Import task token validator
const multer = require('multer');

const router = express.Router();
const internalRouter = express.Router(); // Create separate internal router

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Public routes (existing)
router.use(protect);
router.use(requireActiveSubscription);
router.get('/upload-url', datasetController.getUploadUrl);
router.post('/', datasetController.createDataset); // Triggers task
router.post('/proxy-upload', upload.single('file'), datasetController.proxyUpload); // Triggers task
router.get('/', datasetController.listDatasets);
router.get('/:id/read-url', datasetController.getReadUrl);
router.get('/:id', datasetController.getDataset);
router.get('/:id/schema', datasetController.getSchema);
router.put('/:id', datasetController.updateDataset);
router.delete('/:id', datasetController.deleteDataset); // Service updated

// NEW: Internal worker route for parsing
internalRouter.post('/internal/datasets/parse-worker',
     validateCloudTaskToken, // Protect with token validation
     datasetController.handleParserWorkerRequest // Map to new controller function
);

module.exports = {
    router, // Export existing router
    internalRouter // Export new internal router
};
```

```javascript
// backend/src/routes.js
const express = require('express');
const authRoutes = require('./features/auth/auth.routes');
const subscriptionRoutes = require('./features/subscriptions/subscription.routes');
const { router: datasetRoutes, internalRouter: datasetInternalRoutes } = require('./features/datasets/dataset.routes'); // Import both routers
const userRoutes = require('./features/users/user.routes');
const teamRoutes = require('./features/teams/team.routes');
const notificationRoutes = require('./features/notifications/notification.routes');
const { router: dataQualityRoutes, internalRouter: dataQualityInternalRoutes } = require('./features/dataQuality/dataQuality.routes');
const { router: chatRoutes, internalRouter: chatInternalRoutes } = require('./features/chat/chat.routes');
const exportRoutes = require('./features/export/export.routes'); // Keep export routes separate

const router = express.Router();

// Public routes
router.get('/', (req, res) => {
    res.json({ message: 'NeuroLedger API v1 is running!' });
 });

// Mount feature routers
router.use('/auth', authRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/datasets', datasetRoutes); // Mount public dataset routes
router.use('/users', userRoutes);
router.use('/teams', teamRoutes);
router.use('/notifications', notificationRoutes);
router.use('/', dataQualityRoutes); // Mount data quality routes (they include /datasets/...)
router.use('/', chatRoutes); // Mount chat routes (now includes prompts routes)

// Mount internal worker routes
router.use('/', dataQualityInternalRoutes);
router.use('/', chatInternalRoutes);
router.use('/', datasetInternalRoutes); // Mount internal dataset parser routes

// Mount export routes separately if needed
// router.use('/export', exportRoutes); // Already mounted in app.js

module.exports = router;
```

---

**Phase 2: Loading Parsed Data from GridFS**

```javascript
// backend/src/features/chat/agent/AgentStateManager.js
const logger = require('../../../shared/utils/logger');
const { toolDefinitions } = require('../tools/tool.definitions');

/**
 * Manages the state for a single turn of the agent's reasoning loop.
 * Holds intermediate results, steps taken, and final outcomes.
 */
class AgentStateManager {
    constructor(initialState = {}) {
        this.context = {
            originalQuery: '',
            steps: [],
            intermediateResults: {
                datasetSchemas: {},
                datasetSamples: {},
                // parsedData: {}, // REMOVED - Data is fetched on demand via callback
                analysisResult: initialState.previousAnalysisResult || null,
                generatedAnalysisCode: null,
                generatedReportCode: initialState.previousGeneratedCode || null,
                fragments: [],
                previousAnalysisResultSummary: null,
                hasPreviousGeneratedCode: !!initialState.previousGeneratedCode,
            },
            userContext: '',
            teamContext: '',
            fullChatHistory: [],
            finalAnswer: null,
            error: null,
            errorCode: null,
            toolErrorCounts: {},
            status: 'processing',
        };
        logger.debug(`[AgentStateManager] Initialized with previousAnalysis: ${!!initialState.previousAnalysisResult}, previousCode: ${!!initialState.previousGeneratedCode}`);
    }

    setQuery(query) { this.context.originalQuery = query; }

    addStep(stepData) {
        const newStep = {
            tool: stepData.tool, args: stepData.args,
            resultSummary: stepData.resultSummary || 'Executing...',
            attempt: stepData.attempt || 1, error: stepData.error || null,
            errorCode: stepData.errorCode || null, result: null
        };
        this.context.steps.push(newStep);
        if (!stepData.tool.startsWith('_')) {
            this.context.intermediateResults.fragments.push({
                 type: 'step', tool: stepData.tool,
                 resultSummary: stepData.resultSummary || 'Executing...',
                 error: stepData.error || null, errorCode: stepData.errorCode || null,
                 status: 'running'
             });
             logger.debug(`[AgentStateManager] Added 'running' step fragment for tool: ${stepData.tool}`);
        } else { logger.debug(`[AgentStateManager] Skipping fragment creation for internal step: ${stepData.tool}`); }
    }

    updateLastStep(resultSummary, error = null, result = null, errorCode = null) {
        const lastStepIndex = this.context.steps.length - 1;
        if (lastStepIndex >= 0) {
            const step = this.context.steps[lastStepIndex];
            step.resultSummary = resultSummary; step.error = error;
            step.result = result; step.errorCode = errorCode;
            const relevantFragmentIndex = this.context.intermediateResults.fragments.findLastIndex(
                 f => f.type === 'step' && f.tool === step.tool && f.status === 'running'
            );
            if (relevantFragmentIndex !== -1) {
                 const fragment = this.context.intermediateResults.fragments[relevantFragmentIndex];
                 fragment.resultSummary = resultSummary; fragment.error = error;
                 fragment.errorCode = errorCode; fragment.status = error ? 'error' : 'completed';
                 logger.debug(`[AgentStateManager] Updated step fragment for tool ${step.tool}. Status: ${fragment.status}`);
            } else {
                 logger.warn(`[AgentStateManager] Could not find matching RUNNING step fragment to update for tool: ${step.tool}`);
                 if (!step.tool.startsWith('_')) {
                      this.context.intermediateResults.fragments.push({
                          type: 'step', tool: step.tool, resultSummary: resultSummary,
                          error: error, errorCode: errorCode, status: error ? 'error' : 'completed'
                      });
                      logger.warn(`[AgentStateManager] Added a new completed/error fragment as fallback for tool: ${step.tool}`);
                 }
            }
        } else { logger.warn('[AgentStateManager] Attempted to updateLastStep, but no steps exist.'); }
    }

    addTextFragment(text) {
        if (text && typeof text === 'string' && text.trim()) {
            this.context.intermediateResults.fragments.push({ type: 'text', content: text.trim() });
            logger.debug(`[AgentStateManager] Added text fragment.`);
        }
    }

    setIntermediateResult(toolName, resultData, args = {}) {
        switch (toolName) {
            // REMOVED 'parse_csv_data' case
            case 'execute_analysis_code':
                this.context.intermediateResults.analysisResult = resultData;
                this.context.intermediateResults.generatedAnalysisCode = null;
                logger.info(`[AgentStateManager] Stored analysis execution result.`);
                break;
             case 'generate_analysis_code':
                 if (resultData.code) { this.context.intermediateResults.generatedAnalysisCode = resultData.code; logger.info(`[AgentStateManager] Stored/Updated generated analysis code (length: ${resultData.code.length}).`); }
                 else { logger.warn(`[AgentStateManager] generate_analysis_code success result missing code.`); }
                 break;
            case 'generate_report_code':
                if (resultData.react_code) { this.context.intermediateResults.generatedReportCode = resultData.react_code; logger.info(`[AgentStateManager] Stored generated React report code.`); }
                else { logger.warn(`[AgentStateManager] generate_report_code success result missing react_code.`); }
                break;
             case 'get_dataset_schema':
                 if (resultData && args.dataset_id) {
                     if (!this.context.intermediateResults.datasetSchemas) this.context.intermediateResults.datasetSchemas = {};
                     this.context.intermediateResults.datasetSchemas[args.dataset_id] = resultData;
                     logger.debug(`[AgentStateManager] Stored schema for dataset ${args.dataset_id}.`);
                 }
                 break;
            default: logger.debug(`[AgentStateManager] No specific intermediate storage action for tool: ${toolName}`);
        }
    }

    getIntermediateResult(key, subKey = null) {
        // REMOVED check for 'parsedData' key
        const result = subKey ? this.context.intermediateResults[key]?.[subKey] : this.context.intermediateResults[key];
        return result;
    }

    setFinalAnswer(answer) {
        this.context.finalAnswer = answer || '';
        const fragments = this.context.intermediateResults.fragments;
        const lastFragment = fragments[fragments.length - 1];
        if (lastFragment?.type === 'text') { lastFragment.content = this.context.finalAnswer; logger.debug('[AgentStateManager] Updated last text fragment with final answer.'); }
        else { fragments.push({ type: 'text', content: this.context.finalAnswer }); logger.debug('[AgentStateManager] Added new text fragment for final answer.'); }
        this.context.status = 'completed';
    }

    setError(errorMsg, errorCode = null) {
        this.context.error = errorMsg; this.context.errorCode = errorCode;
        this.context.finalAnswer = `Error: ${errorMsg}`;
        this.context.intermediateResults.fragments.push({ type: 'error', content: errorMsg, errorCode: errorCode });
        this.context.status = 'error';
    }

    setChatHistory(history) { this.context.fullChatHistory = history; }
    setUserTeamContext(userCtx, teamCtx) { this.context.userContext = userCtx; this.context.teamContext = teamCtx; }
    setDatasetSchemas(schemas) { this.context.intermediateResults.datasetSchemas = schemas || {}; }
    setDatasetSamples(samples) { this.context.intermediateResults.datasetSamples = samples || {}; }
    getSteps() { return this.context.steps; }
    incrementToolErrorCount(toolName) { this.context.toolErrorCounts[toolName] = (this.context.toolErrorCounts[toolName] || 0) + 1; }
    getToolErrorCount(toolName) { return this.context.toolErrorCounts[toolName] || 0; }
    isFinished() { return !!this.context.finalAnswer || !!this.context.error || this.context.status === 'awaiting_user_input'; }

    getContextForLLM() {
        let previousAnalysisResultSummary = null;
        const currentAnalysisResult = this.context.intermediateResults.analysisResult;
        if (currentAnalysisResult) { try { const summary = JSON.stringify(currentAnalysisResult); previousAnalysisResultSummary = `Analysis results from this turn are available: ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}`; } catch { previousAnalysisResultSummary = "Analysis results from this turn are available."; } }
        else if (this.context.intermediateResults.previousAnalysisResult) { try { const summary = JSON.stringify(this.context.intermediateResults.previousAnalysisResult); previousAnalysisResultSummary = `Analysis results from a previous turn are available: ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}`; } catch { previousAnalysisResultSummary = "Analysis results from a previous turn are available."; } }
        return {
            originalQuery: this.context.originalQuery,
            fullChatHistory: this.context.fullChatHistory,
            currentTurnSteps: this.context.steps.map(s => ({ tool: s.tool, args: s.args, resultSummary: s.resultSummary, error: s.error, errorCode: s.errorCode, attempt: s.attempt })),
            availableTools: toolDefinitions.map(({ argsSchema, ...rest }) => rest),
            userContext: this.context.userContext, teamContext: this.context.teamContext,
            analysisResult: this.context.intermediateResults.analysisResult,
            previousAnalysisResultSummary: previousAnalysisResultSummary,
            hasPreviousGeneratedCode: !!this.context.intermediateResults.generatedReportCode,
            datasetSchemas: this.context.intermediateResults.datasetSchemas,
            datasetSamples: this.context.intermediateResults.datasetSamples,
        };
    }

    getContextForDB() {
        let finalStatus = this.context.status;
        if (finalStatus === 'processing') { finalStatus = this.context.error ? 'error' : 'completed'; }
        return {
            status: finalStatus, steps: this.context.steps,
            messageFragments: this.context.intermediateResults.fragments,
            aiResponseText: this.context.finalAnswer, errorMessage: this.context.error,
            errorCode: this.context.errorCode,
            aiGeneratedCode: this.context.intermediateResults.generatedReportCode,
            reportAnalysisData: this.context.intermediateResults.analysisResult,
        };
    }

    getFinalStatusObject() {
        return {
            status: this.context.error ? 'error' : (this.context.status === 'awaiting_user_input' ? 'awaiting_user_input' : 'completed'),
            aiResponseText: this.context.finalAnswer,
            aiGeneratedCode: this.context.intermediateResults.generatedReportCode,
            error: this.context.error, errorCode: this.context.errorCode
        };
    }
}

module.exports = AgentStateManager;
```

```javascript
// backend/src/features/chat/agent/AgentRunner.js
const { v4: uuidv4 } = require('uuid');
const logger = require('../../../shared/utils/logger');
const AgentStateManager = require('./AgentStateManager');
const ToolExecutor = require('./ToolExecutor');
const { getNextActionFromLLM } = require('./LLMOrchestrator');
const AgentEventEmitter = require('./AgentEventEmitter');
const AgentContextService = require('../agentContext.service');
const PromptHistory = require('../prompt.model');
const { summarizeToolResult } = require('../agent.utils');
const datasetService = require('../../datasets/dataset.service'); // Import dataset service

// Constants
const MAX_AGENT_ITERATIONS = 10;
const MAX_TOOL_RETRIES = 1;
const MAX_CODE_REFINEMENT_ATTEMPTS = 2;

class AgentRunner {
    constructor(userId, teamId, sessionId, aiMessageId, sendEventCallback, initialContext = {}) {
        this.userId = userId; this.teamId = teamId; this.sessionId = sessionId;
        this.aiMessageId = aiMessageId; this.traceId = uuidv4();
        this.stateManager = new AgentStateManager(initialContext);
        this.toolExecutor = new ToolExecutor();
        this.eventEmitter = new AgentEventEmitter(sendEventCallback, { userId, sessionId, messageId: aiMessageId });
        this.contextService = new AgentContextService(userId, teamId, sessionId);
        logger.debug(`[Trace:${this.traceId}] [AgentRunner ${sessionId}] Initialized for Message ${this.aiMessageId}`);
    }

    async run(userMessage, sessionDatasetIds = []) {
        logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Starting run. Query: "${userMessage.substring(0, 50)}..."`);
        this.stateManager.setQuery(userMessage);

        try {
            // --- Prepare Initial Context ---
            const initialContextPromise = this.contextService.getInitialUserTeamContext();
            const datasetContextPromise = this.contextService.preloadDatasetContext(sessionDatasetIds);
            const historyPromise = this.contextService.prepareChatHistoryAndArtifacts(this.aiMessageId);
            const [initialCtxResult, datasetCtxResult, historyResultSettled] = await Promise.allSettled([
                initialContextPromise, datasetContextPromise, historyPromise
            ]);
            if (initialCtxResult.status === 'fulfilled') this.stateManager.setUserTeamContext(initialCtxResult.value.userContext, initialCtxResult.value.teamContext);
            else logger.error(`[Trace:${this.traceId}] Failed to get initial user/team context:`, initialCtxResult.reason);
            if (datasetCtxResult.status === 'fulfilled') { this.stateManager.setDatasetSchemas(datasetCtxResult.value.datasetSchemas); this.stateManager.setDatasetSamples(datasetCtxResult.value.datasetSamples); }
            else logger.error(`[Trace:${this.traceId}] Failed to preload dataset context:`, datasetCtxResult.reason);
            if (historyResultSettled.status === 'fulfilled') {
                const historyResult = historyResultSettled.value;
                this.stateManager.setChatHistory(historyResult.fullChatHistory);
                if (this.stateManager.getIntermediateResult('analysisResult') === null && historyResult.previousAnalysisResult) { this.stateManager.context.intermediateResults.analysisResult = historyResult.previousAnalysisResult; logger.debug(`[Trace:${this.traceId}] Carried over previous analysis result.`); }
                if (this.stateManager.getIntermediateResult('generatedReportCode') === null && historyResult.previousGeneratedCode) { this.stateManager.context.intermediateResults.generatedReportCode = historyResult.previousGeneratedCode; this.stateManager.context.intermediateResults.hasPreviousGeneratedCode = true; logger.debug(`[Trace:${this.traceId}] Carried over previous generated report code.`); }
            } else logger.error(`[Trace:${this.traceId}] Failed to prepare chat history:`, historyResultSettled.reason);
            logger.debug(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Initial context prepared.`);
            // --- End Prepare Initial Context ---

            // --- Main Loop ---
            let iterations = 0; let nextActionToInject = null;
            while (iterations < MAX_AGENT_ITERATIONS && !this.stateManager.isFinished()) {
                iterations++; logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Iteration ${iterations}`);
                let llmAction;
                if (nextActionToInject) { llmAction = nextActionToInject; nextActionToInject = null; logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Using injected action: ${llmAction.tool}`); }
                else {
                    const llmContext = this.stateManager.getContextForLLM(); llmContext.userId = this.userId;
                    const streamCallback = (type, data) => {
                        if (type === 'token') this.eventEmitter.emitStreamToken(data.content);
                        else if (type === 'finish') this.eventEmitter.emitStreamFinish(data.finishReason);
                        else if (type === 'completed') this.eventEmitter.emitStreamCompleted();
                        else if (type === 'error') this.eventEmitter.emitStreamError(data.message);
                    };
                    logger.debug(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Calling LLM Orchestrator...`);
                    llmAction = await getNextActionFromLLM(llmContext, streamCallback, this.toolExecutor.getKnownToolNames());
                    logger.debug(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] LLM Action received: Tool='${llmAction.tool}', Final=${llmAction.isFinalAnswer}`);
                }
                if (llmAction.userExplanation) { this.eventEmitter.emitUserExplanation(llmAction.userExplanation); }
                else if (llmAction.thinking && !llmAction.isFinalAnswer && !llmAction.tool?.startsWith('_')) { this.eventEmitter.emitUserExplanation("Okay, planning the next step..."); }

                if (llmAction.isFinalAnswer) {
                    logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] LLM indicated final answer.`);
                    this.stateManager.setFinalAnswer(llmAction.textResponse);
                    this.stateManager.addStep({ tool: '_answerUserTool', args: llmAction.args, resultSummary: 'Final answer provided.', attempt: 1 });
                    const finalAnswerText = this.stateManager.context.finalAnswer;
                    const finalGeneratedCode = this.stateManager.getIntermediateResult('generatedReportCode');
                    const finalAnalysisResult = this.stateManager.getIntermediateResult('analysisResult');
                    this.eventEmitter.emitFinalAnswer(finalAnswerText, finalGeneratedCode, finalAnalysisResult);
                    break;
                }
                if (llmAction.tool === 'ask_user_for_clarification') {
                     const question = llmAction.args.question || "I need more information to proceed. Could you please clarify?";
                     logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Agent requested clarification: "${question}"`);
                     this.stateManager.context.status = 'awaiting_user_input'; this.stateManager.setFinalAnswer(question);
                     this.stateManager.setError(null); this.stateManager.addStep({ tool: llmAction.tool, args: llmAction.args, resultSummary: 'Asking user for clarification.', attempt: 1 });
                     this.eventEmitter.emitNeedsClarification(question); logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Pausing turn to wait for user clarification.`);
                     break;
                }

                const toolName = llmAction.tool; const llmToolArgs = llmAction.args;
                logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] LLM requests tool: ${toolName}`);

                // --- MODIFIED: executionContext Creation ---
                const executionContext = {
                    userId: this.userId, teamId: this.teamId, sessionId: this.sessionId, traceId: this.traceId,
                    analysisResult: (toolName === 'generate_report_code') ? this.stateManager.getIntermediateResult('analysisResult') : undefined,
                    datasetSchemas: (toolName === 'generate_report_code' || toolName === 'generate_analysis_code') ? this.stateManager.getIntermediateResult('datasetSchemas') : undefined,
                    // Callback now uses datasetService.getParsedDataFromStorage
                    getParsedDataCallback: (toolName === 'execute_analysis_code' || toolName === 'calculate_financial_ratios') ?
                        async (id) => {
                            try {
                                 logger.debug(`[AgentRunner:getParsedDataCallback] Calling service for dataset ${id}`);
                                 const data = await datasetService.getParsedDataFromStorage(id, this.userId); // Pass userId
                                 logger.debug(`[AgentRunner:getParsedDataCallback] Service returned data for ${id} (Length: ${data?.length})`);
                                 return data;
                             } catch (error) {
                                 logger.error(`[AgentRunner:getParsedDataCallback] Error fetching parsed data for dataset ${id} from service: ${error.message}`);
                                 return null; // Return null to let tool handle the error
                             }
                        } : undefined,
                 };
                 // --- END MODIFICATION ---

                let finalToolResult;
                 if (toolName === 'execute_analysis_code') {
                     let executionSuccess = false; const refinementCounterKey = 'analysis_code_refinement';
                     this.stateManager.context.toolErrorCounts[refinementCounterKey] = 0;
                     for (let attempt = 1; attempt <= MAX_CODE_REFINEMENT_ATTEMPTS; attempt++) {
                         logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Code Execution Attempt ${attempt}/${MAX_CODE_REFINEMENT_ATTEMPTS}`);
                         const codeToExecute = this.stateManager.getIntermediateResult('generatedAnalysisCode');
                         if (!codeToExecute) { finalToolResult = { status: 'error', error: 'Internal state error: No analysis code available for execution.', args: llmToolArgs, errorCode: 'INTERNAL_CODE_MISSING' }; logger.error(`[Trace:${this.traceId}] ${finalToolResult.error}`); break; }
                         this.stateManager.addStep({ tool: toolName, args: llmToolArgs, resultSummary: `Executing code (Attempt ${attempt})...`, attempt: attempt });
                         this.eventEmitter.emitUsingTool(toolName, llmToolArgs);
                         const execResult = await this.toolExecutor.execute(toolName, llmToolArgs, executionContext, { code: codeToExecute });
                         const execResultSummary = summarizeToolResult(execResult); finalToolResult = execResult;
                         if (execResult.status === 'success') {
                             logger.info(`[Trace:${this.traceId}] Code execution successful (Attempt ${attempt}).`);
                             this.stateManager.updateLastStep(execResultSummary, null, execResult.result, null);
                             this.eventEmitter.emitToolResult(toolName, execResultSummary, null, null);
                             this.stateManager.setIntermediateResult(toolName, execResult.result, llmToolArgs);
                             executionSuccess = true; break;
                         } else {
                             const isSandboxError = ['CODE_EXECUTION_FAILED', 'CODE_EXECUTION_TIMEOUT', 'CODE_EXECUTION_NO_RESULT', 'TOOL_EXECUTION_ERROR', 'CODE_GENERATION_INVALID', 'PARSED_DATA_MISSING', 'PARSED_DATA_INVALID'].includes(execResult.errorCode);
                             logger.warn(`[Trace:${this.traceId}] Code execution failed (Attempt ${attempt}): ${execResult.error} (Code: ${execResult.errorCode})`);
                             this.stateManager.updateLastStep(`Error (Attempt ${attempt}): ${execResultSummary}`, execResult.error, null, execResult.errorCode);
                             this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${attempt}): ${execResultSummary}`, execResult.error, execResult.errorCode);
                             this.stateManager.incrementToolErrorCount(refinementCounterKey);
                             if (isSandboxError && attempt < MAX_CODE_REFINEMENT_ATTEMPTS) {
                                 logger.info(`[Trace:${this.traceId}] Attempting code regeneration...`);
                                 this.stateManager.addStep({ tool: '_refiningCode', args: { failedTool: toolName }, resultSummary: 'Attempting to fix code...', attempt: attempt + 1 });
                                 this.eventEmitter.emitUserExplanation("There was an issue running the analysis code. I'll try to fix it automatically.");
                                 const originalGoal = this.stateManager.context.originalQuery;
                                 const regenLlmArgs = { analysis_goal: originalGoal, dataset_id: llmToolArgs.dataset_id, previous_error: execResult.error };
                                 nextActionToInject = { tool: 'generate_analysis_code', args: regenLlmArgs, isFinalAnswer: false, textResponse: null, thinking: "Regenerating analysis code due to execution error.", userExplanation: "Attempting to fix the analysis code..." };
                                 logger.debug(`[Trace:${this.traceId}] Injecting action for refinement:`, nextActionToInject);
                                 break;
                             } else { logger.warn(`[Trace:${this.traceId}] Max code refinements reached or error not suitable for refinement. Aborting.`); break; }
                         }
                     }
                     if (nextActionToInject) { continue; }
                     if (!executionSuccess) { logger.error(`[Trace:${this.traceId}] Code execution failed permanently after ${this.stateManager.getToolErrorCount(refinementCounterKey)} refinement attempts.`); this.stateManager.setError(finalToolResult?.error || 'Code execution failed after multiple attempts.', finalToolResult?.errorCode || 'CODE_EXECUTION_FAILED'); this.eventEmitter.emitAgentError(this.stateManager.context.error, this.stateManager.context.errorCode); continue; }
                 } else {
                    this.stateManager.addStep({ tool: toolName, args: llmToolArgs, resultSummary: 'Executing tool...', attempt: 1 });
                    this.eventEmitter.emitUsingTool(toolName, llmToolArgs);
                    let toolResult; let currentAttempt = 0;
                    do {
                        currentAttempt++; if (currentAttempt > 1) logger.info(`[Trace:${this.traceId}] Retrying tool ${toolName} (Attempt ${currentAttempt})`);
                        toolResult = await this.toolExecutor.execute(toolName, llmToolArgs, executionContext);
                        const resultSummary = summarizeToolResult(toolResult);
                        if (toolResult.error && currentAttempt <= MAX_TOOL_RETRIES) {
                            logger.warn(`[Trace:${this.traceId}] Tool ${toolName} failed (Attempt ${currentAttempt}). Retrying. Error: ${toolResult.error} (Code: ${toolResult.errorCode})`);
                            this.stateManager.incrementToolErrorCount(toolName);
                            this.stateManager.updateLastStep(`Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error, null, toolResult.errorCode);
                            this.stateManager.context.steps[this.stateManager.context.steps.length - 1].attempt = currentAttempt + 1;
                            this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error, toolResult.errorCode);
                        } else {
                            this.stateManager.updateLastStep(resultSummary, toolResult.error, toolResult.result, toolResult.errorCode);
                            this.eventEmitter.emitToolResult(toolName, resultSummary, toolResult.error, toolResult.errorCode);
                            if (!toolResult.error) { this.stateManager.setIntermediateResult(toolName, toolResult.result, llmToolArgs); }
                            break;
                        }
                    } while (currentAttempt <= MAX_TOOL_RETRIES);
                    if (toolResult.error) { logger.warn(`[Trace:${this.traceId}] Tool ${toolName} failed after all retries.`); }
                 }
            } // End main while loop

            if (!this.stateManager.isFinished()) {
                 const maxIterError = `Agent reached maximum iterations (${MAX_AGENT_ITERATIONS}).`;
                 logger.warn(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] ${maxIterError}`);
                 this.stateManager.setError(maxIterError, 'MAX_ITERATIONS_REACHED');
                 this.stateManager.addStep({ tool: '_maxIterations', args: {}, resultSummary: 'Reached max iterations.', attempt: 1 });
                 this.eventEmitter.emitAgentError(maxIterError, 'MAX_ITERATIONS_REACHED');
            }
            await this._finalizeRun();
            return this.stateManager.getFinalStatusObject();
        } catch (error) {
            logger.error(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Unhandled error during agent run: ${error.message}`, { stack: error.stack });
            this.stateManager.setError(error.message || 'Unknown agent run error', 'AGENT_RUNNER_ERROR');
            this.eventEmitter.emitAgentError(this.stateManager.context.error, this.stateManager.context.errorCode);
            await this._finalizeRun();
            return this.stateManager.getFinalStatusObject();
        } finally { this.contextService.cleanup(); }
    }

    async _finalizeRun() {
        logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Finalizing run for message ${this.aiMessageId}.`);
        const dbData = this.stateManager.getContextForDB();
        if (this.stateManager.context.status === 'awaiting_user_input') { dbData.status = 'awaiting_user_input'; dbData.errorMessage = null; }
        dbData.completedAt = new Date(); dbData.isStreaming = false;
        try {
            const updatedRecord = await PromptHistory.findByIdAndUpdate(this.aiMessageId, { $set: dbData }, { new: true }).lean();
            if (!updatedRecord) { logger.error(`[Trace:${this.traceId}] CRITICAL: Failed to find PromptHistory record ${this.aiMessageId} during finalize.`); }
            else { logger.info(`[Trace:${this.traceId}] PromptHistory record ${this.aiMessageId} finalized with status: ${dbData.status}`); }
        } catch (dbError) { logger.error(`[Trace:${this.traceId}] Error saving final state to DB for ${this.aiMessageId}: ${dbError.message}`, { dbData }); }
    }
}

module.exports = AgentRunner;
```

---

**Phase 3: Deprecate/Modify `parse_csv_data` Tool**

```javascript
// backend/src/features/chat/tools/parse_csv_data.js
const logger = require('../../../shared/utils/logger');
const Dataset = require('../../datasets/dataset.model'); // Import Dataset model
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * Core logic for checking the parsing status of a dataset.
 * This tool no longer performs parsing itself.
 *
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.dataset_id - The MongoDB ObjectId of the target dataset.
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @returns {Promise<{status: 'success'|'error', result?: {summary: string}, error?: string, errorCode?: string}>} Result object
 */
async function parse_csv_data_logic(args, context) {
    const { dataset_id } = args;
    const { userId } = context; // Keep userId for potential future access checks

    try {
        // Find the dataset metadata, only selecting necessary fields
        const dataset = await Dataset.findById(dataset_id)
            .select('parsedDataStatus parsedDataError ownerId teamId') // Select status, error, and ownership fields
            .lean();

        if (!dataset) {
            return { status: 'error', error: `Dataset metadata not found for ID ${dataset_id}.`, errorCode: 'DATASET_NOT_FOUND' };
        }

        // Optional: Add access check here if needed, though subsequent tools will check anyway
        // let hasAccess = dataset.ownerId.toString() === userId.toString();
        // if (!hasAccess && dataset.teamId) { ... check team membership ... }
        // if (!hasAccess) return { status: 'error', error: `Access denied to dataset ${dataset_id}.`, errorCode: 'ACCESS_DENIED' };

        logger.info(`[Tool:parse_csv_data] Checking parsed data status for Dataset ${dataset_id}. Status: ${dataset.parsedDataStatus}`);

        switch (dataset.parsedDataStatus) {
            case 'completed':
                return { status: 'success', result: { summary: `Dataset ${dataset_id} is parsed and ready for analysis.` } };
            case 'queued':
            case 'processing':
                return { status: 'error', error: `Dataset ${dataset_id} is currently being processed. Please try again shortly.`, errorCode: 'PARSING_IN_PROGRESS' };
            case 'error':
                return { status: 'error', error: `Dataset ${dataset_id} encountered an error during parsing: ${dataset.parsedDataError || 'Unknown parsing error'}. Cannot proceed with analysis.`, errorCode: 'PARSING_FAILED' };
            case 'not_parsed':
            default:
                 logger.error(`[Tool:parse_csv_data] Dataset ${dataset_id} has unexpected status 'not_parsed' or unknown.`);
                 return { status: 'error', error: `Dataset ${dataset_id} has not been parsed yet. Parsing should happen automatically after upload. Please wait or check dataset status.`, errorCode: 'PARSING_NOT_STARTED' };
        }
    } catch (error) {
        logger.error(`[Tool:parse_csv_data] Error checking status for Dataset ${dataset_id}: ${error.message}`, { error });
         if (error.name === 'CastError') { return { status: 'error', error: `Invalid dataset ID format: ${dataset_id}`, errorCode: 'INVALID_ARGUMENT_FORMAT' }; }
        // Re-throw for the wrapper to catch general execution errors
        throw new Error(`Failed to check dataset parsing status: ${error.message}`);
    }
}

// Export the wrapped function
module.exports = createToolWrapper('parse_csv_data', parse_csv_data_logic);
```

```javascript
// backend/src/features/chat/tools/tool.definitions.js
/**
 * Defines the structure and description of tools available to the LLM agent.
 */
const toolDefinitions = [
    // Dataset Interaction Tools
    {
        name: 'list_datasets',
        description: 'Lists all available datasets for the user or team, providing their names and IDs. Use this first if the user asks about datasets generally or doesn\'t specify one.',
        output: 'On success, returns an object with status: success and result: an array of dataset objects (including _id, name, description, columnCount, isTeamDataset, teamName). On failure, returns an object with status: error and an error message.'
    },
    {
        name: 'get_dataset_schema',
        description: 'Retrieves the schema (column names, types, descriptions) and general description for a specific dataset ID. Essential before generating analysis code.',
        output: 'On success, returns an object with status: success and result: an object containing schemaInfo array, columnDescriptions map, dataset description string, and optionally rowCount. On failure, returns an object with status: error, an error message, and an errorCode.'
    },
    {
        name: 'parse_csv_data',
        // MODIFIED Description:
        description: 'Checks if the data for a specific dataset ID has been successfully processed and is ready for analysis. Returns an error if processing is ongoing or failed. This step is implicitly required before analysis, but you usually do not need to call it directly unless checking status.',
        // MODIFIED Output:
        output: 'On success, returns an object with status: success and result: an object containing a summary message. On failure (e.g., processing, error), returns an object with status: error, an error message, and an errorCode.'
    },
    // Code Generation & Execution Tools
    {
        name: 'generate_analysis_code',
        description: 'Generates executable Node.js code to perform data analysis based on a specific goal. Requires dataset schema context (use get_dataset_schema first). The code will receive parsed data in an `inputData` variable. Example `analysis_goal`: \'Calculate the sum of the Sales column\', \'Calculate Gross Profit Margin using the Revenue and COGS columns\', \'Calculate Debt-to-Equity ratio using Total Liabilities and Total Equity columns\'. Can optionally receive error context from a previous failed execution via the `previous_error` argument.',
        output: 'On success, returns an object with status: success and result: an object containing the generated Node.js code string. On failure, returns an object with status: error, an error message, and an errorCode (e.g., CODE_GENERATION_FAILED, SCHEMA_MISSING).'
    },
    {
        name: 'execute_analysis_code',
        // MODIFIED Description (removed explicit mention of parse_csv_data requirement):
        description: 'Executes the generated Node.js analysis code in a secure sandbox using pre-processed data for the specified dataset ID. The system automatically uses the code generated in the previous step.',
        output: 'On success, returns an object with status: success and result: the JSON output from the executed code. On failure, returns an object with status: error, an error message, an errorCode (e.g., CODE_EXECUTION_FAILED, CODE_EXECUTION_TIMEOUT, PARSED_DATA_MISSING), and potentially console logs.'
    },
    {
        name: 'generate_report_code',
        description: 'Generates React component code (JSX) to visualize or report the results of a previous analysis. Use this AFTER `execute_analysis_code` has successfully returned results. Provide a summary of the results to guide the generation. Can optionally accept `title`, `chart_type`, and `columns_to_visualize` arguments for customization.',
        output: 'On success, returns an object with status: success and result: an object containing the generated React component code string. On failure, returns an object with status: error, an error message, and an errorCode (e.g., CODE_GENERATION_FAILED, MISSING_ANALYSIS_DATA).'
    },
     // Financial Ratio Tool
     {
        name: 'calculate_financial_ratios',
        // MODIFIED Description (removed explicit mention of parse_csv_data requirement):
        description: 'Calculates common financial ratios (e.g., Gross Profit Margin, Net Profit Margin, Current Ratio, Debt-to-Equity) directly from pre-processed dataset data. Provide the `dataset_id` of the processed data, an array of desired `ratios`, and the exact `column_names` required for those ratios.',
        output: 'On success, returns an object with status: success and result: an object containing calculated ratios { ratioName: value, ... }. On failure, status: error and error message with errorCode.'
    },
    // Clarification Tool
    {
        name: 'ask_user_for_clarification',
        description: 'Use this tool ONLY when you need more information from the user to proceed. Ask a specific question to resolve ambiguity or gather missing details (like column names).',
        output: 'Pauses the agent turn and sends the question to the user. Does not return a value to the agent loop directly.'
    },
    // Final Output Tool
    {
        name: '_answerUserTool',
        description: 'Provides the final text-based answer directly to the user when the request has been fully addressed and no further tool use is needed.',
        output: 'Signals the end of the agent\'s turn. Does not return a structured object, only indicates success/failure via status.'
    }
];

module.exports = { toolDefinitions };
```

```javascript
// backend/src/features/chat/agent/SystemPromptBuilder.js
// (Only showing the modified _buildWorkflowGuidance method)
const { toolDefinitions } = require('../tools/tool.definitions');
const formatAnalysisObject = (obj, prefix = '', maxDepth = 3, currentDepth = 0) => { /* ... implementation from previous step ... */ };
const formatCurrency = (value) => { /* ... implementation from previous step ... */ };
const formatPercentage = (value, decimals = 1) => { /* ... implementation from previous step ... */ };
const formatJsonValue = (value) => { /* ... implementation from previous step ... */ };

class SystemPromptBuilder {
    build(context) {
        const parts = [
            this._buildIntroduction(),
            this._buildCoreThinkingInstruction(),
            this._buildCriticalWarnings(),
            this._buildChatHistory(context.fullChatHistory),
            this._buildCurrentProgress(context.currentTurnSteps),
            this._buildPreviousArtifacts(context.previousAnalysisResultSummary, context.hasPreviousGeneratedCode),
            this._buildAnalysisResult(context.analysisResult),
            this._buildUserTeamContext(context.userContext, context.teamContext),
            this._buildDatasetInfo(context.datasetSchemas, context.datasetSamples),
            this._buildToolDefinitions(),
            this._buildFewShotExamples(),
            this._buildCoreInstructions(),
            this._buildWorkflowGuidance(), // <-- This method is updated
            this._buildModificationHandling(),
            this._buildErrorHandling(),
            this._buildClarificationGuidance(),
            this._buildFinalInstruction()
        ];
        return parts.filter(Boolean).join('\n\n');
    }

    // ... other _build methods remain the same as in previous context ...

    _buildWorkflowGuidance() {
        return `**WORKFLOW GUIDANCE:**
*   **Data Availability:** Data for selected datasets is processed automatically in the background after upload. You can generally assume data is ready for analysis tools like \`execute_analysis_code\` or \`calculate_financial_ratios\`. If a tool fails because data isn't ready (e.g., error code PARSING_IN_PROGRESS or PARSING_FAILED), inform the user and suggest they wait or check the dataset status. Do NOT repeatedly try to access data that failed parsing.
*   **Code for Calculations:** For calculations or specific data transformations not covered by other tools, use \`generate_analysis_code\` then \`execute_analysis_code\`.
*   **Report Generation:** To visualize results or present data in a structured way (charts, tables), use \`generate_report_code\` AFTER analysis code has been successfully executed.
*   **Tool Selection:** Choose the MOST appropriate tool for the specific task. Don't use general code generation if a specific tool (like \`calculate_financial_ratios\`) can directly answer the request.
*   **Iterative Refinement:** If code execution fails, use the error information to refine the goal for \`generate_analysis_code\` or \`generate_report_code\` and try again.
*   **Workflow for Comprehensive Reports / Insights:**
    If the user asks for 'insights', 'commentary', 'recommendations', an 'executive summary', or a 'comprehensive report', you **MUST** follow this specific workflow:
    1.  (Assume Data Parsed) Check dataset schema if needed (\`get_dataset_schema\`).
    2.  (Generate ENHANCED Analysis Code) Use \`generate_analysis_code\`. Your \`analysis_goal\` MUST explicitly ask for calculations like variances, ratios, trends, AND **textual insights/recommendations** to be included in the \`sendResult\` object. Explain as 'Performing in-depth analysis'.
    3.  (Execute Code) Use \`execute_analysis_code\`. Explain as 'Running detailed calculations'.
    4.  (Generate ENHANCED Report Code) Use \`generate_report_code\`. Your \`analysis_summary\` should mention that insights are included. Explain as 'Generating comprehensive report'.
    5.  (Answer User) Use \`_answerUserTool\` with a brief message like 'Here is the comprehensive report you requested.' Explain as 'Presenting the detailed report'.
*   **Tool Usage Clarification:** Use \`calculate_financial_ratios\` for direct ratio requests. Use the 'Comprehensive Report' workflow involving \`generate_analysis_code\` for requests needing deeper insights, commentary, custom analysis, or when the required data structure for ratios isn't immediately obvious. The comprehensive workflow is generally preferred for complex or multi-faceted analysis requests.
`;
    }

    // ... other _build methods ...
     _buildIntroduction() { return "You are NeuroLedger AI, an expert Financial Analyst agent. Your goal is to help the user analyze their financial data and answer their questions accurately and insightfully."; }
     _buildCoreThinkingInstruction() { return `**CORE REQUIREMENT: THINK BEFORE ACTING & EXPLAIN TO USER**\nBefore outputting ANY tool call OR your final answer, YOU MUST first provide **BOTH**:\n1.  Your internal, step-by-step reasoning and plan within \`<thinking> ... </thinking>\` tags. This is for internal use.\n2.  A concise, user-friendly explanation of your current plan/action in \`<user_explanation> ... </user_explanation>\` tags. This text will be shown directly to the user. Keep it brief and focus on what you are doing for them (e.g., "Analyzing the sales data...", "Checking the budget details...", "Preparing the summary report..."). **DO NOT mention internal tool names here.**\n\n**Output Format:**\n1.  Provide your internal reasoning in \`<thinking> ... </thinking>\`. **When planning for a comprehensive report, explicitly state in your \`<thinking>\` block that you will generate analysis code that includes insights, and then generate report code to display both data and insights.**\n2.  **Immediately** following, provide the user explanation in \`<user_explanation> ... </user_explanation>\`.\n3.  **Immediately** following the closing \`</user_explanation>\` tag, provide EITHER:\n    a.  A **single JSON object** for a tool call (e.g., \`get_dataset_schema\`). Format:\n        \`\`\`json\n        {\n          "tool": "<tool_name>",\n          "args": { <arguments_based_on_tool_description> }\n        }\n        \`\`\`\n    b.  OR, if no more tools are needed, provide the final answer using the **EXACT** \`_answerUserTool\` format:\n        \`\`\`json\n        {\n          "tool": "_answerUserTool",\n          "args": {\n            "textResponse": "Your final, complete answer text for the user goes here."\n          }\n        }\n        \`\`\`\n        **CRITICAL:** For the final answer, the key inside "args" MUST be exactly \`"textResponse"\`. Do NOT include any extra text outside the JSON block.`; }
     _buildCriticalWarnings() { return `You operate in a loop: Reason -> Act -> Observe.\n\n**⚠️ CRITICAL INSTRUCTION: WHEN USING TOOLS REQUIRING A 'dataset_id', YOU MUST USE THE EXACT MONGODB OBJECTID PROVIDED IN THE 'AVAILABLE DATASETS' SECTION BELOW. DO NOT CREATE, INVENT, OR USE DATASET NAMES AS IDs. ⚠️**`; }
     _buildChatHistory(chatHistory = []) { if (!chatHistory || chatHistory.length === 0) return '**Conversation History:**\nNo history yet.'; let historyText = '**Conversation History (Most Recent Messages):**\n'; if (chatHistory[0]?.role === 'assistant' && chatHistory[0]?.content?.startsWith('Previous conversation summary:')) { historyText += `*Summary of Earlier Conversation:*\n${chatHistory[0].content.replace('Previous conversation summary:\n','')}\n---\n*Recent Messages:*\n`; chatHistory = chatHistory.slice(1); } const displayHistory = chatHistory.slice(-10); historyText += displayHistory.map(msg => { const prefix = msg.role === 'user' ? 'User' : 'Assistant'; const content = (msg.content || '').substring(0, 500); const ellipsis = (msg.content || '').length > 500 ? '...' : ''; return `${prefix}: ${content}${ellipsis}`; }).join('\n\n'); if (chatHistory.length > 10) historyText = `**(Older messages summarized or omitted)**\n${historyText}`; return historyText; }
     _buildCurrentProgress(steps = []) { if (!steps || steps.length === 0) return '**Current Turn Progress:**\nNo actions taken yet this turn.'; let text = '**Current Turn Progress:**\nActions taken so far in this turn:\n'; steps.forEach((step, index) => { if (step.tool.startsWith('_')) return; text += `${index + 1}. Tool Used: \`${step.tool}\` (Attempt: ${step.attempt || 1})\n`; let argsSummary = 'No args'; if (step.args && Object.keys(step.args).length > 0) { const argsToSummarize = {}; for (const key in step.args) { if (typeof step.args[key] === 'string' && step.args[key].length > 50) { argsToSummarize[key] = step.args[key].substring(0, 50) + '...'; } else if (key !== 'code' && key !== 'react_code') { argsToSummarize[key] = step.args[key]; } } try { argsSummary = JSON.stringify(argsToSummarize); } catch { argsSummary = '[Args not serializable]'; } } text += `   Args: ${argsSummary.substring(0, 150)}${argsSummary.length > 150 ? '...' : ''}\n`; text += `   Result Summary: ${step.resultSummary || 'N/A'}\n`; if (step.error) { const errorCodePart = step.errorCode ? ` (${step.errorCode})` : ''; text += `   Error: ${String(step.error).substring(0, 150)}...${errorCodePart}\n`; } }); return text; }
     _buildPreviousArtifacts(summary, hasCode) { if (!summary && !hasCode) return ''; let text = '**Context from Previous Report Generation (If applicable):**\n'; text += `- Summary of Previous Analysis Used: ${summary || 'None available'}\n`; text += `- Previously Generated Code Available: ${hasCode ? 'Yes' : 'No'}\n`; return text; }
     _buildAnalysisResult(analysisResult) { if (!analysisResult) return '**Current Turn Analysis Results:**\nNo analysis has been performed or resulted in data *this turn*. Check previous turn artifacts if modifying.'; try { const formatted = formatAnalysisObject(analysisResult); if (!formatted.trim()) return '**Current Turn Analysis Results (MUST USE for Summarization/Report Args):**\n(Analysis result is empty or contains no data)'; return `**Actual Analysis Results (Data available for next step):**\n\`\`\`json\n${formatted}\n\`\`\``; } catch (e) { console.error('[SystemPromptBuilder] Error formatting analysisResult:', e); return '**Current Turn Analysis Results:**\nError formatting results for display.'; } }
     _buildUserTeamContext(userCtx, teamCtx) { if (!userCtx && !teamCtx) return '**User/Team Context:**\nNo specific user or team context provided.'; return `**User/Team Context:**\nUser Context: ${userCtx || 'Not set.'}\nTeam Context: ${teamCtx || 'Not set.'}`; }
     _buildDatasetInfo(schemas = {}, samples = {}) { const datasetIds = Object.keys(schemas); if (datasetIds.length === 0) return '**AVAILABLE DATASETS:**\nNo datasets are currently selected or available for this chat session.'; let text = '**AVAILABLE DATASETS - CRITICAL INFORMATION:**\n'; text += '\n⚠️ **CRITICAL: YOU MUST USE THE EXACT DATASET IDs LISTED BELOW WHEN A TOOL REQUIRES A \`dataset_id\`** ⚠️\n'; text += '\n**DO NOT MAKE UP IDs OR USE DATASET NAMES. ONLY USE THE MONGODB OBJECTID VALUES SHOWN BELOW.**\n'; datasetIds.forEach(datasetId => { const schema = schemas[datasetId] || {}; const sample = samples[datasetId]; text += `\n## Dataset ID: \`${datasetId}\`\n`; text += `   Name: ${schema.name || 'Unknown Name'}\n`; text += `   Description: ${schema.description || 'No description available'}\n\n`; text += `### Schema Information:\n`; if (schema.schemaInfo && schema.schemaInfo.length > 0) { schema.schemaInfo.forEach(column => { const colDesc = schema.columnDescriptions?.[column.name] || 'No description'; text += `- **${column.name}** (${column.type || 'unknown'}): ${colDesc}\n`; }); } else { text += `   No schema information available.\n`; } if (sample && sample.sampleRows && sample.sampleRows.length > 0) { text += `\n### Sample Data (Last ${sample.sampleRows.length} rows of ${sample.totalRows} total):\n`; try { const sampleString = JSON.stringify(sample.sampleRows, null, 2); const truncatedSample = sampleString.substring(0, 1500) + (sampleString.length > 1500 ? '\n...' : ''); text += `   \`\`\`json\n   ${truncatedSample}\n   \`\`\`\n`; } catch { text += `   [Could not display sample data]\n`; } } }); return text; }
     _buildToolDefinitions() { const formattedTools = toolDefinitions.map(tool => { const escapedDescription = tool.description.replace(/"/g, '\\"').replace(/\n/g, '\\n'); let escapedOutput = ''; if (typeof tool.output === 'string') { escapedOutput = tool.output.replace(/"/g, '\\"').replace(/\n/g, '\\n     '); } else { try { escapedOutput = JSON.stringify(tool.output); } catch { escapedOutput = '[Output format unavailable]'; } } return `  {\n     "name": "${tool.name}",\n     "description": "${escapedDescription}",\n     "output": "${escapedOutput}"\n   }`; }).join(',\n'); return `**Available Tools:**\nYou have access to the following tools. To use a tool, output ONLY a single JSON object in the format shown below AFTER your <thinking> and <user_explanation> blocks:\n\`\`\`json\n{\n  \"tool\": \"<tool_name>\",\n  \"args\": { <arguments_based_on_tool_description> }\n}\n\`\`\`\n\n**Tool Definitions:**\n[\n${formattedTools}\n]\n\n**IMPORTANT:** Determine the required arguments for each tool based on its description above. For the FINAL answer, you MUST use the \`_answerUserTool\` with the argument format \`{"textResponse": "Your answer here"}\`.`; }
     _buildFewShotExamples() { return `**Examples of Interaction Flow:**\n\n*Example 1: User asks for schema*\nUser Request: "What columns are in dataset 6abcdef1234567890abcdef?"\nYour Response:\n\`<thinking>\n1. User wants the schema for dataset ID 6abcdef1234567890abcdef.\n2. Dataset context above shows this ID is available.\n3. I need to use the \`get_dataset_schema\` tool with the exact ID.\n</thinking>\n<user_explanation>Let me check the columns available in that dataset for you.</user_explanation>\`\n\`\`\`json\n{\n  "tool": "get_dataset_schema",\n  "args": { "dataset_id": "6abcdef1234567890abcdef" }\n}\n\`\`\`\n\n*Example 2: User asks for analysis requiring code execution*\nUser Request: "Calculate the total revenue from dataset 6abcdef1234567890abcdef"\nYour Response (Data is assumed ready):\n\`<thinking>\n1. User wants total revenue. Data for 6abc...def is ready.\n2. Schema context shows a 'Revenue' column.\n3. Need to generate code to sum the 'Revenue' column.\n4. Goal for code gen: 'Sum the Revenue column'.\n5. Use \`generate_analysis_code\`. Ensure code includes insights.\n</thinking>\n<user_explanation>Okay, the data is ready. Now I'll prepare the calculation to find the total revenue.</user_explanation>\`\n\`\`\`json\n{\n  "tool": "generate_analysis_code",\n  "args": { "analysis_goal": "Sum the Revenue column and provide insights", "dataset_id": "6abcdef1234567890abcdef" }\n}\n\`\`\`\n(After successful code generation, Observation contains summary)\nYour NEXT Response:\n\`<thinking>\n1. Analysis code to sum revenue has been generated.\n2. Now I need to execute this code using \`execute_analysis_code\` on the parsed data for dataset 6abc...def.\n</thinking>\n<user_explanation>I have the calculation ready, now I'll run it on your data.</user_explanation>\`\n\`\`\`json\n{\n  "tool": "execute_analysis_code",\n  "args": { "dataset_id": "6abcdef1234567890abcdef" }\n}\n\`\`\`\n(After successful code execution, Observation contains summary like: {"result_preview": {"totalRevenue": 150000, "generatedInsights": ["Total revenue is $150,000."]}})\nYour FINAL Response:\n\`<thinking>\n1. Code execution completed successfully. The result was {totalRevenue: 150000, generatedInsights: [...]}.\n2. Need to present this final answer to the user using \`_answerUserTool\`. Include the insight.\n</thinking>\n<user_explanation>The analysis is complete.</user_explanation>\`\n\`\`\`json\n{\n  "tool": "_answerUserTool",\n  "args": {\n    "textResponse": "The total revenue calculated from the dataset is $150,000."\n  }\n}\n\`\`\`\n\n*Example 3: Handling Ambiguity*\nUser Request: "Show the profit margin." (Dataset schema lacks obvious 'Profit' column but has 'Revenue', 'COGS')\nYour Response:\n\`<thinking>\n1. User wants profit margin, but the schema doesn't have a 'Profit' column directly.\n2. I see 'Revenue' and 'COGS' columns. Profit margin is usually (Revenue - COGS) / Revenue.\n3. I should ask the user to confirm if using these columns is correct before proceeding with calculations.\n4. I will use the \`ask_user_for_clarification\` tool.\n</thinking>\n<user_explanation>To calculate the profit margin, I need to know which columns represent revenue and costs. Could you clarify which columns to use?</user_explanation>\`\n\`\`\`json\n{\n  "tool": "ask_user_for_clarification",\n  "args": { "question": "I can calculate the profit margin using the 'Revenue' and 'COGS' columns. Is that correct?" }\n}\n\`\`\`\n`; }
     _buildCoreInstructions() { return `**IMPORTANT INSTRUCTIONS (User Experience Focus):**\n*   **User-Friendly Explanations:** In your \`<user_explanation>\` block, explain your progress towards the user's goal in simple, non-technical language. Focus on *what* you are doing for the user (e.g., "Loading your data", "Preparing the analysis code", "Running the calculations", "Generating the report").\n*   **DO NOT Mention Internals:** In your \`<user_explanation>\` and final \`textResponse\`, **DO NOT** mention internal tool names (like \\\`get_dataset_schema\\\`, \\\`generate_analysis_code\\\`, etc.), internal variables, or system identifiers like MongoDB ObjectIds. Keep the language focused on the user's perspective and the task progress.\n*   **Action AFTER Explanation:** Output the required JSON tool call object (or \\\`_answerUserTool\\\` call) **immediately after** the closing \`</user_explanation>\` tag.`; }
     _buildModificationHandling() { return `**MODIFICATION HANDLING:** If the user asks to **modify** the *most recently generated report* (e.g., 'change the title', 'use a line chart instead') AND you determine the modification **does not require recalculating the underlying data**:\n    a. Acknowledge the modification request in your \`<thinking>\` block and state you will use the previously calculated analysis results.\n    b. Confirm that \`Previous Turn Artifacts\` indicates existing analysis results or generated code.\n    c. Your **only** action should be to use the \`generate_report_code\` tool.\n    d. In the \`analysis_summary\` argument, describe the requested change (e.g., "User wants to change the title to 'New Title' and use a LineChart for the existing monthly revenue data."). Keep it concise.\n    e. Include any specific modification arguments (\`title\`, \`chart_type\`, etc.) based on the user's request in the \`args\` for \`generate_report_code\`.\n    f. Pass the original \`dataset_id\` associated with the analysis.\n    g. **DO NOT** call \`execute_analysis_code\`. The system will automatically provide the previous analysis data to the report generator based on context.`; }
     _buildErrorHandling() { return `**ERROR HANDLING:** If the *last step* shows an 'Error:',\n    a. Explain to the user (in \`<user_explanation>\`) that a step failed (e.g., "I encountered an error while running the analysis.").\n    b. Use \`_answerUserTool\` to inform the user you cannot proceed with that specific path.\n    c. DO NOT attempt to call the *same* tool again unless the error code explicitly suggests a retry AND you modify args. Prefer \`ask_user_for_clarification\` if missing info caused the error.`; }
     _buildClarificationGuidance() { return `**Requesting Clarification:** If the user's request is ambiguous (e.g., asks for 'profit margin' but required columns like 'Revenue' or 'COGS' aren't obvious from the schema) or if a previous tool failed because information was missing, use the \`ask_user_for_clarification\` tool to ask a specific question. Explain *why* you need clarification in \`<user_explanation>\`.`; }
     _buildFinalInstruction() { return `Respond now. Remember the strict output format: 1. \`<thinking>\` block. 2. \`<user_explanation>\` block. 3. EITHER the tool call JSON OR the \`_answerUserTool\` JSON.`; }
}

module.exports = SystemPromptBuilder;
```

---

This set of files incorporates all the changes outlined in the 5-phase plan for shifting to background parsing and GridFS storage, along with the necessary adjustments to the agent's workflow and tools. Remember to run `npm install` in the `backend/` directory after adding `mongodb` to `package.json`. Also, ensure the Cloud Tasks queue (`DATASET_PARSER_QUEUE`) is created and permissions are correctly set in your Google Cloud project.