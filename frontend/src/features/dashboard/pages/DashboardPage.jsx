// ================================================================================
// FILE: NeuroLedger/frontend/src/features/dashboard/pages/DashboardPage.jsx
// ================================================================================
// frontend/src/features/dashboard/pages/DashboardPage.jsx
// ** CORRECTED FILE - Fixed JSX syntax for promptError display **

import React, { useState, useRef, useEffect } from 'react';
import ChatInterface from '../components/ChatInterface';
import PromptInput from '../components/PromptInput';
import { useChatHistory } from '../hooks/useChatHistory';
import { usePromptSubmit, PROCESSING_STAGES } from '../hooks/usePromptSubmit';
import { useDatasets } from '../../dataset_management/hooks/useDatasets';
import Modal from '../../../shared/ui/Modal';
import ReportViewer from '../../report_display/components/ReportViewer'; // Correct path
import logger from '../../../shared/utils/logger';
import ProgressIndicator from '../components/ProgressIndicator';
import { useTheme } from '../../../shared/hooks/useTheme'; // Import useTheme

const DashboardPage = () => {
    // State management hooks
    const { messages, addMessage, updateMessageById, clearAllLoadingFlags } = useChatHistory();
    const { datasets, isLoading: datasetsLoading, error: datasetsError } = useDatasets();
    const { themeName } = useTheme(); // Get current theme name
    const {
        submitPrompt,
        isLoading: promptLoading,
        error: promptError,
        processingStage,
        processingDetail
    } = usePromptSubmit(addMessage, updateMessageById, clearAllLoadingFlags);

    // Local state
    const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);
    const [isReportViewerOpen, setIsReportViewerOpen] = useState(false);
    const [currentReportInfo, setCurrentReportInfo] = useState(null); // Changed state name
    const [currentReportQuality, setCurrentReportQuality] = useState(null); // Keep quality if needed later

    // Reference for chat scrolling
    const chatEndRef = useRef(null);

    // Effect for scrolling chat to bottom when messages change
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages]);

    // Handler to open the report viewer modal
    const handleViewReport = (reportInfoPayload, quality = null) => {
        if (!reportInfoPayload || (!reportInfoPayload.code && !reportInfoPayload.reportData) || !reportInfoPayload.datasets) { // Check for code OR reportData
            logger.error("handleViewReport called with invalid reportInfo payload", reportInfoPayload);
            setCurrentReportInfo({ code: '', datasets: [], error: 'Invalid report data received.' });
        } else {
            const infoType = reportInfoPayload.code ? 'code' : 'data';
            const infoLength = reportInfoPayload.code ? reportInfoPayload.code.length : 'N/A';
            logger.debug(`Opening report viewer with report ${infoType} (${infoLength} chars) and ${reportInfoPayload.datasets.length} datasets`);
            setCurrentReportInfo(reportInfoPayload);
        }
        if (quality) setCurrentReportQuality(quality);
        setIsReportViewerOpen(true);
    };

    // Handler for prompt submission (remains the same)
    const handlePromptSubmit = (promptText) => {
        if (!promptText || !promptText.trim()) { logger.warn("Empty prompt text submitted"); return; }
        if (!selectedDatasetIds.length) {
            logger.warn("No datasets selected");
            addMessage({ type: 'system', content: 'Please select at least one dataset before sending your prompt.' });
            return;
        }
        if (!datasets || datasets.length === 0) {
            logger.error("No datasets available");
             addMessage({ type: 'system', content: 'Error: No datasets are available. Upload in Account > Datasets.' });
            return;
        }
        logger.debug(`Submitting prompt: "${promptText}" with ${selectedDatasetIds.length} selected datasets`);
        addMessage({ type: 'user', content: promptText });
        submitPrompt(promptText, selectedDatasetIds, datasets);
    };

     // renderDatasetError (remains the same)
     const renderDatasetError = () => {
         if (datasetsError) {
             return (
                 <div className="mb-2 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-600/50 rounded-md text-sm text-amber-700 dark:text-amber-300">
                     Error loading datasets: {datasetsError}. You may need to refresh the page.
                 </div>
             );
         }
         return null;
     };
    // Determine if progress indicator should be visible (remains the same)
    const isProgressVisible = promptLoading && processingStage !== PROCESSING_STAGES.WAITING && processingStage !== PROCESSING_STAGES.COMPLETE && processingStage !== PROCESSING_STAGES.ERROR;


    return (
        <>
            <div className="flex flex-col h-[calc(100vh-4rem-2rem)] sm:h-[calc(100vh-4rem-3rem)] lg:h-[calc(100vh-4rem-4rem)]">
                 {/* Chat messages area */}
                 <div className="flex-grow overflow-y-auto mb-4 pr-2 custom-scrollbar">
                     <ChatInterface
                         messages={messages}
                         isLoading={promptLoading && processingStage !== PROCESSING_STAGES.COMPLETE && processingStage !== PROCESSING_STAGES.ERROR} // Refined isLoading for chat
                         onViewReport={handleViewReport} // Pass handler down
                     />
                     <div ref={chatEndRef} />
                 </div>

                 {/* Progress Indicator */}
                 {isProgressVisible && ( <ProgressIndicator stage={processingStage} detail={processingDetail} /> )}

                {/* Error messages */}
                {renderDatasetError()}
                {/* --- CORRECTED ERROR DISPLAY --- */}
                {promptError && (
                    <div className="mb-2 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-600/50 rounded-md text-sm text-red-700 dark:text-red-300">
                        Error: {promptError}
                    </div>
                )}
                {/* --- END CORRECTION --- */}


                {/* Prompt input area */}
                <div className="flex-shrink-0 pb-0">
                     <PromptInput
                         onSubmit={handlePromptSubmit}
                         isLoading={promptLoading} // Pass general loading state
                         datasets={datasets || []}
                         datasetsLoading={datasetsLoading}
                         selectedDatasetIds={selectedDatasetIds}
                         setSelectedDatasetIds={setSelectedDatasetIds}
                     />
                 </div>
            </div>

             {/* Report viewer modal - PASS reportInfo and themeName */}
             <Modal
                 isOpen={isReportViewerOpen}
                 onClose={() => setIsReportViewerOpen(false)}
                 title="Generated Financial Report" // Updated title slightly
                 size="xl" // Keep large size for reports
             >
                 <Modal.Body padding="none"> {/* No padding, ReportViewer handles it */}
                     {currentReportInfo ? (
                         <ReportViewer
                             reportInfo={currentReportInfo} // Pass the object { code, datasets } or { reportData, datasets }
                             themeName={themeName} // Pass current theme
                             // quality={currentReportQuality} // Keep if needed later
                         />
                     ) : (
                          <div className="p-6 text-center text-gray-500">Loading report content...</div> // Placeholder
                     )}
                 </Modal.Body>
             </Modal>
        </>
    );
};

export default DashboardPage;