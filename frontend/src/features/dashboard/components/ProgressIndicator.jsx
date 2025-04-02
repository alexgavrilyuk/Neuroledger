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
    ExclamationCircleIcon
} from '@heroicons/react/24/outline';

const ProgressIndicator = ({ stage, detail }) => {
    // Define the steps in the process
    const steps = [
        { id: PROCESSING_STAGES.GENERATING_CODE, label: 'Generating Analysis', icon: CodeBracketIcon },
        { id: PROCESSING_STAGES.FETCHING_DATA, label: 'Fetching Data', icon: DocumentTextIcon },
        { id: PROCESSING_STAGES.PROCESSING_DATA, label: 'Processing Data', icon: ArrowPathIcon },
        { id: PROCESSING_STAGES.ANALYZING_DATA, label: 'Analyzing', icon: ChartBarIcon },
        { id: PROCESSING_STAGES.CREATING_VISUALS, label: 'Creating Visualizations', icon: ChartBarIcon },
        { id: PROCESSING_STAGES.FINALIZING_REPORT, label: 'Finalizing Report', icon: DocumentChartBarIcon },
    ];

    // Determine the current step index
    const currentStepIndex = steps.findIndex(step => step.id === stage);

    // If error or waiting, don't show the progress indicator
    if (stage === PROCESSING_STAGES.ERROR || stage === PROCESSING_STAGES.WAITING) {
        return null;
    }

    // Determine if process is complete
    const isComplete = stage === PROCESSING_STAGES.COMPLETE;

    return (
        <div className="mb-4 p-2 sm:p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1 flex items-center">
                {isComplete ? (
                    <>
                        <CheckCircleIcon className="h-5 w-5 mr-2 text-green-500 dark:text-green-400" />
                        Report Generation Complete
                    </>
                ) : (
                    <>
                        <Spinner size="sm" className="mr-2" />
                        Generating Report
                    </>
                )}
            </div>

            {/* Step indicator */}
            <div className="relative">
                <div className="overflow-hidden h-2 text-xs flex rounded bg-blue-200 dark:bg-blue-800/50">
                    <div
                        style={{
                            width: `${isComplete ? 100 : Math.min(100, (currentStepIndex / (steps.length - 1)) * 100)}%`
                        }}
                        className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${
                            isComplete ? 'bg-green-500 dark:bg-green-400' : 'bg-blue-500 dark:bg-blue-400'
                        }`}>
                    </div>
                </div>
            </div>

            {/* Step markers */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 mt-3">
                {steps.map((step, index) => {
                    const Icon = step.icon;

                    // Determine state: active, completed, or pending
                    const isActive = step.id === stage;
                    const isCompleted = isComplete || currentStepIndex > index;

                    // Generate appropriate classes
                    let iconClass = "h-5 w-5 mx-auto";
                    let textClass = "text-xs text-center mt-1";

                    if (isActive) {
                        iconClass += " text-blue-600 dark:text-blue-400";
                        textClass += " font-semibold text-blue-600 dark:text-blue-400";
                    } else if (isCompleted) {
                        iconClass += " text-green-500 dark:text-green-400";
                        textClass += " text-gray-500 dark:text-gray-400";
                    } else {
                        iconClass += " text-gray-400 dark:text-gray-600";
                        textClass += " text-gray-400 dark:text-gray-600";
                    }

                    return (
                        <div key={step.id} className="flex flex-col items-center">
                            <div className="relative">
                                {isCompleted && !isActive ? (
                                    <CheckCircleIcon className={iconClass} />
                                ) : (
                                    <Icon className={iconClass} />
                                )}
                            </div>
                            <div className={textClass}>{step.label}</div>
                        </div>
                    );
                })}
            </div>

            {/* Detail message */}
            {detail && (
                <div className="text-xs text-blue-600 dark:text-blue-300 mt-2 text-center">
                    {detail}
                </div>
            )}
        </div>
    );
};

export default ProgressIndicator;