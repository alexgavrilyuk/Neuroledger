// ================================================================================
// FILE: NeuroLedger/backend/src/features/prompts/prompt.service.js
// ================================================================================
// backend/src/features/prompts/prompt.service.js
// ** CORRECT VERSION FOR IFRAME: Generates React CODE Using Globals **

const anthropic = require('../../shared/external_apis/claude.client');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const PromptHistory = require('./prompt.model');
const logger = require('../../shared/utils/logger');

// Context assembly function (Keep as is)
const assembleContext = async (userId, selectedDatasetIds) => {
    let contextString = "Context:\n";
    const user = await User.findById(userId).select('settings').lean();
    contextString += `- User Settings: Currency=${user?.settings?.currency || 'USD'}, DateFormat=${user?.settings?.dateFormat || 'YYYY-MM-DD'}. ${user?.settings?.aiContext || ''}\n`;
    contextString += `- Team Settings: (Not implemented yet)\n`;
    contextString += "- Selected Datasets:\n";
    if (selectedDatasetIds && selectedDatasetIds.length > 0) {
        const datasets = await Dataset.find({ _id: { $in: selectedDatasetIds }, ownerId: userId })
            .select('name description schemaInfo columnDescriptions').lean();
        if (!datasets || datasets.length === 0) {
            contextString += "  - No accessible datasets found for the provided IDs.\n";
        } else {
            datasets.forEach(ds => {
                contextString += `  - Name: ${ds.name}\n`;
                contextString += `    Description: ${ds.description || '(No description provided)'}\n`;
                contextString += `    Columns:\n`;
                if (ds.schemaInfo && ds.schemaInfo.length > 0) {
                    ds.schemaInfo.forEach(col => {
                        const colDesc = ds.columnDescriptions?.[col.name];
                        const colName = typeof col === 'object' && col.name ? col.name : String(col);
                        const colType = typeof col === 'object' && col.type ? col.type : 'unknown';
                        const descText = colDesc ? `: ${colDesc}` : '';
                        contextString += `      - ${colName} (Type: ${colType})${descText}\n`;
                    });
                } else { contextString += `      - (No column schema available)\n`; }
            });
        }
    } else { contextString += "  - None selected.\n"; }
    return contextString;
};


// --- generateCode function ASKS FOR REACT CODE using globals ---
const generateCode = async (userId, promptText, selectedDatasetIds) => {
    if (!anthropic) {
        logger.error("generateCode called but Anthropic client is not initialized.");
        throw new Error('AI assistant is currently unavailable.');
     }

    const startTime = Date.now();
    // Log intent clearly
    logger.info(`Generating React CODE for user ${userId}, Prompt: "${promptText}", Datasets: [${selectedDatasetIds.join(', ')}]`);
    let historyId = null;
    let historyStatus = 'pending';
    let historyErrorMessage = null;
    let generatedCode = null; // Will store the code string
    let contextUsed = '';

    // Create Initial History Record
    try {
        const initialHistory = new PromptHistory({ userId, promptText, selectedDatasetIds, status: 'generating_code' });
        const saved = await initialHistory.save();
        historyId = saved._id;
        logger.info(`Initial prompt history record created ID: ${historyId}`);
    } catch (dbError) {
        logger.error(`Failed to create initial prompt history for user ${userId}: ${dbError.message}`);
    }

    try {
        // 1. Assemble Context
        logger.debug(`Assembling context for historyId: ${historyId}`);
        contextUsed = await assembleContext(userId, selectedDatasetIds);
        logger.debug(`Context assembled successfully for historyId: ${historyId}. Length: ${contextUsed.length}`);

        // --- SYSTEM PROMPT ASKING FOR REACT CODE W/ GLOBALS ---
        const systemPrompt = `You are NeuroLedger AI, an expert React developer and financial data analyst. Generate ONLY the body of a single JavaScript React functional component named 'ReportComponent'.

COMPONENT REQUIREMENTS:
1.  **Component Name:** EXACTLY 'ReportComponent'.
2.  **Props:** The component MUST accept a single prop named \`datasets\`, which is an array of objects: \`{ name: string, content: string, error?: string }\`.
3.  **Rendering:** Use \`React.createElement\` for ALL component/element creation. Do NOT use JSX syntax.
4.  **Global Libraries:** Assume the following libraries are already available as global variables in the execution environment: \`React\`, \`ReactDOM\`, \`Recharts\`, \`_\` (for lodash), and \`Papa\`. **Do NOT include \`import\` or \`require\` statements for these specific libraries.** Access them directly (e.g., \`React.createElement(...)\`, \`Recharts.LineChart(...)\`, \`_.sumBy(...)\`, \`Papa.parse(...)\`).
5.  **Data Parsing:** Use this exact pattern for CSV parsing:
    \`\`\`javascript
    const parsedData = Papa.parse(dataset.content, {
      header: true, dynamicTyping: true, skipEmptyLines: true
    });
    \`\`\`
    Handle potential errors during parsing within a try/catch block. Handle potential errors if a dataset is missing or has an error string in the prop.
6.  **Analysis & Content:** Perform financial analysis based on the user prompt and data context. Include sections for executive summary, key metrics, charts (using Recharts via globals), narrative insights, recommendations, etc., all rendered using \`React.createElement\`. Create meaningful and visually appealing charts appropriate for the data.
7.  **Styling:** Apply inline styles reasonably for good presentation (e.g., \`style={{ margin: '10px', color: '#333' }}\`). Assume a standard sans-serif font. You do NOT need to handle theme switching (light/dark) via JS; assume basic contrasting styles will work or rely on standard Recharts defaults.
8.  **Error Handling:** Include basic try/catch blocks around data processing and rendering logic. If an error occurs, render a simple error message using \`React.createElement('div', { style: { color: 'red', padding: '10px', border: '1px solid red' } }, 'Error processing report: ' + error.message)\`.
9.  **Environment Restrictions:** DO NOT use \`window\`, \`document\`, or other browser-specific APIs directly that might not be available or reliable in the execution sandbox. Focus solely on React rendering based on the props using the provided global libraries.
10. **Output:** Provide ONLY the JavaScript code for the \`ReportComponent\` function body, starting directly with \`function ReportComponent({ datasets }) {\` or similar. Do not include any surrounding text, explanations, or markdown formatting like \`\`\`.

DATA CONTEXT:
${contextUsed}

USER PROMPT:
${promptText}

Generate the React component code now.`;
        // --- END SYSTEM PROMPT ---


        const messages = [{ role: "user", content: "Generate the React component code based on the provided context and user prompt." }];
        const modelToUse = "claude-3-7-sonnet-20250219";
        // Allow more tokens for potentially complex code generation
        const apiOptions = { model: modelToUse, max_tokens: 8192, system: systemPrompt, messages, temperature: 0.2 };

        // 3. Call Claude API
        logger.debug(`Calling Claude API for CODE generation with model ${apiOptions.model}...`);
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const rawResponse = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text : null;
        logger.debug(`Claude RAW CODE response received for historyId ${historyId}. Length: ${rawResponse?.length}`);

        // 4. Extract code
        if (rawResponse) {
            // Attempt to remove markdown backticks if present
             const codeRegex = /```(?:javascript|jsx)?\s*([\s\S]*?)\s*```/;
             const match = rawResponse.match(codeRegex);
             if (match && match[1]) {
                 generatedCode = match[1].trim();
                 logger.debug(`Extracted JS Code Block for historyId ${historyId}.`);
             } else {
                 // Assume raw response is the code if no markdown
                 generatedCode = rawResponse.trim();
                 logger.debug(`Using raw response as code for historyId ${historyId}.`);
             }
             // Basic validation: does it look like a function?
              if (!generatedCode.includes('function ReportComponent') && !generatedCode.includes('React.createElement')) {
                  logger.warn(`Generated code for ${historyId} might be invalid (doesn't contain expected keywords).`);
                  // Consider throwing an error here if validation is strict
                  // throw new Error('AI did not generate recognizable React component code.');
              }

             logger.debug(`--- START GENERATED CODE (History ID: ${historyId}) ---`);
             console.log(generatedCode); // Log the final code string
             logger.debug(`--- END GENERATED CODE ---`);
            historyStatus = 'completed';
        } else {
             logger.error(`Unexpected or empty response format from Claude API for historyId ${historyId}:`, claudeApiResponse);
             throw new Error('Unexpected response format from AI assistant.');
        }

        // 5. Final History Update
        if (historyId) {
             logger.debug(`Updating history ${historyId} with status: ${historyStatus}`);
             await PromptHistory.findByIdAndUpdate(historyId, {
                 status: historyStatus,
                 aiGeneratedCode: generatedCode, // Store the CODE string
                 aiResponseText: null,
                 contextSent: contextUsed,
                 durationMs: Date.now() - startTime,
                 claudeModelUsed: apiOptions.model,
                 errorMessage: null,
                 executionResult: null,
             });
             logger.info(`Final prompt history update ID: ${historyId}. Status: ${historyStatus}`);
        }

        // 6. Return the CODE STRING
        return {
            aiGeneratedCode: generatedCode, // Return the code string
            promptId: historyId,
            status: historyStatus
        };

    } catch (error) {
        logger.error(`Error during prompt code generation for historyId: ${historyId || 'N/A'}: ${error.message}`, error.stack);
         historyStatus = 'error_generating';
         historyErrorMessage = error.message;
         if (historyId) {
             try {
                 await PromptHistory.findByIdAndUpdate(historyId, {
                     status: historyStatus,
                     errorMessage: historyErrorMessage,
                     contextSent: contextUsed,
                     durationMs: Date.now() - startTime,
                     aiGeneratedCode: null,
                     aiResponseText: null
                 });
             }
             catch (dbError) {
                 logger.error(`Failed to update history with error state for ID ${historyId}: ${dbError.message}`);
             }
         }
        // Return error state to controller
        return {
             aiGeneratedCode: null, // Return null code
             promptId: historyId,
             status: historyStatus,
             errorMessage: historyErrorMessage
         };
    }
};

module.exports = {
    generateCode,
};