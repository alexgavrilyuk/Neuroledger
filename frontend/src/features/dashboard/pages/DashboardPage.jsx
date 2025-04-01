// frontend/src/features/dashboard/pages/DashboardPage.jsx
// ** UPDATED FILE - Add Modal state and ReportViewer **
import React, { useState, useRef, useEffect } from 'react';
import ChatInterface from '../components/ChatInterface';
import PromptInput from '../components/PromptInput';
import { useChatHistory } from '../hooks/useChatHistory';
import { usePromptSubmit } from '../hooks/usePromptSubmit';
import { useDatasets } from '../../dataset_management/hooks/useDatasets';
import Modal from '../../../shared/ui/Modal'; // Import Modal
import ReportViewer from '../../report_display/components/ReportViewer'; // Import ReportViewer

const DashboardPage = () => {
    // State for chat history
    const { messages, addMessage, updateMessageById, clearAllLoadingFlags } = useChatHistory();
    // State for datasets
    const { datasets, isLoading: datasetsLoading } = useDatasets();
    // State for prompt submission/execution
    const { submitPrompt, isLoading: promptLoading, error: promptError } = usePromptSubmit(addMessage, updateMessageById, clearAllLoadingFlags);
    // State for dataset selection in PromptInput
    const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);
    // --- State for Report Viewer Modal ---
    const [isReportViewerOpen, setIsReportViewerOpen] = useState(false);
    const [currentReportHtml, setCurrentReportHtml] = useState('');

    // --- Handler to open the report viewer ---
    const handleViewReport = (htmlContent) => {
        setCurrentReportHtml(htmlContent || '<p>No report content available.</p>');
        setIsReportViewerOpen(true);
    };

    // --- Handler to submit prompt ---
    const handlePromptSubmit = (promptText) => {
        if (!promptText.trim()) return;
        if (selectedDatasetIds.length === 0) {
             addMessage({ type: 'system', content: 'Please select at least one dataset before sending your prompt.' });
             return;
        }
        const userMessageId = addMessage({ type: 'user', content: promptText }); // Get user message ID
        submitPrompt(promptText, selectedDatasetIds);
    };

    // Scroll chat to bottom
    const chatEndRef = useRef(null);
    useEffect(() => {
        // Simple scrollIntoView might be sufficient
        chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        // More complex logic if needed:
        // const chatContainer = chatEndRef.current?.parentElement;
        // if (chatContainer) {
        //     chatContainer.scrollTop = chatContainer.scrollHeight;
        // }
    }, [messages]);

    return (
        <>
            <div className="flex flex-col h-[calc(100vh-4rem-2rem)] sm:h-[calc(100vh-4rem-3rem)] lg:h-[calc(100vh-4rem-4rem)]">
                <div className="flex-grow overflow-y-auto mb-4 pr-2 custom-scrollbar">
                    <ChatInterface
                        messages={messages}
                        isLoading={promptLoading} // Pass overall loading state
                        onViewReport={handleViewReport} // Pass the handler
                    />
                     <div ref={chatEndRef} />
                </div>

                 {promptError && ( // Display API call errors separately if desired
                     <div className="mb-2 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-600/50 rounded-md text-sm text-red-700 dark:text-red-300 flex-shrink-0">
                         API Error: {promptError}
                     </div>
                 )}

                <div className="flex-shrink-0 pb-0">
                    <PromptInput
                        onSubmit={handlePromptSubmit}
                        isLoading={promptLoading} // Pass loading state to disable input
                        datasets={datasets}
                        datasetsLoading={datasetsLoading}
                        selectedDatasetIds={selectedDatasetIds}
                        setSelectedDatasetIds={setSelectedDatasetIds}
                    />
                </div>
            </div>

            {/* --- Report Viewer Modal --- */}
            <Modal
                isOpen={isReportViewerOpen}
                onClose={() => setIsReportViewerOpen(false)}
                title="Generated Report"
                size="xl" // Use a larger modal for reports
            >
                <Modal.Body padding="none"> {/* Remove padding, ReportViewer handles it */}
                    <ReportViewer htmlContent={currentReportHtml} />
                </Modal.Body>
                {/* Optional Footer */}
                {/* <Modal.Footer className="justify-end">
                    <Button variant="secondary" onClick={() => setIsReportViewerOpen(false)}>Close</Button>
                </Modal.Footer> */}
            </Modal>
        </>
    );
};

export default DashboardPage;