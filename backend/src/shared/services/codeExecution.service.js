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
 * @param {object} inputData - The pre-parsed data array to inject into the sandbox.
 * @returns {Promise<{result: any, error: string|null}>} Object containing result or error.
 */
const executeSandboxedCode = async (code, inputData) => {
  if (!inputData) {
    logger.error('executeSandboxedCode called without inputData.');
    return { result: null, error: 'Internal error: Input data was not provided for execution.' };
  }
  logger.info(`Attempting sandboxed code execution with ${Array.isArray(inputData) ? 'pre-parsed' : 'INVALID'} data.`);
  if (Array.isArray(inputData)) {
     logger.debug(`Executing code with ${inputData.length} pre-parsed data rows.`);
  }

  let capturedResult = null;
  let capturedError = null;

  // 2. Define Sandbox Context (Globals accessible within the VM)
  const sandboxContext = {
    // Function for the sandboxed code to return results
    sendResult: (result) => {
      if (capturedResult !== null) {
          logger.warn('Sandbox code called sendResult multiple times. Only the first call is used.');
          return;
      }
       if (typeof result === 'undefined') {
           logger.warn('Sandbox code called sendResult with undefined. This might indicate an issue.');
           // Allow undefined for now, but might revisit
       }
       // Basic check for non-serializable types (like functions) - VERY basic
       try {
           JSON.stringify(result); // Throws on circular references, functions, etc.
           capturedResult = result;
           logger.info('sendResult called successfully by sandbox code.');
       } catch (e) {
           logger.error(`sendResult called with non-serializable data: ${e.message}. Result cannot be captured.`);
           capturedResult = { error: `Result could not be serialized: ${e.message}` }; // Send error back
       }
    },
    // Provide the input data directly
    inputData: inputData,
    // Wrapped console for capturing logs (optional)
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
    // Wrap the user code in an IIFE to allow top-level return statements
    const wrappedCode = `(function(){\n${code}\n})();`; 
    
    // --- ADDED: Log code snippet before execution ---
    const codeSnippetStart = wrappedCode.substring(0, 500);
    const codeSnippetEnd = wrappedCode.length > 500 ? wrappedCode.substring(wrappedCode.length - 500) : '';
    logger.debug(`[Code Exec] Attempting to run code. Start: "${codeSnippetStart}..." End: "...${codeSnippetEnd}" Total Length: ${wrappedCode.length}`);
    // --- END ADDED LOG ---

    vm.runInNewContext(wrappedCode, sandboxContext, {
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