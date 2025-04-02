// frontend/src/features/dashboard/hooks/usePromptSubmit.js
// Enhanced with progress tracking and quality assessment

import { useState, useCallback, useRef, useEffect } from 'react';
import apiClient from '../../../shared/services/apiClient';
import logger from '../../../shared/utils/logger';
import axios from 'axios';

// Import the worker using Vite's special syntax
import ReportWorker from '../../../report.worker.js?worker';

// Progress tracking constants
export const PROCESSING_STAGES = {
  WAITING: 'waiting',
  GENERATING_CODE: 'generating_code',
  FETCHING_DATA: 'fetching_data',
  PROCESSING_DATA: 'processing_data',
  ANALYZING_DATA: 'analyzing_data',
  CREATING_VISUALS: 'creating_visuals',
  FINALIZING_REPORT: 'finalizing_report',
  COMPLETE: 'complete',
  ERROR: 'error'
};

export const usePromptSubmit = (addMessageCallback, updateMessageById, clearAllLoadingFlags) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [processingStage, setProcessingStage] = useState(PROCESSING_STAGES.WAITING);
    const [processingDetail, setProcessingDetail] = useState('');
    const workerRef = useRef(null);

    // Cleanup worker on unmount
    useEffect(() => {
        return () => {
            if (workerRef.current) {
                logger.debug("Terminating worker on component unmount");
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    // Helper to fetch dataset content using signed URLs
    const fetchAllDatasetContent = useCallback(async (datasetsToFetch) => {
        if (!datasetsToFetch || datasetsToFetch.length === 0) {
            logger.warn('No datasets to fetch');
            return [];
        }

        setProcessingStage(PROCESSING_STAGES.FETCHING_DATA);
        setProcessingDetail(`Preparing to fetch ${datasetsToFetch.length} datasets`);
        logger.debug(`Fetching content for ${datasetsToFetch.length} datasets...`);

        const results = [];

        // Process datasets sequentially
        for (const [index, ds] of datasetsToFetch.entries()) {
            try {
                setProcessingDetail(`Fetching dataset ${index + 1} of ${datasetsToFetch.length}: ${ds.name}`);
                // 1. Get signed URL from backend
                logger.debug(`Getting read URL for dataset: ${ds.name} (ID: ${ds._id})`);
                const urlResponse = await apiClient.get(`/datasets/${ds._id}/read-url`);

                if (!urlResponse?.data?.status === 'success' || !urlResponse?.data?.data?.signedUrl) {
                    throw new Error(`Failed to get read URL for dataset: ${ds.name}`);
                }

                const readUrl = urlResponse.data.data.signedUrl;
                logger.debug(`Got read URL for ${ds.name}`);

                // 2. Fetch content using the URL
                setProcessingDetail(`Downloading content for ${ds.name}`);
                logger.debug(`Fetching content from storage for ${ds.name}...`);

                const contentResponse = await axios.get(readUrl, {
                    responseType: 'text',
                    timeout: 30000,
                    headers: {
                        'Accept': 'text/plain,text/csv,application/octet-stream'
                    }
                });

                const contentLength = contentResponse.data?.length || 0;
                logger.debug(`Fetched content for ${ds.name}. Length: ${contentLength} chars`);

                // Add to results array with full data
                results.push({
                    name: ds.name,
                    gcsPath: ds.gcsPath,
                    content: contentResponse.data,
                    error: null
                });

            } catch (fetchErr) {
                logger.error(`Failed to fetch content for ${ds.name}:`, fetchErr);
                setProcessingDetail(`Error fetching ${ds.name}: ${fetchErr.message}`);

                // Add error entry to results
                results.push({
                    name: ds.name,
                    gcsPath: ds.gcsPath || null,
                    content: null,
                    error: fetchErr.message || 'Failed to load content'
                });
            }
        }

        // Log summary
        const successCount = results.filter(r => !r.error).length;
        logger.info(`Finished fetching dataset content: ${successCount}/${results.length} successful`);
        setProcessingDetail(`Data fetch complete: ${successCount}/${results.length} datasets loaded`);

        return results;
    }, []);

    // Update message with current processing stage
    const updateProcessingStage = useCallback((stage, detail = '') => {
        setProcessingStage(stage);
        setProcessingDetail(detail);

        // Find a friendly message to display to the user
        let userMessage = 'Processing...';
        switch(stage) {
            case PROCESSING_STAGES.GENERATING_CODE:
                userMessage = "Generating analysis code...";
                break;
            case PROCESSING_STAGES.FETCHING_DATA:
                userMessage = "Fetching dataset content...";
                break;
            case PROCESSING_STAGES.PROCESSING_DATA:
                userMessage = "Processing raw data...";
                break;
            case PROCESSING_STAGES.ANALYZING_DATA:
                userMessage = "Analyzing financial patterns...";
                break;
            case PROCESSING_STAGES.CREATING_VISUALS:
                userMessage = "Creating visualizations...";
                break;
            case PROCESSING_STAGES.FINALIZING_REPORT:
                userMessage = "Finalizing report...";
                break;
            case PROCESSING_STAGES.COMPLETE:
                userMessage = "Report complete!";
                break;
            case PROCESSING_STAGES.ERROR:
                userMessage = `Error: ${detail}`;
                break;
        }

        return userMessage;
    }, []);

    // Main submit function
    const submitPrompt = useCallback(async (promptText, selectedDatasetIds, allAvailableDatasets) => {
        // Validate required callbacks
        if (!addMessageCallback || !updateMessageById) {
            logger.error("Required callback functions missing");
            setError("Internal error: Message handling functions missing");
            return;
        }

        // Check if already processing a request
        if (isLoading) {
            logger.warn("Submission already in progress, ignoring new request");
            return;
        }

        // Clean up any existing worker
        if (workerRef.current) {
            logger.debug("Terminating previous worker");
            workerRef.current.terminate();
            workerRef.current = null;
        }

        // Start new submission process
        logger.debug("Starting prompt submission process");
        setIsLoading(true);
        setError(null);
        const initialStageMessage = updateProcessingStage(PROCESSING_STAGES.GENERATING_CODE);

        // Add placeholder AI message in the chat
        const loadingMessageId = addMessageCallback({
            type: 'ai',
            content: initialStageMessage,
            isLoading: true
        });

        try {
            // 1. Input validation
            if (!promptText?.trim()) {
                throw new Error("Prompt text cannot be empty");
            }

            if (!selectedDatasetIds?.length) {
                throw new Error("At least one dataset must be selected");
            }

            if (!allAvailableDatasets?.length) {
                throw new Error("Available datasets information is missing");
            }

            // 2. Call API to get AI-generated code
            const stageMessage = updateProcessingStage(PROCESSING_STAGES.GENERATING_CODE, "Requesting AI analysis");
            updateMessageById(loadingMessageId, { content: stageMessage });
            logger.debug("Calling backend API to generate code");

            const codeResponse = await apiClient.post('/prompts', {
                promptText,
                selectedDatasetIds
            });

            // Check API response
            if (codeResponse?.data?.status !== 'success' || !codeResponse?.data?.data?.aiGeneratedCode) {
                const errorMsg = codeResponse?.data?.message || 'Failed to generate code from AI';
                logger.error(`API error: ${errorMsg}`);
                throw new Error(errorMsg);
            }

            // Extract code from response
            const { aiGeneratedCode, promptId } = codeResponse.data.data;
            logger.info(`Received code (${aiGeneratedCode.length} chars) for promptId: ${promptId}`);

            // 3. Fetch dataset content
            updateMessageById(loadingMessageId, {
                content: updateProcessingStage(PROCESSING_STAGES.FETCHING_DATA)
            });

            // Find the dataset objects that match the selected IDs
            const datasetsToFetch = allAvailableDatasets.filter(ds =>
                selectedDatasetIds.includes(ds._id)
            );

            if (datasetsToFetch.length === 0) {
                throw new Error("Could not find metadata for the selected datasets");
            }

            logger.debug(`Found ${datasetsToFetch.length} datasets to fetch`);

            // Fetch the actual content for each dataset
            const datasetsWithContent = await fetchAllDatasetContent(datasetsToFetch);

            // Verify that at least one dataset was fetched successfully
            const successfulDatasets = datasetsWithContent.filter(d => d.content && !d.error);
            if (successfulDatasets.length === 0) {
                throw new Error("Could not retrieve content for any of the selected datasets");
            }

            // 4. Set up Web Worker for execution
            updateMessageById(loadingMessageId, {
                content: updateProcessingStage(PROCESSING_STAGES.PROCESSING_DATA, "Initializing analysis")
            });
            logger.debug("Initializing Web Worker for code execution");

            workerRef.current = new ReportWorker();

            // 5. Set up worker message handler
            workerRef.current.onmessage = (event) => {
                const { status, output, error: workerError, errorDetails, type, stage, detail, quality } = event.data || {};

                // Handle progress updates
                if (type === 'progress') {
                    const userFriendlyMessage = updateProcessingStage(stage, detail);
                    updateMessageById(loadingMessageId, {
                        content: userFriendlyMessage,
                        isLoading: true
                    });
                    return; // Don't process further for progress updates
                }

                // Handle final result
                logger.info(`Received ${status} response from worker`);

                if (status === 'success') {
                    // Quality assessment log
                    if (quality) {
                        logger.info(`Report quality assessment: Score=${quality.qualityScore}/3, ` +
                            `Has visualizations=${quality.hasVisualizations}, ` +
                            `Has executive summary=${quality.hasExecutiveSummary}, ` +
                            `Has recommendations=${quality.hasRecommendations}`);
                    }

                    // Update message with the HTML output
                    updateMessageById(loadingMessageId, {
                        content: "Report generated successfully. Click to view.",
                        contentType: 'report_available',
                        reportHtml: output,
                        promptId,
                        isError: false,
                        isLoading: false,
                        quality: quality || null
                    });

                    setError(null);

                    // Update final processing stage
                    updateProcessingStage(PROCESSING_STAGES.COMPLETE);
                } else {
                    // Handle error case
                    const errorMsg = workerError || 'Unknown error during report generation';
                    logger.error(`Worker error: ${errorMsg}`);

                    if (errorDetails) {
                        logger.error("Error details:", errorDetails);
                    }

                    updateMessageById(loadingMessageId, {
                        content: `Error generating report: ${errorMsg}`,
                        contentType: 'error',
                        isError: true,
                        isLoading: false
                    });

                    setError(errorMsg);
                    updateProcessingStage(PROCESSING_STAGES.ERROR, errorMsg);
                }

                // Clean up worker after processing response
                logger.debug("Terminating worker after receiving response");
                if (workerRef.current) {
                    workerRef.current.terminate();
                    workerRef.current = null;
                }

                // Mark process as complete
                setIsLoading(false);
            };

            // 6. Set up worker error handler
            workerRef.current.onerror = (event) => {
                const errorMsg = event.message || 'Unexpected worker error';
                logger.error(`Worker error event: ${errorMsg}`);

                updateMessageById(loadingMessageId, {
                    content: `Error in report generation: ${errorMsg}`,
                    contentType: 'error',
                    isError: true,
                    isLoading: false
                });

                setError(errorMsg);
                updateProcessingStage(PROCESSING_STAGES.ERROR, errorMsg);

                // Clean up worker
                if (workerRef.current) {
                    workerRef.current.terminate();
                    workerRef.current = null;
                }

                setIsLoading(false);
            };

            // 7. Send data to worker
            logger.debug("Sending code and data to worker");

            // Prepare payload with proper structure
            const workerPayload = {
                code: aiGeneratedCode,
                datasets: datasetsWithContent.map(ds => ({
                    name: ds.name,
                    gcsPath: ds.gcsPath,
                    content: ds.content,
                    error: ds.error
                }))
            };

            // Log payload structure for debugging
            logger.debug(`Payload summary: code length=${workerPayload.code.length}, datasets=${workerPayload.datasets.length}`);

            // Send message to worker
            workerRef.current.postMessage(workerPayload);

            // Note: we don't set isLoading=false here, that happens in the worker response handlers

        } catch (error) {
            // Handle errors during preparation and API calls
            const errorMsg = error.message || 'An unknown error occurred';
            logger.error(`Error during prompt submission: ${errorMsg}`, error);

            // Update the message with error
            updateMessageById(loadingMessageId, {
                content: `Error: ${errorMsg}`,
                contentType: 'error',
                isError: true,
                isLoading: false
            });

            setError(errorMsg);
            updateProcessingStage(PROCESSING_STAGES.ERROR, errorMsg);

            // Clean up worker if it exists
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }

            setIsLoading(false);
        }
    }, [addMessageCallback, updateMessageById, fetchAllDatasetContent, isLoading, updateProcessingStage]);

    return {
        submitPrompt,
        isLoading,
        error,
        processingStage,
        processingDetail
    };
};