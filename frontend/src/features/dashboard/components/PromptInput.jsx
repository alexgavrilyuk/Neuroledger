// frontend/src/features/dashboard/components/PromptInput.jsx
import React, { useState } from 'react';
import Button from '../../../shared/ui/Button';
import { PaperAirplaneIcon, PlusCircleIcon } from '@heroicons/react/24/solid';
import { CircleStackIcon } from '@heroicons/react/24/outline';
import Spinner from '../../../shared/ui/Spinner';

const PromptInput = ({
    onSubmit,
    isLoading,
    datasets = [],
    datasetsLoading,
    selectedDatasetIds,
    setSelectedDatasetIds
}) => {
    const [promptText, setPromptText] = useState('');
    const [expanded, setExpanded] = useState(true); // Track if dataset selection area is expanded

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!promptText.trim() || isLoading) return;
        onSubmit(promptText);
        setPromptText(''); // Clear input after submit
    };

    const handleDatasetToggle = (datasetId) => {
        setSelectedDatasetIds((prevSelected) =>
            prevSelected.includes(datasetId)
                ? prevSelected.filter((id) => id !== datasetId)
                : [...prevSelected, datasetId]
        );
    };

    // Function to toggle dataset selection area visibility
    const toggleExpanded = () => {
        setExpanded(!expanded);
    };

    // Count selected datasets for badge
    const selectedCount = selectedDatasetIds.length;

    return (
        <form onSubmit={handleSubmit} className="space-y-3 transition-all duration-300">
            {/* Dataset Selection Area - Enhanced with animations and better styling */}
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${expanded ? 'max-h-36' : 'max-h-0 opacity-0 mb-0'}`}>
                <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-subtle-light dark:bg-gradient-subtle-dark shadow-soft-sm dark:shadow-soft-dark-sm">
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                            Select Datasets for Context:
                        </label>
                    </div>

                    {datasetsLoading ? (
                        <div className="flex justify-center items-center h-12 py-2">
                            <Spinner size="sm" variant="circle" />
                        </div>
                    ) : datasets.length === 0 ? (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-md p-2.5 text-center">
                            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                                No datasets uploaded yet. Upload in Account &gt; Datasets.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-20 overflow-y-auto custom-scrollbar pr-1">
                            {datasets.map((ds) => (
                                <div
                                    key={ds._id}
                                    className={`
                                        flex items-center px-2.5 py-1.5 rounded-md border transition-all duration-200
                                        ${selectedDatasetIds.includes(ds._id)
                                            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/50 shadow-soft-sm'
                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }
                                    `}
                                >
                                    <input
                                        id={`dataset-${ds._id}`}
                                        name="selectedDatasets"
                                        type="checkbox"
                                        checked={selectedDatasetIds.includes(ds._id)}
                                        onChange={() => handleDatasetToggle(ds._id)}
                                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:checked:bg-blue-500 cursor-pointer"
                                    />
                                    <label
                                        htmlFor={`dataset-${ds._id}`}
                                        className={`
                                            ml-2 block text-xs font-medium truncate cursor-pointer transition-colors duration-200
                                            ${selectedDatasetIds.includes(ds._id)
                                                ? 'text-blue-700 dark:text-blue-300'
                                                : 'text-gray-700 dark:text-gray-300'
                                            }
                                        `}
                                        title={ds.name}
                                    >
                                        {ds.name}
                                    </label>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Prompt Text Area - Enhanced with better styling and animations */}
            <div className="flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-soft-md dark:shadow-soft-dark-md focus-within:shadow-soft-lg dark:focus-within:shadow-soft-dark-lg focus-within:border-blue-300 dark:focus-within:border-blue-700/50 transition-all duration-200">
                {/* Toggle dataset selection button with counter badge */}
                <button
                    type="button"
                    onClick={toggleExpanded}
                    className={`
                        relative flex-shrink-0 p-1.5 rounded-full transition-colors duration-200
                        ${expanded
                            ? 'text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                            : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }
                    `}
                    title={expanded ? "Hide dataset selection" : "Show dataset selection"}
                >
                    <CircleStackIcon className="h-5 w-5" />

                    {/* Badge counter */}
                    {selectedCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-medium text-white ring-1 ring-white dark:ring-gray-800">
                            {selectedCount}
                        </span>
                    )}
                </button>

                {/* Textarea with enhanced styling */}
                <textarea
                    rows={1}
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    placeholder="Ask about your selected data..."
                    disabled={isLoading}
                    className="block w-full resize-none border-0 bg-transparent py-1.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-0 sm:text-sm sm:leading-6 flex-grow outline-none transition-colors duration-200"
                    style={{ maxHeight: '100px', overflowY: 'auto' }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                    }}
                />

                {/* Submit button with animation effects */}
                <div className="flex-shrink-0">
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={isLoading || !promptText.trim() || selectedDatasetIds.length === 0}
                        isLoading={isLoading}
                        className="p-2 rounded-full shadow-soft-md hover:shadow-soft-lg transform hover:scale-105 active:scale-95 transition-all duration-200"
                        aria-label="Send prompt"
                    >
                        <PaperAirplaneIcon className="h-5 w-5" />
                    </Button>
                </div>
            </div>

            {/* Helper text - Shown when no datasets are selected */}
            {promptText.trim() && selectedDatasetIds.length === 0 && !datasetsLoading && datasets.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 ml-2 animate-fadeIn">
                    Please select at least one dataset before sending your prompt
                </p>
            )}
        </form>
    );
};

export default PromptInput;