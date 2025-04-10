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

### Code Execution Service (`codeExecution.service.js`)

Provides functionality to execute untrusted Node.js code within a sandboxed environment using the `vm` module. This is used by the AI Agent (Phase 2+) to run generated code for data analysis.

*   **`executeSandboxedCode(code, datasetId, userId)`**: Fetches the specified dataset content, prepares a minimal, restricted execution context (injecting `datasetContent` and a `sendResult` callback), and runs the provided `code` string within `vm.runInNewContext` with a strict timeout. Returns a promise resolving to `{ result: any | null, error: string | null }`.
*   **Security Warning:** Uses Node.js `vm`, which is **not** a true sandbox. Requires careful context control and will be replaced by a more robust solution in future phases.

## Usage

Import services as needed into feature-specific services or controllers.

```javascript
const codeExecutionService = require('../shared/services/codeExecution.service');

// ... later in an async function ...
const executionResult = await codeExecutionService.executeSandboxedCode(codeToRun, datasetId, userId);
if (executionResult.error) {
  // Handle error
} else {
  // Process executionResult.result
}
``` 