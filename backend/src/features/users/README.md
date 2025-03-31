# backend/src/features/users/README.md

## Feature: Users

This feature slice manages user data within the NeuroLedger application database. In Phase 1, it primarily defines the User data model.

### Files

*   **`user.model.js`**: Defines the Mongoose schema for the `User` collection in MongoDB.
    *   **Key Fields (Phase 1):**
        *   `firebaseUid`: (String, Required, Unique) The unique ID from Firebase Authentication. Links the Firebase user to the application user.
        *   `email`: (String, Required, Unique) User's email address.
        *   `name`: (String) User's display name (optional).
        *   `createdAt`: (Date) Timestamp of user creation.
        *   `subscriptionInfo`: (Object) Placeholder for subscription details (Phase 2+).
        *   `settings`: (Object) Placeholder for user-specific settings (Phase 8+).
        *   `teams`: (Array) Placeholder for team memberships (Phase 7+).
*   **`README.md`**: This file.

### Future Files (Not in Phase 1)

*   `user.controller.js`: Will handle HTTP requests for fetching/updating user profiles and settings (e.g., `GET /api/v1/users/me`, `PUT /api/v1/users/me/settings`).
*   `user.service.js`: Will contain the logic for interacting with the User model (fetching user data, updating settings).
*   `user.routes.js`: Will define the routes for user management endpoints.

### Exports

*   `user.model.js` exports the Mongoose model for `User`.

### Dependencies

*   `mongoose`