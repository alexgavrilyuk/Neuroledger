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

### Report Structure

The `qualityReport` structure returned by the backend API has the following format:

```typescript
interface QualityReport {
  // Core report sections
  executiveSummary: string;
  qualityScore: number; // 0-100 scale
  overallStatus: 'ok' | 'warning' | 'error';
  keyFindings: Array<{
    category: string; // e.g., "Completeness", "Accuracy", "Consistency" 
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  
  // Detailed analysis (grouped by category)
  detailedAnalysis: {
    [category: string]: Array<{
      description: string;
      details?: string;
      affectedColumns?: string[];
      severity: 'low' | 'medium' | 'high';
    }>
  };
  
  // Prioritized recommendations
  recommendations: Array<{
    priority: number; // 1 (highest) to N
    description: string;
    rationale?: string;
    benefit?: string;
  }>;
  
  // Metadata
  generatedAt: string; // ISO date string
  processingTimeSeconds: number;
  metadata?: {
    columnStatistics?: object;
    [key: string]: any;
  };
}
```

The `DataQualityReportDisplay` component parses this structure to present an intuitive, organized view to the user. The component handles severity color-coding (red for high, yellow for medium, green for low/ok), and creates collapsible sections for the detailed analysis categories.

### Usage

These components are designed to be integrated into pages where data quality information needs to be displayed, such as a dataset detail view. The parent component is responsible for:

1.  Fetching the audit status (`GET /api/v1/datasets/{id}/quality-audit/status`) or the full report (`GET /api/v1/datasets/{id}/quality-audit`).
2.  Calculating `elapsedTimeSeconds` if displaying the progress indicator.
3.  Providing the `reportData`, `onResetAudit` callback (which should call `DELETE /api/v1/datasets/{id}/quality-audit` and handle state updates), and `isResetting` state to the `DataQualityReportDisplay`.

### Recommended Polling Strategy

When a quality audit is in the `processing` state, implement the following polling strategy:

```jsx
// Inside your component that manages the audit state
useEffect(() => {
  let pollingInterval;
  
  if (qualityStatus === 'processing') {
    // Start a timer to track elapsed time since processing began
    const startTime = Date.now();
    setElapsedTimeSeconds(0);
    
    // Update elapsed time every second for the progress indicator
    const elapsedTimer = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTimeSeconds(elapsedSec);
    }, 1000);
    
    // Poll the status endpoint every 5 seconds
    pollingInterval = setInterval(async () => {
      try {
        const response = await apiClient.get(`/datasets/${datasetId}/quality-audit/status`);
        const newStatus = response.data.data.qualityStatus;
        
        // If status changed from processing, stop polling and fetch full report
        if (newStatus !== 'processing') {
          clearInterval(pollingInterval);
          clearInterval(elapsedTimer);
          fetchFullReport();
        }
        
        // Add a timeout to prevent infinite polling (10 minutes)
        if (Math.floor((Date.now() - startTime) / 1000) > 600) {
          clearInterval(pollingInterval);
          clearInterval(elapsedTimer);
          setPollingError("Quality audit is taking longer than expected. Please check back later.");
        }
      } catch (error) {
        console.error("Error polling audit status:", error);
        clearInterval(pollingInterval);
      }
    }, 5000);
  }
  
  return () => {
    clearInterval(pollingInterval);
  };
}, [qualityStatus, datasetId]);
```

This approach provides a responsive user experience while avoiding unnecessary API calls.
