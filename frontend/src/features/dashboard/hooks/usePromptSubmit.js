// ================================================================================
// FILE: NeuroLedger/frontend/src/features/dashboard/hooks/usePromptSubmit.js
// ================================================================================
// frontend/src/features/dashboard/hooks/usePromptSubmit.js
// ** CORRECT VERSION FOR IFRAME: Expects aiGeneratedCode from API **

import { useState, useCallback, useRef, useEffect } from 'react';
import apiClient from '../../../shared/services/apiClient';
import logger from '../../../shared/utils/logger';
import axios from 'axios'; // Keep for fetching data from GCS

// Progress tracking constants
export const PROCESSING_STAGES = {
  WAITING: 'waiting',
  GENERATING_CODE: 'generating_code',
  FETCHING_DATA: 'fetching_data',
  RENDERING: 'rendering', // Changed from PROCESSING_DATA etc.
  COMPLETE: 'complete',
  ERROR: 'error'
};

export const usePromptSubmit = (addMessageCallback, updateMessageById, clearAllLoadingFlags) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [processingStage, setProcessingStage] = useState(PROCESSING_STAGES.WAITING);
    const [processingDetail, setProcessingDetail] = useState('');

    // Helper to fetch dataset content using signed URLs - Keep this function
    const fetchAllDatasetContent = useCallback(async (datasetsToFetch) => {
        if (!datasetsToFetch || datasetsToFetch.length === 0) { /* ... */ return []; }
        setProcessingStage(PROCESSING_STAGES.FETCHING_DATA);
        setProcessingDetail(`Preparing to fetch ${datasetsToFetch.length} dataset(s)`);
        logger.debug(`Fetching content for ${datasetsToFetch.length} datasets...`);
        const results = [];
        for (const [index, ds] of datasetsToFetch.entries()) {
             try {
                 setProcessingDetail(`Fetching dataset ${index + 1}/${datasetsToFetch.length}: ${ds.name}`);
                 const urlResponse = await apiClient.get(`/datasets/${ds._id}/read-url`);
                 if (!urlResponse?.data?.status === 'success' || !urlResponse?.data?.data?.signedUrl) throw new Error(`No read URL for ${ds.name}`);
                 const readUrl = urlResponse.data.data.signedUrl;
                 setProcessingDetail(`Downloading content for ${ds.name}`);
                 const contentResponse = await axios.get(readUrl, { responseType: 'text', timeout: 30000 });
                 results.push({ name: ds.name, gcsPath: ds.gcsPath, content: contentResponse.data, error: null });
             } catch (fetchErr) {
                 logger.error(`Failed fetch for ${ds.name}:`, fetchErr);
                 results.push({ name: ds.name, gcsPath: ds.gcsPath || null, content: null, error: fetchErr.message || 'Failed' });
             }
        }
        const successCount = results.filter(r => !r.error).length;
        logger.info(`Finished fetching content: ${successCount}/${results.length} successful`);
        setProcessingDetail(`Data fetch complete: ${successCount}/${results.length} loaded`);
        return results;
    }, []); // Removed internal state setters from deps

     // Update message with current processing stage - Keep or simplify
     const updateProcessingStageMessage = useCallback((stage, detail = '') => {
         setProcessingStage(stage);
         setProcessingDetail(detail);
         let userMessage = 'Processing...';
         switch(stage) {
             case PROCESSING_STAGES.GENERATING_CODE: userMessage = "Requesting AI analysis code..."; break;
             case PROCESSING_STAGES.FETCHING_DATA: userMessage = "Fetching required data..."; break;
             case PROCESSING_STAGES.RENDERING: userMessage = "Preparing report sandbox..."; break;
             case PROCESSING_STAGES.COMPLETE: userMessage = "Report ready!"; break;
             case PROCESSING_STAGES.ERROR: userMessage = `Error: ${detail}`; break;
         }
         return userMessage;
     }, []); // Removed internal state setters from deps


    // Main submit function
    const submitPrompt = useCallback(async (promptText, selectedDatasetIds, allAvailableDatasets) => {
        if (!addMessageCallback || !updateMessageById) { logger.error("Missing callbacks"); return; }
        if (isLoading) { logger.warn("Submit already in progress"); return; }

        logger.debug("Starting prompt submission process (Iframe target)");
        setIsLoading(true);
        setError(null);
        const initialStageMessage = updateProcessingStageMessage(PROCESSING_STAGES.GENERATING_CODE);
        const loadingMessageId = addMessageCallback({ type: 'ai', content: initialStageMessage, isLoading: true });

        try {
            // --- VALIDATION ---
            if (!promptText?.trim()) throw new Error("Prompt text cannot be empty");
            if (!selectedDatasetIds?.length) throw new Error("At least one dataset must be selected");
            if (!allAvailableDatasets?.length) throw new Error("Available datasets information is missing");

            // --- 1. Call API to get AI-generated CODE ---
            updateMessageById(loadingMessageId, { content: updateProcessingStageMessage(PROCESSING_STAGES.GENERATING_CODE, "Requesting AI code") });
            logger.debug("Calling backend API to generate code for iframe...");
            const codeResponse = await apiClient.post('/prompts', { promptText, selectedDatasetIds });

            // --- CORRECTED: Expect aiGeneratedCode ---
            if (codeResponse?.data?.status !== 'success' || !codeResponse?.data?.data?.aiGeneratedCode) {
                const errorMsg = codeResponse?.data?.message || 'Failed to generate code from AI'; // Use the backend message
                logger.error(`API error getting code: ${errorMsg}`);
                throw new Error(errorMsg); // Throw the specific error
            }
            const { aiGeneratedCode, promptId } = codeResponse.data.data; // Get the CODE
            logger.info(`Received code string (${aiGeneratedCode.length} chars) for promptId: ${promptId} (for iframe)`);
            // --- END CORRECTION ---

            // --- 2. Fetch dataset content ---
            updateMessageById(loadingMessageId, { content: updateProcessingStageMessage(PROCESSING_STAGES.FETCHING_DATA) });
            const datasetsToFetch = allAvailableDatasets.filter(ds => selectedDatasetIds.includes(ds._id));
            if (datasetsToFetch.length === 0) throw new Error("Could not find metadata for selected datasets");
            logger.debug(`Found ${datasetsToFetch.length} datasets to fetch for iframe`);
            const datasetsWithContent = await fetchAllDatasetContent(datasetsToFetch);
            const successfulDatasets = datasetsWithContent.filter(d => d.content && !d.error);
             if (successfulDatasets.length === 0) throw new Error("Could not retrieve content for any selected datasets");
            const datasetsForIframe = successfulDatasets.map(d => ({ name: d.name, content: d.content, error: null }));


            // --- 3. Update message state with data needed for iframe rendering ---
            updateMessageById(loadingMessageId, {
                content: "Report ready to render. Click to view.",
                contentType: 'report_iframe_ready', // Use this type to trigger ReportViewer
                reportInfo: { // Store code and data together
                    code: aiGeneratedCode,
                    datasets: datasetsForIframe
                },
                promptId,
                isError: false,
                isLoading: false, // Mark AI message as done loading, report is ready to be VIEWED
            });
            setError(null);
            setIsLoading(false); // Mark overall hook process as done
            setProcessingStage(PROCESSING_STAGES.COMPLETE); // Mark processing complete

        } catch (error) {
            const errorMsg = error.message || 'An unknown error occurred';
            logger.error(`Error during prompt submission (iframe prep): ${errorMsg}`, error);
            updateMessageById(loadingMessageId, {
                content: `Error: ${errorMsg}`,
                contentType: 'error', isError: true, isLoading: false
            });
            setError(errorMsg);
            setIsLoading(false);
            setProcessingStage(PROCESSING_STAGES.ERROR);
        }
    }, [addMessageCallback, updateMessageById, fetchAllDatasetContent, isLoading, updateProcessingStageMessage]);

    return {
        submitPrompt,
        isLoading,
        error,
        processingStage,
        processingDetail,
    };
};