// frontend/src/features/dashboard/pages/DashboardPage.jsx
// --- UPDATED FILE ---

import React, { useState, useRef, useEffect } from 'react';
import ChatInterface from '../components/ChatInterface';
import PromptInput from '../components/PromptInput';
import { useDatasets } from '../../dataset_management/hooks/useDatasets';
import { useChat } from '../context/ChatContext'; // Import useChat
import Modal from '../../../shared/ui/Modal';
import ReportViewer from '../../report_display/components/ReportViewer';
import logger from '../../../shared/utils/logger';
import { useTheme } from '../../../shared/hooks/useTheme';
import { LockClosedIcon } from '@heroicons/react/24/outline'; // Import Lock icon

const DashboardPage = () => {
    // Local state for report viewing
    const [isReportViewerOpen, setIsReportViewerOpen] = useState(false);
    const [currentReportInfo, setCurrentReportInfo] = useState(null);
    const [currentReportQuality, setCurrentReportQuality] = useState(null); // Keep if used

    // Get datasets for dataset selection
    const { datasets, isLoading: datasetsLoading, error: datasetsError } = useDatasets();

    // Get theme for report viewer
    const { themeName } = useTheme();

    // Get chat context which provides sessions, messages, and message-sending functionality
    const {
        currentSession,
        messages,
        loading: chatLoading, // General loading state from context
        isLoadingMessages, // ** FIX: Destructure isLoadingMessages **
        // sendMessage, // Deprecated non-streaming version (can be removed if not used)
        sendStreamingMessage,
        loadMessages,
        isSendingMessage // Get the sending state for disabling input
    } = useChat();

    // Local state for dataset selection (used with prompt/message submission)
    const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);

    // Reference for chat scrolling
    const chatEndRef = useRef(null);

    // Effect for scrolling chat to bottom when messages change
    useEffect(() => {
        // Scroll immediately on new message, smooth scroll otherwise
        const lastMessage = messages[messages.length - 1];
        const behavior = lastMessage ? 'auto' : 'smooth';
        chatEndRef.current?.scrollIntoView({ behavior: behavior, block: "end" });
    }, [messages]);


    // Effect to update selectedDatasetIds when currentSession changes OR initial datasets load
    // And load messages for the current session
    useEffect(() => {
        if (currentSession?._id) {
            // Set selected datasets based on session's associated IDs
            if (currentSession.associatedDatasetIds?.length > 0) {
                setSelectedDatasetIds(currentSession.associatedDatasetIds);
            } else {
                setSelectedDatasetIds([]); // Reset if session has no associated IDs yet
            }
            // Load messages for the current session
            loadMessages(currentSession._id);
        } else {
            // Clear messages and selection if no session is active
            setSelectedDatasetIds([]);
            // loadMessages(null); // loadMessages already handles null check
        }
    }, [currentSession, loadMessages]); // Rerun when session changes

    // Handler to open the report viewer modal
    const handleViewReport = (reportInfoPayload, quality = null) => {
        console.log('[DashboardPage handleViewReport START] Received payload:', JSON.stringify(reportInfoPayload));

        // Check for valid code AND analysisData before setting state
        if (reportInfoPayload?.code && reportInfoPayload?.analysisData) {
            const infoLength = reportInfoPayload.code.length;
            const hasAnalysisData = typeof reportInfoPayload.analysisData === 'object' && reportInfoPayload.analysisData !== null;
            logger.debug(`Opening report viewer with code (${infoLength} chars) and analysisData present: ${hasAnalysisData}`);
            setCurrentReportInfo({
                code: reportInfoPayload.code,
                analysisData: reportInfoPayload.analysisData
            });
            // setCurrentReportQuality(quality); // Keep if used elsewhere
            setIsReportViewerOpen(true);
        } else {
            logger.error("handleViewReport called without valid code or analysisData", reportInfoPayload);
            // Optionally: Show an alert to the user here instead of trying to open the modal with bad data.
            // alert("Could not display report: Invalid report data received.");
            setIsReportViewerOpen(false); // Ensure modal doesn't open/stay open if data is invalid
        }
    };

    // Handler for prompt submission
    const handlePromptSubmit = async (promptText) => {
        if (!promptText || !promptText.trim()) {
            logger.warn("Empty prompt text submitted");
            return;
        }

        if (!selectedDatasetIds.length && messages.length === 0) { // Only enforce dataset selection for the *first* message
             logger.warn("No datasets selected for the first message");
             // Optionally show a user-facing error here
             alert("Please select at least one dataset using the database icon before sending your first message.");
             return;
         }

        if (!datasets || datasets.length === 0 && messages.length === 0) {
             logger.error("No datasets available to select from for the first message");
             // Optionally show a user-facing error here
             alert("No datasets found. Please upload a dataset in your account settings first.");
             return;
        }

        try {
            logger.debug(`Submitting prompt via streaming: \"${promptText}\" with ${selectedDatasetIds.length} selected datasets`);

            // This uses the chat context to send a message, now using the streaming version
            await sendStreamingMessage(promptText, selectedDatasetIds);
        } catch (error) {
            logger.error("Error sending streaming prompt:", error);
            // Consider adding user-facing error feedback here
            alert(`Error sending message: ${error.message}`);
        }
    };

    // Determine if this is the first message in the session
    const isFirstMessage = messages.length === 0 && !!currentSession;

    // Determine if dataset selection should be locked (after first message with associated datasets)
    const isDatasetSelectionLocked = !!currentSession?.associatedDatasetIds?.length && messages.length > 0;

    // renderDatasetError function
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

    // Combine loading states for the ChatInterface indicator
    const combinedIsLoading = isLoadingMessages || isSendingMessage;

    return (
        <>
            <div className="flex flex-col h-[calc(100vh-4rem-2rem)] sm:h-[calc(100vh-4rem-3rem)] lg:h-[calc(100vh-4rem-4rem)]">
                {/* Chat messages area */}
                <div className="flex-grow overflow-y-auto mb-4 pr-2 custom-scrollbar">
                    <ChatInterface
                        messages={messages}
                        // ** FIX: Use combinedIsLoading here **
                        isLoading={combinedIsLoading}
                        onViewReport={handleViewReport} // Pass the DashboardPage handler directly
                        currentSession={currentSession}
                    />
                    <div ref={chatEndRef} />
                </div>

                {/* Error messages */}
                {renderDatasetError()}

                {/* Prompt input area */}
                <div className="flex-shrink-0 pb-0">
                    <PromptInput
                        onSubmit={handlePromptSubmit}
                        // ** FIX: Use isSendingMessage to disable input while sending **
                        isLoading={isSendingMessage}
                        datasets={datasets || []}
                        datasetsLoading={datasetsLoading}
                        selectedDatasetIds={selectedDatasetIds}
                        setSelectedDatasetIds={setSelectedDatasetIds}
                        isFirstMessage={isFirstMessage}
                        isDatasetSelectionLocked={isDatasetSelectionLocked}
                    />
                </div>
            </div>

            {/* Report viewer modal */}
            <Modal
                isOpen={isReportViewerOpen}
                onClose={() => setIsReportViewerOpen(false)}
                title="Generated Financial Report"
                size="xl"
            >
                <Modal.Body padding="none">
                    {/* Ensure ReportViewer only renders if modal is open AND reportInfo is valid */}
                    {isReportViewerOpen && currentReportInfo?.code && currentReportInfo?.analysisData && (
                         <ReportViewer
                            // Use a combination of factors for a more reliable key
                            key={`${currentReportInfo.code.substring(0, 50)}-${JSON.stringify(currentReportInfo.analysisData).substring(0, 50)}`}
                            reportInfo={currentReportInfo}
                            themeName={themeName} // Pass theme
                         />
                    )}
                 </Modal.Body>
            </Modal>
        </>
    );
};

export default DashboardPage;