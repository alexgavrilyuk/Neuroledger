// backend/src/features/chat/prompt.service.js
// ** UPDATED FILE - Now uses LLM provider abstraction **

// Remove direct client imports
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const Team = require('../teams/team.model');
const TeamMember = require('../teams/team-member.model');
const logger = require('../../shared/utils/logger');
// Import the system prompt generator
const generateAgentSystemPrompt = require('./system-prompt-template');
// Import the provider factory
const { getProvider, getUserModelPreference } = require('../../shared/llm_providers/ProviderFactory');

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
    // Get the user ID from the agent context
    const { userId } = agentContext;
    
    // Get the user's model preference (for logging)
    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[LLM Reasoning] Using ${preferredProvider} model: ${modelToUse} for user ${userId}`);

    const startTime = Date.now();
    // Destructure fields needed, including fullChatHistory, excluding historySummary
    const { originalQuery, fullChatHistory, currentTurnSteps, availableTools, userContext, teamContext,
            analysisResult, previousAnalysisResultSummary, hasPreviousGeneratedCode } = agentContext;

    try {
        // 1. Get the appropriate LLM provider
        const provider = await getProvider(userId);
        
        // 2. Generate the system prompt using the template
        const systemPrompt = generateAgentSystemPrompt({
            userContext,
            teamContext,
            currentTurnSteps,
            availableTools,
            analysisResult,
            previousAnalysisResultSummary,
            hasPreviousGeneratedCode,
            datasetSchemas: agentContext.datasetSchemas || {},
            datasetSamples: agentContext.datasetSamples || {}
        });
        
        // Log the length, maybe log the prompt itself if needed for debugging
        logger.debug(`Agent System Prompt generated. Length: ${systemPrompt.length}`);
        logger.debug(`[Agent Reasoning] Full System Prompt being sent to ${preferredProvider} model ${modelToUse}:\n------ START SYSTEM PROMPT ------\n${systemPrompt}\n------ END SYSTEM PROMPT ------`);

        // 3. Construct the messages array for the API call
        const messages = [
            ...(fullChatHistory || []), // Spread the formatted history array
            { role: "user", content: originalQuery } // The user's latest query
        ];

        // Log the number of messages being sent
        logger.debug(`[Agent Reasoning] Sending ${messages.length} messages (history + current) to provider.`);

        // 4. Prepare API options
        const apiOptions = {
            model: modelToUse,
            system: systemPrompt,
            messages, // Pass the combined history + current message
            max_tokens: 24096, // Default to 24k tokens
            temperature: 0.1
        };

        // 5. Call the provider to generate content
        logger.debug(`Calling provider API for Agent Reasoning with model ${apiOptions.model}...`);
        const apiResponse = await provider.generateContent(apiOptions);

        // 6. Extract raw response
        const rawResponse = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text : null;

        if (!rawResponse) {
            logger.error(`Unexpected or empty response format from provider API for agent reasoning:`, apiResponse);
            throw new Error(`AI assistant provided an empty or unparseable response.`);
        }

        logger.debug(`Agent RAW response received. Length: ${rawResponse?.length}`);
        logger.debug(`Raw Response: ${rawResponse}`); // Keep full log for now

        const durationMs = Date.now() - startTime;
        logger.info(`LLM Reasoning step completed in ${durationMs}ms.`);

        // 7. Return the raw response
        return rawResponse;

    } catch (error) {
        logger.error(`Error during LLM reasoning API call: ${error.message}`, error);
        throw new Error(`AI assistant failed to generate a response: ${error.message}`);
    }
};

/**
 * Generates the system prompt for analysis code generation.
 * @param {object} params - Parameters for prompt generation.
 * @param {string} params.analysisGoal - The specific goal the code should achieve.
 * @param {object} params.datasetSchema - Schema information ({schemaInfo, columnDescriptions, description}).
 * @returns {string} - The generated system prompt string.
 */
const generateAnalysisCodePrompt = ({ analysisGoal, datasetSchema }) => {
    if (!analysisGoal || !datasetSchema) {
        throw new Error('Missing analysis goal or dataset schema for analysis code prompt generation.');
    }

    // Construct the system prompt for ANALYSIS code generation
    const analysisCodeGenSystemPrompt = `You are an expert Javascript data analyst. Your task is to write Javascript code to analyze the provided dataset based on the user's goal.

    **Input Data:**
    The data will be provided to your code as a Javascript variable named \`inputData\`. This variable will hold an array of objects, where each object represents a row from the original CSV data. You **MUST** access the data using \`inputData\`. **DO NOT** attempt to access it via \`global.inputData\`.

    **Dataset Schema:**
    The structure of the objects within the \`inputData\` array is as follows:
    \`\`\`json
    ${JSON.stringify(datasetSchema, null, 2)}
    \`\`\`

    **Analysis Goal:**
    ${analysisGoal}

    **Code Requirements:**
    1.  Write clean, efficient, and correct Javascript code.
    2.  Your code MUST process the data available ONLY in the \`inputData\` variable.
    3.  **CRITICAL:** Your code MUST conclude by calling the special function \`sendResult(resultObject)\` exactly once, passing the final analysis result as a single JSON-serializable object. Do NOT log the result to the console instead of calling sendResult.
    4.  The \`resultObject\` should contain the key findings based on the analysis goal. Structure it logically.
    5.  You can use standard Javascript built-in objects and functions (Date, Math, Array methods, etc.).
    6.  **DO NOT** include any code for parsing CSV data (like \`.split("\n")\`), as the data is already parsed and provided in \`inputData\`.
    7.  **DO NOT** define functions or variables outside the main script body unless necessary for clarity (helper functions are okay).
    8.  Handle potential data issues gracefully (e.g., missing values, unexpected types) using checks and default values where appropriate.
    9.  **CRITICAL - Data Access:** Column names in the \`inputData\` objects (derived from the CSV headers) might not exactly match the concepts mentioned in the \`Analysis Goal\` (e.g., \`row['Actual Income']\` vs \`row['Income']\`, case differences like \`row['budget expenses']\` vs \`row['BudgetExpenses']\`). Your code **MUST** dynamically find the correct column/property name for each required metric (like income, budget income, expenses, budget expenses, and specific expense categories). Do this by iterating through \`Object.keys(row)\` and using case-insensitive comparisons or keyword matching (e.g., find a key containing \`income\` but not \`budget\`, find a key containing \`expense\` but not \`budget\`) to locate the relevant data field within each \`row\` object before attempting to parse its value. Do NOT rely on hardcoded, case-sensitive property names found only in the schema example.
    10. **CRITICAL - Number Parsing:** When reading numeric values (like income, expenses, budget figures), the values might be strings containing currency symbols (like '$'), commas (','), or other non-numeric characters. You **MUST** implement a robust parsing function. This function should first check if the value is null, undefined, or an empty string, returning 0 in those cases. If it's a string, it should remove common currency symbols and thousand separators (commas) BEFORE attempting to parse it as a number using \`parseFloat()\`. If parsing fails or results in NaN, return 0. Do NOT just remove all non-numeric characters, as this can break numbers with decimals. Use a helper function for this parsing logic.
    11. Output ONLY the raw Javascript code. Do not include any explanations, comments outside the code, or markdown formatting.

    **Example (Conceptual - Focus on Parsing Logic):**
    \`\`\`javascript
    function safeParseFloat(value) {
      if (value === null || value === undefined) return 0;
      let numStr = String(value).trim();
      if (numStr === '') return 0;
      
      // Remove common currency symbols ($) and commas (,)
      numStr = numStr.replace(/\$|,/g, ''); 
      
      const parsed = parseFloat(numStr);
      return isNaN(parsed) ? 0 : parsed;
    }

    const data = inputData;
    let totalIncome = 0;
    data.forEach(row => {
      // Assume incomeKey was found dynamically earlier
      const incomeValue = row[incomeKey]; 
      totalIncome += safeParseFloat(incomeValue); 
    });

    // ... rest of the analysis ...
    
    sendResult({ /* ... results ... */ });
    \`\`\`
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
    // Get the user's model preference (for logging)
    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[Analysis Code Gen] Using ${preferredProvider} model: ${modelToUse} for user ${userId}`);

    const startTime = Date.now();
    logger.info('Generating analysis Node.js code for goal: \"%s...\" using provider', analysisGoal.substring(0, 50));

    // Generate the system prompt
    const systemPrompt = generateAnalysisCodePrompt({ analysisGoal, datasetSchema });

    try {
        // Get the appropriate LLM provider
        const provider = await getProvider(userId);
        
        const messages = [{ role: "user", content: "Generate the Node.js analysis code based on the provided TASK and OUTPUT REQUIREMENTS in the system prompt."}];

        const apiOptions = {
            model: modelToUse,
            system: systemPrompt,
            messages,
            max_tokens: 14096, // Default to 14k tokens for code
            temperature: 0.0 // Low temp for code gen
        };

        // Call the provider to generate content
        const apiResponse = await provider.generateContent(apiOptions);
        
        const generatedCode = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text.trim() : null;

        if (!generatedCode) {
            logger.error(`Analysis code generation returned empty content.`, apiResponse);
            throw new Error(`AI assistant failed to generate analysis code.`);
        }

        // Basic code validation
        if (!generatedCode.includes('sendResult(')) {
            logger.warn('Generated analysis code might be missing sendResult() call.');
        }
        if (generatedCode.includes('.split(') || generatedCode.includes('datasetContent')) {
            logger.warn('Generated analysis code unexpectedly contains parsing logic!');
        }

        const durationMs = Date.now() - startTime;
        logger.info(`Analysis code generated successfully using ${modelToUse}. Length: ${generatedCode.length}, Time: ${durationMs}ms`);
        return { code: generatedCode };

    } catch (error) {
        const durationMs = Date.now() - startTime;
        logger.error(`Error during analysis code generation API call with model ${modelToUse}: ${error.message}. Time: ${durationMs}ms`, error);
        throw new Error(`AI assistant failed to generate analysis code: ${error.message}`);
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
    // Get the user's model preference (for logging)
    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[Report Code Gen] Using ${preferredProvider} model: ${modelToUse} for user ${userId}`);
    
    // Add validation for analysis data
    if (!analysisSummary || !dataJson) {
        const error = 'Missing analysis summary or data for report code generation.';
        logger.error(`[Report Gen] ${error}`, {
            hasAnalysisSummary: !!analysisSummary,
            hasDataJson: !!dataJson // Check specifically for dataJson
        });
        throw new Error(error);
    }

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

    // System Prompt for React Report Code Generation
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
        // Get the appropriate LLM provider
        const provider = await getProvider(userId);
        
        const messages = [{ role: "user", content: "Generate a robust React component that intelligently analyzes the arbitrary JSON structure provided and creates appropriate visualizations. The code should handle any data structure gracefully with proper type checking and error handling."}];
        
        const apiOptions = {
            model: modelToUse,
            system: systemPrompt,
            messages,
            max_tokens: 16000,
            temperature: 0.1 // Low temperature for more predictable code structure
        };

        logger.debug(`Calling provider API for Report Code Generation with model ${modelToUse}...`);

        // Call the provider to generate content
        const apiResponse = await provider.generateContent(apiOptions);
        
        // Extract the generated code
        const generatedCode = apiResponse?.content?.[0]?.type === 'text' ? apiResponse.content[0].text.trim() : null;

        if (!generatedCode) {
            logger.error(`Unexpected or empty response format from provider API for report code gen:`, apiResponse);
            throw new Error(`AI assistant failed to generate report code.`);
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
        throw new Error(`AI assistant failed to generate report code: ${error.message}`);
    }
};

/**
 * [STREAMING] Calls the LLM to get the next reasoning step or final answer, yielding chunks.
 * @param {object} agentContext - Context prepared by AgentOrchestrator.
 * @param {Function} streamCallback - Function to call with each received chunk/event.
 *                                      Callback signature: (eventType, data)
 *                                      eventType: 'token', 'tool_call', 'completed', 'error'
 * @returns {Promise<string>} - The complete text response from the LLM
 */
const streamLLMReasoningResponse = async (agentContext, streamCallback) => {
    const { userId } = agentContext;
    // Get the user's model preference (for logging)
    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(userId);
    logger.info(`[LLM Reasoning - STREAMING] Using ${preferredProvider} model: ${modelToUse} for user ${userId}`);

    const startTime = Date.now();
    const { originalQuery, fullChatHistory, currentTurnSteps, availableTools, userContext, teamContext,
            analysisResult, previousAnalysisResultSummary, hasPreviousGeneratedCode } = agentContext;

    try {
        // 1. Get the appropriate LLM provider
        const provider = await getProvider(userId);
        
        // 2. Generate the system prompt
        const systemPrompt = generateAgentSystemPrompt({
            userContext, teamContext, currentTurnSteps, availableTools,
            analysisResult, previousAnalysisResultSummary, hasPreviousGeneratedCode,
            datasetSchemas: agentContext.datasetSchemas || {},
            datasetSamples: agentContext.datasetSamples || {}
        });
        logger.debug(`[Agent Reasoning - STREAMING] System Prompt Length: ${systemPrompt.length}`);

        // 3. Construct the messages array for the API call
        const messages = [
            ...(fullChatHistory || []), 
            { role: "user", content: originalQuery }
        ];
        logger.debug(`[Agent Reasoning - STREAMING] Sending ${messages.length} messages to provider.`);

        // 4. Prepare API options
        const apiOptions = {
            model: modelToUse,
            max_tokens: 24096,
            system: systemPrompt,
            messages,
            temperature: 0.1,
            stream: true // Enable streaming
        };

        // Log the attempt to start streaming
        logger.debug(`[Agent Reasoning - STREAMING] Starting provider stream with model ${modelToUse}`);
        
        // 5. Start the stream
        const stream = await provider.streamContent(apiOptions);

        logger.info(`LLM Reasoning stream started.`);
        
        // Track chunks and response
        let chunkCount = 0;
        let lastChunkTime = Date.now();
        let jsonBlockDetected = false; // Flag to stop sending tokens to FE
        let fullLLMResponseText = ''; // Accumulate full response

        // Process the stream - this section depends on the provider implementation
        for await (const chunk of stream) {
            // Update tracking variables
            chunkCount++;
            lastChunkTime = Date.now();
            
            // This section will depend on the actual data structure returned by each provider's stream
            // We can adapt this logic in Phase 2 of the refactoring if needed
            // For now, we'll handle the specific providers differently
            
            if (preferredProvider === 'openai') {
                const delta = chunk.choices?.[0]?.delta?.content;
                if (delta) {
                    fullLLMResponseText += delta;
                    if (!jsonBlockDetected) {
                        const jsonMarkerIndex = delta.indexOf('```json');
                        const toolMarkerIndex = delta.indexOf('{\n  "tool":'); 
                        let markerFoundAt = -1;
                        if (jsonMarkerIndex !== -1) markerFoundAt = jsonMarkerIndex;
                        else if (toolMarkerIndex !== -1) markerFoundAt = toolMarkerIndex;

                        if (markerFoundAt !== -1) {
                            jsonBlockDetected = true;
                            const textToSend = delta.substring(0, markerFoundAt).trim();
                            if (textToSend) streamCallback('token', { content: textToSend });
                        } else {
                            streamCallback('token', { content: delta });
                        }
                    }
                }
                
                if(chunk.choices?.[0]?.finish_reason) {
                    const reason = chunk.choices?.[0]?.finish_reason;
                    logger.info(`OpenAI stream finished. Reason: ${reason}, Total chunks: ${chunkCount}`);
                    streamCallback('finish', { finishReason: reason });
                }
            } else if (preferredProvider === 'gemini') {
                try {
                    const text = chunk.text(); 
                    fullLLMResponseText += text;
                    logger.debug(`[STREAM DEBUG] Gemini chunk text content: "${text}"`);

                    if (!jsonBlockDetected) {
                        const jsonMarkerIndex = text.indexOf('```json');
                        const toolMarkerIndex = text.indexOf('{\n  "tool":'); 
                        let markerFoundAt = -1;
                        if (jsonMarkerIndex !== -1) markerFoundAt = jsonMarkerIndex;
                        else if (toolMarkerIndex !== -1) markerFoundAt = toolMarkerIndex;

                        if (markerFoundAt !== -1) {
                            jsonBlockDetected = true; 
                            const textToSend = text.substring(0, markerFoundAt).trim();
                            if (textToSend) {
                                logger.debug(`[STREAM DEBUG] Sending final text part before JSON: "${textToSend}"`);
                                streamCallback('token', { content: textToSend });
                            }
                            logger.debug('[STREAM DEBUG] JSON block detected, stopping further token stream.');
                        } else {
                            if (text) {
                                streamCallback('token', { content: text });
                            }
                        }
                    }
                    
                    // Check for finish info
                    if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].finishReason) {
                        const reason = chunk.candidates[0].finishReason;
                        logger.info(`Gemini stream chunk has finish info. Reason: ${reason}, Total chunks: ${chunkCount}`);
                        streamCallback('finish', { finishReason: reason });
                    }
                } catch (e) {
                    logger.error(`Error processing Gemini stream chunk: ${e.message}`, chunk);
                    streamCallback('error', { message: `Error processing AI response chunk: ${e.message}` });
                }
            } else { // Claude
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    const deltaText = chunk.delta.text;
                    fullLLMResponseText += deltaText;
                    if (!jsonBlockDetected) {
                        const jsonMarkerIndex = deltaText.indexOf('```json');
                        const toolMarkerIndex = deltaText.indexOf('{\n  "tool":');
                        let markerFoundAt = -1;
                        if (jsonMarkerIndex !== -1) markerFoundAt = jsonMarkerIndex;
                        else if (toolMarkerIndex !== -1) markerFoundAt = toolMarkerIndex;

                        if (markerFoundAt !== -1) {
                            jsonBlockDetected = true;
                            const textToSend = deltaText.substring(0, markerFoundAt).trim();
                            if (textToSend) streamCallback('token', { content: textToSend });
                        } else {
                            streamCallback('token', { content: deltaText });
                        }
                    }
                }
                // Handling for other Claude event types would go here
            }
        }

        // Stream ended normally
        const durationMs = Date.now() - startTime;
        logger.info(`LLM Reasoning stream completed in ${durationMs}ms. Total chunks: ${chunkCount}, Last chunk received ${Date.now() - lastChunkTime}ms ago`);
        
        // Check if we received a finish signal
        if (chunkCount > 0) {
            // Only if we actually got chunks but no finish event was sent yet
            streamCallback('finish', { finishReason: 'end_of_stream' });
        }
        
        streamCallback('completed', { finalContent: null }); // Signal completion
        
        // Return the fully accumulated text
        return fullLLMResponseText;

    } catch (error) {
        logger.error(`Error during LLM streaming reasoning API call: ${error.message}`, error);
        streamCallback('error', { message: `AI assistant failed to generate a streaming response: ${error.message}` });
        return null; // Return null or throw on error
    }
};

module.exports = {
    assembleContext, // Keep for potential future use
    getLLMReasoningResponse, // For agent
    streamLLMReasoningResponse, // For streaming
    generateAnalysisCode, // For analysis
    generateReportCode, // For reports
};