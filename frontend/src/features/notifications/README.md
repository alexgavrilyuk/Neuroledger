# frontend/src/features/notifications/README.md

## Feature: Frontend Notifications

This feature provides the UI components and hooks for displaying user notifications, primarily focusing on the notification bell indicator in the header and the dropdown list panel.

### Core Components & Hooks

*   **`hooks/useNotifications.js`**:
    *   **Purpose:** Central hook for managing notification state and interactions with the backend notification API.
    *   **Functionality:**
        *   Fetches notifications (`GET /notifications` with pagination) and unread count (`GET /notifications/unread-count`).
        *   Provides state: `notifications` (array), `unreadCount` (number), `isLoading`, `error`.
        *   Exports functions:
            *   `markAsRead(ids?)`: Calls `PUT /notifications/mark-read` and updates local state. Marks all if `ids` is null/empty.
            *   `deleteNotification(id)`: Calls `DELETE /notifications/:id` and updates local state.
            *   `refetch()`: Reloads notifications and unread count.
            *   `fetchMore(limit)`: Fetches the next page of notifications.
        *   Implements polling via `setInterval` (30s) to update `unreadCount`.

*   **`components/NotificationBell.jsx`**:
    *   **Purpose:** Renders the bell icon in the application header, indicating notification status and controlling the dropdown visibility.
    *   **Functionality:**
        *   Uses `useNotifications` hook to get `unreadCount`.
        *   Displays `BellIcon` or `BellAlertIcon` based on count.
        *   Shows badge/pulse for unread notifications.
        *   Toggles the display of `NotificationList` component.
        *   Calls `markAsRead()` (mark all) when the list is opened via `handleToggle`.

*   **`components/NotificationList.jsx`**:
    *   **Purpose:** Renders the dropdown panel displaying the list of notifications.
    *   **Functionality:**
        *   Uses `useNotifications` hook for data and actions (`deleteNotification`, `markAsRead`, `fetchMore`, etc.).
        *   Uses `useTeamInvites` hook (from `features/team_management`) to get pending invites and accept/reject actions.
        *   Displays loading/error/empty states.
        *   Renders individual notifications with icon, title, message, relative time.
        *   Provides a delete button for each notification.
        *   **Handles Team Invites:** For `team_invite` type, checks if the invite is still valid (via `useTeamInvites`) and hasn't been acted upon locally (using `localStorage`). If valid, displays Accept/Decline buttons which call actions from `useTeamInvites` and update local state/localStorage. Shows Accepted/Declined status for processed invites.
        *   Includes a "Load more" button.
        *   Handles closing the panel on outside click.

### Integration

*   The `NotificationBell` component is intended to be placed in a shared header component (e.g., within `AppLayout`).
*   The `NotificationList` is rendered conditionally by `NotificationBell`.

### Dependencies

*   **Internal Features:**
    *   `features/team_management/hooks/useTeamInvites` (Crucial dependency for handling invite actions within the list).
*   **Shared Modules:**
    *   `shared/hooks/useAuth` (via `useNotifications`).
    *   `shared/services/apiClient`.
    *   `shared/ui/Spinner`.
    *   `@heroicons/react`.
*   **External Libraries:**
    *   `date-fns` (for `formatDistanceToNow`).
    *   `react`.

### State Management

*   Notification list, unread count, loading/error states managed within `useNotifications`.
*   Dropdown visibility (`isOpen`) managed locally in `NotificationBell`.
*   Local state for invite action progress/errors and processed invite status (using `localStorage`) managed within `NotificationList`.