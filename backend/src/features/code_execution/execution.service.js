// backend/src/features/code_execution/execution.service.js
// ** COMPLETE FILE - Added DETAILED logging for datasets prop **

const React = require('react');
const ReactDOMServer = require('react-dom/server');
const Papa = require('papaparse');
const _ = require('lodash');
const Recharts = require('recharts');
const logger = require('../../shared/utils/logger');
const { getBucket } = require('../../shared/external_apis/gcs.client'); // Correct path

// --- SECURITY WARNING REMAINS ---
// The execution method (`new Function`) is **NOT SECURE**.
// Use a proper sandbox (Docker, Firecracker, etc.) in production.
// --- END SECURITY WARNING ---


/**
 * Fetches data from GCS for the sandbox.
 * NOTE: Defined BEFORE it's exported or used internally by executeGeneratedCode.
 */
const fetchDataForSandbox = async (gcsPath) => {
    logger.info(`[fetchDataForSandbox] Attempting to fetch: ${gcsPath}`); // Log entry
    if (!gcsPath) {
         logger.error("[fetchDataForSandbox] Error: Received null or undefined gcsPath.");
         throw new Error("GCS path is missing.");
    }

    try {
        const bucket = getBucket();
        const file = bucket.file(gcsPath);

        const [exists] = await file.exists();
        if (!exists) {
             logger.error(`[fetchDataForSandbox] Error: File not found at GCS path: ${gcsPath}`);
             throw new Error(`Dataset file not found: ${gcsPath}`);
        }
        logger.debug(`[fetchDataForSandbox] File exists at ${gcsPath}. Downloading...`);

        const [buffer] = await file.download();
        const content = buffer.toString('utf-8'); // Assume UTF-8

        logger.info(`[fetchDataForSandbox] Successfully fetched ${content.length} characters from ${gcsPath}`); // Log success and size
        return content; // Return the content string

    } catch (error) {
        logger.error(`[fetchDataForSandbox] Failed to fetch data from ${gcsPath}: ${error.message}`, error.stack); // Log stack
        // Throw the error so fetchDatasetContent catches it and adds the error field
        throw new Error(`Could not load data file content for path: ${gcsPath}. Reason: ${error.message}`);
    }
};


/**
 * Executes the AI-generated React code string within a limited context.
 */
const executeGeneratedCode = async (codeString, executionContext) => {
    logger.info(`Starting execution for code string (length: ${codeString?.length})`);
    // ** LOG THE RECEIVED EXECUTION CONTEXT THOROUGHLY **
    logger.debug('[executeGeneratedCode] Received executionContext:', JSON.stringify(
        {
            datasets: (executionContext?.datasets || []).map(d => ({ name: d?.name, contentLength: d?.content?.length, error: d?.error, path: d?.gcsPath }))
        }, null, 2)
    );

    const { datasets: datasetsFromContext } = executionContext; // Extract datasets

    if (!codeString) {
        logger.error("[executeGeneratedCode] Error: No code provided for execution.");
        return { status: 'error', message: 'No code provided for execution.' };
    }
    // ** ADDED CHECK: Validate datasetsFromContext structure slightly **
    if (!Array.isArray(datasetsFromContext)) {
         logger.error("[executeGeneratedCode] Error: datasetsFromContext is not an array.");
          return { status: 'error', message: 'Internal error: Invalid dataset context received.' };
    }


    // 1. Prepare execution scope - Define the console object clearly here
    const sandboxConsole = {
        log: (...args) => logger.debug('[Sandbox Code Log]', ...args),
        warn: (...args) => logger.warn('[Sandbox Code Warn]', ...args),
        error: (...args) => logger.error('[Sandbox Code Error]', ...args),
    };
    const executionScope = {
        React, useState: React.useState, useEffect: React.useEffect, useCallback: React.useCallback, useMemo: React.useMemo,
        Recharts, Papa, _,
        datasets: datasetsFromContext, // Pass the potentially valid array
        console: sandboxConsole,
        ReactDOMServer,
        process: undefined, require: undefined,
    };
     logger.debug('[executeGeneratedCode] executionScope prepared. Keys:', Object.keys(executionScope));


    // 2. Construct the code string to be executed inside the sandbox
    const codeToRunInSandbox = `
        // Explicitly define console based on the passed scope object's methods
        const console = {
            log: executionScope.console.log,
            warn: executionScope.console.warn,
            error: executionScope.console.error
        };
        // Define other libraries from scope
        const React = executionScope.React;
        const useState = executionScope.React.useState;
        const Recharts = executionScope.Recharts;
        const Papa = executionScope.Papa;
        const _ = executionScope._;
        const ReactDOMServer = executionScope.ReactDOMServer;
        const datasets = executionScope.datasets; // Get datasets from scope

        // *** LOG DATA AS SEEN *INSIDE* SANDBOX ***
        console.log('--- Inside Sandbox Execution ---');
        console.log('Datasets array received:', JSON.stringify(
             (datasets || []).map(d => ({ name: d?.name, contentLength: d?.content?.length, error: d?.error }))
        ));
        console.log('Is datasets an array?', Array.isArray(datasets));
        console.log('Number of datasets:', datasets ? datasets.length : 'undefined');
        // *** END LOGGING ***

        // --- START GENERATED CODE from AI ---
        ${codeString}
        // --- END GENERATED CODE from AI ---

        if (typeof ReportComponent !== 'function') {
            throw new Error('AI did not generate a valid function named ReportComponent.');
        }

        // Create the React element
        console.log('Creating ReportComponent element...');
        const element = React.createElement(ReportComponent, { datasets: datasets });
        console.log('Element created. Rendering to string...');

        // Render the element to string
        const renderedHtml = ReactDOMServer.renderToString(element);
        console.log('Rendering complete. HTML length:', renderedHtml ? renderedHtml.length : 'null/undefined');
        return renderedHtml;
    `;


    // 3. Execute using new Function (UNSAFE - Placeholder Only)
    let outputHtml = null;
    let executionError = null;

    try {
        logger.debug("Preparing sandbox function using new Function()...");
        const sandboxFunction = new Function('executionScope', codeToRunInSandbox);
        logger.debug("Sandbox function created. Executing...");
        outputHtml = sandboxFunction(executionScope); // Execute
        // Log success only if no error was thrown
        logger.info(`Sandbox function execution finished. Output HTML length: ${outputHtml?.length}`);

    } catch (error) {
        logger.error(`Error executing sandbox function: ${error.message}`, error.stack);
        executionError = error;
    }

    // 4. Return Result
    if (executionError) {
        return { status: 'error', message: `Execution Error: ${executionError.message}` };
    } else if (outputHtml === null || outputHtml === undefined || outputHtml.length < 50) {
        logger.warn(`Code execution resulted in minimal output (length: ${outputHtml?.length}). Check generated code/logic and sandbox logs. Output: ${outputHtml?.substring(0, 150)}`);
        return { status: 'error', message: 'Execution produced minimal or no output. Check sandbox logs for errors inside the component.' };
    } else {
        return { status: 'success', output: outputHtml };
    }
};


// Export fetchDataForSandbox as well
module.exports = {
    executeGeneratedCode,
    fetchDataForSandbox
};