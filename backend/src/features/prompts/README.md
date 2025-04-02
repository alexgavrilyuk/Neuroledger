# backend/src/features/prompts/README.md
# ** UPDATED FILE - Reflect explicit scope injection + logging **

## Feature: Prompts & AI Interaction

This feature slice handles receiving user prompts, interacting with the AI model (Anthropic Claude) to generate **React code**, and returning that code to the frontend for client-side execution via Web Workers.

### Core Flow (Phase 5 - Client-Side Execution with Debug Logging)

1.  **API Request (`POST /api/v1/prompts`):** Frontend sends `promptText` and `selectedDatasetIds`. Middleware validates auth/subscription.
2.  **Controller (`prompt.controller.js::generateAndExecuteReport`):** Validates request, calls `prompt.service.generateCode`.
3.  **Service (`prompt.service.js::generateCode`):**
    *   Creates an initial `PromptHistory` record.
    *   **Assembles Context:** Gathers schema/metadata.
    *   **Generates System Prompt:** Creates detailed instructions for Claude:
        *   Requires `ReportComponent` using `React.createElement`.
        *   Requires accessing libraries via `executionScope` object.
        *   Expects data via `datasets` prop, parsing MUST use `executionScope.Papa`.
        *   **Explicitly instructs the AI to add extensive internal logging** using `executionScope.console.log` and `executionScope.console.error` to track data parsing and calculations within the generated component. This is critical for debugging.
    *   **Calls Claude API.**
    *   **Extracts Code.** Logs the extracted code to the backend console for inspection.
    *   **Updates History.**
    *   Returns the `aiGeneratedCode` (or error) to the controller.
4.  **API Response:** Backend sends the `aiGeneratedCode` string (or error details) back to the frontend.

### Files

*   `prompt.model.js`
*   `prompt.service.js` (Updated system prompt for scope + logging, logs generated code)
*   `prompt.controller.js`
*   `prompt.routes.js`
*   `README.md` (This file)

### Dependencies

*   Anthropic Claude Client
*   User, Dataset, PromptHistory models
*   `logger`
*   Middleware

### API Endpoints (Phase 5 - Client-Side Exec)

*   **`POST /api/v1/prompts`**
    *   **Description:** Triggers AI code generation and returns the generated code string.
    *   **Auth:** Required (Login + Sub).
    *   **Request:** `{ promptText: string, selectedDatasetIds: string[] }`
    *   **Success (200):** `{ status: 'success', data: { aiGeneratedCode: string, promptId: string } }`
    *   **Errors:** `400`, `401`, `403`, `500`.