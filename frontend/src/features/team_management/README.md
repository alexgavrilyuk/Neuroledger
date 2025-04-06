# frontend/src/features/team_management/README.md

## Feature: Frontend Team Management

This feature slice provides the UI components, pages, and hooks necessary for users to create, view, and manage teams within NeuroLedger.

### Core Components, Pages & Hooks

*   **`pages/TeamDetailsPage.jsx`**:
    *   **Purpose:** Displays the main view for managing a specific team, accessed via `/account/teams/:teamId`.
    *   **Functionality:**
        *   Fetches detailed team information, including the member list (`GET /teams/:id`).
        *   Determines if the current logged-in user is an admin of this specific team.
        *   Uses a tabbed interface to show "Members", "Datasets", and "Settings" (admin only).
        *   **Members Tab:** Renders `InviteForm` (admin only) and `MemberList`.
        *   **Datasets Tab:** Renders `TeamDatasetList`, fetching datasets for this team (`GET /teams/:id/datasets`).
        *   **Settings Tab:** Renders `TeamSettingsForm` (admin only).
        *   Orchestrates calls to backend API endpoints for team-specific actions (invite, update settings, update role, remove member) often via functions passed down to child components.

*   **`components/CreateTeamForm.jsx`**: Form UI for creating a new team (name, initial settings). Likely used within `AccountTeamsPage`. Calls `createTeam` from `useTeams`.
*   **`components/TeamList.jsx`**: Displays a list of teams the user belongs to. Likely used within `AccountTeamsPage`. Uses data from `useTeams`. Links to `TeamDetailsPage`.
*   **`components/PendingInvites.jsx`**: Displays pending team invitations for the current user. Likely used within `AccountTeamsPage`. Uses `useTeamInvites` for data and accept/reject actions.
*   **`components/TeamDatasetList.jsx`**: Displays a list of datasets belonging to a specific team. Used within `TeamDetailsPage`. Fetches data via prop function or internal effect.
*   **`components/InviteForm.jsx`**: Form UI for inviting a user (by email) to the current team. Used within `TeamDetailsPage` (Members tab). Calls `inviteUser`.
*   **`components/TeamSettingsForm.jsx`**: Form UI for updating team settings (name, AI context, etc.). Used within `TeamDetailsPage` (Settings tab). Calls `updateTeamSettings`.
*   **`components/MemberList.jsx`**: Displays the list of team members, allowing admins to change roles or remove members. Used within `TeamDetailsPage` (Members tab). Calls `updateMemberRole`, `removeMember`.

*   **`hooks/useTeams.js`**:
    *   **Purpose:** Manages the list of teams the user is a member of.
    *   **Functionality:** Fetches team list (`GET /teams`), provides `teams` state, loading/error state, `refetch`, and `createTeam` function (`POST /teams`).
*   **`hooks/useTeamInvites.js`**:
    *   **Purpose:** Manages pending invitations for the current user.
    *   **Functionality:** Fetches pending invites (`GET /teams/invites/pending`), provides `invites` state, loading/error, `refetch`, and `acceptInvite`/`rejectInvite` functions (`POST /invites/:id/accept`, `POST /invites/:id/reject`).
*   **`hooks/useTeamDetails.js`**:
    *   **Purpose:** Manages data and actions for a *single specific team*, identified by `teamId`. (Note: `TeamDetailsPage` currently fetches its own data but could potentially use this hook).
    *   **Functionality:** Fetches team details (`GET /teams/:id`), determines user's role (`isAdmin`), provides `team` state, loading/error, `refetch`, and functions for `updateTeamSettings`, `inviteUser`, `updateMemberRole`, `removeMember`, `fetchTeamDatasets`. Updates local state optimistically or after refetch on mutations.

### Integration

*   The components `CreateTeamForm`, `TeamList`, `PendingInvites` are likely used within the `AccountTeamsPage` (part of `account_management`).
*   The `TeamDetailsPage` is accessed via routing (`/account/teams/:teamId`). It uses the other components (`TeamDatasetList`, `InviteForm`, `TeamSettingsForm`, `MemberList`).
*   The `useTeamInvites` hook is also used by `features/notifications/components/NotificationList` to enable invite actions directly from notifications.

### State Management

*   Overall list of user's teams (`useTeams`) and pending invites (`useTeamInvites`) are managed by their respective hooks.
*   Detailed state for a specific team (`TeamDetailsPage`) is currently managed within the page component itself using `useState` and direct API calls, though `useTeamDetails` provides a hook-based alternative.