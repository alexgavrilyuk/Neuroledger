// ================================================================================
// FILE: NeuroLedger/backend/src/features/prompts/README.md
// ================================================================================
# backend/src/features/prompts/README.md
# ** UPDATED FILE - Reflect JSON generation **

## Feature: Prompts & AI Interaction

This feature slice handles receiving user prompts, interacting with the AI model (Anthropic Claude) to **generate a structured JSON object** representing the financial report, and returning that JSON to the frontend. Client-side rendering handles the display.

### Core Flow (Iframe / JSON Approach)

1.  **API Request (`POST /api/v1/prompts`):** Frontend sends `promptText` and `selectedDatasetIds`. Middleware validates auth/subscription.
2.  **Controller (`prompt.controller.js::generateAndExecuteReport`):** Validates request, calls `prompt.service.generateCode`.
3.  **Service (`prompt.service.js::generateCode`):**
    *   Creates an initial `PromptHistory` record.
    *   **Assembles Context:** Gathers schema/metadata for selected datasets and user/team settings.
    *   **Generates System Prompt:** Creates detailed instructions for Claude, specifically requesting it to output a **single, valid JSON object** describing the report structure (sections, titles, narrative, KPIs, chart specs, etc.). It explicitly forbids outputting code or markdown.
    *   **Calls Claude API.**
    *   **Parses JSON Response:** Attempts to parse Claude's response as JSON. Includes fallback logic to extract JSON if embedded in markdown. Throws an error if parsing fails.
    *   **Updates History:** Saves the generated JSON (as a string) to the `aiResponseText` field in `PromptHistory`.
    *   Returns the **parsed JSON object** (or error) to the controller.
4.  **API Response:** Backend sends the structured JSON report data (or error details) back to the frontend.

### Files

*   `prompt.model.js` (Stores history, including `aiResponseText` for the JSON string)
*   `prompt.service.js` (Updated system prompt for JSON output, parses response)
*   `prompt.controller.js` (Returns JSON data in response)
*   `prompt.routes.js`
*   `README.md` (This file)

### Dependencies

*   Anthropic Claude Client
*   User, Dataset, PromptHistory models
*   `logger`
*   Middleware

### API Endpoints (JSON Approach)

*   **`POST /api/v1/prompts`**
    *   **Description:** Triggers AI analysis and returns a JSON object describing the report.
    *   **Auth:** Required (Login + Sub).
    *   **Request:** `{ promptText: string, selectedDatasetIds: string[] }`
    *   **Success (200):** `{ status: 'success', data: { reportData: object, promptId: string } }` (Where `reportData` is the parsed JSON object from Claude)
    *   **Errors:** `400`, `401`, `403`, `500` (e.g., if JSON parsing fails or AI errors).