# FE_BE_INTERACTION_README.md
# ** UPDATED FILE - Added Dataset Deletion, Proxy Upload, and Team Access for Datasets **

# NeuroLedger: Frontend / Backend API Interaction

This document defines the contract for communication between the NeuroLedger frontend (React) and backend (Node.js/Express) services.

**Last Updated:** April 2025

## 1. Base API URL

`/api/v1` (Default Dev: `http://localhost:5001/api/v1`)

## 2. Authentication

`Authorization: Bearer <Firebase ID Token>` on protected routes. Verified by `protect` middleware. Session init via `POST /auth/session`.

## 3. Standard Responses

*   **Success:** `{ "status": "success", "data": <Payload> | null }`
*   **Error:** `{ "status": "error", "message": string, "code"?: string, "details"?: any }`

## 4. Endpoint Specifications

---

### Feature: Authentication

*   **`POST /api/v1/auth/session`**
    *   Verifies token, gets/creates user.
    *   **Success (200):** `{ status: 'success', data: User }`

---

### Feature: Subscriptions (Dummy)

*   **`GET /api/v1/subscriptions/status`**
    *   Gets current status, checks trial expiry.
    *   **Auth:** Required.
    *   **Success (200):** `{ status: 'success', data: SubscriptionInfo }`
*   **`POST /api/v1/subscriptions/select`**
    *   Selects dummy plan.
    *   **Auth:** Required.
    *   **Request:** `{ "planId": string }`
    *   **Success (200):** `{ status: 'success', data: User }`

---

### Feature: Users (New)

*   **`GET /api/v1/users/me`**
    *   Gets current user's profile information.
    *   **Auth:** Required.
    *   **Success (200):** `{ status: 'success', data: User }`
    *   **Errors:** `401` (Unauthorized), `404` (User not found), `500`.
*   **`PUT /api/v1/users/me/settings`**
    *   Updates user settings, including business context.
    *   **Auth:** Required.
    *   **Request:** `{ currency?: string, dateFormat?: string, aiContext?: string }`
    *   **Success (200):** `{ status: 'success', data: User }`
    *   **Errors:** `401` (Unauthorized), `404` (User not found), `500`.

---

### Feature: Datasets

*   **`GET /api/v1/datasets/upload-url`**
    *   Generates GCS signed URL for PUT upload.
    *   **Auth:** Required (Login + Sub).
    *   **Query:** `filename` (req), `fileSize` (req).
    *   **Success (200):** `{ data: { signedUrl, gcsPath } }`

*   **`POST /api/v1/datasets/proxy-upload`**
    *   Uploads file to backend which then uploads it to GCS and creates metadata.
    *   **Auth:** Required (Login + Sub).
    *   **Request:** FormData with `file` (req) and optional `teamId`.
    *   **Success (201):** `{ status: 'success', data: Dataset }`
    *   **Errors:** `400` (Missing file), `403` (Not a team member/admin), `500` (Server error).

*   **`POST /api/v1/datasets`**
    *   Creates dataset metadata after GCS upload.
    *   **Auth:** Required (Login + Sub).
    *   **Request:** `{ gcsPath, originalFilename, name?, fileSizeBytes?, teamId? }`
    *   **Success (201):** `{ data: Dataset }`

*   **`GET /api/v1/datasets`**
    *   Lists user's datasets (personal and from teams they belong to).
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ data: Dataset[] }` (Note: Includes `_id`, `gcsPath`, and `isTeamDataset` flag)

*   **`GET /api/v1/datasets/{id}/read-url`**
    *   Generates a signed URL for reading the dataset content.
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ status: 'success', data: { signedUrl: string } }`
    *   **Errors:** `400` (Invalid ID), `404` (Dataset not found/accessible), `500`.

*   **`GET /api/v1/datasets/{id}`**
    *   Gets a single dataset with details. Checks for team access.
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ status: 'success', data: Dataset }`
    *   **Errors:** `400` (Invalid ID), `404` (Dataset not found/accessible), `500`.

*   **`GET /api/v1/datasets/{id}/schema`**
    *   Gets dataset schema information and column descriptions. Checks for team access.
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ status: 'success', data: { schemaInfo: Array, columnDescriptions: Object, description: string } }`
    *   **Errors:** `400` (Invalid ID), `404` (Dataset not found/accessible), `500`.

*   **`PUT /api/v1/datasets/{id}`**
    *   Updates dataset information (context and column descriptions). Checks for team access.
    *   **Auth:** Required (Login + Sub).
    *   **Request:** `{ description?: string, columnDescriptions?: Object }`
    *   **Success (200):** `{ status: 'success', data: Dataset }`
    *   **Errors:** `400` (Invalid ID), `404` (Dataset not found/accessible), `500`.

*   **`DELETE /api/v1/datasets/{id}`**
    *   Deletes a dataset and its associated file in GCS. Checks for team access.
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ status: 'success', message: 'Dataset deleted successfully' }`
    *   **Errors:** `400` (Invalid ID), `403` (Not allowed for team datasets), `404` (Dataset not found/accessible), `500`.

---

### Feature: Teams

*   **`POST /api/v1/teams`**
    *   Creates a new team.
    *   **Auth:** Required.
    *   **Request:** `{ name: string, settings?: Object }`
    *   **Success (201):** `{ status: 'success', data: Team }`

*   **`GET /api/v1/teams`**
    *   Lists all teams the user is a member of.
    *   **Auth:** Required.
    *   **Success (200):** `{ status: 'success', data: Team[] }`

*   **`GET /api/v1/teams/{teamId}`**
    *   Gets team details.
    *   **Auth:** Required + Team Membership.
    *   **Success (200):** `{ status: 'success', data: Team }`
    *   **Errors:** `403` (Not a team member), `404` (Team not found).

*   **`PUT /api/v1/teams/{teamId}/settings`**
    *   Updates team settings.
    *   **Auth:** Required + Team Admin.
    *   **Request:** `{ settings: Object }`
    *   **Success (200):** `{ status: 'success', data: Team }`
    *   **Errors:** `403` (Not a team admin), `404` (Team not found).

*   **`GET /api/v1/teams/{teamId}/datasets`**
    *   Gets all datasets for a team.
    *   **Auth:** Required + Team Membership.
    *   **Success (200):** `{ status: 'success', data: Dataset[] }`
    *   **Errors:** `403` (Not a team member), `404` (Team not found).

*   **`POST /api/v1/teams/{teamId}/invites`**
    *   Invites a user to a team.
    *   **Auth:** Required + Team Admin.
    *   **Request:** `{ email: string, role?: 'admin' | 'member' }`
    *   **Success (201):** `{ status: 'success', data: TeamInvite }`
    *   **Errors:** `400` (User already member/invited), `403` (Not a team admin).

*   **`GET /api/v1/teams/invites/pending`**
    *   Gets pending invites for the current user.
    *   **Auth:** Required.
    *   **Success (200):** `{ status: 'success', data: TeamInvite[] }`

*   **`POST /api/v1/teams/invites/{inviteId}/accept`**
    *   Accepts a team invitation.
    *   **Auth:** Required.
    *   **Success (200):** `{ status: 'success', data: { teamId: string, role: string } }`
    *   **Errors:** `400` (Invalid invite/already processed), `404` (Invite not found).

*   **`POST /api/v1/teams/invites/{inviteId}/reject`**
    *   Rejects a team invitation.
    *   **Auth:** Required.
    *   **Success (200):** `{ status: 'success', data: { success: true } }`
    *   **Errors:** `400` (Invalid invite/already processed), `404` (Invite not found).

*   **`PUT /api/v1/teams/{teamId}/members/{memberId}/role`**
    *   Updates a team member's role.
    *   **Auth:** Required + Team Admin.
    *   **Request:** `{ role: 'admin' | 'member' }`
    *   **Success (200):** `{ status: 'success', data: TeamMember }`
    *   **Errors:** `400` (Invalid role/last admin), `403` (Not a team admin), `404` (Member not found).

*   **`DELETE /api/v1/teams/{teamId}/members/{memberId}`**
    *   Removes a member from a team.
    *   **Auth:** Required + Team Admin.
    *   **Success (200):** `{ status: 'success', data: { success: true } }`
    *   **Errors:** `400` (Last admin), `403` (Not a team admin), `404` (Member not found).

---

### Feature: Prompts (Phase 5 - Client-Side Execution)

*   **`POST /api/v1/prompts`**
    *   **Description:** Takes prompt/datasets context, triggers AI code generation, returns the generated code string. **Execution now happens client-side.**
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Body:** `{ "promptText": string, "selectedDatasetIds": string[] }`
    *   **Success Response (200):**
        ```json
        {
          "status": "success",
          "data": {
            "aiGeneratedCode": "<string>", // The raw JS code string from Claude
            "promptId": "<string>" // MongoDB ObjectId of the PromptHistory record
          }
        }
        ```
     * **Error Response (e.g., 500, 400):**
         ```json
         {
             "status": "error",
             "message": "Error generating AI code: <Claude/Service Error Details>",
             "data": {
                "promptId": "<string>" // ID if history record was created
             }
         }
         ```
    *   **Other Errors:** `401`, `403`.

---

### Feature: Notifications

*   **`GET /api/v1/notifications`**
    *   Gets user's notifications.
    *   **Auth:** Required.
    *   **Query:** `limit` (opt), `skip` (opt).
    *   **Success (200):** `{ status: 'success', data: { notifications: Notification[], total: number, hasMore: boolean } }`

*   **`GET /api/v1/notifications/unread-count`**
    *   Gets count of unread notifications.
    *   **Auth:** Required.
    *   **Success (200):** `{ status: 'success', data: { count: number } }`

*   **`PUT /api/v1/notifications/mark-read`**
    *   Marks notifications as read.
    *   **Auth:** Required.
    *   **Request:** `{ notificationIds?: string[] }` (null marks all as read)
    *   **Success (200):** `{ status: 'success', data: { success: true, count: number } }`

---

## 5. Key Data Models (Exchanged Objects)

### User with Added Settings

```typescript
interface User {
  _id: string;
  firebaseUid: string;
  email: string;
  name?: string;
  createdAt: string;
  settings: {
    currency: string;        // "USD", "EUR", etc.
    dateFormat: string;      // "YYYY-MM-DD", "MM/DD/YYYY", etc.
    aiContext?: string;      // Business context for Claude
  };
  subscriptionInfo: SubscriptionInfo;
  onboardingCompleted: boolean;
  teams?: string[];          // Array of Team IDs
}
```

### Dataset with Added Context Fields

```typescript
interface Dataset {
  _id: string;
  name: string;
  description?: string;      // Overall dataset context
  gcsPath: string;
  originalFilename: string;
  fileSizeBytes?: number;
  ownerId: string;
  teamId?: string;           // Team that owns this dataset (if any)
  schemaInfo: Array<{        // Column information
    name: string;
    type: string;            // "string", "number", "date", etc.
  }>;
  columnDescriptions: {      // Column descriptions for context
    [columnName: string]: string;
  };
  isIgnored: boolean;
  createdAt: string;
  lastUpdatedAt: string;
  isTeamDataset?: boolean;   // Frontend flag indicating if dataset belongs to a team
}
```

### Team and Related Models

```typescript
interface Team {
  _id: string;
  name: string;
  settings: {
    currency: string;
    dateFormat: string;
    aiContext?: string;
  };
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  members?: TeamMember[];    // Only in detailed team response
  userRole?: string;         // Current user's role in the team
}

interface TeamMember {
  _id: string;               // User ID
  name: string;
  email: string;
  role: 'admin' | 'member';
  joinedAt: string;
}

interface TeamInvite {
  _id: string;
  teamId: string;
  teamName: string;
  invitedBy: {
    name: string;
    email: string;
  };
  role: 'admin' | 'member';
  createdAt: string;
  expiresAt: string;
}
```

### Notification Model

```typescript
interface Notification {
  _id: string;
  userId: string;
  type: 'team_invite' | 'team_join' | 'team_role_change' | 'system';
  title: string;
  message: string;
  data: {
    [key: string]: any;      // Type-specific data
  };
  isRead: boolean;
  createdAt: string;
}
```

### Schema Response

```typescript
interface SchemaResponse {
  schemaInfo: Array<{
    name: string;
    type: string;
  }>;
  columnDescriptions: {
    [columnName: string]: string;
  };
  description: string;
}
```

### Prompt Generation Response Data (POST /prompts - Phase 5 Client-Side Exec)

```typescript
interface PromptGenResponseData {
    aiGeneratedCode: string | null; // Null if generation failed
    promptId: string;
}
```

## 6. File Upload Flow

### Dataset Upload - Proxy Method (Recommended)
1. Frontend creates FormData with the file and optional teamId
2. Frontend sends FormData to `/api/v1/datasets/proxy-upload` endpoint
3. Backend uploads file to GCS using the service account
4. Backend creates dataset metadata and returns it to frontend
5. This method avoids CORS issues when accessing from different clients

### Dataset Upload - Direct Method (Alternative)
1. Frontend requests a signed URL from `/api/v1/datasets/upload-url`
2. Frontend uploads file directly to GCS using the signed URL
3. After successful upload, frontend notifies backend by calling `/api/v1/datasets` with gcsPath and metadata
4. Note: This method may have CORS issues when accessing from different network locations