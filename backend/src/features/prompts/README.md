# backend/src/features/prompts/README.md
# ** NEW FILE **

## Feature: Prompts & AI Interaction

This feature slice handles receiving user prompts, interacting with the AI model (Anthropic Claude), generating responses (textual in Phase 4, code later), and storing the interaction history.

### Core Flow (Phase 4 - Textual Analysis)

1.  **API Request (`POST /api/v1/prompts`):**
    *   The frontend sends the user's `promptText` and an array of `selectedDatasetIds`.
    *   Middleware (`protect`, `requireActiveSubscription`) ensures the user is authenticated and has an active subscription.
2.  **Controller (`prompt.controller.js`):**
    *   Validates the request body.
    *   Calls `prompt.service.createPromptResponse` with user ID, prompt text, and dataset IDs.
    *   Formats the service response and sends it back to the frontend.
3.  **Service (`prompt.service.js`):**
    *   **Context Assembly (`assembleContext`):** Fetches basic information about the selected datasets (name, schema column names) belonging to the user. Fetches placeholder user settings. Creates a text block containing this context.
    *   **System Prompt:** Defines the AI's role as a financial analyst providing **textual analysis only** for this phase.
    *   **API Call:** Constructs the message history and calls the Claude API (via `claude.client.js`) using a suitable model (e.g., Haiku) requesting analysis based on the user prompt and assembled context.
    *   **Response Handling:** Extracts the textual response from the Claude API result.
    *   **History Storage:** Creates a new `PromptHistory` document in MongoDB, storing the user prompt, selected datasets, context sent (for debugging), the AI's textual response, status ('completed'), duration, and the model used.
    *   Returns the AI's textual response and the ID of the history record.
4.  **Model (`prompt.model.js`):**
    *   Defines the Mongoose schema for the `promptHistories` collection, storing details of each user-AI interaction.

### Files

*   **`prompt.model.js`**: Mongoose schema for storing interaction history.
*   **`prompt.service.js`**: Core logic for context assembly, Claude API interaction, and history saving.
*   **`prompt.controller.js`**: Handles HTTP requests for generating responses.
*   **`prompt.routes.js`**: Defines the `POST /` route and applies middleware.
*   **`README.md`**: This file.

### Dependencies

*   `@anthropic-ai/sdk` (via `shared/external_apis/claude.client.js`)
*   `User` model (`features/users/user.model.js`)
*   `Dataset` model (`features/datasets/dataset.model.js`)
*   `mongoose`
*   `logger`
*   Middleware (`protect`, `requireActiveSubscription`)

### API Endpoints (Phase 4)

*   **`POST /api/v1/prompts`**
    *   **Description:** Takes a user prompt and selected dataset IDs, generates a textual analysis using Claude, saves the interaction, and returns the AI response.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Body:** `{ "promptText": string, "selectedDatasetIds": string[] }`
    *   **Success Response (200):** `{ status: 'success', data: { aiResponse: string, promptId: string } }`
    *   **Error Responses:** `400` (Bad Request - missing fields), `401`, `403`, `500` (e.g., Claude API error, DB error).