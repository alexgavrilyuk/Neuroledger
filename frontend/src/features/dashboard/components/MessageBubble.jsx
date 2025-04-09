// frontend/src/features/dashboard/components/MessageBubble.jsx
import React from 'react';
import { UserIcon, CpuChipIcon, ExclamationCircleIcon, DocumentChartBarIcon } from '@heroicons/react/24/solid';
import Spinner from '../../../shared/ui/Spinner';
import Button from '../../../shared/ui/Button';

const MessageBubble = ({ message, onViewReport }) => {
    // Determine message type
    const isUser = message.messageType === 'user';
    const isError = message.status === 'error' || message.status === 'error_generating' ||
                    message.status === 'error_executing' || message.messageType === 'ai_error';
    const isLoading = message.status === 'processing' || message.status === 'generating_code' ||
                     message.status === 'fetching_data' || message.isLoading;
    const isReportAvailable = (message.status === 'completed' && message.messageType === 'ai_report' &&
                              message.aiGeneratedCode && message.reportDatasets) ||
                              (message.contentType === 'report_iframe_ready' && message.reportInfo?.code &&
                              message.reportInfo?.datasets);

    // Enhanced bubble styles with better visual separation
    const bubbleBaseStyle = `max-w-[80%] lg:max-w-[70%] rounded-xl px-4 py-3 text-sm shadow-soft-md dark:shadow-soft-dark-md break-words transition-all duration-200 animate-fadeIn`;
    const bubbleAlignment = isUser ? 'ml-auto' : 'mr-auto';

    // Enhanced color system with gradients and refined colors
    const bubbleColor = isUser
        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
        : isError
            ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700/50'
            : isReportAvailable
                ? 'bg-gradient-subtle-light dark:bg-gradient-subtle-dark text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600/50'
                : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200/80 dark:border-gray-700/50';

    // Enhanced icon styles with better shadows and colors
    const iconBaseStyle = `h-8 w-8 rounded-full p-1.5 flex-shrink-0 self-start mt-1 shadow-soft-sm`;
    const userIconColor = `bg-gradient-to-br from-blue-400 to-blue-500 text-white`;
    const aiIconColor = isError
        ? `bg-gradient-to-br from-red-400 to-red-500 text-white`
        : `bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700 dark:from-gray-600 dark:to-gray-700 dark:text-gray-200`;

    // Content Rendering with improved spacing and typography
    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex items-center gap-x-2 py-1">
                    <Spinner
                        size="sm"
                        color={isUser ? "text-white" : "text-gray-500 dark:text-gray-400"}
                        variant="circle"
                    />
                    <span className="italic text-current opacity-80 font-medium">
                        {message.content || message.status === 'fetching_data'
                            ? "Fetching data..."
                            : message.status === 'generating_code'
                                ? "Generating code..."
                                : "Processing..."}
                    </span>
                </div>
            );
        }

        // Enhanced report available state with better buttons
        if (isReportAvailable) {
            // Get the right report info based on message format
            const reportInfo = message.contentType === 'report_iframe_ready'
                ? message.reportInfo
                : { code: message.aiGeneratedCode, datasets: message.reportDatasets };

            return (
                <div className="space-y-3">
                    <p className="leading-relaxed">{message.content || "Report generated."}</p>
                    <div className="flex items-center mt-2">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => onViewReport(reportInfo, message.quality)}
                            leftIcon={DocumentChartBarIcon}
                            className="shadow-soft-md dark:shadow-soft-dark-md transform hover:scale-102 active:scale-98"
                        >
                            View Report
                        </Button>
                    </div>
                </div>
            );
        }

        // Handle error content
        if (isError) {
            return (
                <div className="text-red-600 dark:text-red-300 font-medium">
                    <p>Error: {message.errorMessage || "An unexpected error occurred."}</p>
                </div>
            );
        }

        // Enhanced text display with better line height and spacing
        const displayText = message.content || message.promptText || message.aiResponseText || "";
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

        // Fallback for unexpected content with better styling
        return <span className="italic text-gray-400 dark:text-gray-500 font-medium">Unsupported message format</span>;
    };

    return (
        <div className={`flex items-start gap-x-3 ${isUser ? 'justify-end' : ''} my-4 animate-slideInBottom`}>
            {/* AI/Error Icon */}
            {!isUser && (
                <div className={`${iconBaseStyle} ${aiIconColor}`}>
                    {isError
                        ? <ExclamationCircleIcon className="h-full w-full animate-pulse-subtle" />
                        : <CpuChipIcon className="h-full w-full" />
                    }
                </div>
            )}

            {/* Bubble Content with enhanced shadows and animations */}
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