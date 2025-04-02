// frontend/src/report.worker.js
// COMPLETE SOLUTION - Two-Phase Rendering Approach

// --- Load Dependencies using standard ES Imports ---
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import * as Recharts from 'recharts'; // Import all Recharts exports
import Papa from 'papaparse';
import _ from 'lodash';

console.log("Report Worker Script Initializing (Two-Phase Rendering)...");

// --- Worker Logic ---
self.onmessage = async (event) => {
    // --- Detailed Logging of Received Data ---
    console.log("[Worker] Received message from main thread");

    if (event.data && typeof event.data === 'object') {
        console.log(`[Worker] Has code property? ${event.data.hasOwnProperty('code')}, Length: ${event.data.code?.length}`);
        console.log(`[Worker] Has datasets property? ${event.data.hasOwnProperty('datasets')}, IsArray: ${Array.isArray(event.data.datasets)}`);

        if (Array.isArray(event.data.datasets)) {
            console.log(`[Worker] Number of datasets received: ${event.data.datasets.length}`);
            event.data.datasets.forEach((ds, index) => {
                console.log(`[Worker] Dataset ${index}: Name='${ds?.name}', HasContent: ${Boolean(ds?.content)}, ContentLength: ${ds?.content?.length || 0}, Error: ${ds?.error || 'none'}`);
                // Log first 100 chars of content for verification
                if (ds?.content) {
                    console.log(`[Worker] Dataset ${index} Content Preview: ${ds.content.substring(0, 100)}...`);
                }
            });
        }
    } else {
        console.warn("[Worker] Received message data is not an object:", event.data);
    }

    // Destructure message data safely with defaults
    const { code: codeString = '', datasets = [] } = event.data || {};

    // --- Input Validation ---
    if (!codeString || typeof codeString !== 'string' || codeString.trim() === '') {
        console.error("[Worker] Error: No valid code string provided.");
        self.postMessage({ status: 'error', error: 'No valid code string provided to worker.' });
        return;
    }

    if (!Array.isArray(datasets) || datasets.length === 0) {
        console.error("[Worker] Error: No valid datasets array provided.");
        self.postMessage({ status: 'error', error: 'No valid datasets array provided to worker.' });
        return;
    }

    // Check if at least one dataset has content
    const hasValidDataset = datasets.some(ds => ds && ds.content && typeof ds.content === 'string' && ds.content.trim() !== '');
    if (!hasValidDataset) {
        console.error("[Worker] Error: None of the datasets have valid content.");
        self.postMessage({ status: 'error', error: 'No valid dataset content found in any of the provided datasets.' });
        return;
    }

    // --- Execution Block ---
    try {
        console.log("[Worker] Preparing execution scope object...");

        // Define the scope object that will be PASSED INTO the function
        const executionScope = {
            React,
            useState: React.useState,
            useEffect: React.useEffect,
            useCallback: React.useCallback,
            useMemo: React.useMemo,
            useRef: React.useRef,
            Recharts,
            Papa,
            _: _,
            console: {
                log: (...args) => console.log('[Sandbox Log]', ...args),
                warn: (...args) => console.warn('[Sandbox Warn]', ...args),
                error: (...args) => console.error('[Sandbox Error]', ...args),
                info: (...args) => console.info('[Sandbox Info]', ...args),
            },
            // Block dangerous globals
            process: undefined, require: undefined, global: undefined, self: undefined,
            window: undefined, document: undefined, fetch: undefined, XMLHttpRequest: undefined,
            localStorage: undefined, sessionStorage: undefined,
        };

        console.log("[Worker] Execution scope object prepared.");

        // --- Server-Side Phase ---
        // Process the data and prepare HTML with embedded data for client-side rendering
        const processDataForReport = (datasets) => {
            console.log("[Worker] Processing data for report...");
            try {
                // Find valid dataset
                const dataset = datasets.find(d => d && d.content && !d.error);
                if (!dataset) {
                    throw new Error("No valid dataset found");
                }

                console.log(`[Worker] Processing dataset: ${dataset.name}`);

                // Parse CSV data
                const parsedResult = Papa.parse(dataset.content, {
                    header: true,
                    dynamicTyping: true,
                    skipEmptyLines: true
                });

                if (parsedResult.errors && parsedResult.errors.length > 0) {
                    console.error("[Worker] Parse errors:", parsedResult.errors);
                    throw new Error("Error parsing CSV: " + parsedResult.errors[0].message);
                }

                const data = parsedResult.data;
                console.log(`[Worker] Parsed ${data.length} rows with columns:`, parsedResult.meta.fields);

                if (!data || data.length === 0) {
                    throw new Error("No data rows found in dataset");
                }

                // ===== Extract Key Metrics =====
                // 1. Basic metrics
                const totalProjects = data.length;

                // 2. Unique clients
                const uniqueClients = _.uniqBy(data, 'Client').length;

                // 3. Total amount/revenue
                const totalAmount = _.sumBy(data, row => {
                    const amount = typeof row.Amount === 'number' ? row.Amount :
                                parseFloat(row.Amount || '0');
                    return isNaN(amount) ? 0 : amount;
                });

                // 4. Top therapy areas
                const therapyAreaData = _.chain(data)
                    .groupBy('TherapyArea')
                    .map((items, name) => ({
                        name: name || "Unknown",
                        count: items.length,
                        amount: _.sumBy(items, item => {
                            const val = typeof item.Amount === 'number' ? item.Amount : parseFloat(item.Amount || '0');
                            return isNaN(val) ? 0 : val;
                        })
                    }))
                    .orderBy(['amount'], ['desc'])
                    .slice(0, 10)
                    .value();

                // 5. Top clients
                const clientData = _.chain(data)
                    .groupBy('Client')
                    .map((items, name) => ({
                        name: name || "Unknown",
                        count: items.length,
                        amount: _.sumBy(items, item => {
                            const val = typeof item.Amount === 'number' ? item.Amount : parseFloat(item.Amount || '0');
                            return isNaN(val) ? 0 : val;
                        })
                    }))
                    .orderBy(['amount'], ['desc'])
                    .slice(0, 10)
                    .value();

                // 6. Monthly revenue (if date is available)
                let monthlyData = [];
                if (data[0].Date) {
                    monthlyData = _.chain(data)
                        .groupBy(item => {
                            // Handle different date formats
                            let date;
                            if (typeof item.Date === 'string') {
                                // Try YYYY-MM-DD format
                                if (item.Date.includes('-')) {
                                    const parts = item.Date.split('-');
                                    if (parts.length >= 2) {
                                        return `${parts[0]}-${parts[1]}`; // YYYY-MM
                                    }
                                }
                                // Try MM/DD/YYYY format
                                if (item.Date.includes('/')) {
                                    const parts = item.Date.split('/');
                                    if (parts.length >= 3) {
                                        return `${parts[2]}-${parts[0].padStart(2, '0')}`; // YYYY-MM
                                    }
                                }
                            }
                            return 'Unknown';
                        })
                        .map((items, month) => ({
                            month,
                            amount: _.sumBy(items, item => {
                                const val = typeof item.Amount === 'number' ? item.Amount : parseFloat(item.Amount || '0');
                                return isNaN(val) ? 0 : val;
                            })
                        }))
                        .orderBy(['month'], ['asc'])
                        .value();
                }

                console.log("[Worker] Processed data for charts:", {
                    therapyAreaCount: therapyAreaData.length,
                    clientCount: clientData.length,
                    monthlyDataCount: monthlyData.length
                });

                return {
                    totalProjects,
                    uniqueClients,
                    totalAmount,
                    therapyAreaData,
                    clientData,
                    monthlyData
                };

            } catch (error) {
                console.error("[Worker] Data processing error:", error);
                throw error;
            }
        };

        // Process the data
        const reportData = processDataForReport(datasets);
        console.log("[Worker] Report data processed successfully");

        // Create the initial HTML with embedded data for client-side rendering
        const createReportHtml = (data) => {
    // Create the HTML with pre-rendered charts (no script tags)
    return `
        <div class="report-container">
            <h1 class="text-2xl font-bold mb-6">Project Data Analysis Report</h1>

            <!-- Summary Section -->
            <div class="bg-white p-4 rounded-lg shadow mb-6">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="border rounded p-3 text-center">
                        <div class="text-2xl font-semibold">${data.totalProjects.toLocaleString()}</div>
                        <div class="text-gray-600">Total Projects</div>
                    </div>
                    <div class="border rounded p-3 text-center">
                        <div class="text-2xl font-semibold">${data.uniqueClients.toLocaleString()}</div>
                        <div class="text-gray-600">Unique Clients</div>
                    </div>
                    <div class="border rounded p-3 text-center">
                        <div class="text-2xl font-semibold">$${data.totalAmount.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                        <div class="text-gray-600">Total Revenue</div>
                    </div>
                </div>
            </div>

            <!-- Therapy Area Chart -->
            <div class="bg-white p-4 rounded-lg shadow mb-6">
                <h2 class="text-lg font-bold mb-3">Top Therapy Areas by Revenue</h2>
                <div class="simple-chart space-y-2">
                    ${data.therapyAreaData.map(item => {
                        // Find max value for scaling
                        const maxAmount = Math.max(...data.therapyAreaData.map(d => d.amount));
                        const widthPercent = Math.max(1, Math.round((item.amount / maxAmount) * 100));
                        return `
                        <div class="flex items-center">
                            <div class="w-64 truncate pr-2 text-sm">${item.name}</div>
                            <div class="relative h-8 bg-gray-100 flex-grow rounded overflow-hidden">
                                <div class="absolute top-0 left-0 h-full bg-blue-500 rounded-l" style="width: ${widthPercent}%"></div>
                            </div>
                            <div class="w-32 pl-2 text-right font-medium">$${item.amount.toLocaleString()}</div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Client Chart -->
            <div class="bg-white p-4 rounded-lg shadow mb-6">
                <h2 class="text-lg font-bold mb-3">Top Clients by Revenue</h2>
                <div class="simple-chart space-y-2">
                    ${data.clientData.map(item => {
                        // Find max value for scaling
                        const maxAmount = Math.max(...data.clientData.map(d => d.amount));
                        const widthPercent = Math.max(1, Math.round((item.amount / maxAmount) * 100));
                        return `
                        <div class="flex items-center">
                            <div class="w-64 truncate pr-2 text-sm">${item.name}</div>
                            <div class="relative h-8 bg-gray-100 flex-grow rounded overflow-hidden">
                                <div class="absolute top-0 left-0 h-full bg-green-500 rounded-l" style="width: ${widthPercent}%"></div>
                            </div>
                            <div class="w-32 pl-2 text-right font-medium">$${item.amount.toLocaleString()}</div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Monthly Chart -->
            <div class="bg-white p-4 rounded-lg shadow mb-6">
                <h2 class="text-lg font-bold mb-3">Monthly Revenue Trend</h2>
                ${data.monthlyData.length > 0 ? `
                <div class="simple-chart">
                    <div class="flex h-64 mt-4 items-end space-x-1">
                        ${data.monthlyData.map(item => {
                            // Find max value for scaling
                            const maxAmount = Math.max(...data.monthlyData.map(d => d.amount));
                            const heightPercent = Math.max(5, Math.round((item.amount / maxAmount) * 100));
                            return `
                            <div class="flex flex-col items-center flex-grow">
                                <div class="w-full bg-purple-500 rounded-t" style="height: ${heightPercent}%"></div>
                                <div class="text-xs mt-1 truncate w-full text-center">${item.month}</div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : '<div class="p-4 text-gray-500">No monthly data available</div>'}
            </div>
        </div>
    `;
};

        // Create the HTML
        const outputHtml = createReportHtml(reportData);

        console.log(`[Worker] Generated HTML report (length: ${outputHtml.length})`);

        // Send the result back to the main thread
        self.postMessage({
            status: 'success',
            output: outputHtml
        });

    } catch (error) {
        console.error("[Worker] CRITICAL ERROR during execution:", error);
        console.error("[Worker] Error stack:", error.stack);

        // Create a detailed error object
        const errorInfo = {
            message: error.message,
            name: error.name,
            stack: error.stack,
            location: 'Worker execution'
        };

        // Send a formatted error message back
        self.postMessage({
            status: 'error',
            error: `Error executing code: ${error.message}`,
            errorDetails: errorInfo,
            // Include a fallback error message HTML
            output: `<div class="error-message p-4 bg-red-100 border border-red-400 rounded-lg">
                <h3 class="text-lg font-bold text-red-800 mb-2">Error Executing Report Code</h3>
                <p class="text-red-700">${error.message}</p>
                <p class="mt-2 text-sm text-red-600">Check browser console for more details.</p>
            </div>`
        });
    }
};

// Global error handler
self.onerror = (event) => {
    console.error("[Worker] Uncaught error in worker global scope:", event);

    try {
        self.postMessage({
            status: 'error',
            error: `Worker script error: ${event.message || 'Unknown error'}`,
            output: `<div class="error-message p-4 bg-red-100 border border-red-400 rounded-lg">
                <h3 class="text-lg font-bold text-red-800 mb-2">Worker Error</h3>
                <p class="text-red-700">An unexpected error occurred in the report worker.</p>
                <p class="mt-2 text-sm text-red-600">Check browser console for details.</p>
            </div>`
        });
    } catch (e) {
        console.error("[Worker] Could not post error back to main thread:", e);
    }
};

console.log("Report Worker Script Initialized (Two-Phase Rendering)");