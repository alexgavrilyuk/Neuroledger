# backend/src/features/teams/README.md

## Feature: Teams

This feature slice enables collaboration within NeuroLedger by allowing users to create and join teams, share datasets, and use team-specific context for AI-driven report generation.

### Files

*   **`team.model.js`**: Defines the Mongoose schema for teams.
    *   **Key Fields:**
        *   `name`: (String, Required) Team name.
        *   `settings`: (Object) Team settings, including currency, dateFormat, and aiContext.
        *   `ownerId`: (ObjectId, Required) Reference to the user who created the team.
        *   `createdAt`/`updatedAt`: (Date) Timestamps.

*   **`team-member.model.js`**: Defines the relationships between users and teams.
    *   **Key Fields:**
        *   `teamId`: (ObjectId, Required) Team reference.
        *   `userId`: (ObjectId, Required) User reference.
        *   `role`: (String, Required) "admin" or "member".
        *   `joinedAt`: (Date) When the user joined.

*   **`team-invite.model.js`**: Manages team invitations.
    *   **Key Fields:**
        *   `teamId`: (ObjectId, Required) Team reference.
        *   `invitedByUserId`: (ObjectId, Required) User who sent the invite.
        *   `inviteeEmail`: (String, Required) Invited user's email.
        *   `role`: (String, Required) "admin" or "member".
        *   `status`: (String, Required) "pending", "accepted", "rejected", or "expired".
        *   `createdAt`/`expiresAt`: (Date) Timestamps.

*   **`team.service.js`**: Business logic for team operations.
    *   **Key Functions:**
        *   `createTeam`: Create a new team with the user as admin.
        *   `getUserTeams`: Get all teams a user belongs to.
        *   `getTeamWithMembers`: Get team details including member list.
        *   `updateTeamSettings`: Update team settings.
        *   `inviteUserToTeam`: Send a team invitation.
        *   `getPendingInvitesByEmail`: Get pending invites for a user.
        *   `acceptTeamInvite`/`rejectTeamInvite`: Handle invitation responses.
        *   `updateMemberRole`: Change a member's role.
        *   `removeMember`: Remove a user from a team.
        *   `getTeamDatasets`: Get datasets belonging to a team.

*   **`team.controller.js`**: HTTP request handlers for team endpoints.
*   **`team.middleware.js`**: Role-based access control middleware.
    *   `isTeamMember`: Checks if a user belongs to a specific team.
    *   `isTeamAdmin`: Checks if a user has admin role in a specific team.
*   **`team.routes.js`**: API routes for team management.
*   **`README.md`**: This documentation file.

### API Endpoints

All endpoints require authentication (`protect` middleware). Specific role requirements are noted.

*   **Team Management:**
    *   **`POST /api/v1/teams`**
        *   **Description:** Create a new team. The creator becomes the owner and an admin.
        *   **Request Body:** `{ "name": string, "settings"?: { "currency"?: string, "dateFormat"?: string, "aiContext"?: string } }`
        *   **Success (201 Created):** `{ status: 'success', data: Team }`
        *   **Errors:** `400` (Missing name), `500`.
    *   **`GET /api/v1/teams`**
        *   **Description:** List all teams the current user is a member of. Includes the user's role (`userRole`) in each team.
        *   **Success (200 OK):** `{ status: 'success', data: [Team & { userRole: 'admin'|'member' }] }`
        *   **Errors:** `500`.
    *   **`GET /api/v1/teams/:teamId`**
        *   **Auth:** Requires Team Membership (`isTeamMember` middleware).
        *   **Description:** Get team details, including a list of members with their roles.
        *   **Request Params:** `teamId` (ObjectId)
        *   **Success (200 OK):** `{ status: 'success', data: Team & { members: [{ _id, name, email, role, joinedAt }] } }`
        *   **Errors:** `403` (Not member), `404` (Team not found), `500`.
    *   **`PUT /api/v1/teams/:teamId/settings`**
        *   **Auth:** Requires Team Admin Role (`isTeamAdmin` middleware).
        *   **Description:** Update team settings (currency, dateFormat, aiContext).
        *   **Request Params:** `teamId` (ObjectId)
        *   **Request Body:** `{ "settings": { "currency"?: string, "dateFormat"?: string, "aiContext"?: string } }` (Requires `settings` object).
        *   **Success (200 OK):** `{ status: 'success', data: Team }` (Updated team)
        *   **Errors:** `400` (Missing settings), `403` (Not admin), `404` (Team not found), `500`.
    *   **`GET /api/v1/teams/:teamId/datasets`**
        *   **Auth:** Requires Team Membership (`isTeamMember` middleware).
        *   **Description:** Get all datasets associated with this team (`teamId` field matches).
        *   **Request Params:** `teamId` (ObjectId)
        *   **Success (200 OK):** `{ status: 'success', data: [Dataset] }`
        *   **Errors:** `403` (Not member), `404` (Team not found), `500`.

*   **Member Management:**
    *   **`POST /api/v1/teams/:teamId/invites`**
        *   **Auth:** Requires Team Admin Role (`isTeamAdmin` middleware).
        *   **Description:** Invite a user (by email) to join the team. Creates a `TeamInvite` record and sends a notification if the invitee is an existing user.
        *   **Request Params:** `teamId` (ObjectId)
        *   **Request Body:** `{ "email": string, "role"?: "admin" | "member" }` (Role defaults to 'member').
        *   **Success (201 Created):** `{ status: 'success', data: TeamInvite }`
        *   **Errors:** `400` (Missing email; User already member; User already has pending invite), `403` (Not admin), `404` (Team not found), `500`.
    *   **`PUT /api/v1/teams/:teamId/members/:memberId/role`**
        *   **Auth:** Requires Team Admin Role (`isTeamAdmin` middleware).
        *   **Description:** Update a team member's role. Cannot demote the last admin. Creates a notification for the affected member.
        *   **Request Params:** `teamId` (ObjectId), `memberId` (User ObjectId)
        *   **Request Body:** `{ "role": "admin" | "member" }` (Required).
        *   **Success (200 OK):** `{ status: 'success', data: TeamMember }` (Updated member record)
        *   **Errors:** `400` (Invalid role; Member not found; Cannot demote last admin), `403` (Not admin), `404` (Team not found), `500`.
    *   **`DELETE /api/v1/teams/:teamId/members/:memberId`**
        *   **Auth:** Requires Team Admin Role (`isTeamAdmin` middleware).
        *   **Description:** Remove a member from the team. Cannot remove the last admin. Creates a notification for the removed member. Uses a transaction.
        *   **Request Params:** `teamId` (ObjectId), `memberId` (User ObjectId)
        *   **Success (200 OK):** `{ status: 'success', data: { success: true } }`
        *   **Errors:** `400` (Member not found; Cannot remove last admin), `403` (Not admin), `404` (Team not found), `500`.

*   **Invitation Handling:**
    *   **`GET /api/v1/teams/invites/pending`**
        *   **Description:** Get pending, non-expired invites for the current authenticated user (based on their email). Populates team and inviter details.
        *   **Success (200 OK):** `{ status: 'success', data: [FormattedTeamInvite] }` (Formatted to include `teamName`, `invitedBy.name`, etc.)
        *   **Errors:** `500`.
    *   **`POST /api/v1/teams/invites/:inviteId/accept`**
        *   **Description:** Accept a team invitation. Validates invite status/expiry, checks user email. Creates `TeamMember` record, updates `User.teams` array, updates invite status. Uses a transaction. Creates a notification.
        *   **Request Params:** `inviteId` (ObjectId)
        *   **Success (200 OK):** `{ status: 'success', data: { teamId: string, role: string } }`
        *   **Errors:** `400` (Invite not found/processed/expired; Email mismatch; Already member), `404` (User not found for invite ID), `500`.
    *   **`POST /api/v1/teams/invites/:inviteId/reject`**
        *   **Description:** Reject a team invitation. Validates invite status, checks user email. Updates invite status to 'rejected'.
        *   **Request Params:** `inviteId` (ObjectId)
        *   **Success (200 OK):** `{ status: 'success', data: { success: true } }`
        *   **Errors:** `400` (Invite not found/processed; Email mismatch), `404` (User not found for invite ID), `500`.

### Related Components

* **Notifications:** Team invites, role changes, and membership updates trigger notifications.
* **Datasets:** Updated to support team ownership and shared access.
* **Prompts:** Context assembly includes team business context for improved AI responses.

### Security Considerations

* Role-based access control for all team operations
* Team dataset access limited to current team members
* Validation to prevent creating duplicate invites
* Check to ensure the last admin cannot be removed or demoted

### Database Changes

* Added indexing for performance on frequently queried fields
* Compound indexes for uniqueness (e.g., teamId + userId in TeamMember)
* Added proper foreign key references between collections