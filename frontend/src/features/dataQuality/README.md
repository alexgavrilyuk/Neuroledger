# frontend/src/features/dataQuality/README.md

## Feature: Frontend Data Quality Components

This feature slice provides reusable React components specifically for displaying the status and results of the backend's Data Quality Audit feature.

Unlike other feature slices, this one primarily contains UI components intended to be imported and used within other features' pages (e.g., `DatasetDetailPage` within `dataset_management`), rather than defining its own pages or routes.

### Components

*   **`components/DataQualityProgressIndicator.jsx`**:
    *   **Props:** `status` (string), `elapsedTimeSeconds` (number)
    *   **Purpose:** Displays a visual progress indicator when a data quality audit is in the `'processing'` state.
    *   **Functionality:** Shows defined stages (Initializing, Analyzing, Interpreting, Reporting, Completing) with icons. Approximates the current stage based on `elapsedTimeSeconds`. Shows elapsed time. Uses pulsing animation. Renders nothing if status is not `'processing'`.
    *   **Dependencies:** `shared/ui/Spinner`, `@heroicons/react`.

*   **`components/DataQualityReportDisplay.jsx`**:
    *   **Props:** `reportData` (object - the JSON report from the backend), `onResetAudit` (function), `isResetting` (boolean)
    *   **Purpose:** Renders a detailed, formatted view of a completed data quality audit report.
    *   **Functionality:**
        *   Displays overall quality score with corresponding icon/color.
        *   Shows executive summary and key findings.
        *   Provides collapsible sections for detailed analysis (categorized) and recommendations (prioritized).
        *   Includes a "Reset Audit" button which triggers the `onResetAudit` callback passed in via props. Disables button and shows loading state based on `isResetting` prop.
        *   Displays report metadata (generation time, score explanation).
    *   **Dependencies:** `shared/ui/Card`, `shared/ui/Button`, `@heroicons/react`.

### Usage

These components are designed to be integrated into pages where data quality information needs to be displayed, such as a dataset detail view. The parent component is responsible for:

1.  Fetching the audit status (`GET /api/v1/datasets/{id}/quality-audit/status`) or the full report (`GET /api/v1/datasets/{id}/quality-audit`).
2.  Calculating `elapsedTimeSeconds` if displaying the progress indicator.
3.  Providing the `reportData`, `onResetAudit` callback (which should likely call `DELETE /api/v1/datasets/{id}/quality-audit` and handle state updates), and `isResetting` state to the `DataQualityReportDisplay`.
