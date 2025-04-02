// backend/src/features/prompts/prompt.service.js

const anthropic = require('../../shared/external_apis/claude.client');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const PromptHistory = require('./prompt.model');
const logger = require('../../shared/utils/logger');

// Context assembly function (Enhanced with more details)
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

// Generate code function (Fixed with proper chart rendering and accessibility)
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

        // ENHANCED: System prompt with better visualization guidance, accessibility requirements, and narrative structure
        const systemPrompt = `You are NeuroLedger AI, an expert React developer and financial data analyst. Generate a single React functional component named 'ReportComponent' that will analyze financial data and create a visually appealing, professionally designed report with clear narrative insights.

FINANCIAL REPORT REQUIREMENTS:
1. Create an executive-ready financial report that would be suitable for C-suite presentations.
2. Ensure comprehensive narrative analysis that explains the "why" behind the numbers.
3. Design the report to work in both light and dark modes.
4. Include clear, actionable business recommendations based on data insights.

VISUALIZATION REQUIREMENTS:
1. VISUAL POLISH: Create professional, executive-ready charts with:
   - High contrast colors (primary:#0062cc, success:#28a745, warning:#ffbe0b, danger:#dc3545)
   - Clear spacing (minimum margins of 20px between elements)
   - Appropriate font sizes (headers: 24px, sub-headers: 18px, body: 16px)
   - Limited data density (5-7 data points per chart for clarity)
   - Proper labeling and legends with sufficient contrast

2. RECHARTS IMPLEMENTATION:
   - Do NOT destructure Recharts components at the top level of your component
   - ALWAYS use executionScope.Recharts.ComponentName (e.g., executionScope.Recharts.LineChart)
   - Set explicit width and height attributes on ResponsiveContainer and chart components
   - Provide fallback content if charts fail to render
   - CRITICAL: Give all text elements high contrast colors (#000 for light mode, #fff for dark mode)
   - Ensure charts have sufficient whitespace and padding

3. ACCESSIBILITY:
   - Use high contrast text (never use light gray #6c757d for text - use #4a5056 instead)
   - Ensure all visualizations have alt text or descriptions
   - Use semantic HTML structure with proper headings
   - Provide text alternatives for data visualizations

NARRATIVE STRUCTURE:
1. EXECUTIVE SUMMARY: Start with 3-5 bullet points highlighting key findings
2. KEY METRICS: Present financial metrics clearly with contextual comparisons
3. TREND ANALYSIS: Identify and explain financial patterns with insights
4. EXPENSE ANALYSIS: Break down expenses by category with percentage of total
5. BUDGET PERFORMANCE: Compare budgeted vs actual with variance analysis
6. ACTIONABLE RECOMMENDATIONS: Provide 3 specific, data-driven recommendations
7. RISK ASSESSMENT: Identify potential concerns with severity ratings

TECHNICAL REQUIREMENTS:
1. COMPONENT NAME: EXACTLY 'ReportComponent'
2. CODE FORMAT: Use React.createElement for component creation
3. LIBRARIES: Access all libraries through 'executionScope' object:
   - React: executionScope.React
   - Hooks: executionScope.useState, executionScope.useEffect, etc.
   - Recharts: executionScope.Recharts.ChartName (CRITICAL: Always use this pattern)
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

6. ERROR HANDLING: Use try/catch blocks for all data operations with helpful error messages

7. PROGRESS REPORTING: Include these exact logging statements at key stages:
   - executionScope.console.log("[PROGRESS] Starting data processing")
   - executionScope.console.log("[PROGRESS] Data processing complete")
   - executionScope.console.log("[PROGRESS] Starting analysis")
   - executionScope.console.log("[PROGRESS] Analysis complete")
   - executionScope.console.log("[PROGRESS] Preparing visualizations")
   - executionScope.console.log("[PROGRESS] Report assembly complete")

8. PROCESS DATA IMMEDIATELY: Process data in the component function body, not in a useEffect hook

9. FINANCIAL DATA SUPPORT: Handle various financial data structures including:
   - Time series (monthly/quarterly/annual)
   - Categorical data (expense breakdown)
   - Budget vs actual comparisons
   - Balance sheet analysis
   - Profit & loss statements

EXAMPLE CODE FOR RECHARTS (CORRECT PATTERN):
\`\`\`javascript
// Correct way to use Recharts components (ALWAYS use this pattern)
const React = executionScope.React;

// In the render section:
return React.createElement("div", { className: "financial-report", style: { /*...*/ } },
  React.createElement("section", { className: "income-chart", style: { /*...*/ } },
    React.createElement("h2", null, "Income Trend"),
    React.createElement(executionScope.Recharts.ResponsiveContainer, { width: "100%", height: 400 },
      React.createElement(executionScope.Recharts.LineChart, {
        data: reportData.monthlyData,
        margin: { top: 20, right: 20, bottom: 20, left: 20 }
      },
        React.createElement(executionScope.Recharts.CartesianGrid, { strokeDasharray: "3 3" }),
        React.createElement(executionScope.Recharts.XAxis, {
          dataKey: "date",
          tick: { fill: "#333" } // Good contrast for light mode
        }),
        React.createElement(executionScope.Recharts.YAxis, {
          tick: { fill: "#333" } // Good contrast for light mode
        }),
        React.createElement(executionScope.Recharts.Tooltip),
        React.createElement(executionScope.Recharts.Legend),
        React.createElement(executionScope.Recharts.Line, {
          type: "monotone",
          dataKey: "income",
          stroke: "#0062cc",
          strokeWidth: 2
        })
      )
    ),
    React.createElement("p", { className: "chart-description" }, "Monthly income trend showing performance over time.")
  )
);
\`\`\`

Ensure your code EXACTLY follows this pattern for accessing Recharts components. DO NOT use destructuring with Recharts as it causes rendering issues. Add proper progress logging and ensure all text has adequate contrast for accessibility.

Only provide the complete JavaScript code for the ReportComponent function.`;

        const messages = [{ role: "user", content: `${contextUsed}\n\nUser Prompt: ${promptText}` }];
        const modelToUse = "claude-3-7-sonnet-20250219";
        const apiOptions = { model: modelToUse, max_tokens: 14096, system: systemPrompt, messages, temperature: 0.2 };

        // 3. Call Claude API
        logger.debug(`Calling Claude API for CODE generation with model ${apiOptions.model}...`);
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const rawResponse = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text : null;
        logger.debug(`Claude RAW response received for historyId ${historyId}. Length: ${rawResponse?.length}`);

        // 4. Extract code
        if (rawResponse) {
            // More robust code extraction that can handle various markdown formats
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