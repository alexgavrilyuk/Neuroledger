// frontend/src/features/dashboard/components/MessageBubble.jsx
import React from 'react';
// Import Heroicons separately
import { UserIcon, CpuChipIcon, ExclamationCircleIcon, DocumentChartBarIcon } from '@heroicons/react/24/solid'; 
// Import React Icons (Font Awesome) separately
import { FaCircleNotch, FaExclamationTriangle, FaList, FaSearch, FaCode, FaPlayCircle, FaMicrochip } from 'react-icons/fa'; 
import Spinner from '../../../shared/ui/Spinner';
import Button from '../../../shared/ui/Button';
import { useChat } from '../context/ChatContext'; 


// Define tool display map here as it's used within this component
const toolDisplayMap = {
  list_datasets: { text: 'Accessing dataset list...', Icon: FaList },
  get_dataset_schema: { text: 'Analyzing dataset schema...', Icon: FaSearch },
  generate_data_extraction_code: { text: 'Preparing data analysis code...', Icon: FaCode },
  execute_backend_code: { text: 'Analyzing data...', Icon: FaPlayCircle },
  generate_report_code: { text: 'Generating report visualization...', Icon: DocumentChartBarIcon }, // Using Heroicon here intentionally?
  default: { text: 'Processing step...', Icon: FaCircleNotch },
};

const MessageBubble = ({ message, onViewReport }) => {
    const { agentMessageStatuses, AGENT_STATUS } = useChat();

    // Determine message type and base status
    const isUser = message.messageType === 'user';
    const isFinalError = message.status === 'error'; // Use message.status for final error state
    const isProcessing = message.status === 'processing'; // Check if BE marks it as processing

    // Check for specific agent status if the message is processing
    const agentStatus = isProcessing ? agentMessageStatuses[message._id] : null;
    const isAgentError = agentStatus?.status === AGENT_STATUS.ERROR;
    const isLoading = isProcessing && (!agentStatus || agentStatus.status === AGENT_STATUS.IDLE || agentStatus.status === AGENT_STATUS.THINKING || agentStatus.status === AGENT_STATUS.USING_TOOL);

    // Report is available if AI message is complete and has code
    const isReportAvailable = message.messageType === 'ai_report' &&
                              message.status === 'completed' &&
                              message.aiGeneratedCode;

    // Bubble styles
    const bubbleBaseStyle = `max-w-[80%] lg:max-w-[70%] rounded-xl px-4 py-3 text-sm shadow-soft-md dark:shadow-soft-dark-md break-words transition-all duration-200 animate-fadeIn`;
    const bubbleAlignment = isUser ? 'ml-auto' : 'mr-auto';
    const bubbleColor = isUser
        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
        : isFinalError // Use final message status for definite error color
            ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700/50'
            : isReportAvailable // Style differently if report is ready
                ? 'bg-gradient-subtle-light dark:bg-gradient-subtle-dark text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600/50'
                : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200/80 dark:border-gray-700/50';

    // Icon styles
    const iconBaseStyle = `h-8 w-8 rounded-full p-1.5 flex-shrink-0 self-start mt-1 shadow-soft-sm`;
    const userIconColor = `bg-gradient-to-br from-blue-400 to-blue-500 text-white`;
    const aiIconColor = isFinalError
        ? `bg-gradient-to-br from-red-400 to-red-500 text-white`
        : `bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700 dark:from-gray-600 dark:to-gray-700 dark:text-gray-200`;

    // Content Rendering Logic
    const renderContent = () => {
        // --- Handle Loading / Agent Status --- 
        if (isLoading) {
            let statusText = 'Processing...';
            let StatusIcon = FaCircleNotch;
            let iconAnimation = 'animate-spin';

            if (agentStatus) {
                switch (agentStatus.status) {
                    case AGENT_STATUS.THINKING:
                        statusText = 'Thinking...';
                        StatusIcon = FaMicrochip;
                        iconAnimation = 'animate-pulse';
                        break;
                    case AGENT_STATUS.USING_TOOL:
                        const toolInfo = toolDisplayMap[agentStatus.toolName] || toolDisplayMap.default;
                        statusText = toolInfo.text;
                        StatusIcon = toolInfo.Icon;
                        iconAnimation = 'animate-spin'; // Keep spin for tools
                        break;
                    case AGENT_STATUS.IDLE:
                        statusText = 'Preparing response...';
                        StatusIcon = FaCircleNotch;
                        break;
                    // NOTE: Agent ERROR state is handled below with final errors for simplicity
                }
            }

            return (
                <div className="flex items-center gap-x-2 py-1 text-gray-500 dark:text-gray-400">
                    <StatusIcon className={`h-4 w-4 ${iconAnimation}`}/>
                    <span className="italic font-medium">
                        {statusText}
                    </span>
                </div>
            );
        }

        // --- Handle Final Errors (from message status or agent status) --- 
        if (isFinalError || isAgentError) {
            const errorMsg = isAgentError ? agentStatus.error : (message.errorMessage || "An unexpected error occurred.");
            return (
                <div className="text-red-600 dark:text-red-300 font-medium flex items-center gap-x-2">
                     <FaExclamationTriangle className="h-4 w-4 flex-shrink-0" />
                     <span>Error: {errorMsg}</span>
                </div>
            );
        }

        // --- Handle Report Available --- 
        if (isReportAvailable) {
            return (
                <div className="space-y-3">
                    <p className="leading-relaxed">{message.aiResponseText || "Report generated."}</p>
                    <div className="flex items-center mt-2">
                        <Button
                            variant="primary"
                            size="sm"
                            // Call the passed onViewReport prop
                            onClick={() => onViewReport({ code: message.aiGeneratedCode, datasets: message.reportDatasets || [] })}
                            leftIcon={DocumentChartBarIcon}
                            className="shadow-soft-md dark:shadow-soft-dark-md transform hover:scale-102 active:scale-98"
                        >
                            View Report
                        </Button>
                    </div>
                </div>
            );
        }

        // --- Handle Regular Text Content (User or Completed AI) --- 
        const displayText = message.promptText || message.aiResponseText || "";
        if (displayText) {
            return (
                <div className="leading-relaxed">
                    {displayText.split('\n').map((line, index, arr) => (
                        <React.Fragment key={index}>
                            {line || (index > 0 && index < arr.length - 1 ? '\u00A0' : '')}
                            {index < arr.length - 1 && <br />}
                        </React.Fragment>
                    ))}
                </div>
            );
        }

        // Fallback
        return <span className="italic text-gray-400 dark:text-gray-500 font-medium">No content available</span>;
    };

    return (
        <div className={`flex items-start gap-x-3 ${isUser ? 'justify-end' : ''} my-4 animate-slideInBottom`}>
            {/* AI/Error Icon */}
            {!isUser && (
                <div className={`${iconBaseStyle} ${aiIconColor}`}>
                    {isFinalError
                        ? <ExclamationCircleIcon className="h-full w-full animate-pulse-subtle" />
                        : <CpuChipIcon className="h-full w-full" />
                    }
                </div>
            )}

            {/* Bubble Content */}
            <div className={`${bubbleBaseStyle} ${bubbleAlignment} ${bubbleColor}`}>
                {renderContent()}
            </div>

            {/* User Icon */}
            {isUser && (
                <div className={`${iconBaseStyle} ${userIconColor}`}>
                    <UserIcon className="h-full w-full" />
                </div>
            )}
        </div>
    );
};

export default MessageBubble;