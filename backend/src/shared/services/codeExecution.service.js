const vm = require('vm');
const logger = require('../utils/logger');

const CODE_EXECUTION_TIMEOUT_MS = 5000; // 5 seconds timeout for script execution

/**
 * Executes Node.js analysis code in a sandboxed environment using the 'vm' module.
 * Expects pre-parsed data to be passed in.
 *
 * !!! SECURITY WARNING !!!
 * The Node.js 'vm' module is NOT a true security sandbox. This implementation relies on
 * meticulously controlling the context and setting strict timeouts as a temporary mitigation.
 * It is VULNERABLE to sophisticated attacks (e.g., prototype pollution, infinite loops
 * bypassing timeouts in certain Node versions).
 * DO NOT expose sensitive APIs, global objects (process, require, etc.), or filesystem/network access.
 * A robust sandboxing solution (Docker, gVisor, Firecracker) is REQUIRED before production use (Phase 4).
 *
 * @param {string} code - The Node.js analysis code string to execute.
 * @param {Array<Object>} parsedData - The pre-parsed data (array of objects) to be injected.
 * @returns {Promise<{result: any | null, error: string | null}>} - An object containing the result or an error message.
 */
const executeSandboxedCode = async (code, parsedData) => {
  logger.info(`Attempting sandboxed code execution with pre-parsed data.`);
  let capturedResult = null;
  let capturedError = null;

  // 1. Validate Input Data
  if (!Array.isArray(parsedData)) {
      logger.error('executeSandboxedCode called without a valid parsedData array.');
      return { result: null, error: 'Invalid input: parsedData must be an array.' };
  }
  logger.debug(`Executing code with ${parsedData.length} pre-parsed data rows.`);

  // 2. Prepare Sandbox Context
  const sendResult = (data) => {
    logger.debug('sendResult called within sandbox.');
    if (capturedResult === null) { 
      capturedResult = data;
    } else {
      logger.warn('sendResult called multiple times in sandbox. Only the first result is captured.');
    }
  };

  const sandboxContext = {
    // Inject the PARSED data as inputData
    inputData: parsedData, 
    sendResult: sendResult,        
    console: {
       log: (...args) => {
         logger.debug('Sandbox console.log:', ...args);
         console.log('[Sandbox]:', ...args); 
       },
       warn: (...args) => {
         logger.warn('Sandbox console.warn:', ...args);
         console.warn('[Sandbox WARN]:', ...args); 
       },
       error: (...args) => {
         logger.error('Sandbox console.error:', ...args);
         console.error('[Sandbox ERROR]:', ...args); 
       },
     },
    // ** CRITICAL: DO NOT ADD MORE GLOBALS **
  };

  // 3. Execute Code in Sandbox
  try {
    logger.debug('Executing analysis code in vm.runInNewContext...');
    // No need to wrap in function anymore if code expects inputData directly
    // const fullCode = `(function() {\n${code}\n})();`; 
    vm.runInNewContext(code, sandboxContext, { // Execute the analysis code directly
      timeout: CODE_EXECUTION_TIMEOUT_MS,
      displayErrors: true,
    });
    logger.debug('Analysis code execution finished within vm.');

    if (capturedResult !== null) {
      logger.info(`Sandboxed analysis code execution successful, result captured via sendResult.`);
      return { result: capturedResult, error: null };
    } else {
      logger.warn(`Sandboxed analysis code executed but did not call sendResult successfully.`);
      capturedError = 'Analysis code executed but failed to produce a result via sendResult. Check code logic and sendResult call.';
      return { result: null, error: capturedError };
    }

  } catch (execError) {
    logger.error(`Sandboxed analysis code execution failed: ${execError.message}`, { error: execError });
    if (execError.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      capturedError = `Analysis code execution timed out after ${CODE_EXECUTION_TIMEOUT_MS}ms.`;
    } else {
      capturedError = `Analysis code execution failed: ${execError.message}`;
    }
    if(capturedResult && capturedResult.error) { 
         return { result: null, error: `Execution failed after reporting internal error: ${capturedResult.error}. Outer error: ${capturedError}` };
    }
    return { result: null, error: capturedError };
  }
};

module.exports = {
  executeSandboxedCode,
}; 