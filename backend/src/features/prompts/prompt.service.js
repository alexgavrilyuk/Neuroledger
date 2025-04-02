// backend/src/features/prompts/prompt.service.js

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

// Generate code function (Improved with better SVG support)
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

        // IMPROVED: System prompt with better SVG support and inline chart examples
        const systemPrompt = `You are NeuroLedger AI, an expert React developer and data analyst. Generate a single React functional component named 'ReportComponent' that will analyze and visualize data.

REQUIREMENTS:
1. COMPONENT NAME: EXACTLY 'ReportComponent'
2. CODE FORMAT: Use both React.createElement syntax AND inline SVG for charts
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

7. EXTENSIVE LOGGING: Add MANY logging statements with executionScope.console.log() throughout your code

8. CHART RENDERING: When rendering charts, use INLINE SVG instead of Recharts components where possible.
   Example of inline SVG for a bar chart:
   \`\`\`
   const svgBarChart = (data) => {
     const width = 600;
     const height = 300;
     const barWidth = width / data.length;

     return React.createElement('svg',
       {
         width: width,
         height: height,
         xmlns: 'http://www.w3.org/2000/svg',
         viewBox: \`0 0 \${width} \${height}\`
       },
       // Background
       React.createElement('rect', {
         width: '100%',
         height: '100%',
         fill: '#f8f9fa'
       }),
       // Bars
       ...data.map((d, i) => {
         return React.createElement('rect', {
           key: i,
           x: i * barWidth,
           y: height - d.value,
           width: barWidth - 5,
           height: d.value,
           fill: '#4e79a7'
         });
       })
     );
   }
   \`\`\`

9. IMMEDIATE EXECUTION: Process data immediately in the component function body, not in a useEffect hook.

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

  // 2. Process data immediately (NOT IN USEEFFECT)
  let reportData = null;

  try {
    // Find valid dataset
    const primaryDataset = datasets.find(d => d?.content && !d.error);
    if (!primaryDataset) {
      console.error("[ReportComponent] No valid dataset found");
      reportData = { error: "No valid datasets available" };
    } else {
      console.log("[ReportComponent] Parsing dataset:", primaryDataset.name);
      const parsed = Papa.parse(primaryDataset.content, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true
      });
      console.log("[ReportComponent] Parsed data:", parsed);

      if (parsed.errors?.length > 0) {
        console.error("[ReportComponent] Parsing errors:", parsed.errors);
        reportData = { error: "Error parsing data" };
      } else {
        const data = parsed.data;
        console.log("[ReportComponent] Data rows:", data.length);

        // Process data here and store results in reportData
        reportData = {
          // processed data properties
        };
      }
    }
  } catch (error) {
    console.error("[ReportComponent] Error:", error);
    reportData = { error: error.message };
  }

  // 3. Return appropriate UI based on the already processed data
  if (!reportData) {
    return React.createElement("div", null, "Loading...");
  }

  if (reportData.error) {
    return React.createElement("div", { className: "error" },
      React.createElement("h3", null, "Error processing data"),
      React.createElement("p", null, reportData.error)
    );
  }

  console.log("[ReportComponent] Rendering charts with data:", reportData);

  // 4. Create inline SVG charts
  const barChartSvg = React.createElement("svg", { width: 600, height: 300, xmlns: "http://www.w3.org/2000/svg" },
    React.createElement("rect", { width: "100%", height: "100%", fill: "#f8f9fa" }),
    // Add more SVG elements for actual chart here
  );

  // 5. Render visualization with inline SVGs
  return React.createElement("div", null,
    React.createElement("h2", null, "Analysis Report"),
    barChartSvg
  );
}
\`\`\`

Ensure your code EXACTLY follows this pattern, especially using inline SVG for charts where possible. DO NOT explain the code outside of a code block. Only provide the complete JavaScript code for the ReportComponent function.`;

        const messages = [{ role: "user", content: `${contextUsed}\n\nUser Prompt: ${promptText}` }];
        const modelToUse = "claude-3-7-sonnet-20250219";
        const apiOptions = { model: modelToUse, max_tokens: 14096, system: systemPrompt, messages };

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