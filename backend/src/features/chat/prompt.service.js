// backend/src/features/chat/prompt.service.js
// ** UPDATED FILE - Now includes team business context **
const anthropic = require('../../shared/external_apis/claude.client');
// --- NEW: Import Gemini client ---
const geminiClient = require('../../shared/external_apis/gemini.client');
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
        return { provider: 'claude', model: 'claude-3-7-sonnet-20250219' }; // Default model
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
             // --- TODO: Select appropriate Gemini model variant ---
             // For now, hardcoding 1.5 Pro, but could be based on task (reasoning vs code gen)
             return { provider: 'gemini', model: 'gemini-2.5-pro-preview-03-25' }; 
        } else {
             // --- TODO: Select appropriate Claude model variant ---
             // Keeping Haiku for now, but original code used Sonnet/Opus for different tasks
             return { provider: 'claude', model: 'claude-3-7-sonnet-20250219' }; 
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

    // Check provider availability
    if (provider === 'claude' && !anthropic) {
        logger.error("getLLMReasoningResponse called for Claude but client is not initialized.");
        throw new Error('AI assistant (Claude) is currently unavailable.');
    }
     if (provider === 'gemini' && !geminiClient.isAvailable()) {
        logger.error("getLLMReasoningResponse called for Gemini but client is not available. Fallback failed?");
        throw new Error('AI assistant (Gemini) is currently unavailable.');
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
            hasPreviousGeneratedCode
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
            // Adjusted token limits based on model capabilities - CHECK DOCUMENTATION
            max_tokens: provider === 'gemini' ? 8192 : 4096, 
            system: systemPrompt,
            messages, // Pass the combined history + current message
            temperature: 0.1
        };


        // 4. Call the appropriate API
        let apiResponse;
        logger.debug(`Calling ${provider} API for Agent Reasoning with model ${apiOptions.model}...`);

        if (provider === 'gemini') {
            apiResponse = await geminiClient.generateContent(apiOptions);
        } else { // Default to claude
            apiResponse = await anthropic.messages.create(apiOptions);
        }

        // 5. Extract raw response
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

    // Check availability
    if ((provider === 'claude' && !anthropic) || (provider === 'gemini' && !geminiClient.isAvailable())) {
         logger.error(`generateAnalysisCode called but selected provider (${provider}) client is not available.`);
         throw new Error(`AI assistant (${provider}) is currently unavailable for code generation.`);
    }
    
    if (!analysisGoal || !datasetSchema) {
        throw new Error('Missing analysis goal or dataset schema for analysis code generation.');
    }

    const startTime = Date.now();
    logger.info('Generating analysis Node.js code for goal: \\"%s...\\" using %s', analysisGoal.substring(0, 50), provider);

    // Construct the system prompt for ANALYSIS code generation
    // ADDED: Explicit output structure definition
    const requiredOutputStructure = `{
      summary: {
        dataRange: { start: string | null, end: string | null, totalDays: number | null },
        overview: { totalIncome: number, totalExpenses: number, netProfit: number, profitMargin: number }
      },
      incomeVsExpenses: {
        overall: { totalIncome: number, totalExpenses: number, netProfit: number },
        monthly: [{ period: string, income: number, expenses: number, netProfit: number, profitMargin: number }],
        quarterly: [{ period: string, income: number, expenses: number, netProfit: number, profitMargin: number }],
        yearly: [{ period: string, income: number, expenses: number, netProfit: number, profitMargin: number }]
      },
      budgetPerformance: {
        overall: { actualIncome: number, budgetedIncome: number, incomeVariance: number, incomeVariancePercentage: number, actualExpenses: number, budgetedExpenses: number, expensesVariance: number, expensesVariancePercentage: number },
        monthly: [{ period: string, actualIncome: number, budgetedIncome: number, incomeVariance: number, incomeVariancePercentage: number, actualExpenses: number, budgetedExpenses: number, expensesVariance: number, expensesVariancePercentage: number }],
        quarterly: [{ period: string, actualIncome: number, budgetedIncome: number, incomeVariance: number, incomeVariancePercentage: number, actualExpenses: number, budgetedExpenses: number, expensesVariance: number, expensesVariancePercentage: number }]
      },
      expenseBreakdown: {
        overall: [{ category: string, amount: number, percentage: number }],
        monthly: [{ period: string, totalExpenses: number, categories: [{ category: string, amount: number, percentage: number }] }],
        quarterly: [{ period: string, totalExpenses: number, categories: [{ category: string, amount: number, percentage: number }] }]
      },
      trends: {
        income: { monthly: [{ period: string, value: number }] },
        expenses: { monthly: [{ period: string, value: number }] },
        netProfit: { monthly: [{ period: string, value: number }] }
      },
      kpis: {
        profitability: { netProfit: number, profitMargin: number, returnOnExpense: number },
        budgetPerformance: { incomePerformance: number, expensePerformance: number, overallBudgetVariance: number },
        expenseRatio: { topExpenseCategories: [{ category: string, percentage: number }], expenseToIncomeRatio: number }
      },
      anomalies: {
        income: [{ period: string, value: number, average?: number, deviation?: number, type?: string, description?: string }],
        expenses: [{ period: string, value: number, average?: number, deviation?: number, type?: string, description?: string }],
        categories: [{ category: string, period: string, value: number, average?: number, deviation?: number, type?: string, description?: string }]
      }
    }`;

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
    4.  **Filters invalid data:** After mapping, filter the processed data array to include ONLY rows where the parsed date is NOT \`null\`.
    5.  Performs the analysis using the filtered data to achieve the goal: "${analysisGoal}"
    6.  Constructs a result object that **STRICTLY ADHERES** to the REQUIRED OUTPUT STRUCTURE specified below. Include all keys, even if the value is null, 0, or an empty array, unless it is truly optional (like fields within anomalies). Use explicit key-value pairs; DO NOT use shorthand property names.
    7.  Calls \`sendResult(result)\` with the structured result object.
    8.  Wrap **all** logic in a single top-level \`try...catch\` block. Call \`sendResult({ error: err.message || 'Unknown execution error' })\` in the catch block.

    **REQUIRED OUTPUT STRUCTURE (for the object passed to sendResult):**
    ${requiredOutputStructure}

    OUTPUT REQUIREMENTS:
    *   Provide ONLY the raw Node.js code string, starting with \`try { ... } catch (err) { ... }\`. No markdown.
    *   The code MUST operate directly on the \`inputData\` variable. DO NOT include any CSV parsing logic.
    *   The object passed to \`sendResult()\` MUST match the REQUIRED OUTPUT STRUCTURE exactly.`;

    try {
        const messages = [{ role: "user", content: "Generate the Node.js analysis code based on the goal and schema, ensuring the output strictly matches the required structure."}];
        
        // --- MODIFIED: Prepare API options ---
        const apiOptions = {
            model: modelToUse,
             // Example: Maybe allow more tokens for code gen? Adjust per model limits/needs.
            max_tokens: provider === 'gemini' ? 18192 : 14096, 
            system: analysisCodeGenSystemPrompt,
            messages,
            temperature: 0.0 // Low temp for code gen
        };

        // --- MODIFIED: Call appropriate API ---
        let apiResponse;
        if (provider === 'gemini') {
            apiResponse = await geminiClient.generateContent(apiOptions);
        } else {
            apiResponse = await anthropic.messages.create(apiOptions);
        }

        // --- MODIFIED: Extract code (structure is similar) ---
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

    // Check availability
    if ((provider === 'claude' && !anthropic) || (provider === 'gemini' && !geminiClient.isAvailable())) {
         logger.error(`generateReportCode called but selected provider (${provider}) client is not available.`);
         throw new Error(`AI assistant (${provider}) is currently unavailable for report code generation.`);
    }
    
    if (!analysisSummary || !dataJson) {
        throw new Error('Missing analysis summary or data for report code generation.');
    }

    const startTime = Date.now();
    logger.info('Generating React report code...');

    // --- System Prompt for React Report Code Generation ---
    // Added detailed instructions and component import list
    const systemPrompt = `\
You are an expert React developer specializing in data visualization using the Recharts library.
Your task is to generate a **single, self-contained React functional component** named 'ReportComponent' based on the provided analysis data and summary.

**Input Data Structure:**
The component will receive a prop named 'reportData' which is a JSON object containing the analysis results. The structure of 'reportData' is:
\`\`\`json
${JSON.stringify(dataJson, null, 2)}
\`\`\`

**Analysis Summary (Context):**
${analysisSummary}

**Requirements:**
1.  **Component Definition:** Define a single functional component: \`function ReportComponent({ reportData })\`.
2.  **React & Recharts:** Assume React and ReactDOM are available globally. Import necessary Recharts components using destructuring **at the top of the function**:
    \`\`\`javascript
    const { createElement } = React; // Use createElement for JSX elements
    const { ResponsiveContainer, LineChart, BarChart, PieChart, ComposedChart, AreaChart, Line, Bar, Pie, Area, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } = Recharts; // MUST include all used components here, especially Area!
    \`\`\`
3.  **Styling:** Use inline styles ONLY. Define a \`styles\` object containing style objects for different elements (e.g., \`reportContainer\`, \`section\`, \`kpiCard\`, \`chartContainer\`). Use basic, clean styling (e.g., font sizes, padding, margins, borders, background colors).
4.  **Data Handling:** Safely access data from the \`reportData\` prop (e.g., \`reportData?.summary?.overview?.totalIncome\`). Handle potential missing data gracefully (e.g., display 'N/A' or a placeholder message). Include helper functions for formatting (e.g., \`formatCurrency\`, \`formatPercentage\`.
5.  **Structure:** Organize the report into logical sections using \`<div>\` elements with appropriate titles (\`<h2>\`, \`<h3>\`). Key sections might include:
    *   Executive Summary (using the provided \`analysisSummary\`)
    *   Key Performance Indicators (KPIs)
    *   Income vs. Expenses Analysis (using charts)
    *   Budget Performance (using charts/tables)
    *   Expense Breakdown (using charts/tables)
    *   Trend Analysis (using charts like Line or Area charts)
    *   Anomalies (if any data is provided, otherwise state none found)
6.  **Charts:** Use appropriate Recharts components (LineChart, BarChart, PieChart, AreaChart, ComposedChart) to visualize the data. Ensure charts are responsive using \`ResponsiveContainer\`. Use clear labels, tooltips, and legends.
7.  **Tables:** If displaying tabular data (e.g., monthly breakdowns), use basic HTML table elements (\`<table>\`, \`<thead>\`, \`<tbody>\`, \`<tr>\`, \`<th>\`, \`<td>\`) styled using the \`styles\` object.
8.  **Code Output:** Output ONLY the JavaScript code for the \`ReportComponent\` function. Do NOT wrap it in Markdown code fences (\`\`\`javascript ... \`\`\`). Do NOT include any other text, explanations, or imports outside the function body. The entire output must be executable JavaScript defining the component.
9.  **Error Handling:** The component itself should handle potential missing fields in \`reportData\` gracefully. Helper functions should also handle invalid inputs (e.g., non-numeric values for formatting).

**Example Structure (Conceptual):**
\`\`\`javascript
function ReportComponent({ reportData }) {
    const { createElement } = React;
    const { /* Recharts components... */ Area, Line, Bar, Pie, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer /* etc. */ } = Recharts; // Ensure ALL needed components are here!

    const styles = { /* ... */ };
    const formatCurrency = (value) => { /* ... */ };
    // ... other helpers

    const renderKPIs = () => { /* ... */ };
    const renderIncomeExpenseChart = () => { /* ... */ };
    // ... other render functions for sections

    return createElement('div', { style: styles.reportContainer },
        createElement('h1', null, 'Financial Analysis Report'),
        renderKPIs(),
        renderIncomeExpenseChart(),
        // ... other sections
    );
}
\`\`\`
Focus on creating a functional, well-structured, and visually clear report component based *strictly* on the provided \`reportData\` and \`analysisSummary\`.`;

    try {
        const messages = [{ role: "user", content: "Generate the robust React component code for the report based on the summary and the detailed data structure provided in the system prompt, following all requirements, especially data validation and type checking using the correct nested paths before rendering."}];
        // Use a capable model, maybe Sonnet is sufficient for this?
        const apiOptions = {
            model: modelToUse,
            max_tokens: 16000, // Allow ample space for component code
            system: systemPrompt,
            messages,
            temperature: 0.1 // Low temperature for more predictable code structure
        };

        logger.debug(`Calling API for Report Code Generation with model ${modelToUse}...`); // Generic log message

        // --- MODIFIED: Call appropriate API based on provider ---
        let apiResponse;
        if (provider === 'gemini') {
            // Adapt options slightly if needed for Gemini (e.g., system prompt handling)
            // Assuming geminiClient can handle the 'system' property or it should be adapted.
            // If Gemini doesn't use 'system', pass null or structure differently.
            // For now, assume direct passing works, adjust if Gemini client has specific needs.
            apiResponse = await geminiClient.generateContent(apiOptions); 
        } else if (provider === 'claude' && anthropic) {
             apiResponse = await anthropic.messages.create(apiOptions);
        } else {
             // Handle cases where the provider is unknown or the client isn't available
             logger.error(`generateReportCode: Unsupported provider '${provider}' or client not available.`);
             throw new Error(`Unsupported provider '${provider}' or client not available for report generation.`);
        }
        // --- END MODIFICATION ---

        // --- MODIFIED: Extract content consistently ---
        // Both Gemini and Claude (v3) responses seem to use a similar structure
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

module.exports = {
    assembleContext, // Keep for potential future use
    getLLMReasoningResponse, // New function for the agent
    generateAnalysisCode, // Export new function
    generateReportCode, // Add the new function
    // summarizeChatHistory REMOVED from exports
    // generateCode, // Mark as removed/obsolete
    // generateWithHistory // Mark as removed/obsolete
};