# backend/src/features/users/README.md

## Feature: Users

This feature slice manages user data, including profile information, application settings, subscription status, and team associations within the NeuroLedger application database.

### Core Functionality

*   **User Model (`user.model.js`)**: Defines the Mongoose schema (`User`) for storing user data. It serves as the central document holding user identity, preferences, subscription state, and team links.
*   **Profile Retrieval:** Provides an endpoint for authenticated users to retrieve their complete profile information.
*   **Settings Management:** Provides an endpoint for authenticated users to update their application settings (currency, date format, AI context).

### Files

*   **`user.model.js`**: Defines the Mongoose schema for the `User` collection.
    *   **Key Fields:**
        *   `firebaseUid`: (String, Required, Unique) Link to Firebase Auth user.
        *   `email`: (String, Required, Unique) User's email.
        *   `name`: (String) User's display name.
        *   `createdAt`: (Date) Timestamp.
        *   `subscriptionInfo`: (Object) Stores subscription tier, status, dates (`trialEndsAt`, `subscriptionEndsAt`), and Stripe IDs (future). Includes `hasActiveSubscription` helper method. Managed by the `subscriptions` feature.
        *   `settings`: (Object) Stores user preferences: `currency`, `dateFormat`, `aiContext`.
        *   `teams`: (Array of ObjectId refs to `Team`) Stores IDs of teams the user is a member of. Managed by the `teams` feature.
        *   `onboardingCompleted`: (Boolean) Tracks onboarding status.
*   **`user.controller.js`**: Handles HTTP requests for user profile and settings endpoints. Interacts directly with the `User` model.
*   **`user.routes.js`**: Defines the API routes (`GET /me`, `PUT /me/settings`) under `/api/v1/users`. Applies `protect` middleware to all routes.
*   **`README.md`**: This file.

**(Note:** There is no dedicated `user.service.js` file; the business logic is currently handled within the controller.)

### Data Model Interaction

*   **Primary:** `User` model (Read for `GET /me`, Read/Write for `PUT /me/settings`).
*   **(Implicit):** The `auth` feature writes to the `User` model (`getOrCreateUser`), and the `subscriptions` and `teams` features update specific fields (`subscriptionInfo`, `teams` array) within the `User` model.

### Dependencies

*   **Shared Modules:**
    *   `shared/middleware/auth.middleware.js` (`protect`)
    *   `shared/utils/logger.js`
*   **External Libraries:**
    *   `express`
    *   `mongoose`

### API Endpoints

All endpoints require authentication (`protect` middleware).

*   **`GET /api/v1/users/me`**
    *   **Description:** Retrieves the complete profile information for the currently authenticated user.
    *   **Success Response (200 OK):** `{ status: 'success', data: User }` (Full User object)
    *   **Errors:** `401` (Unauthorized), `404` (User not found in DB despite valid token), `500`.

*   **`PUT /api/v1/users/me/settings`**
    *   **Description:** Updates the settings for the currently authenticated user. Only provided fields are updated.
    *   **Request Body:** `{ "currency"?: string, "dateFormat"?: string, "aiContext"?: string }`
    *   **Success Response (200 OK):** `{ status: 'success', data: User }` (Full updated User object)
    *   **Errors:** `401` (Unauthorized), `404` (User not found), `500`.