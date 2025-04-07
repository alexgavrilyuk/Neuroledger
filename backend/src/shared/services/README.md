# Shared Services

This directory contains shared service modules that are used across multiple features.

## Available Services

### Cloud Tasks Service (`cloudTasks.service.js`)

A reusable service for creating Google Cloud Tasks. This centralizes the cloud task creation logic across different features.

**Usage:**
```javascript
const { createTask } = require('../../shared/services/cloudTasks.service');

// Create a task
const response = await createTask(
  config.qualityAuditQueueName, // queue name from config
  '/internal/quality-audit-worker', // endpoint path
  { datasetId, userId } // payload
);
```

The service handles:
- Initializing the Cloud Tasks client
- Creating task with proper OIDC token configuration for authentication
- Error handling and logging

This helps maintain consistency in how background tasks are created across different features. 