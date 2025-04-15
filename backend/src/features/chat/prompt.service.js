// backend/src/features/chat/prompt.service.js
// ** UPDATED FILE - Now includes team business context **
const anthropic = require('../../shared/external_apis/claude.client');
// --- NEW: Import Gemini client ---
const geminiClient = require('../../shared/external_apis/gemini.client');
// --- NEW: Import OpenAI client ---
const openaiClient = require('../../shared/external_apis/openai.client');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const Team = require('../teams/team.model');
const TeamMember = require('../teams/team-member.model');
// PromptHistory is now updated by AgentService
// const PromptHistory = require('./prompt.model');
const logger = require('../../shared/utils/logger');
// Import the NEW agent system prompt generator
const generateAgentSystemPrompt = require('./system-prompt-template');

// --- NEW: Helper function to get user model preference ---
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
        // We might re-introduce dataset context here if needed for history summarization later.

        return {
            contextString, // May not be needed if we only pass structured context
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
 *   Includes: userId, originalQuery, fullChatHistory, currentTurnSteps, availableTools, userContext, teamContext, etc.
 * @returns {Promise<string>} - The raw text response from the LLM.
 */
const getLLMReasoningResponse = async (agentContext) => {
    // --- MODIFIED: Get user preference ---
    const { userId } = agentContext;
    const { provider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[LLM Reasoning] Using ${provider} model: ${modelToUse} for user ${userId}`);

    // Check provider availability - ADDED OpenAI check
    if ((provider === 'claude' && !anthropic) ||
        (provider === 'gemini' && !geminiClient.isAvailable()) ||
        (provider === 'openai' && !openaiClient.isAvailable())) {
        logger.error(`getLLMReasoningResponse called for ${provider} but client is not available.`);
        throw new Error(`AI assistant (${provider}) is currently unavailable.`);
    }

    const startTime = Date.now();
    // Destructure fields needed, including fullChatHistory, excluding historySummary
    const { originalQuery, fullChatHistory, currentTurnSteps, availableTools, userContext, teamContext,
            analysisResult, previousAnalysisResultSummary, hasPreviousGeneratedCode } = agentContext;

    try {
        // 1. Generate the system prompt using the new template
        //    Remove historySummary from the parameters passed
        const systemPrompt = generateAgentSystemPrompt({
            userContext,
            teamContext,
            // historySummary REMOVED
            currentTurnSteps,
            availableTools,
            analysisResult,
            previousAnalysisResultSummary,
            hasPreviousGeneratedCode,
            // ADD DATASET CONTEXT - This was missing!
            datasetSchemas: agentContext.datasetSchemas || {},
            datasetSamples: agentContext.datasetSamples || {}
        });
        // Log the length, maybe log the prompt itself if needed for debugging (as before)
        logger.debug(`Agent System Prompt generated. Length: ${systemPrompt.length}`);
        // --- ADDED: Log the full system prompt being sent (as before) ---
        logger.debug(`[Agent Reasoning] Full System Prompt being sent to ${provider} model ${modelToUse}:\n------ START SYSTEM PROMPT ------\n${systemPrompt}\n------ END SYSTEM PROMPT ------`);
        // --- END ADDED LOG ---

        // 2. Construct the messages array for the API call
        //    Include the fullChatHistory before the current originalQuery.
        const messages = [
            ...(fullChatHistory || []), // Spread the formatted history array, ensure it's an array
            { role: "user", content: originalQuery } // The user's latest query
        ];

        // Log the number of messages being sent
        logger.debug(`[Agent Reasoning] Sending ${messages.length} messages (history + current) to ${provider}.`);


        // 3. Prepare API options based on provider
        const apiOptions = {
            model: modelToUse,
            // Adjusted token limits - ADDED OpenAI
            max_tokens: provider === 'gemini' ? 28192 : (provider === 'openai' ? 24096 : 24096), // OpenAI similar to Claude
            system: systemPrompt,
            messages, // Pass the combined history + current message
            temperature: 0.1
        };


        // 4. Call the appropriate API - ADDED OpenAI
        let apiResponse;
        logger.debug(`Calling ${provider} API for Agent Reasoning with model ${apiOptions.model}...`);

        if (provider === 'gemini') {
            apiResponse = await geminiClient.generateContent(apiOptions);
        } else if (provider === 'openai') {
            apiResponse = await openaiClient.createChatCompletion(apiOptions);
        } else { // Default to claude
            apiResponse = await anthropic.messages.create(apiOptions);
        }

        // 5. Extract raw response (Structure should be consistent due to client adaptation)
        const rawResponse = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text : null;

        if (!rawResponse) {
            logger.error(`Unexpected or empty response format from ${provider} API for agent reasoning:`, apiResponse);
            throw new Error(`AI assistant (${provider}) provided an empty or unparseable response.`);
        }

        logger.debug(`${provider} Agent RAW response received. Length: ${rawResponse?.length}`);
        // Optional: Log only a snippet of raw response if too long
        // logger.debug(`Raw Response Snippet: ${rawResponse.substring(0, 200)}...`); 
        logger.debug(`Raw Response: ${rawResponse}`); // Keep full log for now


        const durationMs = Date.now() - startTime;
        logger.info(`LLM Reasoning step via ${provider} completed in ${durationMs}ms.`);

        // 6. Return the raw response
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
    // --- MODIFIED: Get user preference ---
    const { provider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[Analysis Code Gen] Using ${provider} model: ${modelToUse} for user ${userId}`);

    // Check availability - ADDED OpenAI check
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
    logger.info('Generating analysis Node.js code for goal: \\"%s...\\" using %s', analysisGoal.substring(0, 50), provider);

    // Construct the system prompt for ANALYSIS code generation
    // MODIFIED: Removed the rigid required output structure and related instructions
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
    4.  **Filters invalid data:** After mapping, filter the processed data array to include ONLY rows where the parsed date is NOT \`null\` (if dates are relevant to this analysis).
    5.  Performs the analysis using the filtered data to achieve the goal: "${analysisGoal}"
    6.  Creates a well-structured JSON result object that BEST represents the findings of your analysis. Structure this object in the most logical way to organize the specific insights and data points relevant to addressing the analysis goal. Use clear, descriptive keys and appropriate data types. Include all necessary information to make the results complete and meaningful.
        * **IMPORTANT:** DO NOT include metadata or processing statistics in the results (like "rowsProcessed", "rowsSkipped", "inputDataLength", etc.). Focus exclusively on analysis findings, not on information about the data processing itself.
    7.  Calls \`sendResult(result)\` with your structured result object.
    8.  Wrap **all** logic in a single top-level \`try...catch\` block. Call \`sendResult({ error: err.message || 'Unknown execution error' })\` in the catch block.

    OUTPUT REQUIREMENTS:
    *   Provide ONLY the raw Node.js code string, starting with \`try { ... } catch (err) { ... }\`. No markdown.
    *   The code MUST operate directly on the \`inputData\` variable. DO NOT include any CSV parsing logic.
    *   The object passed to \`sendResult()\` should be a well-structured JSON object that BEST represents your analysis findings for the specific user goal and dataset.`;

    try {
        const messages = [{ role: "user", content: "Generate the Node.js analysis code based on the goal and schema, creating a well-structured JSON result that best represents the findings of the analysis."}];
        
        // --- MODIFIED: Prepare API options - ADDED OpenAI ---
        const apiOptions = {
            model: modelToUse,
             // Adjusted token limits - ADDED OpenAI
            max_tokens: provider === 'gemini' ? 18192 : (provider === 'openai' ? 8192 : 14096), // OpenAI gets 8k tokens
            system: analysisCodeGenSystemPrompt,
            messages,
            temperature: 0.0 // Low temp for code gen
        };

        // --- MODIFIED: Call appropriate API - ADDED OpenAI ---
        let apiResponse;
        if (provider === 'gemini') {
            apiResponse = await geminiClient.generateContent(apiOptions);
        } else if (provider === 'openai') {
            apiResponse = await openaiClient.createChatCompletion(apiOptions);
        } else { // Default to Claude
            apiResponse = await anthropic.messages.create(apiOptions);
        }

        // --- MODIFIED: Extract code (structure should be consistent) ---
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
             // Potentially throw error here?
        }
        
        // Now modelToUse should be defined for the log
        const currentModel = modelToUse; // Assign to different variable just in case of weird scope issue
        logger.info(`Analysis code generated successfully using ${currentModel}. Length: ${generatedCode.length}`);
        return { code: generatedCode };

    } catch (error) {
        // Use the same variable name as defined in the try block for error logging
        const errorModel = modelToUse;
        logger.error(`Error during ${provider} analysis code generation API call with model ${errorModel}: ${error.message}`, error);
        throw new Error(`AI assistant (${provider}) failed to generate analysis code: ${error.message}`);
    }
};

/**
 * Generates React component code for visualizing analysis results.
 * @param {object} params - Parameters for report generation.
 * @param {string} params.userId - The ID of the user requesting the report.
 * @param {string} params.analysisSummary - A textual summary of the key findings.
 * @param {object} params.dataJson - The JSON data object (from code execution) for the report.
 * @returns {Promise<{react_code: string | null}>} - The generated React code string or null on failure.
 */
const generateReportCode = async ({ userId, analysisSummary, dataJson }) => {
    // --- MODIFIED: Get user preference ---
    const { provider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[Report Code Gen] Using ${provider} model: ${modelToUse} for user ${userId}`);

    // Check availability - ADDED OpenAI check
    if ((provider === 'claude' && !anthropic) ||
        (provider === 'gemini' && !geminiClient.isAvailable()) ||
        (provider === 'openai' && !openaiClient.isAvailable())) {
         logger.error(`generateReportCode called but selected provider (${provider}) client is not available.`);
         throw new Error(`AI assistant (${provider}) is currently unavailable for report code generation.`);
    }
    
    // Fix 4: Add validation for analysis data
    if (!analysisSummary || !dataJson) {
        const error = 'Missing analysis summary or data for report code generation.';
        logger.error(`[Report Gen] ${error}`, {
            hasAnalysisSummary: !!analysisSummary,
            hasDataJson: !!dataJson // Check specifically for dataJson
        });
        throw new Error(error);
    }
    // End Fix 4

    // Validate that dataJson is a string (as it should be passed from agent.service)
    if (typeof dataJson !== 'string') {
         logger.warn(`[Report Gen] dataJson is not a string, attempting to stringify. Type: ${typeof dataJson}`);
         try {
             dataJson = JSON.stringify(dataJson);
         } catch (e) {
             logger.error(`[Report Gen] Failed to stringify non-string dataJson: ${e.message}`);
             throw new Error('Invalid data format provided for report generation.');
         }
    }

    let parsedDataJson;
    try {
        parsedDataJson = JSON.parse(dataJson);
    } catch (parseError) {
        logger.error(`[Report Gen] Failed to parse dataJson string: ${parseError.message}`);
        throw new Error('Invalid JSON data provided for report generation.');
    }

    const startTime = Date.now();
    logger.info('[Report Gen] Generating React report code with data:', {
        userId,
        // Log keys from the *parsed* object
        dataKeys: Object.keys(parsedDataJson)
    });

    // --- MODIFIED: System Prompt for React Report Code Generation ---
    // Updated to handle arbitrary JSON structures
    const systemPrompt = `\\
You are an expert React developer specializing in data visualization using the Recharts library.
Your task is to generate a **single, self-contained React functional component** named 'ReportComponent' based on the provided analysis data and summary.

**Input Data Structure:**
The component will receive a prop named 'reportData' which is a JSON object containing analysis results with an ARBITRARY structure. You must INTELLIGENTLY ANALYZE this structure to create appropriate visualizations. The structure of 'reportData' provided for this specific request is:
\`\`\`json
${JSON.stringify(parsedDataJson, null, 2)} // Use parsed data for prompt
\`\`\`

**Analysis Summary (Context):**
${analysisSummary}

**Requirements:**
1.  **Component Definition:** Define a single functional component: \`function ReportComponent({ reportData })\`.
2.  **React & Recharts:** Assume React and ReactDOM are available globally. Import necessary Recharts components using destructuring **at the top of the function**:\n    \`\`\`javascript\n    const { createElement } = React; // Use createElement for JSX elements\n    const { ResponsiveContainer, LineChart, BarChart, PieChart, ComposedChart, AreaChart, Line, Bar, Pie, Area, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } = Recharts; // MUST include all used components here!\n    \`\`\`
3.  **Styling:** Use inline styles ONLY. Define a \`styles\` object containing style objects for different elements (e.g., \`reportContainer\`, \`section\`, \`kpiCard\`, \`chartContainer\`). Use basic, clean styling (e.g., font sizes, padding, margins, borders, background colors).
4.  **Data Analysis & Visualization:**
     *   **CRITICAL:** First, analyze the 'reportData' structure to identify:
         - What are the main data categories or dimensions? (e.g., time periods, geographical regions, product categories)
         - What are the main metrics or values? (e.g., revenue, count, percentage)
         - What type of data relationships are present? (e.g., time series, comparisons, breakdowns)
     *   Based on your analysis, select the most appropriate chart types for each data segment:
         - Time series data → Line/Area charts
         - Category comparisons → Bar/Column charts
         - Part-to-whole relationships → Pie/Donut charts
         - Multi-metric comparisons → Composed charts or grouped bars
         - Single KPI values → KPI cards with appropriate formatting
     *   For any data with significant depth or complexity, consider tables for detailed exploration
     *   **IMPORTANT EXCLUSION:** DO NOT include any metadata or processing statistics like "Rows Processed", "Rows Skipped", "Input Data Length", or similar diagnostics in the report. Focus exclusively on the actual analysis results and insights rather than information about how the data was processed.
5.  **Data Handling:** Safely access data from the \`reportData\` prop using optional chaining. Handle potential missing data gracefully (e.g., display 'N/A' or a placeholder message). Include helper functions for formatting (e.g., \`formatCurrency\`, \`formatPercentage\`, \`formatDate\`, \`formatNumber\`).
6.  **Structure:** Organize the report into logical sections using \`<div>\` elements with appropriate titles (\`<h2>\`, \`<h3>\`). The exact sections will depend on the provided data structure, but typically should include:
     *   Executive Summary (using the provided \`analysisSummary\`)
     *   Key metrics or highlights (if present in the data)
     *   Main visualizations relevant to the analysis goal
     *   Any detailed breakdowns or secondary analyses
     *   Anomalies or notable findings (if present in the data)
7.  **Charts:** Use appropriate Recharts components to visualize the data. Ensure charts are responsive using \`ResponsiveContainer\`. Use clear labels, tooltips, and legends.\n    *   **SVG Definitions (<defs>):** To define elements like gradients for charts (e.g., \`AreaChart\`), place the SVG \`<defs>\` element **directly inside** the chart component. Use \`createElement('defs', ...)\` and \`createElement('linearGradient', ...)\` correctly nested within the chart element structure. **Do NOT attempt to import or define \`defs\` as a variable or component.** Example:\n      \`\`\`javascript\n      createElement(AreaChart, { /* ...props */ },\n          createElement('defs', null,\n              createElement('linearGradient', { id: 'colorUv', x1: '0', y1: '0', x2: '0', y2: '1' },\n                  createElement('stop', { offset: '5%', stopColor: '#8884d8', stopOpacity: 0.8 }),\n                  createElement('stop', { offset: '95%', stopColor: '#8884d8', stopOpacity: 0 })\n              )\n          ),\n          /* ... other chart elements like XAxis, YAxis, Tooltip, Area ... */\n          createElement(Area, { /* ...props */ fill: 'url(#colorUv)' })\n      )\n      \`\`\`\n    *   **Axis Formatting:** For Y-axis ticks (using \`tickFormatter\`), use a simple number formatting function (like the \`formatNumber\` helper) to display numerical values. **Do NOT use the \`formatCurrency\` function for axis ticks**, as it can cause errors if the currency symbol is removed incorrectly.
8.  **Tables:** If displaying tabular data, use basic HTML table elements (\`<table>\`, \`<thead>\`, \`<tbody>\`, \`<tr>\`, \`<th>\`, \`<td>\`) styled using the \`styles\` object.
9.  **Code Output:** Output ONLY the JavaScript code for the \`ReportComponent\` function. Do NOT wrap it in Markdown code fences (\`\`\`javascript ... \`\`\`). Do NOT include any other text, explanations, or imports outside the function body. The entire output must be executable JavaScript defining the component.
10. **Error Handling:** The component itself should handle potential missing fields in \`reportData\` gracefully. Helper functions should also handle invalid inputs (e.g., non-numeric values for formatting).
11. **Print Styling:** Include CSS for print media queries as shown in the example below.

**CRITICAL DEFENSIVE CODING REQUIREMENTS:**
1. **Always Validate Data Before Access:** NEVER assume data exists or has a specific structure. Always validate all data before attempting to access or use it.
2. **Use Optional Chaining:** When accessing nested properties (especially in callbacks, formatters, and library components), ALWAYS use optional chaining instead of direct property access. Example: use 'entry?.payload?.value' instead of 'entry.payload.value'.
3. **Defensive Recharts Callbacks:** For Recharts formatter functions (labels, tooltips, etc.), ALWAYS check if parameters exist before using them. Parameters like 'entry' or 'payload' might be undefined during certain rendering phases. Use either optional chaining or explicit null checks.

   GOOD EXAMPLE 1 (with explicit checks):
   formatter: (value, entry) => {
     if (!entry || !entry.payload || entry.payload.year !== '2025') return null;
     return formatPercentage(value);
   }
   
   GOOD EXAMPLE 2 (with optional chaining):
   formatter: (value, entry) => entry?.payload?.year !== '2025' ? formatPercentage(value) : null
   
   BAD EXAMPLE (will cause runtime errors):
   formatter: (value, entry) => entry.payload.year !== '2025' ? formatPercentage(value) : null

4. **Null Checks In All Functions:** ALL helper functions must check inputs before accessing any properties or performing operations.
5. **Fallback Values:** Always provide fallback values or components when data might be missing.
6. **Runtime Error Prevention:** Code must never throw exceptions due to data structure variations. Add explicit checks and error boundaries for all potentially unsafe operations.

**Example Structure (Conceptual):**
\`\`\`javascript
function ReportComponent({ reportData }) {
    const { createElement } = React;
    const { /* Recharts components... */ Area, Line, Bar, Pie, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, AreaChart /* etc. */ } = Recharts; // Ensure ALL needed components are here!

    const styles = { /* ... */ };
    
    // Helper functions for formatting
    const formatCurrency = (value) => { /* ... */ };
    const formatPercentage = (value) => { /* ... */ };
    const formatNumber = (value) => { /* ... */ };
    
    // Set up print styling
    const printStyles = \`
      @media print {
        .chart-container, .kpi-card {
          page-break-inside: avoid !important;
        }
        h2, h3 {
          page-break-after: avoid !important;
        }
      }
    \`;

    // React component creation based on data analysis
    const renderMainMetrics = () => {
        // Example of intelligently determining what to render based on data structure
        if (reportData?.metrics || reportData?.summary || reportData?.overview) {
            const metricsSource = reportData?.metrics || reportData?.summary || reportData?.overview;
            // Render appropriate KPI cards based on what's available
            return createElement('div', { className: 'kpi-container', style: styles.kpiContainer },
                /* Create KPI cards based on available metrics */
            );
        }
        return null; // Don't render if no metrics found
    };

    const renderMainChart = () => {
        // Example of intelligently choosing chart type based on data structure
        if (reportData?.timeSeries || (reportData?.data && Array.isArray(reportData?.data) && reportData?.data[0]?.date)) {
            // Render time series chart for time-based data
            return createElement('div', { className: 'chart-container', style: styles.chartContainer },
                createElement('h3', null, 'Trend Analysis'),
                createElement(ResponsiveContainer, { width: '100%', height: 300 },
                    /* Time series chart using LineChart or AreaChart */
                )
            );
        } else if (reportData?.categories || reportData?.breakdown || (reportData?.data && reportData?.data[0]?.category)) {
            // Render category breakdown chart
            return createElement('div', { className: 'chart-container', style: styles.chartContainer },
                createElement('h3', null, 'Category Analysis'),
                createElement(ResponsiveContainer, { width: '100%', height: 300 },
                    /* Category chart using BarChart or PieChart */
                )
            );
        }
        // Continue with more intelligent chart selection logic
        return null;
    };

    return createElement('div', { style: styles.reportContainer },
        createElement('style', null, printStyles),
        createElement('h1', null, 'Analysis Report'),
        createElement('div', { style: styles.summarySection },
            createElement('h2', null, 'Executive Summary'),
            createElement('p', null, analysisSummary)
        ),
        renderMainMetrics(),
        renderMainChart(),
        // Other sections based on data structure
    );
}
\`\`\`
Focus on creating a functional, well-structured, and visually clear report component based on your intelligent analysis of the provided \`reportData\` and \`analysisSummary\`.`;

    try {
        const messages = [{ role: "user", content: "Generate a robust React component that intelligently analyzes the arbitrary JSON structure provided and creates appropriate visualizations. The code should handle any data structure gracefully with proper type checking and error handling."}];
        // Use a capable model, maybe Sonnet is sufficient for this?
        const apiOptions = {
            model: modelToUse,
            // Adjusted token limits - ADDED OpenAI
            max_tokens: provider === 'gemini' ? 16000 : (provider === 'openai' ? 16000 : 16000), // OpenAI gets 16k
            system: systemPrompt,
            messages,
            temperature: 0.1 // Low temperature for more predictable code structure
        };

        logger.debug(`Calling ${provider} API for Report Code Generation with model ${modelToUse}...`);

        // --- MODIFIED: Call appropriate API based on provider - ADDED OpenAI ---
        let apiResponse;
        if (provider === 'gemini') {
            apiResponse = await geminiClient.generateContent(apiOptions);
        } else if (provider === 'openai') {
             apiResponse = await openaiClient.createChatCompletion(apiOptions);
        } else if (provider === 'claude' && anthropic) { // Keep explicit Claude check
             apiResponse = await anthropic.messages.create(apiOptions);
        } else {
             // Handle cases where the provider is unknown or the client isn't available after the initial check (shouldn't happen)
             logger.error(`generateReportCode: Unsupported provider '${provider}' or client not available.`);
             throw new Error(`Unsupported provider '${provider}' or client not available for report generation.`);
        }
        // --- END MODIFICATION ---

        // --- MODIFIED: Extract content consistently ---
        // Response structure is adapted in each client file to be consistent
        const generatedCode = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text.trim() : null;
        // --- END MODIFICATION ---

        if (!generatedCode) {
            logger.error(`Unexpected or empty response format from ${provider} API for report code gen:`, apiResponse);
            throw new Error(`AI assistant (${provider}) failed to generate report code.`);
        }

        // Basic validation: Does it look like a React component using createElement?
        if (!generatedCode.includes('function ReportComponent') || !generatedCode.includes('React.createElement')) {
             logger.warn('Generated report code might be invalid (missing expected keywords).');
             // Consider throwing an error if validation is stricter
        }

        logger.info(`React report code generated successfully using ${modelToUse}. Length: ${generatedCode.length}`);
        return { react_code: generatedCode };

    } catch (error) {
        logger.error(`Error during report code generation API call with model ${modelToUse}: ${error.message}`, error);
        throw new Error(`AI assistant (${provider}) failed to generate report code: ${error.message}`);
    }
};

/**
 * [STREAMING] Calls the LLM to get the next reasoning step or final answer, yielding chunks.
 * @param {object} agentContext - Context prepared by AgentOrchestrator.
 * @param {Function} streamCallback - Function to call with each received chunk/event.
 *                                      Callback signature: (eventType, data)
 *                                      eventType: 'token', 'tool_call', 'completed', 'error'
 */
const streamLLMReasoningResponse = async (agentContext, streamCallback) => {
    const { userId } = agentContext;
    const { provider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[LLM Reasoning - STREAMING] Using ${provider} model: ${modelToUse} for user ${userId}`);

    // Check provider availability
    if ((provider === 'claude' && !anthropic) ||
        (provider === 'gemini' && !geminiClient.isAvailable()) ||
        (provider === 'openai' && !openaiClient.isAvailable())) {
        logger.error(`streamLLMReasoningResponse called for ${provider} but client is not available.`);
        streamCallback('error', { message: `AI assistant (${provider}) is currently unavailable.` });
        return; // Stop processing
    }

    const startTime = Date.now();
    const { originalQuery, fullChatHistory, currentTurnSteps, availableTools, userContext, teamContext,
            analysisResult, previousAnalysisResultSummary, hasPreviousGeneratedCode } = agentContext;

    try {
        const systemPrompt = generateAgentSystemPrompt({
            userContext, teamContext, currentTurnSteps, availableTools,
            analysisResult, previousAnalysisResultSummary, hasPreviousGeneratedCode,
            datasetSchemas: agentContext.datasetSchemas || {},
            datasetSamples: agentContext.datasetSamples || {}
        });
        logger.debug(`[Agent Reasoning - STREAMING] System Prompt Length: ${systemPrompt.length}`);

        const messages = [
            ...(fullChatHistory || []), 
            { role: "user", content: originalQuery }
        ];
        logger.debug(`[Agent Reasoning - STREAMING] Sending ${messages.length} messages to ${provider}.`);

        const apiOptions = {
            model: modelToUse,
            max_tokens: provider === 'gemini' ? 28192 : (provider === 'openai' ? 24096 : 24096),
            system: systemPrompt,
            messages,
            temperature: 0.1,
            stream: true // <<< Enable streaming for all providers here
        };

        let stream;
        if (provider === 'gemini') {
            stream = await geminiClient.streamGenerateContent(apiOptions);
        } else if (provider === 'openai') {
            stream = await openaiClient.streamChatCompletion(apiOptions);
        } else { // Claude
            stream = await anthropic.messages.create(apiOptions);
        }

        logger.info(`LLM Reasoning stream started via ${provider}.`);

        // Process the stream
        for await (const chunk of stream) {
            // --- Chunk processing logic needs to be provider-specific --- 
            if (provider === 'openai') {
                const delta = chunk.choices?.[0]?.delta?.content;
                if (delta) {
                    streamCallback('token', { content: delta });
                }
                // TODO: Add OpenAI tool call stream handling if needed
                if(chunk.choices?.[0]?.finish_reason === 'stop'){
                     logger.info('OpenAI stream finished.');
                 }
            } else if (provider === 'gemini') {
                // Gemini SDK yields chunks directly
                try {
                    const text = chunk.text(); // Method to get text from Gemini chunk
                    if (text) {
                         streamCallback('token', { content: text });
                    }
                } catch (e) {
                    // Handle potential errors during text extraction from chunk
                     logger.error(`Error processing Gemini stream chunk: ${e.message}`, chunk);
                     streamCallback('error', { message: `Error processing AI response chunk: ${e.message}` });
                }
            } else { // Claude
                 // Anthropic SDK stream events
                 if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                     streamCallback('token', { content: chunk.delta.text });
                 } else if (chunk.type === 'message_stop') {
                     logger.info('Claude stream finished.');
                 } else if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
                    // Basic handling for tool calls - might need refinement
                    streamCallback('tool_call', { toolName: chunk.content_block.name, input: chunk.content_block.input });
                 }
                 // Add handling for other Claude stream events if necessary
            }
        }

        // Stream ended normally
        const durationMs = Date.now() - startTime;
        logger.info(`LLM Reasoning stream via ${provider} completed in ${durationMs}ms.`);
        streamCallback('completed', { finalContent: null }); // Signal completion

    } catch (error) {
        logger.error(`Error during ${provider} LLM streaming reasoning API call: ${error.message}`, error);
        streamCallback('error', { message: `AI assistant (${provider}) failed to generate a streaming response: ${error.message}` });
    }
};

module.exports = {
    assembleContext, // Keep for potential future use
    getLLMReasoningResponse, // New function for the agent
    streamLLMReasoningResponse, // Export the NEW streaming function
    generateAnalysisCode, // Export new function
    generateReportCode, // Add the new function
    // summarizeChatHistory REMOVED from exports
    // generateCode, // Mark as removed/obsolete
    // generateWithHistory // Mark as removed/obsolete
};