# backend/src/features/prompts/README.md
# ** UPDATED FILE - Reflect change to React.createElement prompting **

## Feature: Prompts & AI Interaction

This feature slice handles receiving user prompts, interacting with the AI model (Anthropic Claude), generating **React code using `React.createElement`**, executing that code via the execution service, and storing the interaction history.

### Core Flow (Phase 5 - Revised)

1.  **API Request (`POST /api/v1/prompts`):** Frontend sends `promptText` and `selectedDatasetIds`. Middleware validates auth/subscription.
2.  **Controller (`prompt.controller.js`):** Validates request, calls `prompt.service.generateCodeAndExecute`.
3.  **Service (`prompt.service.js`):**
    *   Creates an initial `PromptHistory` record.
    *   **Assembles Context:** Gathers schema/metadata about selected datasets to inform the AI.
    *   **Pre-fetches Data:** Loads the actual content of the selected datasets from GCS.
    *   **Generates System Prompt:** Creates detailed instructions for Claude, **explicitly requiring it to generate a React component named `ReportComponent` using ONLY `React.createElement` syntax (NO JSX)**. It specifies the expected `datasets` prop structure (including the pre-fetched `content` string) and the available libraries (React, Recharts, PapaParse, Lodash).
    *   **Calls Claude API:** Sends the context, user prompt, and system prompt to Claude to generate the JavaScript code string. Logs the generated code.
    *   **Prepares Execution Context:** Bundles the pre-fetched dataset content (`{ name, content }`) for the execution service.
    *   **Calls Execution Service:** Invokes `executionService.executeGeneratedCode`, passing the generated JS code string and the data context.
    *   **Processes Result:** Receives the execution status and output (rendered HTML string or error message) from the execution service.
    *   **Updates History:** Updates the `PromptHistory` record with the generated code, execution status, result/error, and duration.
    *   Returns the execution result to the controller.
4.  **Execution Service (`code_execution/execution.service.js`):** (Placeholder) Takes the JS code string and data context. Uses `new Function()` (INSECURE!) to execute the code, providing the specified libraries (React, ReactDOMServer, etc.) and the `datasets` prop. Renders the component to an HTML string using `ReactDOMServer.renderToString()`. Returns success/output or error.
5.  **Model (`prompt.model.js`):** Defines the schema for storing interaction history, including fields for `aiGeneratedCode` and `executionResult`.

### Files

*   `prompt.model.js`
*   `prompt.service.js` (Major changes in system prompt and data handling)
*   `prompt.controller.js`
*   `prompt.routes.js`
*   `README.md` (This file)

### Dependencies

*   Anthropic Claude Client
*   User, Dataset, PromptHistory models
*   `code_execution.service.js`
*   `logger`
*   Middleware

### API Endpoints (Phase 5)

*   **`POST /api/v1/prompts`**
    *   **Description:** Triggers AI code generation (using `React.createElement`), executes code, returns rendered HTML or error.
    *   **Auth:** Required (Login + Sub).
    *   **Request:** `{ promptText: string, selectedDatasetIds: string[] }`
    *   **Success (200):** `{ status: 'success', data: { executionOutput: string, executionStatus: 'completed' | 'error_...', promptId: string } }`
    *   **Errors:** `400`, `401`, `403`, `500`.