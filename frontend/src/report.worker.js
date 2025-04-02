// src/report.worker.js
// Fixed version to prevent the infinite re-render loop

// --- Load Dependencies using standard ES Imports ---
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import * as Recharts from 'recharts';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import _ from 'lodash';

console.log("Report Worker Script Initializing (Claude Code Execution)...");

// --- Worker Logic ---
self.onmessage = async (event) => {
    console.log("[Worker] Received message from main thread");

    // Log basic info about received message
    if (event.data && typeof event.data === 'object') {
        console.log(`[Worker] Received code length: ${event.data.code?.length || 0}`);
        console.log(`[Worker] Received datasets count: ${Array.isArray(event.data.datasets) ? event.data.datasets.length : 0}`);
    }

    // Destructure message data with defaults
    const { code: codeString = '', datasets = [] } = event.data || {};

    // --- Input Validation ---
    if (!codeString || typeof codeString !== 'string' || codeString.trim() === '') {
        console.error("[Worker] Error: No valid code string provided.");
        self.postMessage({
            status: 'error',
            error: 'No valid code string provided to worker.',
            output: createErrorHTML('Missing Code', 'No valid code was provided to the worker.')
        });
        return;
    }

    if (!Array.isArray(datasets) || datasets.length === 0) {
        console.error("[Worker] Error: No valid datasets array provided.");
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
        console.error("[Worker] Error: None of the datasets have valid content.");
        self.postMessage({
            status: 'error',
            error: 'No valid dataset content found in any of the provided datasets.',
            output: createErrorHTML('Empty Datasets', 'All provided datasets are empty or invalid.')
        });
        return;
    }

    // --- Fix common errors in the generated code ---
    let fixedCodeString = codeString;

    // Fix 1: Replace any 'a0' with '30' (common typo in margin values)
    if (fixedCodeString.includes('a0')) {
        console.log("[Worker] Fixing potential typo: 'a0' → '30'");
        fixedCodeString = fixedCodeString.replace(/a0/g, '30');
    }

    // Fix 2: Ensure svg viewBox is properly formatted (no template literals in some browsers)
    fixedCodeString = fixedCodeString.replace(
        /viewBox: `0 0 \$\{width\} \$\{height\}`/g,
        'viewBox: "0 0 " + width + " " + height'
    );

    // Fix 3: Check for malformed destructuring of Recharts
    if (fixedCodeString.includes('const { BarChart, Bar') && !fixedCodeString.includes('Recharts.BarChart')) {
        console.log("[Worker] Adding Recharts prefix to components");
        fixedCodeString = fixedCodeString.replace(
            /const \{ (.*?) \} = Recharts;/,
            '// Using direct Recharts.Component references instead of destructuring'
        );
    }

    // Fix 4: Address missing variable declarations
    const potentialUndefinedVars = ['maxValue', 'barWidth', 'chartWidth', 'chartHeight', 'radius'];
    potentialUndefinedVars.forEach(varName => {
        // Check if the variable is used without being defined
        if ((new RegExp(`[^a-zA-Z0-9_]${varName}[^a-zA-Z0-9_]`)).test(fixedCodeString) &&
            !fixedCodeString.includes(`const ${varName} =`) &&
            !fixedCodeString.includes(`let ${varName} =`)) {
            console.log(`[Worker] Adding missing variable declaration for ${varName}`);
            // Insert placeholder declaration at the beginning of the function
            fixedCodeString = fixedCodeString.replace(
                /function ReportComponent\(\{ datasets \}\) \{/,
                `function ReportComponent({ datasets }) {\n  // Added by worker: placeholder variable\n  let ${varName} = 0;`
            );
        }
    });

    // Fix 5: Fix infinite loop - Remove useState calls that trigger re-renders
    fixedCodeString = fixedCodeString.replace(
        /const \[processingStatus, setProcessingStatus\] = useState\({.*?\}\);/s,
        '// Removed useState that was causing re-renders\nconst processingStatus = { isLoading: false, error: null, parsedData: null, insights: null };'
    );

    // Fix 6: Replace any setState calls in the main function body
    fixedCodeString = fixedCodeString.replace(
        /setProcessingStatus\({.*?\}\);/g,
        '// Removed setState call to prevent re-renders\n// processingStatus was updated directly instead'
    );

    // Fix 7: Wrap immediate processing code in a try-catch to prevent crashes
    if (fixedCodeString.includes('// Process data immediately (not in useEffect)')) {
        fixedCodeString = fixedCodeString.replace(
            /\/\/ Process data immediately \(not in useEffect\)([\s\S]*?)try {/m,
            '// Process data immediately (not in useEffect)\ntry {'
        );
    }

    // --- Execution Block ---
    try {
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

            // Console (sandboxed)
            console: {
                log: (...args) => console.log('[Sandbox Log]', ...args),
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
                return function ErrorComponent() {
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

        // Add wrapper div with styling for the final output
        const finalHTML = `
            <div class="claude-generated-report">
                ${renderedHTML}
                <style>
                    /* Basic styles for the report */
                    .claude-generated-report {
                        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    }
                    .summary-section { margin-bottom: 2rem; }
                    .summary-cards {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 1rem;
                        margin-top: 1rem;
                    }
                    .summary-card {
                        background: #f8f9fa;
                        border: 1px solid #dee2e6;
                        border-radius: 0.5rem;
                        padding: 1rem;
                        flex: 1 1 200px;
                    }
                    .summary-card h3 {
                        margin-top: 0;
                        font-size: 1rem;
                        color: #495057;
                    }
                    .summary-card .value {
                        font-size: 1.5rem;
                        font-weight: bold;
                        margin: 0.5rem 0 0;
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
                    }
                    .chart-container.wide {
                        flex-basis: 100%;
                    }
                    .tables-section {
                        margin-top: 2rem;
                    }
                    .table-container {
                        margin-bottom: 2rem;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    th, td {
                        padding: 0.75rem;
                        text-align: left;
                        border-bottom: 1px solid #dee2e6;
                    }
                    th {
                        font-weight: bold;
                        background: #f8f9fa;
                    }
                    /* Dark mode support */
                    @media (prefers-color-scheme: dark) {
                        .summary-card, th {
                            background: #212529;
                        }
                        th, td {
                            border-color: #343a40;
                        }
                        .summary-card {
                            border-color: #343a40;
                        }
                        .summary-card h3 {
                            color: #ced4da;
                        }
                    }
                </style>
            </div>
        `;

        console.log(`[Worker] Successfully rendered HTML (length: ${finalHTML.length})`);

        // Send the result back to the main thread
        self.postMessage({
            status: 'success',
            output: finalHTML
        });

    } catch (error) {
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