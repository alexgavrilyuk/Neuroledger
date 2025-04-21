// ================================================================================
// FILE: backend/src/features/chat/prompt.service.js
// PURPOSE: Handles LLM interactions, using provider abstraction.
// PHASE 5 UPDATE: Added guidance on handling error feedback in generateAnalysisCodePrompt.
// ================================================================================

const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const Team = require('../teams/team.model');
const TeamMember = require('../teams/team-member.model');
const logger = require('../../shared/utils/logger');
const { getProvider, getUserModelPreference } = require('../../shared/llm_providers/ProviderFactory');

/**
 * Assembles initial user and team context strings.
 * @param {string} userId - The user ID.
 * @param {Array<string>} selectedDatasetIds - (Currently unused).
 * @returns {Promise<{contextString: string, userContext: string, teamContext: string}>}
 */
const assembleContext = async (userId, selectedDatasetIds) => {
    // (No changes needed for Phase 5)
    let contextString = ""; let userContext = ''; let teamContext = '';
    try {
        const user = await User.findById(userId).select('settings').lean();
        if (user?.settings?.aiContext) userContext = user.settings.aiContext;
        const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
        let teamContexts = [];
        if (teamMemberships?.length > 0) {
            const teamIds = teamMemberships.map(m => m.teamId);
            const teams = await Team.find({ _id: { $in: teamIds } }).select('name settings.aiContext').lean();
            teams.forEach(t => { if (t.settings?.aiContext) teamContexts.push(`Team "${t.name}": ${t.settings.aiContext}`); });
        }
        if (teamContexts.length > 0) teamContext = teamContexts.join('\n  - ');
        contextString = `User Context: ${userContext || 'N/A'}\nTeam Contexts:\n  - ${teamContext || 'N/A'}`;
        return { contextString, userContext: userContext, teamContext: teamContext };
    } catch (error) {
        logger.error(`Error assembling initial user/team context: ${error.message}`);
        return { contextString: "Error assembling context.", userContext: '', teamContext: '' };
    }
};

/**
 * Generates the system prompt specifically for ANALYSIS code generation.
 * PHASE 5 UPDATE: Added guidance on handling error feedback.
 * @param {object} params - Parameters for prompt generation.
 * @param {string} params.analysisGoal - The specific goal, potentially including error feedback.
 * @param {object} params.datasetSchema - Schema information.
 * @returns {string} - The generated system prompt string.
 */
const generateAnalysisCodePrompt = ({ analysisGoal, datasetSchema }) => {
    if (!analysisGoal || !datasetSchema) throw new Error('Missing goal or schema for analysis code prompt.');
    let schemaDetails = `Dataset Description: ${datasetSchema.description || 'N/A'}\nColumns:\n`;
    if (datasetSchema.schemaInfo?.length > 0) {
        schemaDetails += datasetSchema.schemaInfo.map(col => `- ${col.name} (${col.type || 'string'}): ${datasetSchema.columnDescriptions?.[col.name] || 'No description'}`).join('\n');
    } else { schemaDetails += '(No schema information available)'; }

    const analysisCodeGenSystemPrompt = `You are an expert Javascript data analyst writing code to run in a **HIGHLY RESTRICTED SANDBOX ENVIRONMENT (Node.js vm module)**.

    **CRITICAL CONSTRAINTS:**
    1.  **NO FILE SYSTEM ACCESS**, **NO \`require\`**, ONLY Standard JS built-ins.
    2.  Data is **PRE-PARSED** and available ONLY via the \`inputData\` variable (an array of objects).
    3.  Your code MUST call \`sendResult(resultObject)\` **exactly once** with a JSON-serializable result.

    **Your Task:** Write Javascript code adhering to constraints to achieve the goal below using ONLY \`inputData\`.

    **Analysis Goal:**
    ${analysisGoal}

    **Dataset Schema Context:**
    ${schemaDetails}

    **Expanded Calculation Requirements:**
    Beyond the primary goal, your generated code **MUST** attempt to calculate the following if relevant columns exist in the provided schema (check \`datasetSchema\`):
    - **Variance Analysis:** If columns suggesting 'Actual' and 'Budget' values are present (e.g., 'Actual Sales', 'Budgeted Sales'), calculate both the absolute difference (\`Actual - Budget\`) and the percentage difference (\`((Actual - Budget) / Budget) * 100\`). Handle potential division by zero.
    - **Common Financial Ratios:** If standard financial columns are present (e.g., 'Revenue', 'COGS', 'Operating Expenses', 'Current Assets', 'Current Liabilities', 'Total Debt', 'Total Equity'), calculate relevant ratios like Gross Profit Margin, Operating Margin, Current Ratio, Debt-to-Equity. Check for column existence before attempting calculation. Handle division by zero.
    - **Trend Analysis (Basic):** If a date/time column and key numeric columns exist, calculate period-over-period percentage change for primary metrics (like total revenue or net income) if feasible within the sandbox constraints.

    **CRITICAL: Generate Textual Insights:**
    Based on your calculations (variances, ratios, trends), your code **MUST** generate an array of brief, human-readable insight strings. These strings should summarize key findings.
    Examples: \`'Net income was $500 (15.2%) below budget.'\`, \`'Gross margin improved slightly to 45.5%.'\`, \`'Sales grew 8% compared to the previous period.'\`, \`'High missing values found in the Marketing Spend column.'\`

    **Output Structure (\`sendResult\`):**
    Your code **MUST** call \`sendResult(resultObject)\` exactly once. The \`resultObject\` **MUST** be a JSON object containing:
    - \`summaryKPIs\` (object): Key aggregated values (e.g., \`totalRevenue\`, \`netIncome\`).
    - \`calculatedRatios\` (object, optional): Calculated ratios (e.g., \`grossMarginPercent\`).
    - \`varianceAnalysis\` (object, optional): Calculated variances (e.g., \`incomeVariancePercent\`).
    - \`trendAnalysis\` (object, optional): Calculated trends (e.g., \`revenueMoMGrowth\`).
    - \`chartData\` (object or array, optional): Data specifically formatted for potential charts (e.g., monthly breakdowns, category totals).
    - \`generatedInsights\` (array of strings): The textual insights derived from the analysis.
    - \`recommendations\` (array of strings, optional): Brief, actionable recommendations based on the insights.

    **Code Requirements Recap:**
    *   Read ONLY from \`inputData\`.
    *   Perform calculations based on 'Analysis Goal' and 'Expanded Calculation Requirements'.
    *   Use ONLY standard JS built-ins.
    *   Handle data issues (nulls, types) defensively.
    *   **Dynamically find column keys** (case-insensitive/keyword match), do not hardcode names.
    *   **Safely parse numbers** (handle symbols like '$', ',', potentially empty strings). Use a helper like \`safeParseFloat\`.
    *   Call \`sendResult(yourFinalJsonObject)\` with the structure defined above.
    *   Output ONLY raw Javascript code, no explanations or markdown.
    *   **Execution Flow:** Your script MUST execute top-to-bottom and culminate in the **single** \`sendResult()\` call. If you define functions, **ensure the main analysis function is EXPLICITLY CALLED at the end of the script.** Do not assume the environment will call functions for you.

    **Example Structure (Illustrating Function Call):**
    \`\`\`javascript
    function safeParseFloat(value) { /* ... robust implementation ... */ }
    function formatCurrency(value) { /* ... implementation ... */ }

    // Main analysis function definition
    function performFullAnalysis(data) {
      // ... your complex analysis logic using 'data' ...
      const insights = [];
      const recommendations = [];
      let summaryKPIs = {};
      let calculatedRatios = {};
      let varianceAnalysis = {};
      let chartData = {};
      // ... calculate KPIs, ratios, variances, chart data ...
      // ... generate insights & recommendations based on calculations ...
      if (someCondition) {
        insights.push("Key insight based on condition.");
        // recommendations.push("Actionable step based on condition.");
      }
      // ... more complex logic ...

      // Prepare the final result object matching the required Output Structure
      const resultObject = {
        summaryKPIs: summaryKPIs,
        calculatedRatios: calculatedRatios,
        varianceAnalysis: varianceAnalysis,
        chartData: chartData,
        generatedInsights: insights,
        recommendations: recommendations
      };

      // The single, final call to sendResult INSIDE the main function
      sendResult(resultObject);
    }

    // --- CRITICAL SCRIPT END ---
    // Entry point: Check inputData and EXPLICITLY call the main analysis function.
    if (!Array.isArray(inputData) || inputData.length === 0) {
      // Handle empty/invalid input case
      sendResult({ error: "Input data is empty or invalid.", summaryKPIs: {}, generatedInsights: ["Error: Input data was empty."], recommendations: [] });
    } else {
      try {
        // Explicitly call the main analysis function defined above
        performFullAnalysis(inputData);
      } catch (error) {
        // Basic error handling INSIDE the sandbox
        sendResult({ error: \`Analysis failed: \${error.message}\`, summaryKPIs: {}, generatedInsights: [\`Error during analysis: \${error.message}\`], recommendations: [] });
      }
    }
    \`\`\`

    **Flexibility:** Your code must be **flexible**. Analyze the provided \`datasetSchema\` to determine *which* calculations are possible and relevant. Do not attempt calculations if required columns are missing. Gracefully handle missing or invalid data within \`inputData\`.

    **Error Feedback Handling (If applicable):** Your \`Analysis Goal\` might include error feedback from a previous failed execution attempt (indicated by text like "Fix the following error..."). Analyze the error message AND the original goal carefully to provide corrected code that avoids the previous error, while still adhering to all sandbox constraints. Focus on fixing the specific error mentioned.

    Generate the Javascript code now.
    `;
    return analysisCodeGenSystemPrompt;
};

/**
 * Generates Node.js analysis code using the LLM based on a goal and schema.
 * @param {object} params - Parameters for code generation.
 * @returns {Promise<{code: string | null}>} - The generated code string or null on failure.
 */
const generateAnalysisCode = async ({ userId, analysisGoal, datasetSchema }) => {
    // (Code remains the same as Phase 4)
    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[Analysis Code Gen] Using ${preferredProvider} model: ${modelToUse} for user ${userId}`);
    const startTime = Date.now();
    logger.info('Generating analysis Node.js code for goal: "%s..." using provider', analysisGoal.substring(0, 50));
    const systemPrompt = generateAnalysisCodePrompt({ analysisGoal, datasetSchema });
    try {
        const provider = await getProvider(userId);
        const messages = [{ role: "user", content: "Generate the sandboxed Javascript analysis code based **strictly** on the system prompt instructions, using ONLY the `inputData` variable and calling `sendResult`."}];
        const apiOptions = { model: modelToUse, system: systemPrompt, messages, max_tokens: 24096, temperature: 0.0 };
        const apiResponse = await provider.generateContent(apiOptions);
        const generatedCode = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text.trim() : null;
        if (!generatedCode) throw new Error(`AI assistant failed to generate analysis code.`);
        let cleanedCode = generatedCode;
        const codeBlockRegex = /^```(?:javascript|js)?\s*([\s\S]*?)\s*```$/m;
        const match = cleanedCode.match(codeBlockRegex);
        if (match && match[1]) cleanedCode = match[1].trim();
        cleanedCode = cleanedCode.replace(/const\s+\w+\s*=\s*require\(['"].*?['"]\);?/g, '');
        cleanedCode = cleanedCode.replace(/fs\.readFileSync\s*\(.*?\)/g, '/* fs.readFileSync removed */');
        cleanedCode = cleanedCode.replace(/fs\.existsSync\s*\(.*?\)/g, '/* fs.existsSync removed */');
        cleanedCode = cleanedCode.replace(/path\.join\s*\(.*?\)/g, '/* path.join removed */');
        cleanedCode = cleanedCode.replace(/^.*const\s+inputData\s*=\s*global\.inputData.*$/gm, '');
        if (!cleanedCode.includes('sendResult(')) logger.warn('Generated analysis code might be missing sendResult() call after cleaning.');
        if (cleanedCode.includes('require(')) throw new Error('Generated code included disallowed require statement.');
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
 * Generates the system prompt specifically for REPORT code generation.
 * @param {object} params - Parameters for prompt generation.
 * @param {string} params.analysisSummary - A summary of the analysis performed.
 * @param {string} params.dataJson - A JSON string representation of the analysis result data.
 * @param {string} [params.title] - Optional title preference from user/agent.
 * @param {string} [params.chart_type] - Optional chart type preference.
 * @param {Array<string>} [params.columns_to_visualize] - Optional specific columns preference.
 * @returns {string} - The generated system prompt string.
 */
const generateReportCodePrompt = ({ analysisSummary, dataJson, title, chart_type, columns_to_visualize }) => {
    // --- NEW: Add data preview to prompt ---
    let dataPreview = "No data preview available.";
    try {
        const parsedData = JSON.parse(dataJson);
        // Create a more limited preview (e.g., first 5 keys/values, or first 5 array elements)
        if (Array.isArray(parsedData)) {
            dataPreview = JSON.stringify(parsedData.slice(0, 3), null, 2);
             if (parsedData.length > 3) dataPreview += '\n... (truncated array)';
        } else if (typeof parsedData === 'object' && parsedData !== null) {
             const keys = Object.keys(parsedData);
             const previewObj = {};
             keys.slice(0, 5).forEach(key => { previewObj[key] = parsedData[key]; });
             // --- NEW: Show a glimpse of insights/recommendations if present ---
             if (parsedData.generatedInsights) {
                 previewObj.generatedInsights = parsedData.generatedInsights.slice(0, 2); // Show first 2 insights
                 if (parsedData.generatedInsights.length > 2) previewObj.generatedInsights.push('...');
             }
              if (parsedData.recommendations) {
                 previewObj.recommendations = parsedData.recommendations.slice(0, 2); // Show first 2 recommendations
                 if (parsedData.recommendations.length > 2) previewObj.recommendations.push('...');
             }
             dataPreview = JSON.stringify(previewObj, null, 2);
             if (keys.length > 5) dataPreview += '\n... (truncated object)';
        } else {
             dataPreview = String(parsedData).substring(0, 200); // Primitive preview
        }
    } catch { /* Ignore parsing errors for preview */ }
    // --- END NEW ---

    // --- NEW: Refined Prompt ---
    const reportCodeGenSystemPrompt = `You are an expert React developer tasked with creating a **self-contained React component** named \`ReportComponent\` to visualize financial analysis results. This component will run in a sandboxed iframe environment.

    **CRITICAL SANDBOX CONSTRAINTS:**
    1.  **NO \`import\` or \`export\` statements.** Use libraries available globally (e.g., \`window.React\`, \`window.Recharts\`).
    2.  **DEFINE ONLY ONE FUNCTION:** \`function ReportComponent(props) { ... }\`. Do NOT include any other code outside this function definition (no surrounding HTML, script tags, or example usage like \`ReactDOM.render\`).
    3.  **ACCESS DATA VIA PROP:** The analysis result data will be passed as a prop named \`reportData\`. Access it via \`props.reportData\`. This object will contain fields like \`summaryKPIs\`, \`calculatedRatios\`, \`varianceAnalysis\`, \`trendAnalysis\`, \`chartData\`, \`generatedInsights\` (an array of strings), and \`recommendations\` (an array of strings).
    4.  **USE AVAILABLE LIBRARIES:** You can use \`React\`, \`ReactDOM\`, \`Recharts\`, \`lodash\` (\`_\`), \`papaparse\` (\`Papa\`), \`xlsx\` (\`XLSX\`). Access them directly (e.g., \`React.useState\`, \`Recharts.LineChart\`).

    **TASK:** Generate the React code for \`ReportComponent\` based on the following analysis:

    **Analysis Summary:**
    ${analysisSummary || 'No summary provided.'}

    **Analysis Data Preview (passed as \`props.reportData\`):**
    \`\`\`json
    ${dataPreview}
    \`\`\`
    *Note: The actual \`props.reportData\` object will contain the full analysis results, including fields like \`summaryKPIs\`, \`calculatedRatios\`, \`varianceAnalysis\`, \`chartData\`, \`generatedInsights\` (array of strings), and \`recommendations\` (array of strings).*

    **User Preferences (Optional):**
    - Report Title: ${title || 'Generate an appropriate title based on the analysis summary'}
    - Preferred Chart Type: ${chart_type || 'Choose the best fit (e.g., LineChart, BarChart, PieChart, ComposedChart, or a simple Table/Metric display)'}
    - Focus Columns: ${columns_to_visualize ? columns_to_visualize.join(', ') : 'Visualize relevant data from props.reportData'}

    **Output Requirements:**
    *   Create clear and informative visualizations using Recharts (using data from \`props.reportData.chartData\`).
    *   Display key metrics from \`props.reportData.summaryKPIs\`.
    *   **CRITICAL: Render the textual insights from \`props.reportData.generatedInsights\` under a clear heading (e.g., 'Key Observations').**
    *   **CRITICAL: Render the recommendations from \`props.reportData.recommendations\` under a clear heading (e.g., 'Actionable Recommendations').**
    *   Structure the report logically (e.g., Summary/KPIs -> Charts -> Observations -> Recommendations).
    *   Handle potential missing data in \`props.reportData\` gracefully.
    *   Style components minimally using inline styles or basic CSS class names.
    *   The component should be functional and render the analysis data effectively.
    *   **OUTPUT ONLY THE JAVASCRIPT CODE FOR THE \`ReportComponent\` FUNCTION.**

    **GOOD EXAMPLE (Structure including Insights/Recommendations):**
    \`\`\`javascript
    function ReportComponent(props) {
      const { React, Recharts } = window;
      const { /* Destructure chart components */ } = Recharts;
      const reportData = props.reportData || {};
      const insights = reportData.generatedInsights || [];
      const recommendations = reportData.recommendations || [];
      const kpis = reportData.summaryKPIs || {};
      const chartData = reportData.chartData || {}; // e.g., { monthly: [], categories: [] }

      // ... helper functions (formatCurrency etc.) ...

      // Styles
      const sectionStyle = { marginTop: '25px', paddingTop: '15px', borderTop: '1px solid #eee' };
      const headingStyle = { fontSize: '1.1em', fontWeight: '600', marginBottom: '10px', color: '#333' };
      const listStyle = { listStyleType: 'disc', marginLeft: '20px', paddingLeft: '5px' };
      const listItemStyle = { marginBottom: '5px', fontSize: '0.9em', color: '#555' };

      return React.createElement('div', { /* container styles */ },
        React.createElement('h2', { /* title styles */ }, "\${title || 'Financial Analysis Report'}"),

        // KPIs Section
        React.createElement('div', { /* kpi container styles */ },
           // ... render KPIs from kpis object ...
        ),

        // Charts Section
        React.createElement('div', { style: sectionStyle },
            React.createElement('h3', { style: headingStyle }, 'Performance Charts'),
            // ... render charts using chartData.monthly, chartData.categories etc. ...
        ),

        // Key Observations Section
        insights.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('h3', { style: headingStyle }, 'Key Observations'),
          React.createElement('ul', { style: listStyle },
            insights.map((insight, index) =>
              React.createElement('li', { key: 'insight-' + index, style: listItemStyle }, insight)
            )
          )
        ),

        // Recommendations Section
        recommendations.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('h3', { style: headingStyle }, 'Actionable Recommendations'),
          React.createElement('ul', { style: listStyle },
            recommendations.map((rec, index) =>
              React.createElement('li', { key: 'rec-' + index, style: listItemStyle }, rec)
            )
          )
        )
      );
    }
    \`\`\`

    Generate the code for \`ReportComponent\` now. Remember, ONLY the function code.
    `;
    // --- END NEW ---
    return reportCodeGenSystemPrompt;
};

/**
 * Generates React component code for visualizing analysis results.
 * @param {object} params - Parameters for report generation.
 * @returns {Promise<{react_code: string | null}>} - The generated React code string or null on failure.
 */
const generateReportCode = async ({ userId, analysisSummary, dataJson, title, chart_type, columns_to_visualize }) => {
    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[Report Code Gen] Using ${preferredProvider} model: ${modelToUse} for user ${userId}`);
    if (!analysisSummary || !dataJson) throw new Error('Missing analysis summary or data for report code generation.');
    if (typeof dataJson !== 'string') throw new Error('Invalid dataJson format: Expected string.');

    // Generate the refined prompt
    const systemPrompt = generateReportCodePrompt({ analysisSummary, dataJson, title, chart_type, columns_to_visualize });

    try {
        const provider = await getProvider(userId);
        // Simple user message, all logic is in system prompt
        const messages = [{ role: "user", content: "Generate the React component code exactly as specified in the system prompt." }];
        const apiOptions = { model: modelToUse, system: systemPrompt, messages, max_tokens: 28000, temperature: 0.1 }; // Increased max_tokens slightly if needed

        const startTime = Date.now(); // Start timer
        const apiResponse = await provider.generateContent(apiOptions);
        const durationMs = Date.now() - startTime; // End timer

        const generatedCode = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text.trim() : null;

        if (!generatedCode) {
            throw new Error(`AI assistant failed to generate report code.`);
        }

        let cleanedCode = generatedCode;
        // Remove markdown fences first
        const codeBlockRegex = /^```(?:jsx?|javascript)?\s*([\s\S]*?)\s*```$/m;
        const match = cleanedCode.match(codeBlockRegex);
        if (match && match[1]) {
            cleanedCode = match[1].trim();
            logger.debug('[generateReportCode] Removed markdown fences.');
        }

        // Basic cleaning - remove imports/exports, ensure ReportComponent exists
        cleanedCode = cleanedCode.replace(/^import\s+.*\s+from\s+['"].*['"];?/gm, '');
        cleanedCode = cleanedCode.replace(/^export\s+default\s+\w+;?/gm, '');
        cleanedCode = cleanedCode.replace(/^export\s+(const|function)\s+/gm, '$1 ');

        if (!cleanedCode.includes('function ReportComponent')) {
             logger.warn('[generateReportCode] Generated report code is missing "function ReportComponent" definition. Returning as is, iframe may fail.');
             // Return the code anyway, let the iframe handle the error
        } else if (cleanedCode.includes('import ') || cleanedCode.includes('export ')) {
            logger.error('[generateReportCode] Generated code still included disallowed import/export after cleaning!', { cleanedCode: cleanedCode.substring(0, 500) });
            throw new Error('Generated code included disallowed import/export statement.');
        } else {
            logger.info(`React report code generated successfully using ${modelToUse}. Length: ${cleanedCode.length}, Time: ${durationMs}ms`);
        }

        return { react_code: cleanedCode };

    } catch (error) {
        logger.error(`Error during report code generation API call with model ${modelToUse}: ${error.message}`, error);
        throw new Error(`AI assistant failed to generate report code: ${error.message}`);
    }
};

/**
 * [STREAMING] Calls the LLM to get the next reasoning step or final answer, yielding chunks.
 * @param {object} apiOptions - The complete options object for the LLM API call (model, system, messages, etc.).
 * @param {Function} streamCallback - Function to call with each received chunk/event.
 * @returns {Promise<string | null>} - The complete text response from the LLM, or null on error.
 */
const streamLLMReasoningResponse = async (apiOptions, streamCallback) => {
    // (Code remains the same as Phase 4)
    const startTime = Date.now(); const modelUsed = apiOptions.model || 'Unknown'; const userId = apiOptions.userId;
    logger.debug(`[streamLLMReasoningResponse] Starting provider stream with model ${modelUsed}`);
    try {
        const provider = await getProvider(userId); const stream = await provider.streamContent(apiOptions);
        logger.info(`LLM Reasoning stream started with model ${modelUsed}.`);
        let fullLLMResponseText = ''; let chunkCount = 0; let isFinished = false;
        for await (const chunk of stream) {
             chunkCount++; let textDelta = null; let currentFinishReason = null;
             if (chunk.choices?.[0]) { textDelta = chunk.choices[0].delta?.content; currentFinishReason = chunk.choices[0].finish_reason; }
             else if (typeof chunk.text === 'function') { try { textDelta = chunk.text(); } catch(e) {} if (chunk.candidates?.[0]?.finishReason) currentFinishReason = chunk.candidates[0].finishReason; }
             else if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') { textDelta = chunk.delta.text; }
             else if (chunk.type === 'message_stop') { currentFinishReason = chunk.message?.stop_reason || 'stop_sequence'; }
            if (textDelta) { fullLLMResponseText += textDelta; streamCallback('token', { content: textDelta }); }
            if (currentFinishReason) { isFinished = true; logger.info(`LLM Stream finished event. Reason: ${currentFinishReason}`); streamCallback('finish', { finishReason: currentFinishReason }); }
        }
        const durationMs = Date.now() - startTime;
        logger.info(`LLM Reasoning stream loop ended in ${durationMs}ms. Chunks: ${chunkCount}. Model: ${modelUsed}. Finish event: ${isFinished}`);
        streamCallback('completed', { finalContent: null }); return fullLLMResponseText;
    } catch (error) {
        logger.error(`Error during LLM streaming API call: ${error.message}`, error);
        streamCallback('error', { message: `AI assistant failed to generate a streaming response: ${error.message}` }); return null;
    }
};

/**
 * Generates a summary of provided chat history using an LLM.
 * @async
 * @param {string} historyToSummarize - A string containing the formatted conversation history needing summarization.
 * @param {string} userId - The ID of the user (for selecting the provider).
 * @returns {Promise<string|null>} - The generated summary text, or null on failure.
 */
const getHistorySummary = async (historyToSummarize, userId) => {
    // (Code remains the same as Phase 4)
    if (!historyToSummarize) return null; logger.info(`[History Summarization] Requesting summary for history (length: ${historyToSummarize.length}) for user ${userId}`);
    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(userId);
    let summarizationModel = modelToUse; if (preferredProvider === 'claude') { summarizationModel = 'claude-3-haiku-20240307'; logger.debug(`[History Summarization] Overriding model to ${summarizationModel} for summarization.`); }
    else { logger.debug(`[History Summarization] Using preferred model ${summarizationModel} for summarization.`); }
    const systemPrompt = "You are a concise summarization assistant..."; const messages = [{ role: "user", content: `Please summarize this conversation history:\n\n${historyToSummarize}` }];
    try {
        const provider = await getProvider(userId); const apiOptions = { model: summarizationModel, system: systemPrompt, messages, max_tokens: 25000, temperature: 0.2 };
        const apiResponse = await provider.generateContent(apiOptions); const summaryText = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text.trim() : null;
        if (!summaryText) { logger.warn(`[History Summarization] LLM returned empty content for summary.`); return null; }
        logger.info(`[History Summarization] Summary generated successfully (length: ${summaryText.length}).`); return summaryText;
    } catch (error) {
        logger.error(`[History Summarization] Error during summarization API call: ${error.message}`, error); return null;
    }
};

module.exports = {
    assembleContext,
    streamLLMReasoningResponse,
    generateAnalysisCodePrompt,
    generateReportCodePrompt,
    generateAnalysisCode,
    generateReportCode,
    getUserModelPreference,
    getHistorySummary,
};