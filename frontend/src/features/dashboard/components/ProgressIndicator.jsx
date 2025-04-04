// frontend/src/features/dashboard/components/ProgressIndicator.jsx
import React from 'react';
import { PROCESSING_STAGES } from '../hooks/usePromptSubmit';
import Spinner from '../../../shared/ui/Spinner';
import {
    CodeBracketIcon,
    DocumentTextIcon,
    ArrowPathIcon,
    ChartBarIcon,
    DocumentChartBarIcon,
    CheckCircleIcon,
    CpuChipIcon,
    CloudArrowDownIcon,
    PaintBrushIcon,
} from '@heroicons/react/24/outline';

const ProgressIndicator = ({ stage, detail }) => {
    // Define the steps in the process - align with PROCESSING_STAGES in usePromptSubmit
    const steps = [
        { id: PROCESSING_STAGES.GENERATING_CODE, label: 'Generating Code', icon: CpuChipIcon },
        { id: PROCESSING_STAGES.FETCHING_DATA, label: 'Fetching Data', icon: CloudArrowDownIcon },
        { id: PROCESSING_STAGES.RENDERING, label: 'Rendering', icon: PaintBrushIcon },
    ];

    // Determine the current step index
    const currentStepIndex = steps.findIndex(step => step.id === stage);

    // If error or waiting or complete, don't show the step indicator visually progressing
    const isTerminalState = [
        PROCESSING_STAGES.ERROR,
        PROCESSING_STAGES.WAITING,
        PROCESSING_STAGES.COMPLETE
    ].includes(stage);

    const isComplete = stage === PROCESSING_STAGES.COMPLETE;
    const isError = stage === PROCESSING_STAGES.ERROR;

    // Don't render anything if waiting
    if (stage === PROCESSING_STAGES.WAITING) return null;

    return (
        <div className={`mb-4 p-3 sm:p-4 border rounded-xl shadow-soft-md dark:shadow-soft-dark-md transition-all duration-300 animate-fadeIn ${
            isError ? 'bg-gradient-to-br from-red-50 to-red-100/60 dark:from-red-900/30 dark:to-red-900/10 border-red-200 dark:border-red-800/50'
            : isComplete ? 'bg-gradient-to-br from-green-50 to-green-100/60 dark:from-green-900/30 dark:to-green-900/10 border-green-200 dark:border-green-800/50'
            : 'bg-gradient-to-br from-blue-50 to-blue-100/60 dark:from-blue-900/30 dark:to-blue-800/10 border-blue-200 dark:border-blue-800/50'
        }`}>
            {/* Header Area with Status Icon and Title */}
            <div className={`text-sm font-medium mb-3 flex items-center ${
                isError ? 'text-red-700 dark:text-red-300'
                : isComplete ? 'text-green-700 dark:text-green-300'
                : 'text-blue-700 dark:text-blue-300'
            }`}>
                {isComplete ? (
                    <>
                        <div className="p-1 rounded-full bg-green-100 dark:bg-green-900/30 mr-2">
                            <CheckCircleIcon className="h-5 w-5 text-green-500 dark:text-green-400" />
                        </div>
                        <span className="font-semibold">Report Generation Complete</span>
                    </>
                ) : isError ? (
                    <>
                        <div className="p-1 rounded-full bg-red-100 dark:bg-red-900/30 mr-2 animate-pulse">
                            <svg className="h-5 w-5 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <span className="font-semibold">Processing Error</span>
                    </>
                ) : (
                    <>
                        <div className="p-1 rounded-full bg-blue-100 dark:bg-blue-900/30 mr-2">
                            <Spinner size="sm" color="text-blue-500 dark:text-blue-400" />
                        </div>
                        <span className="font-semibold">Generating Report</span>
                    </>
                )}
            </div>

            {/* Step indicator - Show visually only for non-terminal states */}
            {!isTerminalState && (
                <>
                    {/* Progress bar with smooth animation */}
                    <div className="relative pt-1">
                        <div className="overflow-hidden h-2 mb-3 text-xs flex rounded-full bg-blue-100 dark:bg-blue-900/30">
                            <div
                                style={{
                                    width: `${Math.max(5, Math.min(100, ((currentStepIndex + 0.5) / steps.length) * 100))}%`,
                                    transition: 'width 1s ease-in-out'
                                }}
                                className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-400"
                            ></div>
                        </div>
                    </div>

                    {/* Step markers with animations and better icons */}
                    <div className="grid grid-cols-3 gap-1 mt-1">
                        {steps.map((step, index) => {
                            const Icon = step.icon;
                            const isActive = step.id === stage;
                            const isCompletedStep = !isTerminalState && currentStepIndex > index;

                            let iconContainerClass = "flex items-center justify-center h-8 w-8 mx-auto rounded-full transition-all duration-300";
                            let iconClass = "h-4 w-4 transition-all duration-300";
                            let textClass = "text-xs text-center mt-1 transition-all duration-300";

                            if (isActive) {
                                iconContainerClass += " bg-blue-100 dark:bg-blue-900/50 transform scale-110";
                                iconClass += " text-blue-600 dark:text-blue-400";
                                textClass += " font-semibold text-blue-600 dark:text-blue-400";
                            } else if (isCompletedStep) {
                                iconContainerClass += " bg-blue-50 dark:bg-blue-900/20";
                                iconClass += " text-blue-500 dark:text-blue-400 opacity-70";
                                textClass += " text-gray-600 dark:text-gray-400";
                            } else { // Pending
                                iconContainerClass += " bg-gray-100 dark:bg-gray-800";
                                iconClass += " text-gray-400 dark:text-gray-600";
                                textClass += " text-gray-400 dark:text-gray-500";
                            }

                            return (
                                <div key={step.id} className="flex flex-col items-center" title={step.label}>
                                    <div className={iconContainerClass}>
                                        {isActive ? (
                                            <div className="animate-pulse">
                                                <Icon className={iconClass} />
                                            </div>
                                        ) : (
                                            <Icon className={iconClass} />
                                        )}
                                    </div>
                                    <div className={textClass}>{step.label}</div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Detail message with enhanced styling */}
            {detail && !isTerminalState && (
                <div className="text-xs bg-white/50 dark:bg-gray-800/50 rounded-md p-2 mt-3 text-center border border-gray-200/50 dark:border-gray-700/30 shadow-soft-sm">
                    <span className="text-blue-600 dark:text-blue-300 font-medium">{detail}</span>
                </div>
            )}

            {/* Error detail message */}
            {isError && detail && (
                <div className="text-xs bg-red-50 dark:bg-red-900/20 rounded-md p-2 mt-3 text-center border border-red-200/50 dark:border-red-700/30">
                    <span className="text-red-600 dark:text-red-300">{detail}</span>
                </div>
            )}
        </div>
    );
};

export default ProgressIndicator;