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

* **Team Management:**
  * `POST /api/v1/teams` - Create a new team
  * `GET /api/v1/teams` - List all teams the user is a member of
  * `GET /api/v1/teams/:teamId` - Get team details
  * `PUT /api/v1/teams/:teamId/settings` - Update team settings (admin only)
  * `GET /api/v1/teams/:teamId/datasets` - Get all datasets for a team

* **Member Management:**
  * `POST /api/v1/teams/:teamId/invites` - Invite a user to a team (admin only)
  * `PUT /api/v1/teams/:teamId/members/:memberId/role` - Update member role (admin only)
  * `DELETE /api/v1/teams/:teamId/members/:memberId` - Remove a member (admin only)

* **Invitation Handling:**
  * `GET /api/v1/teams/invites/pending` - Get pending invites for the current user
  * `POST /api/v1/teams/invites/:inviteId/accept` - Accept an invitation
  * `POST /api/v1/teams/invites/:inviteId/reject` - Reject an invitation

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