const vm = require('vm');
const logger = require('../utils/logger');
const datasetService = require('../../features/datasets/dataset.service');

const CODE_EXECUTION_TIMEOUT_MS = 5000; // 5 seconds timeout for script execution

/**
 * Executes untrusted Node.js code in a sandboxed environment using the 'vm' module.
 * Fetches the required dataset content and injects it into the sandbox.
 *
 * !!! SECURITY WARNING !!!
 * The Node.js 'vm' module is NOT a true security sandbox. This implementation relies on
 * meticulously controlling the context and setting strict timeouts as a temporary mitigation.
 * It is VULNERABLE to sophisticated attacks (e.g., prototype pollution, infinite loops
 * bypassing timeouts in certain Node versions).
 * DO NOT expose sensitive APIs, global objects (process, require, etc.), or filesystem/network access.
 * A robust sandboxing solution (Docker, gVisor, Firecracker) is REQUIRED before production use (Phase 4).
 *
 * @param {string} code - The Node.js code string to execute.
 * @param {string} datasetId - The ID of the dataset to fetch and inject.
 * @param {string} userId - The ID of the user requesting execution (for permission checks).
 * @returns {Promise<{result: any | null, error: string | null}>} - An object containing the result (if successful and returned via sendResult/console.log) or an error message.
 */
const executeSandboxedCode = async (code, datasetId, userId) => {
  logger.info(`Attempting sandboxed code execution for dataset ${datasetId} by user ${userId}`);
  let datasetContent = null;
  let capturedResult = null;
  let capturedError = null;

  // 1. Fetch Dataset Content Securely
  try {
    // Replace placeholder with actual call to dataset service
    datasetContent = await datasetService.getRawDatasetContent(datasetId, userId);
    if (!datasetContent) {
      // This case should now be handled by getRawDatasetContent throwing an error
      // but keep a check just in case it returns null/undefined unexpectedly
      throw new Error('Fetched dataset content was empty or null.');
    }
    logger.debug(`Dataset content fetched successfully for sandbox (Dataset ID: ${datasetId})`);
  } catch (fetchError) {
    logger.error(`Failed to fetch dataset for sandboxed execution: ${fetchError.message}`, { datasetId, userId });
    // Return specific errors (like access denied) directly if possible
    return { result: null, error: `Failed to prepare data: ${fetchError.message}` };
  }

  // 2. Prepare Sandbox Context
  // Create a function within this scope to capture the result
  const sendResult = (data) => {
    logger.debug('sendResult called within sandbox.');
    if (capturedResult === null) { // Only capture the first result
      capturedResult = data;
    } else {
      logger.warn('sendResult called multiple times in sandbox. Only the first result is captured.');
    }
  };

  const sandboxContext = {
    datasetContent: datasetContent, // Inject the raw dataset content
    sendResult: sendResult,        // Inject the result callback function
    console: {
       // Override console.log to potentially capture output (optional, sendResult is preferred)
       log: (...args) => {
         logger.debug('Sandbox console.log:', ...args);
         // Simple capture: if first arg is JSON, maybe capture it?
         // if (capturedResult === null && args.length === 1 && typeof args[0] === 'string') {
         //   try { capturedResult = JSON.parse(args[0]); } catch(e) { /* ignore */ }
         // }
       },
       warn: (...args) => logger.warn('Sandbox console.warn:', ...args),
       error: (...args) => logger.error('Sandbox console.error:', ...args),
     },
    // ** CRITICAL: DO NOT ADD MORE GLOBALS **
    // Specifically forbid: require, process, Buffer, setTimeout, setInterval, fetch, etc.
    // Standard JS built-ins (Object, Array, String, Number, Math, JSON, Date) ARE available.
  };

  // 3. Execute Code in Sandbox
  try {
    logger.debug('Executing code in vm.runInNewContext...');
    // Explicitly wrap the code to ensure the function is called if needed
    const fullCode = `(function() {\n${code}\n})();`; 
    vm.runInNewContext(fullCode, sandboxContext, {
      timeout: CODE_EXECUTION_TIMEOUT_MS,
      displayErrors: true,
    });
    logger.debug('Code execution finished within vm.');

    if (capturedResult !== null) {
      logger.info(`Sandboxed code execution successful, result captured via sendResult.`);
      return { result: capturedResult, error: null };
    } else {
      // If sendResult wasn't called, it implies an issue.
      // The error might have been caught internally by the generated code's try/catch
      // and sent via sendResult({error: ...}), which would be in capturedResult.
      // If capturedResult is STILL null, it means the code either:
      // a) Finished without calling sendResult and without erroring.
      // b) Errored in a way not caught by its own try/catch OR the vm context.
      logger.warn(`Sandboxed code executed but did not call sendResult successfully.`);
      // Provide a more specific error message for the agent
      capturedError = 'Code executed but failed to produce a result via sendResult. Possible reasons: internal error not caught, logic error, or incorrect sendResult usage.';
      return { result: null, error: capturedError };
    }

  } catch (execError) {
    logger.error(`Sandboxed code execution failed: ${execError.message}`, { datasetId, userId, error: execError });
    if (execError.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      capturedError = `Code execution timed out after ${CODE_EXECUTION_TIMEOUT_MS}ms.`;
    } else {
      // Try to provide a more informative message if possible
      capturedError = `Code execution failed: ${execError.message}`;
    }
    // Ensure sendResult wasn't somehow called before the error was thrown
    if(capturedResult && capturedResult.error) { 
         return { result: null, error: `Execution failed after reporting internal error: ${capturedResult.error}. Outer error: ${capturedError}` };
    }
    return { result: null, error: capturedError };
  }
};

module.exports = {
  executeSandboxedCode,
}; 