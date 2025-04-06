# backend/src/features/notifications/README.md

## Feature: Notifications

This feature provides a centralized system for creating, retrieving, managing, and displaying notifications to users about important application events, primarily focused on team-related activities initially.

### Core Functionality

*   **Notification Creation:** Other feature services (e.g., `teams.service`) call `notificationService.createNotification` to generate notifications for specific users when relevant events occur (like team invites).
*   **Notification Retrieval:** Users can fetch their notifications, optionally paginated, and get a count of unread notifications.
*   **Read Status Management:** Users can mark specific notifications or all their notifications as read.
*   **Deletion:** Users can delete individual notifications.
*   **(Internal):** A service function exists for periodic cleanup of old notifications, though it's not currently exposed via API or scheduled.

### Files

*   **`notification.model.js`**: Defines the Mongoose schema (`Notification`) for storing notification data.
    *   **Key Fields:** `userId`, `type` (enum: `team_invite`, `team_join`, `team_role_change`, `system`), `title`, `message`, `data` (Mixed object for context like `teamId`, `inviteId`), `isRead` (Boolean), `createdAt` (Date).
*   **`notification.service.js`**: Contains the core business logic for notification operations.
    *   `createNotification`: Saves a new notification document. Called by other services.
    *   `getUserNotifications`: Retrieves paginated notifications for a user, sorted by creation date.
    *   `getUnreadCount`: Counts unread notifications for a user.
    *   `markAsRead`: Updates the `isRead` status for specified or all user notifications.
    *   `deleteNotificationById`: Deletes a specific notification document owned by the user.
    *   `deleteOldNotifications`: (Internal use) Deletes notifications older than a specified number of days.
    *   `getUnreadNotifications`: (Internal use?) Gets all unread notifications (not directly used by controller currently).
*   **`notification.controller.js`**: Handles HTTP request validation and responses for notification API endpoints, calling the appropriate service functions.
*   **`notification.routes.js`**: Defines API routes (`/`, `/unread-count`, `/mark-read`, `/:notificationId`) under `/api/v1/notifications`. Applies `protect` middleware to all routes.
*   **`README.md`**: This documentation file.

### Data Model Interaction

*   **Primary:** `Notification` model (CRUD operations).
*   **Supporting:** `User` model (implicitly via `req.user` from `protect` middleware to get `userId`).

### Dependencies

*   **Shared Modules:**
    *   `shared/middleware/auth.middleware.js` (`protect`)
    *   `shared/utils/logger.js`
*   **External Libraries:**
    *   `express`
    *   `mongoose`

### How Notifications are Created

Notifications are **not** created via a dedicated API endpoint in this feature slice. Instead, other feature services are responsible for calling `notificationService.createNotification` when an event warrants notifying a user.

**Examples:**

*   When a user is invited to a team (`teams.service`).
*   When a user accepts/rejects an invite (`teams.service`).
*   When a user's role in a team changes (`teams.service`).

### API Endpoints

All endpoints require authentication (Login).

*   **`GET /api/v1/notifications`**
    *   **Description:** Retrieves notifications for the current user, sorted by creation date (newest first), with pagination.
    *   **Query Params:**
        *   `limit` (number, optional, default: 20): Max number of notifications per page.
        *   `skip` (number, optional, default: 0): Number of notifications to skip for pagination.
    *   **Success Response (200 OK):**
        ```json
        {
          "status": "success",
          "data": {
            "notifications": [ Notification ],
            "total": number, // Total number of notifications for the user
            "hasMore": boolean // True if more notifications exist beyond the current page
          }
        }
        ```
    *   **Errors**: `500`

*   **`GET /api/v1/notifications/unread-count`**
    *   **Description:** Gets the count of unread notifications for the current user.
    *   **Success Response (200 OK):**
        ```json
        {
          "status": "success",
          "data": {
            "count": number
          }
        }
        ```
    *   **Errors**: `500`

*   **`PUT /api/v1/notifications/mark-read`**
    *   **Description:** Marks notifications as read for the current user.
    *   **Request Body:**
        *   `{ "notificationIds": [string] }` (Optional): An array of specific notification `_id`s to mark as read.
        *   If `notificationIds` is omitted, `null`, or an empty array, **all** notifications for the user will be marked as read.
    *   **Success Response (200 OK):**
        ```json
        {
          "status": "success",
          "data": {
            "modifiedCount": number // Number of notifications marked as read
          }
        }
        ```
    *   **Errors**: `500`

*   **`DELETE /api/v1/notifications/:notificationId`**
    *   **Description:** Deletes a specific notification belonging to the current user.
    *   **Request Params**: `notificationId` (MongoDB ObjectId, required)
    *   **Success Response (200 OK):**
        ```json
        {
          "status": "success",
          "data": { "success": true }
        }
        ```
    *   **Errors**:
        *   `400 Bad Request`: Invalid `notificationId` format.
        *   `404 Not Found`: Notification not found or does not belong to the user.
        *   `500`

### Future Enhancements Considered

*   Real-time notifications (WebSockets)
*   Email notifications
*   User preferences for notifications
*   Categorization/filtering

This feature provides the foundation for a comprehensive notification system that can be expanded as the application grows.