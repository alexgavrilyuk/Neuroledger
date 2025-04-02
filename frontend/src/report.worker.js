// frontend/src/report.worker.js
// Executes Claude's generated React component and renders it to HTML

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
            ${codeString}
            return ReportComponent;
        `);

        // Get the component function
        const ReportComponent = getReportComponent(executionScope);

        if (typeof ReportComponent !== 'function') {
            throw new Error("Claude's code did not produce a valid React component function");
        }

        console.log("[Worker] Successfully extracted ReportComponent function");

        // Create the React element with the datasets prop
        const reactElement = React.createElement(ReportComponent, { datasets });

        // Server-side render to HTML
        console.log("[Worker] Rendering component to HTML...");
        const renderedHTML = ReactDOMServer.renderToString(reactElement);

        // Add wrapper div with styling for the final output
        const finalHTML = `
            <div class="claude-generated-report">
                ${renderedHTML}
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

        // Send a formatted error message back
        self.postMessage({
            status: 'error',
            error: `Error executing code: ${error.message}`,
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