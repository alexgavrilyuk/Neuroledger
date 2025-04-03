// ================================================================================
// FILE: NeuroLedger/frontend/src/features/dashboard/components/ProgressIndicator.jsx
// ================================================================================
// frontend/src/features/dashboard/components/ProgressIndicator.jsx
// ** RE-VERIFIED - Ensure key prop is present **

import React from 'react';
import { PROCESSING_STAGES } from '../hooks/usePromptSubmit'; // Ensure correct import path
import Spinner from '../../../shared/ui/Spinner';
import {
    CodeBracketIcon,
    DocumentTextIcon,
    ArrowPathIcon, // Kept if PROCESSING_DATA stage exists in hook
    ChartBarIcon, // Kept if ANALYZING/VISUALS stages exist
    DocumentChartBarIcon, // Kept if FINALIZING/RENDERING stages exist
    CheckCircleIcon,
    CpuChipIcon, // Example alternative for Generating
    CloudArrowDownIcon, // Example alternative for Fetching Data
    PaintBrushIcon, // Example alternative for Rendering
} from '@heroicons/react/24/outline';

const ProgressIndicator = ({ stage, detail }) => {
    // Define the steps in the process - ALIGN WITH PROCESSING_STAGES in usePromptSubmit
    // Assuming usePromptSubmit uses: WAITING, GENERATING_CODE, FETCHING_DATA, RENDERING, COMPLETE, ERROR
    const steps = [
        { id: PROCESSING_STAGES.GENERATING_CODE, label: 'Generating Code', icon: CpuChipIcon },
        { id: PROCESSING_STAGES.FETCHING_DATA, label: 'Fetching Data', icon: CloudArrowDownIcon },
        // Conditionally add more steps here if the hook reports them
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
        <div className={`mb-4 p-2 sm:p-3 border rounded-md ${
            isError ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : isComplete ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            }`}>
            <div className={`text-sm font-medium mb-1 flex items-center ${
                 isError ? 'text-red-700 dark:text-red-300'
                 : isComplete ? 'text-green-700 dark:text-green-300'
                 : 'text-blue-700 dark:text-blue-300'
                 }`}>
                {isComplete ? (
                    <>
                        <CheckCircleIcon className="h-5 w-5 mr-2 text-green-500 dark:text-green-400" />
                        Report Generation Complete
                    </>
                ) : isError ? (
                     <>
                         {/* Error display is handled outside, but could show minimal icon */}
                         Processing Stopped
                     </>
                ) : (
                    <>
                        <Spinner size="sm" className="mr-2" />
                        Generating Report
                    </>
                )}
            </div>

            {/* Step indicator - Show visually only for non-terminal states */}
            {!isTerminalState && (
                <>
                    <div className="relative pt-1"> {/* Added padding top */}
                        <div className="overflow-hidden h-2 mb-2 text-xs flex rounded bg-blue-200 dark:bg-blue-800/50">
                            <div
                                style={{ width: `${Math.max(5, Math.min(100, (currentStepIndex / steps.length) * 100))}%` }} // Ensure minimum width for visibility
                                className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 dark:bg-blue-400 transition-width duration-500 ease-out">
                            </div>
                        </div>
                    </div>

                    {/* Step markers */}
                    <div className={`grid grid-cols-${steps.length} gap-1 mt-1`}>
                        {steps.map((step, index) => {
                            const Icon = step.icon;
                            const isActive = step.id === stage;
                            const isCompletedStep = !isTerminalState && currentStepIndex > index;

                            let iconClass = "h-4 w-4 mx-auto transition-colors duration-300"; // Smaller icons maybe
                            let textClass = "text-[10px] text-center mt-0.5 transition-colors duration-300"; // Smaller text

                            if (isActive) {
                                iconClass += " text-blue-600 dark:text-blue-400";
                                textClass += " font-semibold text-blue-600 dark:text-blue-400";
                            } else if (isCompletedStep) {
                                iconClass += " text-blue-500 dark:text-blue-400 opacity-70"; // Show completed differently than default pending
                                textClass += " text-gray-600 dark:text-gray-400";
                            } else { // Pending
                                iconClass += " text-gray-300 dark:text-gray-600";
                                textClass += " text-gray-400 dark:text-gray-500";
                            }

                            return (
                                // **** Ensure key is present ****
                                <div key={step.id} className="flex flex-col items-center" title={step.label}>
                                    <div className="relative">
                                        <Icon className={iconClass} />
                                    </div>
                                    <div className={textClass}>{step.label}</div>
                                </div>
                                // **** End Ensure key ****
                            );
                        })}
                    </div>
                </>
            )}

            {/* Detail message - Show only when processing, not complete/error */}
            {detail && !isTerminalState && (
                <div className="text-xs text-blue-600 dark:text-blue-300 mt-2 text-center">
                    {detail}
                </div>
            )}
        </div>
    );
};

export default ProgressIndicator;