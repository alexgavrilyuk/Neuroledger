// ================================================================================
// FILE: NeuroLedger/backend/src/features/prompts/README.md
// ================================================================================
# backend/src/features/prompts/README.md
# ** UPDATED FILE - Reflect JSON generation **

## Feature: Prompts & AI Code Generation

This feature slice handles receiving user prompts along with selected datasets, interacting with the Anthropic Claude API to generate **executable JavaScript React component code (as a string)** based on the context, and returning that code string to the frontend for client-side execution.

### Core Flow (Code Generation)

1.  **API Request (`POST /api/v1/prompts`)**:
    *   Frontend sends `promptText` (user's request) and `selectedDatasetIds` (array of dataset ObjectIds).
    *   Middleware (`protect`, `requireActiveSubscription`) validates authentication and subscription status.
2.  **Controller (`prompt.controller.js::generateAndExecuteReport`)**:
    *   Validates required request body fields (`promptText`, `selectedDatasetIds`).
    *   Calls `promptService.generateCode` with user ID and request data.
    *   Handles potential errors returned by the service (e.g., `error_generating`).
    *   On success, returns a 200 OK response containing the generated `aiGeneratedCode` (string) and the `promptId`.
3.  **Service (`prompt.service.js::generateCode`)**:
    *   Creates an initial `PromptHistory` record with status `generating_code`.
    *   **Assembles Context (`assembleContext`)**:
        *   Retrieves user settings (`aiContext`, currency, date format) from the `User` model.
        *   Retrieves `aiContext` from all teams the user is a member of (`TeamMember`, `Team` models).
        *   Retrieves metadata (`name`, `description`, `schemaInfo`, `columnDescriptions`, `teamId.name`) for the `selectedDatasetIds` the user has access to (`Dataset` model).
        *   Formats this information into a structured `contextString`.
    *   **Generates System Prompt (`system-prompt-template.js`)**:
        *   Uses the assembled context (`userContext`, `datasetContext`, `promptText`) to create detailed instructions for Claude.
        *   **Crucially, instructs Claude to generate ONLY the body of a JavaScript React functional component named `ReportComponent`**, using `React.createElement` syntax, accepting `datasets` props, and referencing specific global libraries (`React`, `Recharts`, `_`, `Papa`). Forbids JSX and markdown wrappers.
    *   **Calls Claude API**: Sends the system prompt and user message to the Claude API (`claude-3-7-sonnet-20250219` model) to generate the code.
    *   **Extracts Code**: Parses the Claude API response, attempting to extract the raw JavaScript code, potentially removing markdown fences (` ``` `). Performs basic validation checks.
    *   **Updates History**: Saves the generated code string to the `aiGeneratedCode` field in the `PromptHistory` record, along with status (`completed` or `error_generating`), duration, model used, and context sent.
    *   Returns an object containing `{ aiGeneratedCode, promptId, status, errorMessage }` to the controller.
4.  **API Response (`200 OK` or `500 Internal Server Error`)**:
    *   Backend sends the response from the controller, typically `{ status: 'success', data: { aiGeneratedCode: string, promptId: string } }` or an error object.

**(Note:** The actual execution of the `aiGeneratedCode` is handled **client-side**, likely within a sandbox environment like an iframe, as indicated by the system prompt's constraints and the `FE_BE_INTERACTION_README.md`.)

### Files

*   **`prompt.model.js`**: Mongoose schema (`PromptHistory`) for storing prompt details, context, generated code (`aiGeneratedCode`), status, potential errors, and execution results (`executionResult` - currently unused in backend generation flow).
*   **`prompt.service.js`**: Contains the core logic for context assembly (`assembleContext`) and interacting with Claude to generate React code (`generateCode`).
*   **`prompt.controller.js`**: Handles the HTTP request/response for the `POST /prompts` endpoint, calls the service, and returns the generated code string.
*   **`prompt.routes.js`**: Defines the `POST /prompts` route and applies auth/subscription middleware.
*   **`system-prompt-template.js`**: Exports a function that generates the detailed system prompt instructing Claude on how to format the React component code.
*   **`README.md`**: This file.

### Data Model Interaction

*   **Primary:** `PromptHistory` model (Write: Create initial record, update with results/errors).
*   **Supporting (Read-only for context):**
    *   `User` model (for `settings.aiContext`, user ID).
    *   `Dataset` model (for metadata of selected datasets).
    *   `Team` model (for `settings.aiContext`).
    *   `TeamMember` model (to find user's teams).

### External Service Interactions

*   **Anthropic Claude API**: Called by `prompt.service.js` to generate the React component code string. Requires API key configured (`shared/external_apis/claude.client.js`).

### Dependencies

*   **Internal Features:**
    *   `users` (for `User` model)
    *   `datasets` (for `Dataset` model)
    *   `teams` (for `Team`, `TeamMember` models)
*   **Shared Modules:**
    *   `shared/middleware/auth.middleware.js` (`protect`)
    *   `shared/middleware/subscription.guard.js` (`requireActiveSubscription`)
    *   `shared/external_apis/claude.client.js`
    *   `shared/utils/logger.js`
*   **External Libraries:**
    *   `@anthropic-ai/sdk`
    *   `express`
    *   `mongoose`

### API Endpoints

*   **`POST /api/v1/prompts`**
    *   **Auth**: Required (Login + Active Subscription)
    *   **Description:** Takes a user prompt and selected dataset IDs, interacts with Claude to generate a React component code string for client-side execution, and returns this code string.
    *   **Request Body:**
        ```json
        {
          "promptText": "string", // User's natural language request
          "selectedDatasetIds": ["string"] // Array of Dataset ObjectIds
        }
        ```
    *   **Success Response (200 OK):**
        ```json
        {
          "status": "success",
          "data": {
            "aiGeneratedCode": "string", // The generated JS React component code
            "promptId": "string" // ID of the PromptHistory record
          }
        }
        ```
    *   **Error Responses:**
        *   `400 Bad Request`: Missing or invalid `promptText` or `selectedDatasetIds`.
        *   `401 Unauthorized`: User not authenticated.
        *   `403 Forbidden`: User subscription inactive.
        *   `500 Internal Server Error`: AI generation failed (error details might be in message), context assembly failed, database error. May include `{ data: { promptId: string } }` if history record was created before failure.