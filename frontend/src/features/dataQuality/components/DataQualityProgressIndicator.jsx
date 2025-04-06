// frontend/src/features/dataQuality/components/DataQualityProgressIndicator.jsx
import React from 'react';
import Spinner from '../../../shared/ui/Spinner';
import { ClockIcon, MagnifyingGlassIcon, BeakerIcon, DocumentChartBarIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

const DataQualityProgressIndicator = ({ status, elapsedTimeSeconds }) => {
  // Define the stages of the quality audit process
  const stages = [
    { id: 'init', name: 'Initializing', icon: ClockIcon },
    { id: 'analyze', name: 'Analyzing Data Structure', icon: MagnifyingGlassIcon },
    { id: 'interpret', name: 'AI Interpretation', icon: BeakerIcon },
    { id: 'report', name: 'Generating Report', icon: DocumentChartBarIcon },
    { id: 'complete', name: 'Completing Audit', icon: DocumentTextIcon }
  ];

  // Determine current stage based on elapsed time
  // This is an approximation since we don't have real-time stage updates
  const getCurrentStage = () => {
    if (!elapsedTimeSeconds) return 'init';
    if (elapsedTimeSeconds < 10) return 'init';
    if (elapsedTimeSeconds < 30) return 'analyze';
    if (elapsedTimeSeconds < 60) return 'interpret';
    if (elapsedTimeSeconds < 90) return 'report';
    return 'complete';
  };

  const currentStage = getCurrentStage();

  // Format elapsed time
  const formatElapsedTime = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (status !== 'processing') {
    return null;
  }

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 animate-pulse-subtle">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Spinner size="sm" color="text-blue-500 dark:text-blue-400" />
            <span className="ml-2 text-sm font-medium text-blue-700 dark:text-blue-300">
              Quality Audit in Progress
            </span>
          </div>
          <span className="text-xs font-medium text-blue-500 dark:text-blue-400">
            {formatElapsedTime(elapsedTimeSeconds)}
          </span>
        </div>

        <div className="space-y-3">
          {stages.map((stage, index) => {
            const StageIcon = stage.icon;
            const isCurrentStage = stage.id === currentStage;
            const isPastStage = stages.findIndex(s => s.id === currentStage) > index;

            return (
              <div
                key={stage.id}
                className={`flex items-center space-x-3 ${
                  isCurrentStage
                    ? 'text-blue-700 dark:text-blue-300'
                    : isPastStage
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                <div className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${
                  isCurrentStage
                    ? 'bg-blue-100 dark:bg-blue-800/50 animate-pulse'
                    : isPastStage
                      ? 'bg-green-100 dark:bg-green-800/50'
                      : 'bg-gray-100 dark:bg-gray-800/30'
                }`}>
                  <StageIcon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">
                  {stage.name}
                </span>
                {isCurrentStage && (
                  <span className="flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-800/50">
                    In Progress
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          This process typically takes 1-3 minutes depending on dataset size. You can leave this page and come back later.
        </p>
      </div>
    </div>
  );
};

export default DataQualityProgressIndicator;