// frontend/src/features/dashboard/pages/DashboardPage.jsx
// ** UPDATED FILE - Pass setMessages to usePromptSubmit **
import React, { useState, useRef, useEffect } from 'react';
import ChatInterface from '../components/ChatInterface';
import PromptInput from '../components/PromptInput';
import { useChatHistory } from '../hooks/useChatHistory';
import { usePromptSubmit } from '../hooks/usePromptSubmit';
import { useDatasets } from '../../dataset_management/hooks/useDatasets';

const DashboardPage = () => {
    // --- FIX: Get setMessages from useChatHistory ---
    const { messages, addMessage, setMessages } = useChatHistory();
    const { datasets, isLoading: datasetsLoading, error: datasetsError } = useDatasets();
    // --- FIX: Pass setMessages to usePromptSubmit ---
    const { submitPrompt, isLoading: promptLoading, error: promptError } = usePromptSubmit(addMessage, setMessages);
    const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);

    const handlePromptSubmit = (promptText) => {
        if (!promptText.trim()) return;
        if (selectedDatasetIds.length === 0) {
             addMessage({ type: 'system', content: 'Please select at least one dataset before sending your prompt.' });
             return;
        }
        addMessage({ type: 'user', content: promptText });
        submitPrompt(promptText, selectedDatasetIds);
    };

    const chatEndRef = useRef(null);
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        // --- Optional: Slightly adjusted height calculation for better fit ---
        <div className="flex flex-col h-[calc(100vh-4rem-2rem)] sm:h-[calc(100vh-4rem-3rem)] lg:h-[calc(100vh-4rem-4rem)]"> {/* vh - header - page padding (adjust p values if needed) */}
            <div className="flex-grow overflow-y-auto mb-4 pr-2 custom-scrollbar"> {/* Add custom scrollbar class if desired */}
                <ChatInterface messages={messages} isLoading={promptLoading && messages[messages.length - 1]?.isLoading !== true} />
                 <div ref={chatEndRef} />
            </div>

             {promptError && (
                 <div className="mb-2 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-600/50 rounded-md text-sm text-red-700 dark:text-red-300 flex-shrink-0"> {/* Added flex-shrink-0 */}
                     Error: {promptError}
                 </div>
             )}

            <div className="flex-shrink-0 pb-0"> {/* Removed bottom padding from here */}
                <PromptInput
                    onSubmit={handlePromptSubmit}
                    isLoading={promptLoading}
                    datasets={datasets}
                    datasetsLoading={datasetsLoading}
                    selectedDatasetIds={selectedDatasetIds}
                    setSelectedDatasetIds={setSelectedDatasetIds}
                />
            </div>
        </div>
    );
};

// Optional: Add custom scrollbar styles in index.css if desired
/*
Example in index.css:
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5); // gray-400 with opacity
  border-radius: 3px;
}
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(107, 114, 128, 0.5); // gray-500 with opacity
}
*/

export default DashboardPage;