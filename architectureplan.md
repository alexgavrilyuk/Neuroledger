Okay, let's break down the detailed file-level architecture plan for both the frontend and backend of NeuroLedger, adhering strictly to the Vertical Slice Architecture (VSA).

**Important Considerations:**

*   **VSA Goal:** The primary goal here is isolation. A team working on the `datasets` feature should ideally only need to modify files within `features/datasets/` and potentially consume well-defined, stable elements from `features/shared/`. Cross-feature dependencies outside of `shared` should be minimized or eliminated.
*   **READMEs:** Remember, *every* feature directory (`features/auth/`, `features/datasets/`, etc.) on *both* frontend and backend **MUST** contain a `README.md`. This README details the feature's purpose, its APIs (for backend features), the UI components/pages (for frontend features), data models involved, and any specific setup or operational notes. This is paramount for coordinating separate teams.
*   **`features/shared/`:** This is *not* a dumping ground. It's for genuinely reusable, stable, cross-cutting concerns like base UI elements, core authentication logic wrappers, API client configurations, database connection setups, etc.
*   **File Granularity:** This plan outlines key files. Depending on complexity, controllers, services, or components might be broken down further into smaller files within their respective directories, but they would still belong to that feature slice.
*   **Error Handling & Logging:** While not explicitly listed in every file, assume robust error handling and logging are implemented, likely using shared middleware/utilities.
*   **Testing:** Test files (`*.test.js` or `*.spec.js`) would typically reside alongside the files they test or in a dedicated `__tests__` subfolder within each feature slice directory. They are omitted here for brevity but are essential.

---

## Backend Architecture Plan (Node.js / Express)

```
neuroledger-backend/
├── src/
│   ├── features/
│   │   ├── auth/
│   │   │   ├── auth.controller.js      # Handles incoming HTTP requests for auth (e.g., POST /api/v1/auth/session)
│   │   │   ├── auth.service.js         # Verifies Firebase ID token using shared Firebase Admin client
│   │   │   ├── auth.routes.js          # Defines API routes like /session, connects routes to controller methods
│   │   │   └── README.md               # Explains auth flow, token verification logic, endpoints
│   │   │
│   │   ├── users/
│   │   │   ├── user.controller.js      # Handles requests for user profile (GET /me), settings (PUT /me/settings)
│   │   │   ├── user.service.js         # Logic to fetch/update user data in DB, interacts with UserModel
│   │   │   ├── user.model.js           # Defines the User schema/model (e.g., using Mongoose or Sequelize) - includes profile info, settings
│   │   │   ├── user.routes.js          # Defines routes like /me, /me/settings
│   │   │   └── README.md               # Explains user data structure, endpoints, settings options
│   │   │
│   │   ├── subscriptions/
│   │   │   ├── subscription.controller.js # Handles requests for subscription status (GET /status), plan selection (POST /select)
│   │   │   ├── subscription.service.js    # Logic for checking/updating subscription status (dummy logic initially), associating plans with users
│   │   │   ├── subscription.model.js      # Defines Subscription schema or adds fields to UserModel (tier, trialEndDate, status)
│   │   │   ├── subscription.routes.js     # Defines routes like /status, /select
│   │   │   └── README.md                  # Explains subscription tiers, status logic, endpoints (notes dummy implementation)
│   │   │
│   │   ├── datasets/
│   │   │   ├── dataset.controller.js   # Handles requests for listing (GET /), uploading (POST /), details (GET /{id}), metadata update (PUT /{id}), delete (DELETE /{id}), getting upload URL (GET /upload-url)
│   │   │   ├── dataset.service.js      # Logic for interacting with GCS (via shared client) for uploads/signed URLs, DB operations (metadata, schema storage), basic schema detection (parsing headers)
│   │   │   ├── dataset.model.js        # Defines Dataset schema (name, description, gcsPath, ownerId, teamId, schemaInfo, userColumnDescriptions, isIgnored)
│   │   │   ├── dataset.routes.js       # Defines all dataset-related routes
│   │   │   └── README.md               # Explains dataset management, GCS interaction, schema storage, metadata fields, endpoints
│   │   │
│   │   ├── teams/
│   │   │   ├── team.controller.js      # Handles requests for team CRUD (GET /, POST /, GET /{id}, PUT /{id}), member management (POST /{id}/members, DELETE /{id}/members)
│   │   │   ├── team.service.js         # Logic for creating teams, sending invites (using an email service via shared client), managing members, updating team settings/context
│   │   │   ├── team.model.js           # Defines Team schema (name, ownerId, settings) and TeamMember schema (teamId, userId, role, status)
│   │   │   ├── team.routes.js          # Defines all team-related routes
│   │   │   └── README.md               # Explains team structure, invite flow, member roles, endpoints
│   │   │
│   │   ├── prompts/
│   │   │   ├── prompt.controller.js    # Handles request to initiate analysis (POST /)
│   │   │   ├── prompt.service.js       # Core logic: Fetches user/team settings, dataset metadata/schema/descriptions, assembles the full context prompt for Claude, calls Claude API (via shared client), receives generated React code, passes code to Code Execution service, returns result/status. May store prompt history.
│   │   │   ├── prompt.routes.js        # Defines the main /api/v1/prompts route
│   │   │   └── README.md               # Explains context assembly logic, Claude API interaction, interaction with Code Execution service, endpoint
│   │   │
│   │   ├── code_execution/
│   │   │   ├── execution.controller.js # Handles internal requests (likely not directly HTTP exposed, but called by prompt.service) to execute code
│   │   │   ├── execution.service.js    # **CRITICAL & COMPLEX:** Sets up secure sandbox (e.g., vm2, Docker), fetches necessary data read-only, executes the received React code, captures output/errors, enforces resource limits (CPU, memory, time), returns structured result or error.
│   │   │   ├── execution.sandbox.js    # (or similar) Abstracted logic for the chosen sandboxing mechanism
│   │   │   └── README.md               # **VERY IMPORTANT:** Details the sandboxing strategy, security measures, resource limits, input/output format, potential risks.
│   │   │
│   │   └── shared/
│   │       ├── middleware/
│   │       │   ├── auth.middleware.js  # Express middleware to verify Firebase token on incoming requests (uses auth.service), attach user info to request object
│   │       │   ├── error.handler.js  # Centralized error handling middleware
│   │       │   ├── subscription.guard.js # Middleware to check user's subscription status before allowing access to certain features/routes
│   │       │   └── README.md           # Explains available middleware and how to use them
│   │       ├── utils/
│   │       │   ├── logger.js         # Configured logging utility (e.g., Winston)
│   │       │   ├── helpers.js        # General utility functions (string formatting, etc.)
│   │       │   └── README.md           # Documents utility functions
│   │       ├── config/
│   │       │   ├── index.js          # Loads environment variables (Firebase creds, DB URI, Claude API key, GCS bucket), validates them, and exports a config object
│   │       │   └── README.md           # Lists required environment variables
│   │       ├── db/
│   │       │   ├── connection.js     # Establishes and manages database connection (e.g., Mongoose connect)
│   │       │   └── README.md           # Explains DB connection setup
│   │       ├── external_apis/
│   │       │   ├── firebase.client.js # Initializes Firebase Admin SDK
│   │       │   ├── gcs.client.js      # Initializes Google Cloud Storage client, provides functions for signed URLs, file operations
│   │       │   ├── claude.client.js   # Initializes client/wrapper for calling the Anthropic Claude API
│   │       │   ├── email.service.js  # Wrapper for sending emails (e.g., team invites via SendGrid or similar)
│   │       │   └── README.md          # Explains how to use API clients, required keys (referenced from config)
│   │       └── README.md             # Overview of all shared components
│   │
│   ├── config/                     # General app config if not handled entirely in shared/config
│   ├── server.js                   # Entry point: Initializes Express app, applies core middleware (CORS, body-parser), loads main router (`./routes.js`), starts the server listener.
│   ├── app.js                      # Often used to configure the Express application instance itself (middleware, etc.), separate from the server listener logic in server.js
│   └── routes.js                   # Main router: Imports and mounts all feature-specific routers under base paths (e.g., app.use('/api/v1/auth', authRoutes))
│
├── .env.example                # Example environment variables file
├── package.json                # Project dependencies and scripts
└── README.md                   # High-level project overview, setup instructions, link to FE/BE Interaction README
```

---

## Frontend Architecture Plan (React / Tailwind CSS)

```
neuroledger-frontend/
├── public/
│   └── index.html              # Main HTML file, React app mounts here
│   └── ...                     # Other static assets (favicon, etc.)
│
├── src/
│   ├── features/
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   │   ├── LoginForm.jsx       # UI component for the login form fields and button
│   │   │   │   ├── SignupForm.jsx      # UI component for the signup form fields and button
│   │   │   │   └── AuthLayout.jsx      # Optional: Layout specific to auth pages (e.g., centered card)
│   │   │   ├── pages/
│   │   │   │   ├── LoginPage.jsx       # Page component handling login logic (state, calling Firebase/AuthContext)
│   │   │   │   └── SignupPage.jsx      # Page component handling signup logic
│   │   │   ├── hooks/
│   │   │   │   └── useAuthActions.js   # Custom hook encapsulating Firebase login/signup/logout calls and updating shared AuthContext
│   │   │   └── README.md               # Explains auth UI components, pages, interaction with Firebase SDK and AuthContext
│   │   │
│   │   ├── onboarding/
│   │   │   ├── components/
│   │   │   │   ├── TutorialStep.jsx    # Component for a single step/slide in the tutorial
│   │   │   │   └── TutorialModal.jsx   # Modal container for the tutorial steps, handles navigation, "Don't show again"
│   │   │   ├── hooks/
│   │   │   │   └── useOnboarding.js    # Hook to manage onboarding state (visibility, current step, "don't show again" persistence)
│   │   │   └── README.md               # Explains onboarding flow, components, state management
│   │   │
│   │   ├── subscription/
│   │   │   ├── components/
│   │   │   │   └── PlanSelectorCard.jsx # UI card displaying a subscription plan option
│   │   │   ├── pages/
│   │   │   │   └── SubscriptionPage.jsx # Page shown after signup/if no active sub, displays plans, handles selection (dummy API call)
│   │   │   └── README.md               # Explains subscription selection UI, interaction with backend (dummy endpoint)
│   │   │
│   │   ├── dashboard/
│   │   │   ├── components/
│   │   │   │   ├── ChatInterface.jsx   # Main container for displaying messages/artefacts
│   │   │   │   ├── PromptInput.jsx     # Text input area for user prompts, handles submission
│   │   │   │   ├── MessageBubble.jsx   # Component to display user prompt or simple text response from AI
│   │   │   │   └── ReportArtefact.jsx  # Container holding the dynamically rendered report (uses report_display feature)
│   │   │   ├── hooks/
│   │   │   │   ├── useChatHistory.js   # Manages the state of the chat conversation (messages, loading states)
│   │   │   │   └── usePromptSubmit.js  # Handles logic for sending prompt + context to backend API
│   │   │   ├── pages/
│   │   │   │   └── DashboardPage.jsx   # Main page users interact with after login/setup
│   │   │   └── README.md               # Explains chat UI, state management, prompt submission flow
│   │   │
│   │   ├── dataset_management/ # (Likely rendered within AccountManagement pages)
│   │   │   ├── components/
│   │   │   │   ├── DatasetList.jsx     # Displays table/list of user's/team's datasets
│   │   │   │   ├── DatasetUpload.jsx   # Component handling file selection and upload logic (using signed URL from BE)
│   │   │   │   ├── DatasetMetadataForm.jsx # Form for editing dataset name, description, context
│   │   │   │   ├── SchemaViewerEditor.jsx # Displays detected schema, allows users to add descriptions per column
│   │   │   │   └── DatasetActions.jsx  # Buttons for delete, ignore/unignore dataset
│   │   │   ├── hooks/
│   │   │   │   ├── useDatasets.js      # Hook to fetch and manage dataset list state
│   │   │   │   └── useDatasetUpload.js # Hook to manage file upload process (get signed URL, upload to GCS, notify BE)
│   │   │   └── README.md               # Explains dataset UI components, fetching/upload logic, state management
│   │   │
│   │   ├── team_management/ # (Likely rendered within AccountManagement pages)
│   │   │   ├── components/
│   │   │   │   ├── TeamList.jsx        # Displays list of teams user belongs to
│   │   │   │   ├── MemberList.jsx      # Displays members of a selected team
│   │   │   │   ├── InviteMemberForm.jsx # Form to invite new members by email
│   │   │   │   └── TeamSettingsForm.jsx # Form for editing team name, context settings
│   │   │   ├── hooks/
│   │   │   │   └── useTeamManagement.js # Hook to fetch team data, manage invites, update settings
│   │   │   └── README.md               # Explains team management UI, API interactions
│   │   │
│   │   ├── account_management/
│   │   │   ├── components/
│   │   │   │   ├── AccountSidebar.jsx  # Navigation within the account section (Profile, Datasets, Teams, Settings)
│   │   │   │   ├── UserProfileForm.jsx # Form for editing user profile info
│   │   │   │   ├── GeneralSettingsForm.jsx # Form for currency, date format, etc.
│   │   │   │   └── AISettingsForm.jsx  # Form for user-level AI context settings
│   │   │   ├── pages/
│   │   │   │   ├── AccountPage.jsx     # Main container page for all account management sections, handles routing/display of subsections
│   │   │   │   ├── UserProfilePage.jsx # Specific view/route for profile editing
│   │   │   │   ├── DatasetMgmtPage.jsx # View/route embedding dataset_management components
│   │   │   │   ├── TeamMgmtPage.jsx    # View/route embedding team_management components
│   │   │   │   └── SettingsPage.jsx    # View/route for general and AI settings forms
│   │   │   └── README.md               # Explains account section structure, forms, navigation
│   │   │
│   │   ├── report_display/ # (Component feature, used by Dashboard)
│   │   │   ├── components/
│   │   │   │   ├── DynamicRenderer.jsx # **KEY COMPONENT:** Takes structured data/code output from BE and attempts to render it (text, figures, charts using shared ChartWrapper)
│   │   │   │   ├── ErrorDisplay.jsx    # Component to show if code execution failed
│   │   │   │   └── LoadingSkeleton.jsx # Placeholder shown while report is generating/rendering
│   │   │   ├── hooks/
│   │   │   │   └── useReportInteractions.js # Hook potentially managing state for drill-downs or other interactions within the rendered report
│   │   │   └── README.md               # Explains how reports are rendered dynamically, handles charts, errors, interactivity hooks
│   │   │
│   │   └── shared/
│   │       ├── ui/                     # Base, reusable, unopinionated UI components styled with Tailwind
│   │       │   ├── Button.jsx
│   │       │   ├── Input.jsx
│   │       │   ├── Card.jsx
│   │       │   ├── Modal.jsx
│   │       │   ├── Spinner.jsx
│   │       │   ├── Table.jsx
│   │       │   ├── ChartWrapper.jsx    # Wrapper around the chosen charting library (e.g., Recharts, Chart.js) ensuring consistent styling/theming
│   │       │   ├── Icon.jsx            # Component for rendering SVG icons consistently
│   │       │   └── README.md           # Documents available UI primitives, props, usage
│   │       ├── layouts/
│   │       │   ├── AppLayout.jsx       # Main application layout (e.g., with sidebar, header) after login
│   │       │   ├── CenteredLayout.jsx  # Simple layout for centering content (e.g., login, signup)
│   │       │   └── README.md           # Explains different page layouts
│   │       ├── hooks/
│   │       │   ├── useApi.js           # Hook wrapping the shared Axios instance for making API calls (handles loading/error state)
│   │       │   ├── useAuth.js          # Hook to easily access auth state and actions from AuthContext
│   │       │   ├── useTheme.js         # Hook to access current theme and theme switching function from ThemeContext
│   │       │   └── README.md           # Documents shared custom hooks
│   │       ├── contexts/
│   │       │   ├── AuthContext.jsx     # Provides authentication state (user, token, loading, error) and actions (login, logout) globally using React Context API
│   │       │   ├── ThemeContext.jsx    # Provides current theme state and theme switching function
│   │       │   └── README.md           # Explains available global contexts and their provided values/functions
│   │       ├── services/
│   │       │   ├── apiClient.js        # Configured Axios instance (base URL, interceptors for adding auth token, handling standard errors)
│   │       │   └── README.md           # Explains API client setup and usage patterns
│   │       ├── theme/
│   │       │   ├── themes.js           # Object defining color palettes, fonts, etc., for light, dark, and other themes (compatible with Tailwind's theme config)
│   │       │   ├── ThemeProvider.jsx   # Context provider that applies the selected theme (e.g., adds class to root element) and allows switching
│   │       │   └── README.md           # Explains how theming works, how to define themes
│   │       ├── assets/                 # Shared images, icons, fonts
│   │       │   └── icons/              # SVG icons, potentially as React components
│   │       ├── utils/
│   │       │   ├── formatters.js       # Functions for formatting dates, currency, numbers
│   │       │   ├── constants.js        # Shared constant values (e.g., API paths, event names)
│   │       │   └── helpers.js          # Miscellaneous browser utility functions
│   │       ├── types/                  # (If using TypeScript) Shared type definitions
│   │       └── README.md               # Overview of all shared components and utilities
│   │
│   ├── App.jsx                     # Root component: Sets up Context Providers (Auth, Theme), Router
│   ├── index.js (or main.jsx)      # Entry point: Renders the App component into the DOM
│   ├── routes.jsx                  # Defines application routes using react-router-dom, maps paths to Page components (consider lazy loading features)
│   └── styles/
│       ├── index.css               # Main CSS file, includes Tailwind directives (@tailwind base; @tailwind components; @tailwind utilities;)
│       └── global.css              # Any additional global custom styles
│
├── tailwind.config.js          # Tailwind CSS configuration (theme extensions, plugins)
├── package.json                # Project dependencies and scripts
└── README.md                   # High-level project overview, setup instructions, link to FE/BE Interaction README
```

---

**FE/BE Interaction README (`FE_BE_INTERACTION_README.md`)**

This crucial, shared document (ideally in a common repo or linked prominently in both FE and BE READMEs) would detail:

1.  **Base API URL:** e.g., `/api/v1`
2.  **Authentication:** Flow description (Firebase ID Token sent in `Authorization: Bearer <token>` header).
3.  **Standard Response Formats:** Success (`{ status: 'success', data: ... }`), Error (`{ status: 'error', message: '...', code: '...', details?: ... }`).
4.  **Endpoint Definitions:** Detailed list of all backend API endpoints, grouped by feature (matching the backend feature slices):
    *   Method (GET, POST, PUT, DELETE)
    *   Path (e.g., `/users/me`)
    *   Required Headers (e.g., Authorization)
    *   Request Body Schema (if applicable)
    *   Success Response Schema
    *   Error Response Codes/Schemas
5.  **Key Data Models:** Structures for User, Dataset, Team, etc., as exchanged between FE and BE.

---

This structure provides a strong foundation for VSA, enabling parallel development and clear responsibilities while maintaining consistency through shared elements and comprehensive documentation via READMEs. Remember to emphasize the critical nature and complexity of the `code_execution` feature on the backend.