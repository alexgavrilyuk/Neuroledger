// frontend/src/features/dashboard/pages/DashboardPage.jsx
import React, { useState, useRef, useEffect } from 'react';
import ChatInterface from '../components/ChatInterface';
import PromptInput from '../components/PromptInput';
import { useDatasets } from '../../dataset_management/hooks/useDatasets';
import { useChat } from '../context/ChatContext';
import Modal from '../../../shared/ui/Modal';
import ReportViewer from '../../report_display/components/ReportViewer';
import logger from '../../../shared/utils/logger';
import { useTheme } from '../../../shared/hooks/useTheme';

const DashboardPage = () => {
    // Local state for report viewing
    const [isReportViewerOpen, setIsReportViewerOpen] = useState(false);
    const [currentReportInfo, setCurrentReportInfo] = useState(null);
    const [currentReportQuality, setCurrentReportQuality] = useState(null);

    // Get datasets for dataset selection
    const { datasets, isLoading: datasetsLoading, error: datasetsError } = useDatasets();

    // Get theme for report viewer
    const { themeName } = useTheme();

    // Get chat context which provides sessions, messages, and message-sending functionality
    const {
        currentSession,
        messages,
        loading: chatLoading,
        sendMessage,
        sendStreamingMessage,
        loadMessages
    } = useChat();

    // Local state for dataset selection (used with prompt/message submission)
    const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);

    // Reference for chat scrolling
    const chatEndRef = useRef(null);

    // Effect for scrolling chat to bottom when messages change
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages]);

    // Effect to update selectedDatasetIds when currentSession changes
    useEffect(() => {
        if (currentSession?.associatedDatasetIds?.length > 0) {
            setSelectedDatasetIds(currentSession.associatedDatasetIds);
        } else {
            setSelectedDatasetIds([]);
        }

        // When the session changes, load messages for that session
        if (currentSession?._id) {
            loadMessages(currentSession._id);
        }
    }, [currentSession, loadMessages]);

    // Handler to open the report viewer modal
    const handleViewReport = (reportInfoPayload, quality = null) => {
        // ---- ADD LOG AT START ----
        // Log the received payload, expecting code and analysisData
        console.log('[DashboardPage handleViewReport START] Received payload:', JSON.stringify(reportInfoPayload));
        // ---- END LOG ----
        
        // SIMPLIFIED CHECK: Require code and the new analysisData field
        if (!reportInfoPayload || !reportInfoPayload.code || !reportInfoPayload.analysisData) {
            logger.error("handleViewReport called without valid code or analysisData", reportInfoPayload);
            // Set error state or handle appropriately
            setCurrentReportInfo({ code: '', analysisData: {}, error: 'Invalid report data: Code or analysis data missing.' });
            setCurrentReportQuality(null);
        } else {
            const infoLength = reportInfoPayload.code.length;
            // Check analysisData type/keys if needed for more robust logging
            const hasAnalysisData = typeof reportInfoPayload.analysisData === 'object' && reportInfoPayload.analysisData !== null;
            logger.debug(`Opening report viewer with code (${infoLength} chars) and analysisData present: ${hasAnalysisData}`);
            // Set state with code and analysisData
            setCurrentReportInfo({ 
                code: reportInfoPayload.code, 
                analysisData: reportInfoPayload.analysisData // Pass the analysis data object
            });
             if (quality) setCurrentReportQuality(quality);
        }
       
        setIsReportViewerOpen(true); // Always attempt to open modal, state will dictate content
    };

    // Handler for prompt submission
    const handlePromptSubmit = async (promptText) => {
        if (!promptText || !promptText.trim()) {
            logger.warn("Empty prompt text submitted");
            return;
        }

        if (!selectedDatasetIds.length) {
            logger.warn("No datasets selected");
            return;
        }

        if (!datasets || datasets.length === 0) {
            logger.error("No datasets available");
            return;
        }

        try {
            logger.debug(`Submitting prompt via streaming: \"${promptText}\" with ${selectedDatasetIds.length} selected datasets`);

            // This uses the chat context to send a message, now using the streaming version
            await sendStreamingMessage(promptText, selectedDatasetIds);
        } catch (error) {
            logger.error("Error sending streaming prompt:", error);
            // Consider adding user-facing error feedback here
        }
    };

    // Determine if this is the first message in the session
    const isFirstMessage = messages.length === 0 && !!currentSession;

    // Determine if dataset selection should be locked (after first message)
    const isDatasetSelectionLocked = !!currentSession?.associatedDatasetIds?.length && messages.length > 0;

    // renderDatasetError
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

    return (
        <>
            <div className="flex flex-col h-[calc(100vh-4rem-2rem)] sm:h-[calc(100vh-4rem-3rem)] lg:h-[calc(100vh-4rem-4rem)]">
                {/* Chat messages area */}
                <div className="flex-grow overflow-y-auto mb-4 pr-2 custom-scrollbar">
                    <ChatInterface
                        messages={messages}
                        isLoading={chatLoading}
                        onViewReport={handleViewReport}
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
                        isLoading={chatLoading}
                        datasets={datasets || []}
                        datasetsLoading={datasetsLoading}
                        selectedDatasetIds={selectedDatasetIds}
                        setSelectedDatasetIds={setSelectedDatasetIds}
                        isFirstMessage={isFirstMessage}
                        isDatasetSelectionLocked={isDatasetSelectionLocked}
                    />
                </div>
            </div>

            {/* Report viewer modal - PASS reportInfo and themeName */}
            <Modal
                isOpen={isReportViewerOpen}
                onClose={() => setIsReportViewerOpen(false)}
                title="Generated Financial Report"
                size="xl"
            >
                <Modal.Body padding="none">
                    <ReportViewer
                        key={currentReportInfo?.code || 'report-viewer'}
                        reportInfo={currentReportInfo}
                        themeName={themeName}
                    />
                </Modal.Body>
            </Modal>
        </>
    );
};

export default DashboardPage;