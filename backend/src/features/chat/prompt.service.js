// backend/src/features/chat/prompt.service.js
const anthropic = require('../../shared/external_apis/claude.client');
// --- Import Gemini client ---
const geminiClient = require('../../shared/external_apis/gemini.client');
// --- Import OpenAI client ---
const openaiClient = require('../../shared/external_apis/openai.client');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const Team = require('../teams/team.model');
const TeamMember = require('../teams/team-member.model');
const logger = require('../../shared/utils/logger');
// Import the NEW agent system prompt generator
const generateAgentSystemPrompt = require('./system-prompt-template');

// --- Helper function to get user model preference ---
const getUserModelPreference = async (userId) => {
    if (!userId) {
        logger.warn('Cannot fetch model preference without userId. Defaulting to Claude.');
        return { provider: 'claude', model: 'claude-3-7-sonnet-20250219' }; // Consistent default
    }
    try {
        // Select only the preferredAiModel field
        const user = await User.findById(userId).select('settings.preferredAiModel').lean();
        const preference = user?.settings?.preferredAiModel || 'claude'; // Default to claude if not found

        if (preference === 'gemini') {
             // Check if Gemini client is available before returning preference
             if (!geminiClient.isAvailable()) {
                 logger.warn(`User ${userId} prefers Gemini, but Gemini client is not available. Falling back to Claude.`);
                 return { provider: 'claude', model: 'claude-3-7-sonnet-20250219' }; // Fallback model
             }
             // Use a specific Gemini model
             return { provider: 'gemini', model: 'gemini-2.5-pro-preview-03-25' }; // Example: Using Flash
        } else if (preference === 'openai') {
            // Check if OpenAI client is available
            if (!openaiClient.isAvailable()) {
                logger.warn(`User ${userId} prefers OpenAI, but OpenAI client is not available. Falling back to Claude.`);
                return { provider: 'claude', model: 'claude-3-7-sonnet-20250219' }; // Fallback model
            }
            // Use the specified OpenAI model
            return { provider: 'openai', model: 'o3-mini-2025-01-31' }; // Using gpt-3.5-turbo for "o3 mini"
        } else { // Default case is claude
             // Use a specific Claude model
             return { provider: 'claude', model: 'claude-3-7-sonnet-20250219' }; // Default Claude model
        }
    } catch (error) {
        logger.error(`Error fetching user model preference for user ${userId}: ${error.message}. Defaulting to Claude.`);
        return { provider: 'claude', model: 'claude-3-7-sonnet-20250219' }; // Default model on error
    }
};

// Enhanced context assembly function - now includes team context
const assembleContext = async (userId, selectedDatasetIds) => {
    let contextString = "";
    let userContext = '';
    let teamContext = '';

    try {
        const user = await User.findById(userId).select('settings').lean();
        if (user?.settings?.aiContext) {
            userContext = user.settings.aiContext;
            contextString += `- User Business Context: ${userContext}\n`;
        }

        const teamMemberships = await TeamMember.find({ userId }).lean();
        let teamContexts = [];
        if (teamMemberships && teamMemberships.length > 0) {
            const teamIds = teamMemberships.map(membership => membership.teamId);
            const teams = await Team.find({ _id: { $in: teamIds } }).lean();
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

        // Simplified context assembly for now - focusing on user/team settings
        // Dataset listing/schema retrieval is handled by agent tools.

        return {
            contextString,
            userContext: userContext,
            teamContext: teamContext
        };
    } catch (error) {
        logger.error(`Error assembling initial user/team context: ${error.message}`);
        return {
            contextString: "Error assembling context.",
            userContext: '',
            teamContext: ''
        };
    }
};

/**
 * Calls the LLM to get the next reasoning step or final answer for the agent.
 * @param {object} agentContext - Context prepared by AgentOrchestrator.
 * @returns {Promise<string>} - The raw text response from the LLM.
 */
const getLLMReasoningResponse = async (agentContext) => {
    // --- Get user preference ---
    const { userId } = agentContext;
    const { provider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[LLM Reasoning] Using ${provider} model: ${modelToUse} for user ${userId}`);

    // Check provider availability
    if ((provider === 'claude' && !anthropic) ||
        (provider === 'gemini' && !geminiClient.isAvailable()) ||
        (provider === 'openai' && !openaiClient.isAvailable())) {
        logger.error(`getLLMReasoningResponse called for ${provider} but client is not available.`);
        throw new Error(`AI assistant (${provider}) is currently unavailable.`);
    }

    const startTime = Date.now();
    // Destructure fields needed
    const {
        originalQuery,
        fullChatHistory,
        currentTurnSteps,
        availableTools,
        userContext,
        teamContext,
        analysisResults,
        previousAnalysisResultSummary,
        hasPreviousGeneratedCode
    } = agentContext;

    try {
        // Generate the system prompt using the template
        const systemPrompt = generateAgentSystemPrompt({
            userContext,
            teamContext,
            currentTurnSteps,
            availableTools,
            analysisResults,
            previousAnalysisResultSummary,
            hasPreviousGeneratedCode
        });

        logger.debug(`Agent System Prompt generated. Length: ${systemPrompt.length}`);
        logger.debug(`[Agent Reasoning] Full System Prompt being sent to ${provider} model ${modelToUse}:\n------ START SYSTEM PROMPT ------\n${systemPrompt}\n------ END SYSTEM PROMPT ------`);

        // Construct the messages array for the API call
        const messages = [
            ...(fullChatHistory || []),
            { role: "user", content: originalQuery }
        ];

        logger.debug(`[Agent Reasoning] Sending ${messages.length} messages (history + current) to ${provider}.`);

        // Prepare API options based on provider
        const apiOptions = {
            model: modelToUse,
            max_tokens: provider === 'gemini' ? 28192 : (provider === 'openai' ? 24096 : 24096),
            system: systemPrompt,
            messages,
            temperature: 0.1
        };

        // Call the appropriate API
        let apiResponse;
        logger.debug(`Calling ${provider} API for Agent Reasoning with model ${apiOptions.model}...`);

        if (provider === 'gemini') {
            apiResponse = await geminiClient.generateContent(apiOptions);
        } else if (provider === 'openai') {
            apiResponse = await openaiClient.createChatCompletion(apiOptions);
        } else { // Default to claude
            apiResponse = await anthropic.messages.create(apiOptions);
        }

        // Extract raw response
        const rawResponse = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text : null;

        if (!rawResponse) {
            logger.error(`Unexpected or empty response format from ${provider} API for agent reasoning:`, apiResponse);
            throw new Error(`AI assistant (${provider}) provided an empty or unparseable response.`);
        }

        logger.debug(`${provider} Agent RAW response received. Length: ${rawResponse?.length}`);
        logger.debug(`Raw Response: ${rawResponse}`);

        const durationMs = Date.now() - startTime;
        logger.info(`LLM Reasoning step via ${provider} completed in ${durationMs}ms.`);

        return rawResponse;

    } catch (error) {
        logger.error(`Error during ${provider} LLM reasoning API call: ${error.message}`, error);
        throw new Error(`AI assistant (${provider}) failed to generate a response: ${error.message}`);
    }
};

/**
 * Generates Node.js code for execution in a restricted sandbox environment.
 * @param {object} params - Parameters for code generation.
 * @param {string} params.userId - The ID of the user requesting the code.
 * @param {string} params.analysisGoal - The specific goal the code should achieve.
 * @param {object} params.datasetSchema - Schema information ({schemaInfo, columnDescriptions, description}).
 * @returns {Promise<{code: string | null}>} - The generated code string or null on failure.
 */
const generateAnalysisCode = async ({ userId, analysisGoal, datasetSchema }) => {
    // --- Get user preference ---
    const { provider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[Analysis Code Gen] Using ${provider} model: ${modelToUse} for user ${userId}`);

    // Check availability
    if ((provider === 'claude' && !anthropic) ||
        (provider === 'gemini' && !geminiClient.isAvailable()) ||
        (provider === 'openai' && !openaiClient.isAvailable())) {
         logger.error(`generateAnalysisCode called but selected provider (${provider}) client is not available.`);
         throw new Error(`AI assistant (${provider}) is currently unavailable for code generation.`);
    }
    
    if (!analysisGoal || !datasetSchema) {
        throw new Error('Missing analysis goal or dataset schema for analysis code generation.');
    }

    const startTime = Date.now();
    logger.info(`Generating dynamic analysis Node.js code for goal: "${analysisGoal.substring(0, 50)}..." using ${provider}`);

    // Construct the system prompt for ANALYSIS code generation with DYNAMIC goal
    const analysisCodeGenSystemPrompt = `You are an expert Node.js developer writing analysis code for a VERY RESTRICTED sandbox (Node.js vm.runInNewContext).

    CONTEXT IN SANDBOX:
    1.  \`inputData\`: A JavaScript variable already populated with the PARSED dataset as an array of objects. Do NOT try to parse it again.
    2.  \`sendResult(data)\`: Function to return ONE JSON-serializable result of your analysis.
    3.  Standard JS built-ins ONLY (String, Array, Object, Math, JSON, Date, etc.).
    4.  \`console.log/warn/error\` for debugging.

    RESTRICTIONS (CRITICAL):
    *   NO \`require()\`. NO external libraries.
    *   NO Node.js globals (process, Buffer, fs, etc.).
    *   NO \`async/await\`.
    *   MUST use the provided \`inputData\` variable directly.
    *   MUST call \`sendResult(result)\` exactly once with the final analysis result (or \`{ error: ... }\` on failure).
    *   MUST complete within ~5 seconds.
    *   MUST use ES5 syntax ONLY. DO NOT use ES6+ features such as template literals (e.g., \`string \${variable}\`), arrow functions (=>), let, or const. Use traditional string concatenation (+) and var for variable declarations.
    *   **Execution Flow:** The generated code will be executed directly. **Do NOT use top-level \`return\` statements.** The script should run to completion and use the provided \`sendResult(result)\` function to return the final JSON analysis object. Errors should be allowed to throw naturally (they will be caught).

    DATASET SCHEMA (for context on properties within inputData objects):
    *   Description: ${datasetSchema.description || '(No description provided)'}
    *   Columns: ${(datasetSchema.schemaInfo || []).map(col => `    - ${col.name} (Type: ${col.type || 'unknown'})`).join('\n') || '    (No schema info available)'}

    **TASK:**
    Write a Node.js script that:
    1.  Takes the \`inputData\` array of objects.
    2.  **Includes robust date parsing:** Create a helper function (e.g., \`parseDateRobustly\`) that attempts to parse date strings. If the input is empty, null, or cannot be parsed into a valid Date object (even after trying common formats like YYYY-MM-DD, MM/DD/YYYY), the helper function MUST return \`null\`. DO NOT default to the epoch date (1970).
    3.  Processes \`inputData\`: Map over \`inputData\`, use the robust date parser, and parse numeric values carefully. 
    4.  **Filters invalid data:** After mapping, filter the processed data array to include ONLY rows where essential parsed values are valid.
    5.  **Analysis Goal:** ${analysisGoal}
    6.  Returns EXACTLY the data needed to fulfill this specific analysis goal. Don't force results into a predetermined structure - the structure should match what's needed for the specific goal.
    7.  Calls \`sendResult(result)\` with the result object directly related to the analysis goal.
    8.  Wrap **all** logic in a single top-level \`try...catch\` block. Call \`sendResult({ error: err.message || 'Unknown execution error' })\` in the catch block.

    OUTPUT REQUIREMENTS:
    *   Provide ONLY the raw Node.js code string, starting with \`try { ... } catch (err) { ... }\`. No markdown.
    *   The code MUST operate directly on the \`inputData\` variable. DO NOT include any CSV parsing logic.
    *   The structure passed to \`sendResult()\` should be the simplest JSON-serializable object/array that satisfies the analysis goal.`;

    try {
        const messages = [{ role: "user", content: "Generate the Node.js analysis code based on the goal and schema provided in the system prompt."}];
        
        // Prepare API options
        const apiOptions = {
            model: modelToUse,
            max_tokens: provider === 'gemini' ? 18192 : (provider === 'openai' ? 8192 : 14096),
            system: analysisCodeGenSystemPrompt,
            messages,
            temperature: 0.0 // Low temp for code gen
        };

        // Call appropriate API
        let apiResponse;
        if (provider === 'gemini') {
            apiResponse = await geminiClient.generateContent(apiOptions);
        } else if (provider === 'openai') {
            apiResponse = await openaiClient.createChatCompletion(apiOptions);
        } else { // Default to Claude
            apiResponse = await anthropic.messages.create(apiOptions);
        }

        // Extract code
        const generatedCode = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text.trim() : null;

        if (!generatedCode) {
            logger.error(`Analysis code generation by ${provider} returned empty content.`, apiResponse);
            throw new Error(`AI assistant (${provider}) failed to generate analysis code.`);
        }

        // Check if code includes calls to sendResult (basic validation)
        if (!generatedCode.includes('sendResult(')) {
             logger.warn('Generated analysis code might be missing sendResult() call.');
        }
        if (generatedCode.includes('.split(') || generatedCode.includes('datasetContent')) {
             logger.warn('Generated analysis code unexpectedly contains parsing logic!');
        }
        
        const currentModel = modelToUse;
        logger.info(`Analysis code generated successfully using ${currentModel}. Length: ${generatedCode.length}`);
        return { code: generatedCode };

    } catch (error) {
        const errorModel = modelToUse;
        logger.error(`Error during ${provider} analysis code generation API call with model ${errorModel}: ${error.message}`, error);
        throw new Error(`AI assistant (${provider}) failed to generate analysis code: ${error.message}`);
    }
};

/**
 * Generates React component code for visualizing analysis results.
 * @param {object} params - Parameters for report generation.
 * @param {string} params.userId - The ID of the user requesting the report.
 * @param {string} params.reportGoal - Overall goal of the report.
 * @param {object} params.analysisResults - Object containing multiple analysis results.
 * @returns {Promise<{react_code: string | null}>} - The generated React code string or null on failure.
 */
const generateReportCode = async ({ userId, reportGoal, analysisResults }) => {
    // --- Get user preference ---
    const { provider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[Report Code Gen] Using ${provider} model: ${modelToUse} for user ${userId}`);

    // Check availability
    if ((provider === 'claude' && !anthropic) ||
        (provider === 'gemini' && !geminiClient.isAvailable()) ||
        (provider === 'openai' && !openaiClient.isAvailable())) {
         logger.error(`generateReportCode called but selected provider (${provider}) client is not available.`);
         throw new Error(`AI assistant (${provider}) is currently unavailable for report code generation.`);
    }
    
    // Validate input
    if (!reportGoal || !analysisResults) {
        const error = 'Missing report goal or analysis results for report code generation.';
        logger.error(`[Report Gen] ${error}`, {
            hasReportGoal: !!reportGoal,
            hasAnalysisResults: !!analysisResults
        });
        throw new Error(error);
    }

    // Ensure analysisResults is a string (convert if needed)
    let analysisResultsJson;
    if (typeof analysisResults !== 'string') {
        try {
            analysisResultsJson = JSON.stringify(analysisResults);
        } catch (e) {
            logger.error(`[Report Gen] Failed to stringify analysisResults: ${e.message}`);
            throw new Error('Invalid data format provided for report generation.');
        }
    } else {
        analysisResultsJson = analysisResults;
    }

    // Parse to validate and for logging
    let parsedResults;
    try {
        parsedResults = JSON.parse(analysisResultsJson);
    } catch (parseError) {
        logger.error(`[Report Gen] Failed to parse analysis results: ${parseError.message}`);
        throw new Error('Invalid JSON data provided for report generation.');
    }

    const startTime = Date.now();
    logger.info(`[Report Gen] Generating dynamic React report code for goal: "${reportGoal}"`);
    logger.info('[Report Gen] Analysis results keys:', Object.keys(parsedResults));

    // System Prompt for React Report Code Generation
    const systemPrompt = `\
You are an expert React developer specializing in data visualization using the Recharts library.
Your task is to generate a **single, self-contained React functional component** named 'ReportComponent' based on the provided analysis results and report goal.

**Report Goal:**
${reportGoal}

**Input Data Structure:**
The component will receive a prop named 'reportData' which is a JSON object containing the analysis results. The structure of 'reportData' is:
\`\`\`json
${JSON.stringify(parsedResults, null, 2)}
\`\`\`

**Requirements:**
1.  **Component Definition:** Define a single functional component: \`function ReportComponent({ reportData })\`.
2.  **React & Recharts:** Assume React and ReactDOM are available globally. Import necessary Recharts components using destructuring **at the top of the function**:\n    \`\`\`javascript\n    const { createElement } = React; // Use createElement for JSX elements\n    const { ResponsiveContainer, LineChart, BarChart, PieChart, ComposedChart, AreaChart, Line, Bar, Pie, Area, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } = Recharts; // MUST include all used components here!\n    \`\`\`
3.  **Styling:** Use inline styles ONLY. Define a \`styles\` object containing style objects for different elements (e.g., \`reportContainer\`, \`section\`, \`kpiCard\`, \`chartContainer\`). Use basic, clean styling (e.g., font sizes, padding, margins, borders, background colors).
4.  **Data Handling:** Safely access data from the \`reportData\` prop using optional chaining and null checks. Handle potential missing data gracefully (e.g., display 'N/A' or a placeholder message). Include helper functions for formatting (e.g., \`formatCurrency\`, \`formatPercentage\`, \`formatNumber\`).
5.  **Dynamic Visualization:** Choose appropriate chart types based on the actual structure and nature of the data:
     * **Categorical Data:** Bar charts or pie charts
     * **Time Series:** Line or area charts
     * **Comparisons:** Bar charts or grouped bar charts
     * **Distributions:** Histograms or scatter plots
     * **Single Values/KPIs:** Card displays with appropriate formatting
     * **Tabular Data:** HTML tables with proper styling
6.  **Visualization Guidelines:**
     * **Chart Selection:** Don't force all data into predefined charts. Choose the right chart for each piece of data.
     * **Simplicity:** Prioritize clarity over complexity.
     * **Context:** Include appropriate titles, labels, and legends that explain what the data represents.
     * **Color:** Use a consistent, accessible color palette.
7.  **Charts:** Use appropriate Recharts components (LineChart, BarChart, PieChart, AreaChart, ComposedChart) to visualize the data. Ensure charts are responsive using \`ResponsiveContainer\`. Use clear labels, tooltips, and legends.\n    *   **SVG Definitions (<defs>):** To define elements like gradients for charts (e.g., \`AreaChart\`), place the SVG \`<defs>\` element **directly inside** the chart component. Use \`createElement('defs', ...)\` and \`createElement('linearGradient', ...)\` correctly nested within the chart element structure. **Do NOT attempt to import or define \`defs\` as a variable or component.** Example:\n      \`\`\`javascript\n      createElement(AreaChart, { /* ...props */ },\n          createElement('defs', null,\n              createElement('linearGradient', { id: 'colorUv', x1: '0', y1: '0', x2: '0', y2: '1' },\n                  createElement('stop', { offset: '5%', stopColor: '#8884d8', stopOpacity: 0.8 }),\n                  createElement('stop', { offset: '95%', stopColor: '#8884d8', stopOpacity: 0 })\n              )\n          ),\n          /* ... other chart elements like XAxis, YAxis, Tooltip, Area ... */\n          createElement(Area, { /* ...props */ fill: 'url(#colorUv)' })\n      )\n      \`\`\`\n    *   **Axis Formatting:** For Y-axis ticks (using \`tickFormatter\`), use a simple number formatting function (like the \`formatNumber\` helper) to display numerical values. **Do NOT use the \`formatCurrency\` function for axis ticks**, as it can cause errors if the currency symbol is removed incorrectly.
8.  **Code Output:** Output ONLY the JavaScript code for the \`ReportComponent\` function. Do NOT wrap it in Markdown code fences (\`\`\`javascript ... \`\`\`). Do NOT include any other text, explanations, or imports outside the function body. The entire output must be executable JavaScript defining the component.
9.  **Error Handling:** The component itself should handle potential missing fields in \`reportData\` gracefully. Helper functions should also handle invalid inputs (e.g., non-numeric values for formatting).
10. **PDF/PRINT STYLING (CRITICAL):** You **MUST** include a literal \`<style>\` tag within the main returned JSX fragment containing an \`@media print\` block with CSS rules to prevent elements from being awkwardly split across PDF pages:
    \`\`\`jsx
    const printStyles = \`
      @media print {
        .report-card, .chart-wrapper { /* Adapt selectors! */
          page-break-inside: avoid !important;
        }
        h2, h3 {
           page-break-after: avoid !important;
        }
        /* Add more rules as needed for your specific layout */
      }
    \`;

    return createElement('div', { style: styles.reportContainer },
      createElement('style', null, printStyles),
      /* ...rest of your report JSX... */
    );
    \`\`\`

Focus on creating a functional, well-structured, and visually clear report component that dynamically adapts to the actual data structure provided.`;

    try {
        const messages = [{ role: "user", content: "Generate the robust React component code for the dynamic report based on the report goal and analysis results provided in the system prompt, following all requirements and best practices."}];

        const apiOptions = {
            model: modelToUse,
            max_tokens: provider === 'gemini' ? 16000 : (provider === 'openai' ? 16000 : 16000),
            system: systemPrompt,
            messages,
            temperature: 0.1 // Low temperature for predictable code
        };

        logger.debug(`Calling ${provider} API for Report Code Generation with model ${modelToUse}...`);

        // Call appropriate API based on provider
        let apiResponse;
        if (provider === 'gemini') {
            apiResponse = await geminiClient.generateContent(apiOptions);
        } else if (provider === 'openai') {
             apiResponse = await openaiClient.createChatCompletion(apiOptions);
        } else if (provider === 'claude' && anthropic) {
             apiResponse = await anthropic.messages.create(apiOptions);
        } else {
             logger.error(`generateReportCode: Unsupported provider '${provider}' or client not available.`);
             throw new Error(`Unsupported provider '${provider}' or client not available for report generation.`);
        }

        // Extract content consistently
        const generatedCode = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text.trim() : null;

        if (!generatedCode) {
            logger.error(`Unexpected or empty response format from ${provider} API for report code gen:`, apiResponse);
            throw new Error(`AI assistant (${provider}) failed to generate report code.`);
        }

        // Basic validation: Does it look like a React component using createElement?
        if (!generatedCode.includes('function ReportComponent') || !generatedCode.includes('React.createElement')) {
             logger.warn('Generated report code might be invalid (missing expected keywords).');
        }

        logger.info(`React report code generated successfully using ${modelToUse}. Length: ${generatedCode.length}`);
        return { react_code: generatedCode };

    } catch (error) {
        logger.error(`Error during report code generation API call with model ${modelToUse}: ${error.message}`, error);
        throw new Error(`AI assistant (${provider}) failed to generate report code: ${error.message}`);
    }
};

module.exports = {
    assembleContext,
    getLLMReasoningResponse,
    generateAnalysisCode,
    generateReportCode,
};