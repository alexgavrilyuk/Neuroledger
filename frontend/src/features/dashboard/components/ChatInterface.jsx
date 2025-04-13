// frontend/src/features/dashboard/components/ChatInterface.jsx
import React from 'react';
import MessageBubble from './MessageBubble';
import Spinner from '../../../shared/ui/Spinner';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { useChat } from '../context/ChatContext';

const ChatInterface = ({ messages = [], isLoading, currentSession, onViewReport }) => {
    const hasMessages = messages.length > 0;

    // --- NEW: Intermediate handler for View Report --- 
    const handleBubbleViewReport = (clickedMessage) => {
        if (!clickedMessage || !clickedMessage.aiGeneratedCode) {
            console.error('[ChatInterface] handleBubbleViewReport called without a message or message missing code.', clickedMessage);
            // Call original handler with minimal info to potentially show an error
            onViewReport({ code: null, analysisData: null });
            return;
        }

        let analysisData = clickedMessage.reportAnalysisData; // Check current message first

        if (!analysisData) {
            console.log(`[ChatInterface] Message ${clickedMessage._id} lacks analysisData. Searching previous messages...`);
            const clickedMessageIndex = messages.findIndex(msg => msg._id === clickedMessage._id);

            if (clickedMessageIndex > 0) {
                for (let i = clickedMessageIndex - 1; i >= 0; i--) {
                    if (messages[i].reportAnalysisData) {
                        console.log(`[ChatInterface] Found analysisData in previous message ${messages[i]._id}`);
                        analysisData = messages[i].reportAnalysisData;
                        break; // Stop searching once found
                    }
                }
            }
        }

        if (!analysisData) {
            console.warn(`[ChatInterface] Could not find analysisData for message ${clickedMessage._id} in history. Proceeding with potentially empty data.`);
            analysisData = {}; // Fallback to empty object
        }

        // Construct the payload with code from clicked message and found analysisData
        const payload = {
            code: clickedMessage.aiGeneratedCode,
            analysisData: analysisData,
            // Optionally pass message ID for context if needed later
            // messageId: clickedMessage._id
        };

        // Call the original handler passed from DashboardPage
        onViewReport(payload);
    };
    // --- END NEW HANDLER ---

    return (
        <div className="relative min-h-[200px] space-y-1">
            {/* Empty state with subtle animation when no messages */}
            {!hasMessages && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 animate-fadeIn">
                    {currentSession ? (
                        <>
                            <ChatBubbleLeftRightIcon className="h-12 w-12 mb-3 opacity-40" />
                            <p className="text-sm font-medium">Start your conversation about your data</p>
                            <p className="text-xs mt-1.5">{currentSession.title}</p>
                        </>
                    ) : (
                        <>
                            <ChatBubbleLeftRightIcon className="h-12 w-12 mb-3 opacity-40" />
                            <p className="text-sm font-medium">Select or create a chat session from the sidebar</p>
                            <p className="text-xs mt-1.5">Each chat keeps context between messages</p>
                        </>
                    )}
                </div>
            )}

            {/* Messages with improved spacing and animations */}
            <div className="space-y-6 py-2">
                {messages.map((msg) => (
                    <div
                        key={msg._id || msg.id || `${msg.messageType || msg.type}-${Date.now() * Math.random()}`}
                        className="transform transition-all duration-300 ease-out"
                    >
                        <MessageBubble
                            message={msg}
                            onViewReport={handleBubbleViewReport}
                        />
                    </div>
                ))}
            </div>

            {/* Enhanced loading indicator - shown only if the most recent message isn't already a loading placeholder */}
            {isLoading && messages.length > 0 && !messages[messages.length - 1]?.isLoading && messages[messages.length - 1]?.status !== 'processing' && (
                <div className="flex justify-start items-center gap-x-3 py-3 pl-9 animate-fadeIn">
                    <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-lg p-2.5 shadow-soft-sm dark:shadow-soft-dark-sm">
                        <Spinner
                            size="sm"
                            variant="circle"
                            color="text-blue-500 dark:text-blue-400"
                        />
                    </div>
                    <span className="text-xs italic text-gray-500 dark:text-gray-400 font-medium">
                        Processing your request...
                    </span>
                </div>
            )}
        </div>
    );
};

export default ChatInterface;