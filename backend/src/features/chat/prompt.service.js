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
            availableTools       // Pass tool definitions
        });
        logger.debug(`Agent System Prompt generated. Length: ${systemPrompt.length}`);

        // 2. Construct the messages array for the API call
        //    The agent loop provides the necessary history/tool context via the system prompt.
        //    We only need to provide the *current* user query here.
        const messages = [
            // TODO: Consider adding summarized history directly to messages if system prompt gets too large
            { role: "user", content: originalQuery } // The user's latest query
        ];

        const modelToUse = "claude-3-opus-20240229"; // Use a powerful model for reasoning
        const apiOptions = {
            model: modelToUse,
            max_tokens: 4096, // Max output tokens (tool call JSON or final answer)
            system: systemPrompt,
            messages,
            temperature: 0.1 // Lower temperature for more predictable tool usage
        };

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
const generateSandboxedCode = async ({ analysisGoal, datasetSchema }) => {
    if (!anthropic) {
        logger.error("generateSandboxedCode called but Anthropic client is not initialized.");
        throw new Error('AI assistant is currently unavailable.');
    }
    if (!analysisGoal || !datasetSchema) {
        throw new Error('Missing analysis goal or dataset schema for code generation.');
    }

    const startTime = Date.now();
    logger.info(`Generating sandboxed Node.js code for goal: \"${analysisGoal.substring(0, 100)}...\"`);

    // 1. Construct a dedicated system prompt for sandboxed code generation
    const codeGenSystemPrompt = `You are an expert Node.js developer writing code for a VERY RESTRICTED sandbox (Node.js vm.runInNewContext).\n

CONTEXT IN SANDBOX:
1.  \`datasetContent\`: A **string** variable with the raw dataset content (likely CSV).
2.  \`sendResult(data)\`: Function to return ONE JSON-serializable result.
3.  Standard JS built-ins (String, Array, Object, Math, JSON, etc.).
4.  \`console.log/warn/error\` for debugging (does not return results).

RESTRICTIONS (CRITICAL):
*   NO \`require()\` calls (no modules like fs, path, http, csv-parse, etc.).
*   NO Node.js globals (process, Buffer, setTimeout, fetch, etc.).
*   NO \`async/await\` (use only standard sync JS or basic Promises if absolutely needed).
*   Code MUST be relatively simple and fast (runs within ~5 seconds).
*   MUST call \`sendResult(data)\` exactly once with the final result.

DATASET SCHEMA:
*   Description: ${datasetSchema.description || '(No description provided)'}
*   Columns:
${(datasetSchema.schemaInfo || []).map(col => `    - ${col.name} (Type: ${col.type || 'unknown'})${datasetSchema.columnDescriptions?.[col.name] ? ': ' + datasetSchema.columnDescriptions[col.name] : ''}`).join('\n') || '    (No schema info available)'}

**TASK:**
Write a Node.js script that achieves the goal: \"${analysisGoal}\"

Specifically, the script MUST:
1.  Take the \`datasetContent\` **string**.
2.  **Parse the CSV string MANUALLY:**
    *   Add \`console.log('Starting parsing...')\`.
    *   Handle potential BOM.
    *   Split into lines ('\\n'). Handle \`\\r\`. Add \`console.log(\`Processing \${lines.length} lines...\`)\`.
    *   Get headers from first non-empty line, split by comma, trim. Add \`console.log(\`Headers: \${headers.join(',')}\`)\`.
    *   Map remaining lines to objects. Add \`console.log(\`Processing row \${i+1}...\`)\` inside the loop. Add error logging within the loop for skipped rows or parsing issues.
    *   Perform type conversion (e.g., parseFloat), checking for NaN.
    *   Result is an array of objects (\`parsedData\`). Add \`console.log(\`Parsed \${parsedData.length} data rows.\`)\`.
3.  **If the goal involves analysis:**
    *   Add \`console.log('Starting analysis...')\`.
    *   Perform calculation on \`parsedData\`.
    *   Add \`console.log('Analysis complete.')\`.
4.  Call \`sendResult(result)\`. Add \`console.log('Calling sendResult...')\` right before it.
5.  Wrap **all** logic in a single top-level \`try...catch\` block. Call \`sendResult({ error: err.message || 'Unknown execution error' })\` and \`console.error(\`Execution Error: \${err.message}\`)\` in the catch block.`

    try {
        const messages = [{ role: "user", content: "Generate the Node.js code based on the requirements, ensuring CSV parsing is included."}]; // Updated user message slightly
        const modelToUse = "claude-3-7-sonnet-20250219"; 
        const apiOptions = {
            model: modelToUse,
            max_tokens: 3072, // Increased tokens slightly for parsing logic
            system: codeGenSystemPrompt,
            messages,
            temperature: 0.0 
        };

        logger.debug(`Calling Claude API for Sandboxed Code Generation with model ${modelToUse}...`);
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const generatedCode = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text.trim() : null;

        if (!generatedCode) {
            logger.error('Unexpected or empty response format from Claude API for sandboxed code gen:', claudeApiResponse);
            throw new Error('AI assistant provided no code.');
        }

        // More robust check: includes parsing logic AND sendResult
        if (!generatedCode.includes('sendResult(') || (!generatedCode.includes('.split(\'\n\')') && !generatedCode.includes('.split(",")'))) {
             logger.warn('Generated sandboxed code might be missing parsing or sendResult() call.');
        }

        logger.debug('--- Received Generated Code ---');
        console.log(generatedCode); // Log the exact code received
        logger.debug('--- End Generated Code ---');

        logger.info(`Sandboxed code generated successfully using ${modelToUse}. Length: ${generatedCode.length}`);
        return { code: generatedCode };

    } catch (error) {
        logger.error(`Error during sandboxed code generation API call with model ${modelToUse}: ${error.message}`, error);
        throw new Error(`AI failed to generate sandboxed code: ${error.message}`);
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
    //    It needs to instruct the AI to use React.createElement, assume global libraries (React, Recharts), etc.
    //    It also needs the analysis summary and the data structure (keys of dataJson) as context.
    const dataKeys = dataJson ? Object.keys(dataJson) : [];
    const reportGenSystemPrompt = `You are an expert React developer specializing in data visualization using Recharts. Generate ONLY the body of a single JavaScript React functional component named 'ReportComponent'.

COMPONENT REQUIREMENTS:
1.  **Component Name:** EXACTLY 'ReportComponent'.
2.  **Props:** The component MUST accept a single prop named \`reportData\`, which is the JSON object provided below.
3.  **Rendering:** Use \`React.createElement\` for ALL component/element creation. Do NOT use JSX syntax.
4.  **Global Libraries:** Assume \`React\` and \`Recharts\` are available as global variables. Access them directly (e.g., \`React.createElement(Recharts.LineChart, ...)\`). **Do NOT include \`import\` or \`require\` statements.**
5.  **Analysis & Content:** Use the provided \`analysisSummary\` and the \`reportData\` prop to create meaningful visualizations (charts, tables, key figures) using Recharts and standard HTML elements via \`React.createElement\`. Structure the report logically.
6.  **Styling:** Apply reasonable inline styles for presentation (e.g., \`style={{ margin: '10px' }}\`). Assume a standard sans-serif font.
7.  **Error Handling:** Include basic error handling (e.g., check if \`reportData\` exists before accessing its properties). If critical data is missing, render a helpful message.
8.  **Output:** Provide ONLY the JavaScript code for the \`ReportComponent\` function body, starting directly with \`function ReportComponent({ reportData }) {\` or similar. Do not include any surrounding text, explanations, or markdown formatting like \`\`\`.

ANALYSIS SUMMARY:
${analysisSummary}

PROVIDED DATA STRUCTURE (Prop: reportData):
${dataKeys.length > 0 ? `- Object with keys: ${dataKeys.join(', ')}` : '- No data provided (or data was empty/null). Handle gracefully.'}

Generate the React component code now.`;

    try {
        const messages = [{ role: "user", content: "Generate the React component code for the report based on the summary and data structure."}];
        // Use a capable model, maybe Sonnet is sufficient for this?
        const modelToUse = "claude-3-sonnet-20240229";
        const apiOptions = {
            model: modelToUse,
            max_tokens: 4096, // Allow ample space for component code
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
            max_tokens: 250, // Limit summary length
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
        logger.error(`Error during history summarization API call with model ${modelToUse}: ${error.message}`, error);
        return `Error summarizing history: ${error.message}`;
    }
};

module.exports = {
    assembleContext, // Keep for potential future use
    getLLMReasoningResponse, // New function for the agent
    generateSandboxedCode, // Add the new function
    generateReportCode, // Add the new function
    summarizeChatHistory // Add the new summarization function
    // generateCode, // Mark as removed/obsolete
    // generateWithHistory // Mark as removed/obsolete
};