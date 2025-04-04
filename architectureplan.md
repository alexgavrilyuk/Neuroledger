NeuroLedger: Revised Build Plan & Architecture Documentation (Iframe Execution)

1. Application Overview

NeuroLedger is a web application empowering users to generate financial reports using natural language prompts against their uploaded datasets.

Core Workflow (Current Iframe Architecture):

Authentication: Users sign up/log in via Firebase.

Subscription: Users select a (dummy) plan/trial to activate features.

Onboarding: First-time users see a tutorial.

Data Management: Users upload Excel/CSV datasets to GCS, manage basic metadata.

Context Configuration: (Minimal in current implementation) Basic user/team settings placeholders exist.

Prompting: Users type prompts in a chat interface, selecting relevant datasets.

AI Code Generation (BE): Backend receives prompt/context, calls Claude API instructing it to generate React code string.

Code & Data Fetching (FE):

Frontend receives the React code string from the backend.

Frontend requests and receives signed read URLs from the backend for the selected datasets.

Frontend fetches the actual dataset content directly from GCS using these URLs.

Sandboxed Execution (FE):

The generated code string and fetched dataset content are passed securely via postMessage into a sandboxed iframe (sandbox="allow-scripts").

A bootstrapper HTML file (iframe-bootstrapper.html) within the iframe loads necessary libraries (React, Recharts, etc.) via CDN.

The bootstrapper executes the received code string (using new Function()) within the iframe's isolated environment, passing the data and library globals.

The AI-generated React component renders inside the iframe.

Report Display: The rendered report is viewed within the iframe, typically presented inside a modal in the main application.

Iteration & Export: (Future) Users can continue prompting. Export/drilldown features TBD.

Key Goals:

Leverage AI (Claude) for automated report code string generation.

Provide secure (via iframe sandbox) client-side execution and rendering of AI-generated reports.

Offer a modern, themeable UI.

Enable basic data upload and selection.

Target UI Aesthetic: Modern, clean, intuitive, professional, themeable (Light/Dark implemented).

2. Backend Architecture (Node.js / Express - Current State)

Core Principle: Vertical Slice Architecture (VSA). code_execution slice removed/not implemented.

Directory Structure & File Descriptions:

neuroledger-backend/
├── src/
│   ├── features/
│   │   ├── auth/               # Handles authentication verification
│   │   │   ├── auth.controller.js  # HTTP handler for POST /api/v1/auth/session. Verifies token via service, gets/creates user.
│   │   │   ├── auth.service.js     # Verifies Firebase ID token, finds/creates user in DB via user.model.
│   │   │   ├── auth.routes.js      # Defines POST /session route.
│   │   │   └── README.md           # Details: Firebase token verification, user get/create logic, endpoint spec.
│   │   │
│   │   ├── users/              # Manages user data model
│   │   │   ├── user.model.js       # Mongoose schema for User (firebaseUid, email, name, subscriptionInfo, onboardingCompleted, settings/teams placeholders). Includes hasActiveSubscription helper.
│   │   │   └── README.md           # Details: User data model fields and purpose. (No controller/service/routes implemented yet for profile/settings updates).
│   │   │
│   │   ├── subscriptions/      # Manages dummy subscription status
│   │   │   ├── subscription.controller.js # HTTP handlers for GET /status, POST /select.
│   │   │   ├── subscription.service.js    # Dummy logic to update user.subscriptionInfo based on planId ('trial', 'plus'), checks trial expiry.
│   │   │   ├── subscription.routes.js     # Defines GET /status, POST /select routes.
│   │   │   └── README.md                  # Details: Dummy subscription logic, interaction with User model, endpoints specs.
│   │   │
│   │   ├── datasets/           # Manages dataset uploads, metadata, and read access
│   │   │   ├── dataset.controller.js   # HTTP handlers: GET /upload-url (for PUT), POST / (create metadata), GET / (list), GET /{id}/read-url (for GET).
│   │   │   ├── dataset.service.js      # Logic: Generates GCS signed URLs (PUT & GET), saves metadata to DB, parses headers (CSV/XLSX), lists datasets, checks file existence before generating read URL.
│   │   │   ├── dataset.model.js        # Mongoose schema for Dataset (name, gcsPath, ownerId, schemaInfo, etc.).
│   │   │   ├── dataset.routes.js       # Defines dataset CRUD-related routes including upload/read URLs.
│   │   │   └── README.md               # Details: Dataset model, GCS interaction (upload/read URLs), header parsing, endpoints specs including read URL.
│   │   │
│   │   ├── prompts/            # Handles prompt request, context assembly, AI code generation
│   │   │   ├── prompt.controller.js    # HTTP handler for POST /. Validates, calls service, returns { aiGeneratedCode, promptId }.
│   │   │   ├── prompt.service.js       # Core Logic: Assembles context (user settings placeholder, dataset schemas/metadata). Calls Claude API instructing it to generate **React code string**. Stores history. Returns code string. **Does NOT execute code.**
│   │   │   ├── prompt.model.js         # Mongoose schema for PromptHistory (stores prompt, context, selected datasets, *aiGeneratedCode*, status, etc.).
│   │   │   ├── prompt.routes.js        # Defines POST / route.
│   │   │   └── README.md               # **IMPORTANT:** Details context assembly, Claude interaction asking for CODE, API response structure containing `aiGeneratedCode`.
│   │   │
│   │   └── shared/             # Shared utilities, configurations, clients
│   │       ├── middleware/
│   │       │   ├── auth.middleware.js  # Verifies Firebase token, attaches `req.user`.
│   │       │   ├── error.handler.js  # Global Express error handler.
│   │       │   ├── subscription.guard.js # Checks `req.user.subscriptionInfo` status/trial date.
│   │       │   └── README.md           # Documents middleware.
│   │       ├── utils/
│   │       │   └── logger.js         # Simple console logger.
│   │       ├── config/
│   │       │   └── index.js          # Loads/validates/exports .env variables (PORT, MONGO_URI, FIREBASE_PROJECT_ID, GCS_BUCKET_NAME, CLAUDE_API_KEY).
│   │       ├── db/
│   │       │   └── connection.js     # Establishes Mongoose DB connection.
│   │       ├── external_apis/
│   │       │   ├── firebase.client.js # Initializes Firebase Admin SDK.
│   │       │   ├── gcs.client.js      # Initializes Google Cloud Storage client. Provides `getBucket`.
│   │       │   ├── claude.client.js   # Initializes Anthropic Claude client.
│   │       │   └── email.service.js  # Placeholder - Not implemented yet.
│   │       └── README.md             # Overview of shared modules.
│   │
│   ├── app.js                      # Configures Express app instance (middleware).
│   ├── routes.js                   # Main API router mounting feature routers under `/api/v1`.
│   └── server.js                   # Entry point: Connects DB, starts HTTP server.
│
├── .env                        # Actual secrets (Untracked)
├── .env.example                # Template for required environment variables.
├── firebase-service-account.json # Firebase credentials (Untracked)
├── gcs-service-account.json    # GCS credentials (Untracked)
├── package.json                # Dependencies (Should contain ONLY backend libs: express, mongoose, firebase-admin, @google-cloud/storage, @anthropic-ai/sdk, dotenv, cors, papaparse, xlsx etc. **REMOVE react, react-dom, recharts etc.**)
├── .gitignore                  # Ignores node_modules, .env, service account keys.
└── README.md                   # Project overview, setup, reflects implemented phases & iframe architecture.
Use code with caution.
3. Frontend Architecture (React / Vite / Tailwind CSS - Current State)

Core Principle: VSA for features. report_display handles iframe logic. Data fetching for reports now in usePromptSubmit.

Directory Structure & File Descriptions:

neuroledger-frontend/
├── public/
│   ├── iframe-bootstrapper.html # **KEY FILE:** Static HTML loaded into sandbox iframe. Loads CDN libs (React, ReactDOM, Recharts, _, Papa, XLSX), listens for postMessage, executes received code via new Function(), renders report, sends status back.
│   └── placeholder-image.svg    # Example image for onboarding.
│   └── vite.svg                 # Default Vite icon.
│
├── src/
│   ├── features/
│   │   ├── auth/               # Login/Signup UI & Logic
│   │   │   ├── components/     # LoginForm.jsx, SignupForm.jsx (UI, basic validation)
│   │   │   ├── hooks/          # useAuthActions.js (Handles calling context actions, post-signup logout/redirect)
│   │   │   ├── pages/          # LoginPage.jsx (Displays success msg), SignupPage.jsx
│   │   │   └── README.md       # Details auth flow, post-signup redirect.
│   │   │
│   │   ├── onboarding/       # Initial tutorial modal
│   │   │   ├── components/     # TutorialModal.jsx, TutorialStep.jsx
│   │   │   ├── hooks/          # useOnboarding.js (Manages visibility via localStorage & user prop)
│   │   │   └── README.md       # Details onboarding trigger/persistence logic.
│   │   │
│   │   ├── subscription/     # Dummy subscription plan selection
│   │   │   ├── components/     # PlanSelectorCard.jsx (Styled plan display)
│   │   │   ├── pages/          # SubscriptionPage.jsx (Layout, handles selection API call, updates AuthContext user)
│   │   │   └── README.md       # Details dummy plan selection flow.
│   │   │
│   │   ├── dashboard/        # Main chat/prompting interface
│   │   │   ├── components/
│   │   │   │   ├── ChatInterface.jsx   # Displays messages.
│   │   │   │   ├── MessageBubble.jsx   # Renders individual message; handles 'report_iframe_ready' type with "View Report" button, calls onViewReport prop with reportInfo { code, datasets }.
│   │   │   │   ├── PromptInput.jsx     # Textarea, dataset selector (uses useDatasets), submit button.
│   │   │   │   └── ProgressIndicator.jsx # Shows processing stages.
│   │   │   ├── hooks/
│   │   │   │   ├── useChatHistory.js   # Manages array of chat messages.
│   │   │   │   └── usePromptSubmit.js  # **KEY HOOK:** Handles prompt submission: calls BE POST /prompts -> receives code -> calls BE GET /datasets/{id}/read-url -> fetches data from GCS -> updates message state with { code, datasets } for ReportViewer. Manages loading/error/progress stages.
│   │   │   ├── pages/
│   │   │   │   └── DashboardPage.jsx   # Orchestrates dashboard: renders components, manages ReportViewer modal state, passes reportInfo/themeName to modal.
│   │   │   └── README.md               # **IMPORTANT:** Details the revised flow: receiving code, fetching data, triggering ReportViewer via modal.
│   │   │
│   │   ├── dataset_management/ # UI for dataset upload/listing (within Account)
│   │   │   ├── components/     # DatasetUpload.jsx (Uses useDatasetUpload), DatasetList.jsx (Uses useDatasets).
│   │   │   ├── hooks/
│   │   │   │   ├── useDatasetUpload.js # Manages 3-step GCS upload (get URL, PUT to GCS, POST metadata to BE).
│   │   │   │   └── useDatasets.js      # Fetches dataset list from BE (GET /datasets). Used here and in Dashboard.
│   │   │   └── README.md               # Details upload/list UI components and hooks. Mentions use in Dashboard.
│   │   │
│   │   ├── account_management/ # Structure for account sections
│   │   │   ├── layouts/        # AccountLayout.jsx (Provides header and sub-navigation for /account/* routes)
│   │   │   ├── pages/          # AccountDatasetsPage.jsx (Integrates dataset components), AccountProfilePage.jsx, AccountTeamsPage.jsx, AccountSettingsPage.jsx (Placeholders).
│   │   │   └── README.md       # Details account section structure and sub-navigation.
│   │   │
│   │   ├── report_display/   # Handles rendering the report via iframe
│   │   │   ├── components/
│   │   │   │   └── ReportViewer.jsx # **KEY COMPONENT:** Renders sandboxed iframe pointing to iframe-bootstrapper.html. Manages iframe state (loading, ready, error). Uses postMessage to send { code, datasets } and theme updates *into* iframe. Listens for status messages *from* iframe. Displays loading/error overlays.
│   │   │   └── README.md           # **IMPORTANT:** Explains iframe sandboxing approach, postMessage communication, security points, interaction with bootstrapper.
│   │   │
│   │   └── shared/             # Shared UI, hooks, contexts, etc.
│   │       ├── ui/             # Base presentational components: Button, Card, Input, Spinner, Modal, Checkbox. (Themeable via Tailwind dark: variants)
│   │       ├── layouts/        # AppLayout.jsx (Main authenticated layout with Sidebar), CenteredLayout.jsx (Public split-screen layout)
│   │       ├── hooks/          # useAuth.js, useTheme.js
│   │       ├── contexts/       # AuthContext.jsx (Manages user state, interacts with BE session), ThemeContext.jsx (Manages light/dark mode via class on <html>, localStorage)
│   │       ├── services/       # apiClient.js (Axios instance with auth interceptor), firebase.js (Firebase SDK init)
│   │       ├── theme/          # ThemeProvider.jsx, ThemeSwitcher.jsx, themes.js (Basic theme defs)
│   │       ├── components/     # Sidebar.jsx (Used by AppLayout)
│   │       ├── utils/          # logger.js (Frontend console logger)
│   │       └── README.md       # Overview of shared elements.
│   │
│   ├── App.jsx                     # Root: Sets up Context Providers, Router.
│   ├── index.css                   # Imports Tailwind directives, global base styles.
│   ├── main.jsx                    # Renders App into DOM.
│   └── routes.jsx                  # Defines routes, ProtectedRoute, PublicOnlyRoute logic. Lazy loads pages.
│
├── .env                        # Actual secrets (Untracked)
├── .env.example                # Template for FE env variables (VITE_FIREBASE_*, VITE_API_BASE_URL).
├── index.html                  # Root HTML, includes Google Font link.
├── package.json                # Frontend dependencies (React, Tailwind, Axios, Firebase, react-router-dom, react-dropzone, recharts, lodash, papaparse, xlsx, dompurify etc.)
├── tailwind.config.js          # Tailwind config (darkMode: 'class', Inter font, plugins: forms, typography).
├── postcss.config.js           # PostCSS config for Tailwind/Autoprefixer.
├── vite.config.js              # Vite build config. (No special iframe bundling needed).
├── .gitignore                  # Ignores node_modules, dist, .env.
├── FE_BE_INTERACTION_README.md # API contract doc (Updated for iframe flow).
├── UI_README.md                # Styling guidelines.
└── README.md                   # Project overview, setup, reflects implemented phases & iframe architecture.
Use code with caution.
4. FE/BE Interaction Documentation (FE_BE_INTERACTION_README.md - Key Points reflecting Current State)

Base URL: /api/v1

Auth: Authorization: Bearer <Firebase ID Token>. POST /auth/session for init.

Responses: Standard status: 'success'/'error'.

Endpoints:

POST /auth/session -> { data: User }

GET /subscriptions/status -> { data: SubscriptionInfo }

POST /subscriptions/select -> { data: User } (Returns full User)

GET /datasets/upload-url?filename&fileSize -> { data: { signedUrl, gcsPath } }

POST /datasets -> { data: Dataset }

GET /datasets -> { data: Dataset[] }

GET /datasets/{id}/read-url -> { data: { signedUrl } } (Crucial for FE data fetching)

POST /prompts -> { data: { aiGeneratedCode: string, promptId: string } } (Returns code string, NOT executed result)