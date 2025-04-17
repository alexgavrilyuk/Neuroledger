// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/prompt.service.js
// PURPOSE: Handles LLM interactions, using provider abstraction.
// VERSION: COMPLETE FILE - Includes strengthened prompts and cleaning for both
//          analysis code and report code generation. No placeholders.
// ================================================================================

const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const Team = require('../teams/team.model');
const TeamMember = require('../teams/team-member.model');
const logger = require('../../shared/utils/logger');
const { getProvider, getUserModelPreference } = require('../../shared/llm_providers/ProviderFactory'); // Corrected path

/**
 * Assembles initial user and team context strings.
 * @param {string} userId - The user ID.
 * @param {Array<string>} selectedDatasetIds - (Currently unused in this specific function but kept for potential future use).
 * @returns {Promise<{contextString: string, userContext: string, teamContext: string}>}
 */
const assembleContext = async (userId, selectedDatasetIds) => {
    let contextString = ""; // May not be needed if only structured context is used downstream
    let userContext = '';
    let teamContext = '';
    try {
        const user = await User.findById(userId).select('settings').lean();
        if (user?.settings?.aiContext) {
            userContext = user.settings.aiContext;
            contextString += `- User Business Context: ${userContext}\n`;
        }

        const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean(); // Select only teamId
        let teamContexts = [];
        if (teamMemberships && teamMemberships.length > 0) {
            const teamIds = teamMemberships.map(membership => membership.teamId);
            // Select only fields needed for context
            const teams = await Team.find({ _id: { $in: teamIds } }).select('name settings.aiContext').lean();
            teams.forEach(team => {
                if (team.settings?.aiContext) {
                    teamContexts.push(`Team \"${team.name}\": ${team.settings.aiContext}`);
                }
            });
        }
        if (teamContexts.length > 0) {
             teamContext = teamContexts.join('\n  - ');
             contextString += "- Team Contexts:\n  - " + teamContext + "\n";
        }

        // Dataset listing/schema retrieval handled by agent tools now.

        return {
            contextString, // Return the generated string if needed
            userContext: userContext,
            teamContext: teamContext
        };
    } catch (error) {
        logger.error(`Error assembling initial user/team context: ${error.message}`);
        // Return empty strings on error, allows agent to proceed without context if necessary
        return { contextString: "Error assembling context.", userContext: '', teamContext: '' };
    }
};

/**
 * Generates the system prompt specifically for ANALYSIS code generation.
 * Emphasizes the restricted sandbox environment and use of `inputData`.
 * @param {object} params - Parameters for prompt generation.
 * @param {string} params.analysisGoal - The specific goal the code should achieve.
 * @param {object} params.datasetSchema - Schema information ({schemaInfo, columnDescriptions, description}).
 * @returns {string} - The generated system prompt string.
 */
const generateAnalysisCodePrompt = ({ analysisGoal, datasetSchema }) => {
    if (!analysisGoal || !datasetSchema) {
        throw new Error('Missing analysis goal or dataset schema for analysis code prompt generation.');
    }

    // Construct schema details string
    let schemaDetails = `Dataset Description: ${datasetSchema.description || 'N/A'}\nColumns:\n`;
    if (datasetSchema.schemaInfo && datasetSchema.schemaInfo.length > 0) {
        schemaDetails += datasetSchema.schemaInfo.map(col =>
            `- ${col.name} (Expected Type: ${col.type || 'string'}): ${datasetSchema.columnDescriptions?.[col.name] || 'No description'}`
        ).join('\n');
    } else {
        schemaDetails += '(No schema information available)';
    }

    // ** Strengthened System Prompt **
    const analysisCodeGenSystemPrompt = `You are an expert Javascript data analyst writing code to run in a **HIGHLY RESTRICTED SANDBOX ENVIRONMENT (Node.js vm module)**.

    **CRITICAL CONSTRAINTS:**
    1.  **NO FILE SYSTEM ACCESS:** You CANNOT use \`require('fs')\`, \`fs.readFileSync\`, \`fs.existsSync\`, or any file system operations.
    2.  **NO \`require\`:** You CANNOT use the \`require()\` function to import ANY Node.js modules (\`fs\`, \`path\`, etc.) or external libraries.
    3.  **ONLY Standard JS:** You ONLY have access to standard built-in Javascript objects and functions (e.g., \`Array\`, \`Object\`, \`Math\`, \`Date\`, \`String\`, \`Number\`, \`JSON\`).
    4.  **PRE-PARSED DATA:** The dataset content has ALREADY BEEN PARSED. It is provided to your code ONLY through a variable named \`inputData\`.
    5.  **\`inputData\` FORMAT:** The \`inputData\` variable is an ARRAY OF OBJECTS, where each object represents a row from the original data, with keys corresponding to column headers. Example: \`[{ "Column A": "value1", "Column B": 10 }, { "Column A": "value2", "Column B": 20 }]\`.
    6.  **MANDATORY OUTPUT:** Your code MUST finish by calling the function \`sendResult(resultObject)\` **exactly once**. \`resultObject\` must be a JSON-serializable object containing your calculated analysis results. Do NOT use \`console.log\` for the final result.

    **Your Task:** Write Javascript code that strictly adheres to the constraints above to achieve the following goal using ONLY the \`inputData\` variable.

    **Analysis Goal:**
    ${analysisGoal}

    **Dataset Schema Context (for understanding \`inputData\` structure):**
    ${schemaDetails}

    **Code Requirements Recap:**
    *   Read data ONLY from the \`inputData\` array variable.
    *   Perform calculations based on the 'Analysis Goal'.
    *   Use ONLY standard Javascript built-ins. **NO \`require\` STATEMENTS ALLOWED.**
    *   Handle potential data issues (missing values, type variations) defensively within the code using standard JS checks (e.g., \`typeof\`, \`isNaN\`, null checks).
    *   **CRITICAL - Column Access:** Column names in \`inputData\` objects might have different casing or slight variations from the goal description (e.g., \`row['Actual Income']\` vs \`row['income']\`). Your code **MUST** find the correct property name dynamically (e.g., by iterating \`Object.keys(row)\` and using case-insensitive checks or keyword matching like \`.toLowerCase().includes('income')\`) before accessing values. Do NOT rely on hardcoded names from the schema example.
    *   **CRITICAL - Number Parsing:** If values need to be treated as numbers (e.g., currency, metrics), they might be strings containing symbols ('$', ','). Implement robust parsing: check for null/empty strings (treat as 0), remove common symbols, then use \`parseFloat()\`. Return 0 if parsing fails. Use a helper function like \`safeParseFloat\` shown in the example.
    *   Call \`sendResult(yourFinalJsonObject)\` at the very end with your computed results.
    *   Output ONLY the raw Javascript code, without explanations or markdown fences.

    **Example Helper Function (Include similar logic in your code):**
    \`\`\`javascript
    function safeParseFloat(value) {
      if (value === null || value === undefined) return 0;
      let numStr = String(value).trim();
      if (numStr === '') return 0;
      // Remove common currency symbols ($ potentially others) and commas (,)
      numStr = numStr.replace(/[$,]/g, ''); // Regex for common symbols
      const parsed = parseFloat(numStr);
      return isNaN(parsed) ? 0 : parsed;
    }
    \`\`\`

    Generate the Javascript code now.
    `;

    return analysisCodeGenSystemPrompt;
};

/**
 * Generates Node.js analysis code using the LLM based on a goal and schema.
 * @param {object} params - Parameters for code generation.
 * @param {string} params.userId - The ID of the user requesting the code.
 * @param {string} params.analysisGoal - The specific goal the code should achieve.
 * @param {object} params.datasetSchema - Schema information.
 * @returns {Promise<{code: string | null}>} - The generated code string or null on failure.
 */
const generateAnalysisCode = async ({ userId, analysisGoal, datasetSchema }) => {
    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[Analysis Code Gen] Using ${preferredProvider} model: ${modelToUse} for user ${userId}`);
    const startTime = Date.now();
    logger.info('Generating analysis Node.js code for goal: "%s..." using provider', analysisGoal.substring(0, 50));

    const systemPrompt = generateAnalysisCodePrompt({ analysisGoal, datasetSchema });

    try {
        const provider = await getProvider(userId);
        const messages = [{ role: "user", content: "Generate the sandboxed Javascript analysis code based **strictly** on the system prompt instructions, using ONLY the `inputData` variable and calling `sendResult`."}];

        const apiOptions = {
            model: modelToUse,
            system: systemPrompt,
            messages,
            max_tokens: 4096, // Increased slightly, adjust as needed
            temperature: 0.0
        };

        const apiResponse = await provider.generateContent(apiOptions);
        const generatedCode = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text.trim() : null;

        if (!generatedCode) {
            logger.error(`Analysis code generation returned empty content.`, apiResponse);
            throw new Error(`AI assistant failed to generate analysis code.`);
        }

        // --- More Aggressive Cleaning ---
        let cleanedCode = generatedCode;
        const codeBlockRegex = /^```(?:javascript|js)?\s*([\s\S]*?)\s*```$/m;
        const match = cleanedCode.match(codeBlockRegex);
        if (match && match[1]) {
            cleanedCode = match[1].trim();
        }
        cleanedCode = cleanedCode.replace(/const\s+\w+\s*=\s*require\(['"].*?['"]\);?/g, ''); // Remove require
        cleanedCode = cleanedCode.replace(/fs\.readFileSync\s*\(.*?\)/g, '/* fs.readFileSync removed */');
        cleanedCode = cleanedCode.replace(/fs\.existsSync\s*\(.*?\)/g, '/* fs.existsSync removed */');
        cleanedCode = cleanedCode.replace(/path\.join\s*\(.*?\)/g, '/* path.join removed */');
        cleanedCode = cleanedCode.replace(/^.*const\s+inputData\s*=\s*global\.inputData.*$/gm, '');
        // --- End Cleaning ---

        // Validation after cleaning
        if (!cleanedCode.includes('sendResult(')) {
            logger.warn('Generated analysis code might be missing sendResult() call after cleaning.');
        }
        if (cleanedCode.includes('require(')) {
             logger.error('Generated analysis code STILL contains require() after cleaning! Potential sandbox bypass.');
             throw new Error('Generated code included disallowed require statement.');
        }

        const durationMs = Date.now() - startTime;
        logger.info(`Analysis code generated successfully using ${modelToUse}. Length: ${cleanedCode.length}, Time: ${durationMs}ms`);
        return { code: cleanedCode };

    } catch (error) {
        const durationMs = Date.now() - startTime;
        logger.error(`Error during analysis code generation API call with model ${modelToUse}: ${error.message}. Time: ${durationMs}ms`, error);
        throw new Error(`AI assistant failed to generate analysis code: ${error.message}`);
    }
};

/**
 * Generates React component code for visualizing analysis results.
 * Includes strengthened instructions about module syntax.
 * @param {object} params - Parameters for report generation.
 * @param {string} params.userId - The ID of the user requesting the report.
 * @param {string} params.analysisSummary - A textual summary of the key findings.
 * @param {string} params.dataJson - The JSON data object (as a string) for the report.
 * @returns {Promise<{react_code: string | null}>} - The generated React code string or null on failure.
 */
const generateReportCode = async ({ userId, analysisSummary, dataJson }) => {
    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[Report Code Gen] Using ${preferredProvider} model: ${modelToUse} for user ${userId}`);
    if (!analysisSummary || !dataJson) throw new Error('Missing analysis summary or data for report code generation.');
    if (typeof dataJson !== 'string') throw new Error('Invalid dataJson format: Expected string.');

    let parsedDataJson;
    try {
        parsedDataJson = JSON.parse(dataJson);
    } catch (parseError) {
        throw new Error('Invalid JSON data provided for report generation.');
    }

    // ** Strengthened Report Generation Prompt **
    const systemPrompt = `You are an expert React developer specializing in data visualization using the Recharts library.
Your task is to generate a **single, self-contained React functional component** named 'ReportComponent' based on the provided analysis data and summary.

**CRITICAL EXECUTION CONTEXT:**
*   **GLOBAL LIBRARIES:** React, ReactDOM, Recharts, PropTypes, Lodash (_), Papa, XLSX are **ALREADY LOADED GLOBALLY** in the execution environment (like a CDN).
*   **NO \`import\` STATEMENTS:** You **MUST NOT** include any \`import\` statements (e.g., \`import React from 'react';\`). Access libraries via their global names (e.g., \`React.createElement\`, \`Recharts.LineChart\`, \`window.PropTypes\`).
*   **NO \`export\` STATEMENTS:** You **MUST NOT** include any \`export\` statements (e.g., \`export default ReportComponent;\`). The component function itself is the required output.
*   **COMPONENT DEFINITION:** Define the component as a standard function: \`function ReportComponent({ reportData })\`.

**Input Data Structure:**
The component will receive a prop named 'reportData' which is a JSON object containing analysis results with an ARBITRARY structure. You must INTELLIGENTLY ANALYZE this structure to create appropriate visualizations. The structure for this request is:
\`\`\`json
${JSON.stringify(parsedDataJson, null, 2)}
\`\`\`

**Analysis Summary (Context):**
${analysisSummary}

**Requirements:**
1.  **Component Definition:** \`function ReportComponent({ reportData })\`.
2.  **Global Libraries:** Access libraries globally (e.g., \`React.createElement\`, \`Recharts.LineChart\`). **NO IMPORTS.**
3.  **Styling:** Use inline styles ONLY via a \`styles\` object. Basic, clean styling.
4.  **Data Analysis & Visualization:**
    *   Analyze 'reportData' structure intelligently.
    *   Select appropriate Recharts chart types (LineChart, BarChart, PieChart, ComposedChart, AreaChart).
    *   Use tables (\`<table>\`) for detailed data if suitable.
    *   **EXCLUDE PROCESSING METADATA:** Do not show "Rows Processed", "Input Data Length", etc. Focus on analysis results.
5.  **Data Handling:** Use optional chaining. Handle missing data gracefully. Include formatting helpers (\`formatCurrency\`, \`formatPercentage\`, \`formatNumber\`).
6.  **Structure:** Logical sections using \`<div>\`, \`<h2>\`, \`<h3>\`. Example sections: Executive Summary, Key Metrics, Main Visualizations, Details.
7.  **Charts:** Use \`ResponsiveContainer\`. Clear labels, tooltips, legends.
    *   **SVG \`<defs>\`:** Place \`<defs>\` for gradients **directly inside** the chart component using \`React.createElement('defs', ...)\`.
    *   **Axis Formatting:** Use basic number formatting (\`formatNumber\`) for Y-axis ticks, **NOT** currency formatting.
8.  **Code Output:** Output ONLY the raw JavaScript code defining \`ReportComponent\`. **NO MARKDOWN FENCES (\`\`\`). NO \`import\`. NO \`export\`.**
9.  **Error Handling:** Handle missing fields in \`reportData\` gracefully.
10. **Print Styling:** Include basic print styles using \`@media print\`.
11. **Defensive Coding:** Validate data, use optional chaining, check callback parameters, provide fallbacks. Code must not throw runtime errors due to data variations.

**Example Structure (Conceptual - REMEMBER NO IMPORTS/EXPORTS):**
\`\`\`javascript
// NO IMPORTS HERE
function ReportComponent({ reportData }) {
    // Access globals directly:
    const { createElement, useState } = React;
    const { ResponsiveContainer, LineChart, BarChart, /* etc. */ } = Recharts;
    // const PropTypes = window.PropTypes; // If needed

    const styles = { /* ... */ };
    const formatCurrency = (value) => { /* ... */ };
    // ... other helpers ...

    // Print styles
    const printStyles = \`@media print { /* ... */ }\`;

    // Check reportData exists
    if (!reportData || typeof reportData !== 'object') {
         return createElement('div', { style: styles.error }, 'Error: Invalid report data received.');
    }

    // Main component logic using React.createElement or similar
    return createElement('div', { style: styles.reportContainer },
        createElement('style', null, printStyles),
        createElement('h1', null, reportData?.reportTitle || 'Analysis Report'),
        // ... render sections, charts, tables using createElement ...
    );
}
// NO EXPORT HERE
\`\`\`
Focus on creating a functional, well-structured, and visually clear report component based on your intelligent analysis of the provided \`reportData\` and \`analysisSummary\`, adhering strictly to the NO \`import\`/NO \`export\` and global library access constraints.`;

    try {
        const provider = await getProvider(userId);
        const messages = [{ role: "user", content: "Generate the self-contained React component code as specified in the system prompt, using global libraries and no import/export statements."}];
        const apiOptions = {
            model: modelToUse,
            system: systemPrompt,
            messages,
            max_tokens: 8000, // Adjust as needed, report code can be long
            temperature: 0.1
        };

        const apiResponse = await provider.generateContent(apiOptions);
        const generatedCode = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text.trim() : null;

        if (!generatedCode) {
            throw new Error(`AI assistant failed to generate report code.`);
        }

        // Cleaning for React code
        let cleanedCode = generatedCode;
        const codeBlockRegex = /^```(?:jsx?|javascript)?\s*([\s\S]*?)\s*```$/m;
        const match = cleanedCode.match(codeBlockRegex);
        if (match && match[1]) {
            cleanedCode = match[1].trim();
        }
        cleanedCode = cleanedCode.replace(/^import\s+.*\s+from\s+['"].*['"];?/gm, ''); // Remove imports
        cleanedCode = cleanedCode.replace(/^export\s+default\s+\w+;?/gm, ''); // Remove default export
        cleanedCode = cleanedCode.replace(/^export\s+(const|function)\s+/gm, '$1 '); // Remove named exports

        // Validation
        if (!cleanedCode.includes('function ReportComponent')) {
            logger.warn('Generated report code might be invalid (missing `function ReportComponent`).');
        }
        if (cleanedCode.includes('import ') || cleanedCode.includes('export ')) {
            logger.error('Generated report code STILL contains import/export after cleaning! LLM failed to follow instructions.');
            // Consider throwing error or letting iframe fail
             throw new Error('Generated code included disallowed import/export statement.');
        }

        logger.info(`React report code generated successfully using ${modelToUse}. Length: ${cleanedCode.length}`);
        return { react_code: cleanedCode };
    } catch (error) {
        logger.error(`Error during report code generation API call with model ${modelToUse}: ${error.message}`, error);
        throw new Error(`AI assistant failed to generate report code: ${error.message}`);
    }
};


/**
 * [STREAMING] Calls the LLM to get the next reasoning step or final answer, yielding chunks.
 * Accepts full API options object.
 * @param {object} apiOptions - The complete options object for the LLM API call (model, system, messages, etc.).
 * @param {Function} streamCallback - Function to call with each received chunk/event.
 * @returns {Promise<string>} - The complete text response from the LLM.
 */
const streamLLMReasoningResponse = async (apiOptions, streamCallback) => {
    const startTime = Date.now();
    const modelUsed = apiOptions.model || 'Unknown';
    const userId = apiOptions.userId; // Extract userId if passed in options
    logger.debug(`[streamLLMReasoningResponse] Starting provider stream with model ${modelUsed}`);

    try {
        const provider = await getProvider(userId); // Use userId if needed for provider selection
        const stream = await provider.streamContent(apiOptions);
        logger.info(`LLM Reasoning stream started with model ${modelUsed}.`);

        let fullLLMResponseText = '';
        let chunkCount = 0;
        let isFinished = false; // Track if a finish event was received

        for await (const chunk of stream) {
             chunkCount++;
             let textDelta = null;
             let currentFinishReason = null;

             // Adapt chunk processing based on provider structure
             if (chunk.choices && chunk.choices[0]) { // OpenAI style
                 textDelta = chunk.choices[0].delta?.content;
                 currentFinishReason = chunk.choices[0].finish_reason;
             } else if (typeof chunk.text === 'function') { // Gemini style
                 try { textDelta = chunk.text(); } catch(e) {}
                 if (chunk.candidates && chunk.candidates[0]?.finishReason) {
                    currentFinishReason = chunk.candidates[0].finishReason;
                 }
             } else if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') { // Claude style
                 textDelta = chunk.delta.text;
             } else if (chunk.type === 'message_stop') { // Claude finish
                 currentFinishReason = chunk.message?.stop_reason || 'stop_sequence';
             } // Add other specific chunk checks if needed

            // Process Delta
            if (textDelta) {
                fullLLMResponseText += textDelta;
                streamCallback('token', { content: textDelta });
            }
            // Process Finish
            if (currentFinishReason) {
                isFinished = true; // Mark that a finish event was received
                logger.info(`LLM Stream finished event detected. Reason: ${currentFinishReason}`);
                streamCallback('finish', { finishReason: currentFinishReason });
            }
        } // End for await loop

        const durationMs = Date.now() - startTime;
        logger.info(`LLM Reasoning stream loop ended in ${durationMs}ms. Total chunks: ${chunkCount}. Model: ${modelUsed}. Finish event received: ${isFinished}`);

        // Signal completion reliably, even if no explicit 'finish' event came on the very last chunk
        streamCallback('completed', { finalContent: null });

        return fullLLMResponseText; // Return the fully accumulated text

    } catch (error) {
        logger.error(`Error during LLM streaming API call: ${error.message}`, error);
        streamCallback('error', { message: `AI assistant failed to generate a streaming response: ${error.message}` });
        return null; // Return null on error
    }
};


module.exports = {
    assembleContext,
    streamLLMReasoningResponse,
    generateAnalysisCodePrompt,
    generateAnalysisCode,
    generateReportCode,
    getUserModelPreference,
};