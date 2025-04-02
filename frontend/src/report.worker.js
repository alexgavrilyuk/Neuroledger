// src/report.worker.js
// FIXED version with improved visualization rendering and contrast

// --- Load Dependencies using standard ES Imports ---
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import * as Recharts from 'recharts';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import _ from 'lodash';

console.log("Report Worker Script Initializing (Claude Code Execution)...");

// --- Progress Tracking Constants ---
const PROGRESS_STAGES = {
  INITIALIZING: 'initializing',
  PROCESSING_DATA: 'processing_data',
  ANALYZING_DATA: 'analyzing_data',
  CREATING_VISUALS: 'creating_visuals',
  FINALIZING_REPORT: 'finalizing_report',
  COMPLETE: 'complete',
  ERROR: 'error'
};

// --- Quality Assessment Function ---
const assessReportQuality = (html) => {
  // Basic quality checks
  const hasCharts = html.includes('recharts-wrapper') ||
                    html.includes('<svg') ||
                    html.includes('chart-container');

  const hasExecutiveSummary = html.toLowerCase().includes('executive summary');
  const hasRecommendations = html.toLowerCase().includes('recommendation') ||
                             html.toLowerCase().includes('suggested action');

  return {
    hasVisualizations: hasCharts,
    hasExecutiveSummary: hasExecutiveSummary,
    hasRecommendations: hasRecommendations,
    qualityScore: [hasCharts, hasExecutiveSummary, hasRecommendations].filter(Boolean).length
  };
};

// --- Progress Tracking Function ---
const trackProgress = (stage, detail = null) => {
  self.postMessage({
    type: 'progress',
    stage: stage,
    detail: detail
  });

  console.log(`[Worker Progress] ${stage}${detail ? ': ' + detail : ''}`);
};

// --- Worker Logic ---
self.onmessage = async (event) => {
    trackProgress(PROGRESS_STAGES.INITIALIZING);
    console.log("[Worker] Received message from main thread");

    // Destructure message data with defaults
    const { code: codeString = '', datasets = [] } = event.data || {};

    // --- Input Validation ---
    if (!codeString || typeof codeString !== 'string' || codeString.trim() === '') {
        trackProgress(PROGRESS_STAGES.ERROR, 'No valid code string provided');
        self.postMessage({
            status: 'error',
            error: 'No valid code string provided to worker.',
            output: createErrorHTML('Missing Code', 'No valid code was provided to the worker.')
        });
        return;
    }

    if (!Array.isArray(datasets) || datasets.length === 0) {
        trackProgress(PROGRESS_STAGES.ERROR, 'No valid datasets array provided');
        self.postMessage({
            status: 'error',
            error: 'No valid datasets array provided to worker.',
            output: createErrorHTML('Missing Datasets', 'No datasets were provided for analysis.')
        });
        return;
    }

    // Check if at least one dataset has content
    const hasValidDataset = datasets.some(ds => ds && ds.content && typeof ds.content === 'string' && ds.content.trim() !== '');
    if (!hasValidDataset) {
        trackProgress(PROGRESS_STAGES.ERROR, 'No valid dataset content found');
        self.postMessage({
            status: 'error',
            error: 'No valid dataset content found in any of the provided datasets.',
            output: createErrorHTML('Empty Datasets', 'All provided datasets are empty or invalid.')
        });
        return;
    }

    // --- Attempt to fix common issues with the code ---
    let fixedCodeString = codeString;

    // Fix viewBox issues in SVG
    fixedCodeString = fixedCodeString.replace(
        /viewBox: `0 0 \$\{width\} \$\{height\}`/g,
        'viewBox: "0 0 " + width + " " + height'
    );

    // Fix rendering issues with Recharts components
    const rechartsComponentRegex = /const \{([^}]+)\}\s*=\s*Recharts;/g;
    if (rechartsComponentRegex.test(fixedCodeString)) {
        // If destructuring is used, ensure we're accessing Recharts properly
        fixedCodeString = fixedCodeString.replace(
            /const \{([^}]+)\}\s*=\s*Recharts;/g,
            'const {$1} = executionScope.Recharts;'
        );
    }

    // Progress-aware execution
    try {
        trackProgress(PROGRESS_STAGES.PROCESSING_DATA);
        console.log("[Worker] Setting up execution environment...");

        // Define the scope object that will be PASSED to Claude's code
        const executionScope = {
            // React and related
            React,
            useState: React.useState,
            useEffect: React.useEffect,
            useCallback: React.useCallback,
            useMemo: React.useMemo,
            useRef: React.useRef,
            useLayoutEffect: React.useLayoutEffect,
            useContext: React.useContext,
            useReducer: React.useReducer,

            // Libraries
            Recharts,
            Papa,
            _,
            XLSX,

            // Console with progress tracking
            console: {
                log: (...args) => {
                    // Check for progress markers in logs
                    const message = args[0];
                    if (typeof message === 'string' && message.includes('[PROGRESS]')) {
                        if (message.includes('Starting data processing')) {
                            trackProgress(PROGRESS_STAGES.PROCESSING_DATA);
                        } else if (message.includes('Data processing complete')) {
                            trackProgress(PROGRESS_STAGES.ANALYZING_DATA);
                        } else if (message.includes('Starting analysis')) {
                            trackProgress(PROGRESS_STAGES.ANALYZING_DATA);
                        } else if (message.includes('Analysis complete')) {
                            trackProgress(PROGRESS_STAGES.CREATING_VISUALS);
                        } else if (message.includes('Preparing visualizations')) {
                            trackProgress(PROGRESS_STAGES.CREATING_VISUALS);
                        } else if (message.includes('Report assembly complete')) {
                            trackProgress(PROGRESS_STAGES.FINALIZING_REPORT);
                        }
                    }
                    console.log('[Sandbox Log]', ...args);
                },
                warn: (...args) => console.warn('[Sandbox Warn]', ...args),
                error: (...args) => console.error('[Sandbox Error]', ...args),
                info: (...args) => console.info('[Sandbox Info]', ...args),
            }
        };

        console.log("[Worker] Evaluating Claude's generated component code...");

        // Create a function that takes executionScope and returns the ReportComponent
        const getReportComponent = new Function('executionScope', `
            try {
                ${fixedCodeString}
                return ReportComponent;
            } catch (error) {
                console.error("[Sandbox Error] Error in component function:", error);
                // Return a fallback component that displays the error
                return function ErrorComponent({ datasets }) {
                    return executionScope.React.createElement("div", { style: { color: "red" } },
                        executionScope.React.createElement("h2", null, "Error in Component Code"),
                        executionScope.React.createElement("p", null, error.message),
                        executionScope.React.createElement("pre", null, error.stack)
                    );
                };
            }
        `);

        // Get the component function
        const ReportComponent = getReportComponent(executionScope);

        if (typeof ReportComponent !== 'function') {
            throw new Error("Claude's code did not produce a valid React component function");
        }

        console.log("[Worker] Successfully extracted ReportComponent function");
        trackProgress(PROGRESS_STAGES.CREATING_VISUALS);

        // Create the React element with the datasets prop
        const reactElement = React.createElement(ReportComponent, { datasets });

        // Server-side render to HTML - with error handling
        console.log("[Worker] Rendering component to HTML...");
        let renderedHTML;

        try {
            renderedHTML = ReactDOMServer.renderToString(reactElement);
        } catch (renderError) {
            console.error("[Worker] Error during renderToString:", renderError);

            // Create fallback HTML for the error
            renderedHTML = `<div class="error-container">
                <h2>Error Rendering Report</h2>
                <p>${renderError.message}</p>
                <pre>${renderError.stack}</pre>
            </div>`;
        }

        // Post-process the rendered HTML to fix color contrast issues
        renderedHTML = renderedHTML
            // Ensure text has good contrast against backgrounds
            .replace(/color:\s*#6c757d/g, 'color: #4a5056') // Darker gray for text
            .replace(/color:\s*#adb5bd/g, 'color: #495057') // Darker gray for light text
            // Add class to recharts text elements for visibility
            .replace(/<text class="recharts-text/g, '<text class="recharts-text high-contrast-text');

        // Add wrapper div with styling for the final output - FIXED STYLES for better chart rendering
        const finalHTML = `
            <div class="claude-generated-report">
                ${renderedHTML}
                <style>
                    /* High-contrast accessibility fixes */
                    .high-contrast-text { fill: #000 !important; }
                    .recharts-cartesian-axis-tick-value { fill: #333 !important; }
                    .recharts-text { fill: #333 !important; }
                    .recharts-legend-item-text { color: #333 !important; }
                    @media (prefers-color-scheme: dark) {
                        .high-contrast-text { fill: #fff !important; }
                        .recharts-cartesian-axis-tick-value { fill: #eee !important; }
                        .recharts-text { fill: #eee !important; }
                        .recharts-legend-item-text { color: #eee !important; }
                    }

                    /* Base styles */
                    .claude-generated-report {
                        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        color: #333;
                        line-height: 1.5;
                    }

                    /* Fix recharts rendering issues */
                    .recharts-wrapper {
                        width: 100% !important;
                        height: 400px !important;
                        min-height: 400px !important;
                        display: block !important;
                    }
                    .recharts-surface {
                        overflow: visible !important;
                    }

                    /* Make sure charts take the full container width */
                    .recharts-responsive-container {
                        width: 100% !important;
                        min-height: 400px !important;
                        height: 400px !important;
                    }

                    /* Other report styles */
                    .claude-generated-report h1 {
                        font-size: 1.8rem;
                        margin-bottom: 1rem;
                        color: #0062cc;
                    }
                    .claude-generated-report h2 {
                        font-size: 1.5rem;
                        margin-top: 2rem;
                        margin-bottom: 1rem;
                        color: #0062cc;
                        border-bottom: 1px solid #eee;
                        padding-bottom: 0.5rem;
                    }
                    .claude-generated-report h3 {
                        font-size: 1.2rem;
                        margin-top: 1.5rem;
                        margin-bottom: 0.75rem;
                        color: #333;
                    }
                    .summary-section {
                        margin-bottom: 2rem;
                        background-color: #f8f9fa;
                        padding: 1.5rem;
                        border-radius: 8px;
                    }
                    .executive-summary {
                        background-color: #f0f7ff;
                        padding: 1.5rem;
                        border-radius: 8px;
                        margin-bottom: 2rem;
                    }
                    .summary-cards {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 1rem;
                        margin-top: 1rem;
                    }
                    .summary-card, .metric-card {
                        background: #fff;
                        border: 1px solid #e0e0e0;
                        border-radius: 8px;
                        padding: 1.25rem;
                        flex: 1 1 200px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    }
                    .summary-card h3, .metric-card h3 {
                        margin-top: 0;
                        font-size: 1rem;
                        color: #555;
                    }
                    .summary-card .value, .metric-card .value {
                        font-size: 1.5rem;
                        font-weight: bold;
                        margin: 0.5rem 0 0;
                        color: #0062cc;
                    }
                    .key-metrics {
                        margin-bottom: 2.5rem;
                    }
                    .charts-section {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 2rem;
                        margin-bottom: 2rem;
                    }
                    .chart-container {
                        flex: 1 1 400px;
                        min-height: 300px;
                        background: #fff;
                        border-radius: 8px;
                        padding: 1rem;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    }
                    .chart-container.wide {
                        flex-basis: 100%;
                    }
                    .data-tables-section {
                        margin-top: 2rem;
                    }
                    .table-container {
                        margin-bottom: 2rem;
                        overflow-x: auto;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 0.9rem;
                    }
                    th, td {
                        padding: 0.75rem;
                        text-align: left;
                        border-bottom: 1px solid #e0e0e0;
                    }
                    th {
                        font-weight: 600;
                        background: #f8f9fa;
                        position: sticky;
                        top: 0;
                    }
                    .recommendations {
                        background-color: #f0f9ff;
                        padding: 1.5rem;
                        border-radius: 8px;
                        margin: 2rem 0;
                    }
                    .risk-assessment {
                        background-color: #fff8f0;
                        padding: 1.5rem;
                        border-radius: 8px;
                        margin: 2rem 0;
                    }
                    /* Fix list element styles */
                    .claude-generated-report ul {
                      list-style-type: disc;
                      padding-left: 1.5rem;
                      margin-bottom: 1rem;
                    }
                    .claude-generated-report li {
                      margin-bottom: 0.5rem;
                    }
                    /* Dark mode support */
                    @media (prefers-color-scheme: dark) {
                        .claude-generated-report {
                            color: #e0e0e0;
                        }
                        .summary-section, .summary-card, .metric-card, .chart-container {
                            background: #2a2a2a;
                            border-color: #444;
                        }
                        .executive-summary {
                            background-color: #1a2a3a;
                        }
                        .recommendations {
                            background-color: #1a2a3a;
                        }
                        .risk-assessment {
                            background-color: #2a2520;
                        }
                        th, td {
                            border-color: #444;
                        }
                        th {
                            background: #333;
                        }
                        .claude-generated-report h1, .claude-generated-report h2 {
                            color: #4d9fff;
                        }
                        .claude-generated-report h3 {
                            color: #e0e0e0;
                        }
                        .summary-card h3, .metric-card h3 {
                            color: #ccc;
                        }
                        .summary-card .value, .metric-card .value {
                            color: #4d9fff;
                        }
                    }
                </style>
            </div>
        `;

        trackProgress(PROGRESS_STAGES.FINALIZING_REPORT);

        // Assess the quality of the report
        const qualityAssessment = assessReportQuality(finalHTML);
        console.log(`[Worker] Report quality assessment:`, qualityAssessment);

        console.log(`[Worker] Successfully rendered HTML (length: ${finalHTML.length})`);
        trackProgress(PROGRESS_STAGES.COMPLETE);

        // Send the result back to the main thread
        self.postMessage({
            status: 'success',
            output: finalHTML,
            quality: qualityAssessment
        });

    } catch (error) {
        trackProgress(PROGRESS_STAGES.ERROR, error.message);
        console.error("[Worker] Error during execution:", error);
        console.error("[Worker] Error stack:", error.stack);

        // Create a detailed error object
        const errorInfo = {
            message: error.message,
            name: error.name,
            stack: error.stack,
            location: 'Worker execution'
        };

        // Create a more detailed error message with code snippet
        let errorMessage = `Error executing code: ${error.message}`;
        if (error.stack && typeof error.stack === 'string') {
            // Try to extract line numbers from the stack trace
            const lineMatch = error.stack.match(/eval.+?<anonymous>:(\d+):(\d+)/);
            if (lineMatch && lineMatch[1]) {
                const lineNumber = parseInt(lineMatch[1], 10);
                // Extract the problematic code section
                const codeLines = fixedCodeString.split('\n');
                const startLine = Math.max(1, lineNumber - 3);
                const endLine = Math.min(codeLines.length, lineNumber + 3);

                let codeSnippet = '';
                for (let i = startLine; i <= endLine; i++) {
                    const isErrorLine = i === lineNumber;
                    codeSnippet += `${i}: ${isErrorLine ? '→ ' : '  '}${codeLines[i-1]}\n`;
                }

                errorMessage += `\n\nProblem at line ${lineNumber}:\n\n${codeSnippet}`;
            }
        }

        // Send a formatted error message back
        self.postMessage({
            status: 'error',
            error: errorMessage,
            errorDetails: errorInfo,
            output: createErrorHTML('Report Generation Error', error.message)
        });
    }
};

/**
 * Creates a styled HTML error message
 */
function createErrorHTML(title, message) {
    return `
        <div class="error-message p-4 bg-red-100 border border-red-400 rounded-lg">
            <h3 class="text-lg font-bold text-red-800 mb-2">${title}</h3>
            <p class="text-red-700">${message}</p>
            <p class="mt-2 text-sm text-red-600">Check browser console for more details.</p>
        </div>
    `;
}

// Global error handler
self.onerror = (event) => {
    console.error("[Worker] Uncaught error in worker global scope:", event);

    try {
        self.postMessage({
            status: 'error',
            error: `Worker script error: ${event.message || 'Unknown error'}`,
            output: createErrorHTML('Worker Error', 'An unexpected error occurred in the report worker.')
        });
    } catch (e) {
        console.error("[Worker] Could not post error back to main thread:", e);
    }
};

console.log("Report Worker Script Initialized (Claude Code Execution)");