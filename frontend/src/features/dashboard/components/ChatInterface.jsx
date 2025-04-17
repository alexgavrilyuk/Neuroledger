// ================================================================================
// FILE: NeuroLedger copy/frontend/src/features/dashboard/components/ChatInterface.jsx
// PURPOSE: Displays the list of chat messages.
// PHASE 5 FIX: Verify key prop usage and add safety check.
// ================================================================================
import React from 'react';
import MessageBubble from './MessageBubble';
import Spinner from '../../../shared/ui/Spinner';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { useChat } from '../context/ChatContext'; // Keep useChat for context info maybe

const ChatInterface = ({ messages = [], isLoading, currentSession, onViewReport }) => {
    const hasMessages = messages.length > 0;

    // --- Intermediate handler for View Report (No change from previous step) ---
    const handleBubbleViewReport = (clickedMessage) => {
        if (!clickedMessage || !clickedMessage.aiGeneratedCode) {
            console.error('[ChatInterface] handleBubbleViewReport called without a message or message missing code.', clickedMessage);
            onViewReport({ code: null, analysisData: null });
            return;
        }
        let analysisData = clickedMessage.reportAnalysisData;
        if (!analysisData) {
            console.log(`[ChatInterface] Message ${clickedMessage._id} lacks analysisData. Searching previous messages...`);
            const clickedMessageIndex = messages.findIndex(msg => msg._id === clickedMessage._id);
            if (clickedMessageIndex > 0) {
                for (let i = clickedMessageIndex - 1; i >= 0; i--) {
                    if (messages[i].reportAnalysisData) {
                        console.log(`[ChatInterface] Found analysisData in previous message ${messages[i]._id}`);
                        analysisData = messages[i].reportAnalysisData;
                        break;
                    }
                }
            }
        }
        if (!analysisData) {
            console.warn(`[ChatInterface] Could not find analysisData for message ${clickedMessage._id} in history. Proceeding with potentially empty data.`);
            analysisData = {};
        }
        const payload = {
            code: clickedMessage.aiGeneratedCode,
            analysisData: analysisData,
        };
        onViewReport(payload);
    };

    return (
        <div className="relative min-h-[200px] space-y-1">
            {/* Empty state */}
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
                            <p className="text-sm font-medium">Select or create a chat session</p>
                            <p className="text-xs mt-1.5">Each chat keeps context between messages</p>
                        </>
                    )}
                </div>
            )}

            {/* Messages List */}
            <div className="space-y-6 py-2">
                {messages.map((msg) => {
                    // --- KEY PROP VERIFICATION ---
                    const key = msg._id; // Use the expected unique ID
                    if (!key) {
                         // This should ideally not happen with DB data
                         console.error("CRITICAL: Rendering message without a unique _id!", msg);
                         // Fallback key, but indicates a deeper problem
                         // return null; // Or render an error placeholder
                    }
                    // --- END KEY PROP VERIFICATION ---
                    return (
                        // Using reliable key here
                        <div key={key || `msg-${Math.random()}`} className="transform transition-all duration-300 ease-out">
                            <MessageBubble
                                message={msg}
                                onViewReport={handleBubbleViewReport}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Loading indicator (conditionally shown) */}
            {isLoading && messages.length > 0 && !messages[messages.length - 1]?.isLoading && messages[messages.length - 1]?.status !== 'processing' && (
                 <div className="flex justify-start items-center gap-x-3 py-3 pl-9 animate-fadeIn">
                     <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-lg p-2.5 shadow-soft-sm dark:shadow-soft-dark-sm">
                         <Spinner size="sm" variant="circle" color="text-blue-500 dark:text-blue-400" />
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