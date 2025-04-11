// backend/src/features/chat/prompt.service.js
// ** UPDATED FILE - Now includes team business context **
const anthropic = require('../../shared/external_apis/claude.client');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const Team = require('../teams/team.model');
const TeamMember = require('../teams/team-member.model');
// PromptHistory is now updated by AgentService
// const PromptHistory = require('./prompt.model');
const logger = require('../../shared/utils/logger');
// Import the NEW agent system prompt generator
const generateAgentSystemPrompt = require('./system-prompt-template');

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
 *   Includes: originalQuery, historySummary, currentTurnSteps, availableTools, userContext, teamContext.
 * @returns {Promise<string>} - The raw text response from the LLM.
 */
const getLLMReasoningResponse = async (agentContext) => {
    if (!anthropic) {
        logger.error("getLLMReasoningResponse called but Anthropic client is not initialized.");
        throw new Error('AI assistant is currently unavailable.');
     }

    const startTime = Date.now();
    const { originalQuery, historySummary, currentTurnSteps, availableTools, userContext, teamContext } = agentContext;

    try {
        // 1. Generate the system prompt using the new template
        const systemPrompt = generateAgentSystemPrompt({
            userContext,         // Pass User AI context
            teamContext,         // Pass Team AI context
            historySummary,      // Pass history summary
            currentTurnSteps,    // Pass steps taken this turn
            availableTools,      // Pass tool definitions
            analysisResult: agentContext.analysisResult // <<< EXPLICITLY PASS ANALYSIS RESULT
        });
        logger.debug(`Agent System Prompt generated. Length: ${systemPrompt.length}`);

        // 2. Construct the messages array for the API call
        //    The agent loop provides the necessary history/tool context via the system prompt.
        //    We only need to provide the *current* user query here.
        const messages = [
            // TODO: Consider adding summarized history directly to messages if system prompt gets too large
            { role: "user", content: originalQuery } // The user's latest query
        ];

        const modelToUse = "claude-3-7-sonnet-20250219"; // Use Opus specifically for the main reasoning step
        const apiOptions = {
            model: modelToUse,
            max_tokens: 14096, // Max output tokens (tool call JSON or final answer) - Opus has larger context but keep output reasonable
            system: systemPrompt,
            messages,
            temperature: 0.1 // Lower temperature for more predictable tool usage
        };

        // --- ADDED: Log the full system prompt being sent --- 
        logger.debug(`[Agent Reasoning] Full System Prompt being sent to ${apiOptions.model}:\n------ START SYSTEM PROMPT ------\n${systemPrompt}\n------ END SYSTEM PROMPT ------`);
        // --- END ADDED LOG --- 

        // 3. Call Claude API
        logger.debug(`Calling Claude API for Agent Reasoning with model ${apiOptions.model}...`);
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const rawResponse = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text : null;

        if (!rawResponse) {
            logger.error('Unexpected or empty response format from Claude API for agent reasoning:', claudeApiResponse);
            throw new Error('AI assistant provided an empty or unparseable response.');
        }

        logger.debug(`Claude Agent RAW response received. Length: ${rawResponse?.length}`);
        logger.debug(`Raw Response: ${rawResponse}`); // Log the raw response for debugging parsing
        const durationMs = Date.now() - startTime;
        logger.info(`LLM Reasoning step completed in ${durationMs}ms.`);

        // 4. Return the raw response for the AgentOrchestrator to parse
        return rawResponse;

    } catch (error) {
        logger.error(`Error during LLM reasoning API call: ${error.message}`, error);
        // Rethrow the error to be handled by the AgentOrchestrator
        throw new Error(`AI assistant failed to generate a response: ${error.message}`);
    }
};

/**
 * Generates Node.js code for execution in a restricted sandbox environment.
 * @param {object} params - Parameters for code generation.
 * @param {string} params.analysisGoal - The specific goal the code should achieve.
 * @param {object} params.datasetSchema - Schema information ({schemaInfo, columnDescriptions, description}).
 * @returns {Promise<{code: string | null}>} - The generated code string or null on failure.
 */
const generateAnalysisCode = async ({ analysisGoal, datasetSchema }) => {
    if (!anthropic) {
        logger.error("generateAnalysisCode called but Anthropic client is not initialized.");
        throw new Error('AI assistant is currently unavailable.');
    }
    if (!analysisGoal || !datasetSchema) {
        throw new Error('Missing analysis goal or dataset schema for analysis code generation.');
    }

    const startTime = Date.now();
    logger.info('Generating analysis Node.js code for goal: \"%s...\"', analysisGoal.substring(0, 50));

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

    // Define modelToUse outside the try block to ensure it's accessible in catch
    const modelToUse = "claude-3-7-sonnet-20250219"; // Using Sonnet as specified

    try {
        const messages = [{ role: "user", content: "Generate the Node.js analysis code based on the goal and schema, ensuring the output strictly matches the required structure."}];
        
        const apiOptions = {
            model: modelToUse,
            max_tokens: 13500, 
            system: analysisCodeGenSystemPrompt,
            messages,
            temperature: 0.0 
        };

        logger.debug(`Calling Claude API for Analysis Code Generation with model ${modelToUse}...`);
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const generatedCode = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text.trim() : null;

        if (!generatedCode) {
            logger.error(`Unexpected or empty response format from Claude API for analysis code gen:`, claudeApiResponse);
            throw new Error('AI assistant provided no analysis code.');
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
        logger.error(`Error during analysis code generation API call with model ${errorModel}: ${error.message}`, error);
        throw new Error(`AI failed to generate analysis code: ${error.message}`);
    }
};

/**
 * Generates React component code for visualizing analysis results.
 * @param {object} params - Parameters for report generation.
 * @param {string} params.analysisSummary - A textual summary of the key findings.
 * @param {object} params.dataJson - The JSON data object (from code execution) for the report.
 * @returns {Promise<{react_code: string | null}>} - The generated React code string or null on failure.
 */
const generateReportCode = async ({ analysisSummary, dataJson }) => {
    if (!anthropic) {
        logger.error('generateReportCode called but Anthropic client is not initialized.');
        throw new Error('AI assistant is currently unavailable.');
    }
    if (!analysisSummary) {
        throw new Error('Missing analysis summary for report code generation.');
    }

    const startTime = Date.now();
    logger.info('Generating React report code...');

    // 1. Construct the system prompt for React code generation (similar to original /prompts endpoint)
    //    It needs the analysis summary and the data structure (keys of dataJson) as context.
    const dataKeys = dataJson ? Object.keys(dataJson) : [];
    // -- More detailed structure based on observed analysis results --
    const dataStructureDescription = `\n- **summary**: Object, contains:\n    - **dataRange**: Object (e.g., { start, end, totalDays })\n    - **overview**: Object (e.g., { totalIncome, totalExpenses, netProfit, profitMargin })\n- **incomeVsExpenses**: Object, contains:\n    - **overall**: Object (e.g., { totalIncome, totalExpenses, netProfit })\n    - **monthly**: ARRAY of objects (e.g., [{ period, income, expenses, netProfit, profitMargin }, ...]) - Use this for monthly charts.\n    - **quarterly**: ARRAY of objects (e.g., [{ period, income, expenses, netProfit, profitMargin }, ...])\n    - **yearly**: ARRAY of objects (e.g., [{ period, income, expenses, netProfit, profitMargin }, ...])\n- **budgetPerformance**: Object, contains:\n    - **overall**: Object (e.g., { actualIncome, budgetedIncome, incomeVariance, incomeVariancePercentage, actualExpenses, budgetedExpenses, expensesVariance, expensesVariancePercentage })\n    - **monthly**: ARRAY of objects (e.g., [{ period, actualIncome, budgetedIncome, incomeVariance, incomeVariancePercentage, actualExpenses, budgetedExpenses, expensesVariance, expensesVariancePercentage }, ...]) - Use this for budget charts.\n    - **quarterly**: ARRAY of objects (e.g., [{ period, actualIncome, budgetedIncome, ... }, ...])\n- **expenseBreakdown**: Object, contains:\n    - **overall**: ARRAY of objects (e.g., [{ category, amount, percentage }, ...]) - Use this for the main breakdown chart/table.\n    - **monthly**: ARRAY of objects (e.g., [{ period, totalExpenses, categories: [...] }, ...])\n    - **quarterly**: ARRAY of objects (e.g., [{ period, totalExpenses, categories: [...] }, ...])\n- **trends**: Object, contains:\n    - **income**: Object with key 'monthly' (ARRAY) containing trend data (e.g., [{ period, value }, ...]).\n    - **expenses**: Object with key 'monthly' (ARRAY) containing trend data.\n    - **netProfit**: Object with key 'monthly' (ARRAY) containing trend data.\n- **kpis**: Object, contains:\n    - **profitability**: Object (e.g., { netProfit, profitMargin, returnOnExpense })\n    - **budgetPerformance**: Object (e.g., { incomePerformance, expensePerformance, overallBudgetVariance })\n    - **expenseRatio**: Object (e.g., { topExpenseCategories (ARRAY of {category, percentage}), expenseToIncomeRatio })\n- **anomalies**: Object, contains:\n    - **income**: ARRAY of objects (e.g., [{ period, value, average, deviation, type, description? }, ...])\n    - **expenses**: ARRAY of objects\n    - **categories**: ARRAY of objects (e.g., [{ category, period, value, ... }, ...])\n- Other top-level keys potentially present: ${dataKeys.join(', ')}\n`;

    const reportGenSystemPrompt = `You are an expert React developer specializing in data visualization using Recharts. Generate ONLY the body of a single JavaScript React functional component named 'ReportComponent'.

COMPONENT REQUIREMENTS:
1.  **Component Name:** EXACTLY 'ReportComponent'.
2.  **Props:** The component MUST accept a single prop named \`reportData\`, which is the JSON object provided below.
3.  **Rendering:** Use \`React.createElement\` for ALL component/element creation. Do NOT use JSX syntax.
4.  **Global Libraries:** Assume \`React\` and \`Recharts\` are available as global variables. Access them directly (e.g., \`React.createElement(Recharts.LineChart, ...)\`). **Do NOT include \`import\` or \`require\` statements.**
5.  **Analysis & Content:** Use the provided \`analysisSummary\` and the \`reportData\` prop to create meaningful visualizations (charts, tables, key figures) using Recharts and standard HTML elements via \`React.createElement\`. Structure the report logically. Display the following sections based on available data: Financial Summary, Income vs Expenses (Monthly Chart), Budget Performance (Monthly Chart), Expense Breakdown (Overall Pie Chart & Table), Key Trends (Income, Expenses, Net Profit Monthly Area Charts), KPIs, and Anomalies.
6.  **Styling:** Apply reasonable inline styles for presentation (e.g., \`style={{ margin: '10px' }}\`). Assume a standard sans-serif font. Use contrasting colors for chart elements (e.g., income green, expenses red).
7.  **Robust Data Handling:** \n    *   The \`reportData\` prop structure is described below under EXPECTED DATA STRUCTURE. Your code MUST strictly adhere to this structure. Pay close attention to nested keys and whether a value is an object or an array.\n    *   **Key Data Paths:** Access data using the CORRECT nested paths (e.g., \`reportData.summary.overview.totalIncome\`, \`reportData.kpis.profitability.profitMargin\`, \`reportData.kpis.expenseRatio.expenseToIncomeRatio\`).\n    *   **Check data existence AND type:** Before accessing properties or iterating (e.g., using \`.map()\`), ALWAYS verify that the parent object/array exists AND the specific property exists AND has the expected type based on the structure below (e.g., \`typeof reportData.summary?.overview?.totalIncome === 'number'\`, \`Array.isArray(reportData.expenseBreakdown?.overall)\`, \`Array.isArray(reportData.incomeVsExpenses?.monthly)\`).\n    *   **Safe Access:** Use optional chaining (\`?.\`) extensively (e.g., \`reportData?.summary?.overview?.totalIncome\`, \`reportData?.trends?.income?.monthly\`, \`reportData?.kpis?.profitability?.profitMargin\`).\n    *   **Chart Data:** For chart components (BarChart, LineChart, PieChart, AreaChart), the \`data\` prop MUST be an array. Ensure the corresponding property in \`reportData\` (e.g., \`reportData.incomeVsExpenses.monthly\`, \`reportData.expenseBreakdown.overall\`, \`reportData.trends.income.monthly\`) is validated as a non-empty array before rendering the chart.\n    *   **Rendering List/Table Items:** When mapping over an array of objects (e.g., \`reportData.anomalies.income.map(...)\` or rows in \`reportData.expenseBreakdown.overall\`), you MUST create React elements for the *specific properties* you want to display (e.g., \`anomaly.period\`, \`anomaly.value\`). **DO NOT render the entire object (e.g., \`anomaly\`) directly as a child element**, as this will cause a React error. Format the properties into strings or nested elements.\n    *   **Internal Errors:** If expected data based on the structure below is missing or invalid, render a clear, user-friendly message FOR THAT SPECIFIC SECTION (e.g., \`React.createElement('p', { style: { color: 'orange' } }, 'KPI data (reportData.kpis.profitability) is unavailable or invalid.')\`). Do NOT let the entire component crash.\n    *   **KPI Display:** Render ONLY the specific KPIs defined in the EXPECTED DATA STRUCTURE under the \`kpis\` key (i.e., netProfit, profitMargin, returnOnExpense, incomePerformance, expensePerformance, overallBudgetVariance, topExpenseCategories, expenseToIncomeRatio). Do NOT attempt to render any other KPIs.\n8.  **Output:** Provide ONLY the JavaScript code for the \`ReportComponent\` function body, starting directly with \`function ReportComponent({ reportData }) {\` or similar. Do not include any surrounding text, explanations, or markdown formatting like \`\`\`.

ANALYSIS SUMMARY:
${analysisSummary}

EXPECTED DATA STRUCTURE (Prop: reportData):
${dataStructureDescription}

Base your component implementation STRICTLY on the ANALYSIS SUMMARY and the EXPECTED DATA STRUCTURE described above. Validate data presence and types carefully before use, especially checking for arrays before mapping or passing to charts using the specified nested paths.

Generate the React component code now. Ensure it is robust and handles potential variations in the reportData structure gracefully.`;

    try {
        const messages = [{ role: "user", content: "Generate the robust React component code for the report based on the summary and the detailed data structure provided in the system prompt, following all requirements, especially data validation and type checking using the correct nested paths before rendering."}];
        // Use a capable model, maybe Sonnet is sufficient for this?
        const modelToUse = "claude-3-7-sonnet-20250219";
        const apiOptions = {
            model: modelToUse,
            max_tokens: 16000, // Allow ample space for component code
            system: reportGenSystemPrompt,
            messages,
            temperature: 0.1 // Low temperature for more predictable code structure
        };

        logger.debug(`Calling Claude API for Report Code Generation with model ${modelToUse}...`);
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const generatedCode = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text.trim() : null;

        if (!generatedCode) {
            logger.error('Unexpected or empty response format from Claude API for report code gen:', claudeApiResponse);
            throw new Error('AI assistant provided no report code.');
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
        throw new Error(`AI failed to generate report code: ${error.message}`);
    }
};

/**
 * Summarizes a given chat history using an LLM call.
 * @param {Array<{role: string, content: string}>} chatHistory - The recent chat history.
 * @returns {Promise<string>} - The summarized history string.
 */
const summarizeChatHistory = async (chatHistory) => {
    if (!anthropic) {
        logger.error('summarizeChatHistory called but Anthropic client is not initialized.');
        return "Error: AI assistant unavailable for summarization."; // Return error string
    }
    if (!chatHistory || chatHistory.length === 0) {
        return "No conversation history to summarize.";
    }

    const startTime = Date.now();
    logger.info(`Summarizing chat history (${chatHistory.length} messages)...`);

    // 1. Construct the summarization prompt
    const summarizationSystemPrompt = "You are a helpful assistant specializing in summarizing conversations. Given the following chat history between a User and an AI Financial Analyst Agent, provide a concise summary focusing on the key topics discussed, questions asked, analyses performed, and conclusions reached. Aim for a summary that captures the essence of the conversation flow and the most important information exchanged. Do not exceed 3-4 sentences.";

    // Format history for the prompt message
    const historyString = chatHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n---\n');
    const messages = [
        { 
            role: "user", 
            content: `Please summarize the following conversation history:\n\n${historyString}`
        }
    ];

    try {
        // Use a smaller, faster model for summarization
        const modelToUse = "claude-3-7-sonnet-20250219"; 
        const apiOptions = {
            model: modelToUse,
            max_tokens: 2500, // Limit summary length
            system: summarizationSystemPrompt,
            messages,
            temperature: 0.2 
        };

        // Add model to log
        logger.debug(`Calling Claude API for History Summarization with model ${modelToUse}...`);
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const summary = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text.trim() : null;

        if (!summary) {
            logger.error('Unexpected or empty response format from Claude API for history summarization:', claudeApiResponse);
            return "Error: Failed to generate history summary.";
        }

        logger.info(`History summarized successfully using ${modelToUse} in ${Date.now() - startTime}ms.`);
        return summary;

    } catch (error) {
        // Add model to error log
        // Ensure modelToUse is defined in this scope or handle potential ReferenceError
        const errorModel = typeof modelToUse !== 'undefined' ? modelToUse : '[model variable undefined]';
        logger.error(`Error during history summarization API call with model ${errorModel}: ${error.message}`, error);
        return `Error summarizing history: ${error.message}`;
    }
};

module.exports = {
    assembleContext, // Keep for potential future use
    getLLMReasoningResponse, // New function for the agent
    generateAnalysisCode, // Export new function
    generateReportCode, // Add the new function
    summarizeChatHistory // Add the new summarization function
    // generateCode, // Mark as removed/obsolete
    // generateWithHistory // Mark as removed/obsolete
};