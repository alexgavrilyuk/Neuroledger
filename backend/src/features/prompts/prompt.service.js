// backend/src/features/prompts/prompt.service.js
// FIXED VERSION - With properly escaped backticks in the prompt

const anthropic = require('../../shared/external_apis/claude.client');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const PromptHistory = require('./prompt.model');
const logger = require('../../shared/utils/logger');

// Context assembly function (Unchanged)
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
                        contextString += `      - ${col.name} (Type: ${col.type})${colDesc ? `: ${colDesc}` : ''}\n`;
                    });
                } else { contextString += `      - (No column schema available)\n`; }
            });
        }
    } else { contextString += "  - None selected.\n"; }
    return contextString;
};

// Generate code function (Improved)
const generateCode = async (userId, promptText, selectedDatasetIds) => {
    if (!anthropic) {
        logger.error("generateCode called but Anthropic client is not initialized.");
        throw new Error('AI assistant is currently unavailable.');
    }

    const startTime = Date.now();
    logger.info(`Generating CODE ONLY for user ${userId}, Prompt: "${promptText}", Datasets: [${selectedDatasetIds.join(', ')}]`);
    let historyId = null;
    let historyStatus = 'pending';
    let historyErrorMessage = null;
    let generatedCode = null;
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

        // IMPROVED: System prompt with PROPERLY ESCAPED backticks
        const systemPrompt = `You are NeuroLedger AI, an expert React developer and data analyst. Generate a single React functional component named 'ReportComponent' that will analyze and visualize data.

REQUIREMENTS:
1. COMPONENT NAME: EXACTLY 'ReportComponent'
2. CODE FORMAT: Use ONLY React.createElement syntax, NO JSX
3. LIBRARIES: Access all libraries through 'executionScope' object:
   - React: executionScope.React
   - Hooks: executionScope.useState, executionScope.useEffect, etc.
   - Recharts: executionScope.Recharts
   - PapaParse: executionScope.Papa
   - Lodash: executionScope._
   - Console: executionScope.console.log(), executionScope.console.error()

4. DATA STRUCTURE: Component must accept { datasets } as its only prop, where datasets is an array of:
   {
     name: string,        // Dataset name
     gcsPath: string,     // Storage path
     content: string,     // CSV/data content as string
     error?: string       // Optional error message
   }

5. DATA PARSING: Use this exact pattern for CSV parsing:
   const parsedData = executionScope.Papa.parse(dataset.content, {
     header: true,
     dynamicTyping: true,
     skipEmptyLines: true
   });

6. ERROR HANDLING: Use try/catch blocks for all data operations, use executionScope.console.error() for errors

7. EXTENSIVE LOGGING: Add MANY logging statements with executionScope.console.log() throughout your code:
   - Log "Starting ReportComponent" at the beginning
   - Log dataset content preview (first 100 chars)
   - Log parsing results with column names
   - Log calculated metrics (counts, sums, etc.)
   - Log chart data before rendering

8. OUTPUT FORMAT: Return a complete React element tree that displays:
   - Title and summary of findings
   - At least one chart using Recharts when data permits
   - Error handling when datasets are empty/invalid

EXAMPLE CODE STRUCTURE:
\`\`\`javascript
function ReportComponent({ datasets }) {
  // 1. Alias libraries from executionScope
  const React = executionScope.React;
  const useState = executionScope.useState;
  const Papa = executionScope.Papa;
  const _ = executionScope._;
  const Recharts = executionScope.Recharts;
  const console = executionScope.console;

  console.log("[ReportComponent] Starting execution");

  try {
    // 2. Find valid dataset
    const primaryDataset = datasets.find(d => d?.content && !d.error);
    if (!primaryDataset) {
      console.error("[ReportComponent] No valid dataset found");
      return React.createElement("div", { className: "error" },
        React.createElement("h3", null, "Error: No valid datasets available")
      );
    }

    // 3. Parse data
    console.log("[ReportComponent] Parsing dataset:", primaryDataset.name);
    const parsed = Papa.parse(primaryDataset.content, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true
    });
    console.log("[ReportComponent] Parsed data:", parsed);

    // 4. Handle parsing errors
    if (parsed.errors?.length > 0) {
      console.error("[ReportComponent] Parsing errors:", parsed.errors);
      return React.createElement("div", { className: "error" },
        React.createElement("h3", null, "Error parsing data")
      );
    }

    const data = parsed.data;
    console.log("[ReportComponent] Data rows:", data.length);

    // 5. Process data
    // ... calculation code here ...

    // 6. Return visualization
    return React.createElement("div", null,
      React.createElement("h2", null, "Analysis Report"),
      React.createElement(Recharts.BarChart, { width: 600, height: 300, data: chartData },
        React.createElement(Recharts.CartesianGrid, { strokeDasharray: "3 3" }),
        React.createElement(Recharts.XAxis, { dataKey: "name" }),
        React.createElement(Recharts.YAxis, null),
        React.createElement(Recharts.Tooltip, null),
        React.createElement(Recharts.Bar, { dataKey: "value", fill: "#8884d8" })
      )
    );
  } catch (error) {
    console.error("[ReportComponent] Error:", error);
    return React.createElement("div", { className: "error" },
      React.createElement("h3", null, "Error processing data"),
      React.createElement("p", null, error.message)
    );
  }
}
\`\`\`

Ensure your code EXACTLY follows this pattern. DO NOT explain the code outside of a code block. Only provide the complete JavaScript code for the ReportComponent function.`;

        const messages = [{ role: "user", content: `${contextUsed}\n\nUser Prompt: ${promptText}` }];
        const modelToUse = "claude-3-5-sonnet-20240620";
        const apiOptions = { model: modelToUse, max_tokens: 4096, system: systemPrompt, messages };

        // 3. Call Claude API
        logger.debug(`Calling Claude API for CODE generation with model ${apiOptions.model}...`);
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const rawResponse = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text : null;
        logger.debug(`Claude RAW response received for historyId ${historyId}. Length: ${rawResponse?.length}`);

        // 4. Extract code
        if (rawResponse) {
            // IMPROVED: More robust code extraction that can handle various markdown formats
            const codeRegex = /```(?:javascript)?\s*([\s\S]*?)\s*```/;
            const match = rawResponse.match(codeRegex);

            if (match && match[1]) {
                generatedCode = match[1].trim();
                logger.debug(`Successfully extracted JS Code Block for historyId ${historyId}.`);
                logger.debug(`--- START GENERATED CODE (History ID: ${historyId}) ---`);
                console.log(generatedCode);
                logger.debug(`--- END GENERATED CODE ---`);
                historyStatus = 'completed';
            } else {
                 logger.warn(`Could not extract code block from Claude response for historyId ${historyId}. Response: ${rawResponse.substring(0, 500)}`);
                 throw new Error('AI failed to generate the expected code format.');
            }
        } else {
             logger.error(`Unexpected or empty response format from Claude API for historyId ${historyId}:`, claudeApiResponse);
             throw new Error('Unexpected response format from AI assistant.');
        }

        // 5. Final History Update
        if (historyId) {
             logger.debug(`Updating history ${historyId} with status: ${historyStatus}`);
             await PromptHistory.findByIdAndUpdate(historyId, {
                 status: historyStatus,
                 aiGeneratedCode: generatedCode,
                 contextSent: contextUsed,
                 durationMs: Date.now() - startTime,
                 claudeModelUsed: apiOptions.model,
                 errorMessage: null,
                 executionResult: null,
             });
             logger.info(`Final prompt history update ID: ${historyId}. Status: ${historyStatus}`);
        }

        // 6. Return result
        return {
            aiGeneratedCode: generatedCode,
            promptId: historyId,
            status: historyStatus
        };

    } catch (error) {
        logger.error(`Error during prompt code generation for historyId: ${historyId}: ${error.message}`, error.stack);
         historyStatus = 'error_generating';
         historyErrorMessage = error.message;
         if (historyId) {
             try {
                 logger.debug(`Updating history ${historyId} with error status: ${historyStatus}`);
                 await PromptHistory.findByIdAndUpdate(historyId, {
                     status: historyStatus,
                     errorMessage: historyErrorMessage,
                     contextSent: contextUsed,
                     durationMs: Date.now() - startTime,
                     aiGeneratedCode: null
                 });
             }
             catch (dbError) {
                 logger.error(`Failed to update history with error state for ID ${historyId}: ${dbError.message}`);
             }
         }
        // Return error state to controller
        return {
            aiGeneratedCode: null,
            promptId: historyId,
            status: historyStatus,
            errorMessage: historyErrorMessage
        };
    }
};

module.exports = {
    generateCode,
};