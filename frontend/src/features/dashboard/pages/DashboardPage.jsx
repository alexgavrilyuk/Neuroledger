// frontend/src/features/dashboard/pages/DashboardPage.jsx
// FIXED VERSION - Properly passes datasets to usePromptSubmit

import React, { useState, useRef, useEffect } from 'react';
import ChatInterface from '../components/ChatInterface';
import PromptInput from '../components/PromptInput';
import { useChatHistory } from '../hooks/useChatHistory';
import { usePromptSubmit } from '../hooks/usePromptSubmit';
import { useDatasets } from '../../dataset_management/hooks/useDatasets';
import Modal from '../../../shared/ui/Modal';
import ReportViewer from '../../report_display/components/ReportViewer';
import logger from '../../../shared/utils/logger';

const DashboardPage = () => {
    // State management hooks
    const { messages, addMessage, updateMessageById, clearAllLoadingFlags } = useChatHistory();
    const { datasets, isLoading: datasetsLoading, error: datasetsError } = useDatasets();
    const { submitPrompt, isLoading: promptLoading, error: promptError } = usePromptSubmit(
        addMessage,
        updateMessageById,
        clearAllLoadingFlags
    );

    // Local state
    const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);
    const [isReportViewerOpen, setIsReportViewerOpen] = useState(false);
    const [currentReportHtml, setCurrentReportHtml] = useState('');

    // Reference for chat scrolling
    const chatEndRef = useRef(null);

    // Effect for scrolling chat to bottom when messages change
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages]);

    // Handler to open the report viewer modal
    const handleViewReport = (htmlContent) => {
        if (!htmlContent) {
            logger.warn("handleViewReport called with empty HTML content");
            setCurrentReportHtml('<p class="text-red-500">No report content available.</p>');
        } else {
            logger.debug(`Opening report viewer with HTML content (${htmlContent.length} chars)`);
            setCurrentReportHtml(htmlContent);
        }

        setIsReportViewerOpen(true);
    };

    // Handler for prompt submission
    const handlePromptSubmit = (promptText) => {
        // Validate prompt text
        if (!promptText || !promptText.trim()) {
            logger.warn("Empty prompt text submitted");
            return;
        }

        // Validate dataset selection
        if (!selectedDatasetIds.length) {
            logger.warn("No datasets selected");
            addMessage({
                type: 'system',
                content: 'Please select at least one dataset before sending your prompt.'
            });
            return;
        }

        // Validate datasets are loaded
        if (!datasets || datasets.length === 0) {
            logger.error("No datasets available");
            addMessage({
                type: 'system',
                content: 'Error: No datasets are available. Please upload datasets in your account settings.'
            });
            return;
        }

        // Add user message to chat
        logger.debug(`Submitting prompt: "${promptText}" with ${selectedDatasetIds.length} selected datasets`);
        const userMessageId = addMessage({ type: 'user', content: promptText });

        // Submit prompt for processing
        submitPrompt(promptText, selectedDatasetIds, datasets);
    };

    // Show dataset error if any
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
                        isLoading={promptLoading}
                        onViewReport={handleViewReport}
                    />
                    <div ref={chatEndRef} />
                </div>

                {/* Error messages */}
                {renderDatasetError()}
                {promptError && (
                    <div className="mb-2 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-600/50 rounded-md text-sm text-red-700 dark:text-red-300">
                        Error: {promptError}
                    </div>
                )}

                {/* Prompt input area */}
                <div className="flex-shrink-0 pb-0">
                    <PromptInput
                        onSubmit={handlePromptSubmit}
                        isLoading={promptLoading || datasetsLoading}
                        datasets={datasets || []}
                        datasetsLoading={datasetsLoading}
                        selectedDatasetIds={selectedDatasetIds}
                        setSelectedDatasetIds={setSelectedDatasetIds}
                    />
                </div>
            </div>

            {/* Report viewer modal */}
            <Modal
                isOpen={isReportViewerOpen}
                onClose={() => setIsReportViewerOpen(false)}
                title="Generated Report"
                size="xl"
            >
                <Modal.Body padding="none">
                    <ReportViewer htmlContent={currentReportHtml} />
                </Modal.Body>
            </Modal>
        </>
    );
};

export default DashboardPage;