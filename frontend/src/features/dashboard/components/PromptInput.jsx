// frontend/src/features/dashboard/components/PromptInput.jsx
// ** NEW FILE **
import React, { useState } from 'react';
import Button from '../../../shared/ui/Button';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid'; // Solid icon for send
import Spinner from '../../../shared/ui/Spinner'; // Import Spinner for dataset loading

const PromptInput = ({
    onSubmit,
    isLoading,
    datasets = [],
    datasetsLoading,
    selectedDatasetIds,
    setSelectedDatasetIds
}) => {
    const [promptText, setPromptText] = useState('');

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

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
             {/* Dataset Selection Area */}
            <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50 max-h-32 overflow-y-auto">
                 <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Select Datasets for Context:</label>
                 {datasetsLoading ? (
                     <div className="flex justify-center items-center h-10"> <Spinner size="sm" /> </div>
                 ) : datasets.length === 0 ? (
                     <p className="text-xs text-gray-400 dark:text-gray-500">No datasets uploaded yet. Upload in Account > Datasets.</p>
                 ) : (
                     <div className="space-y-1.5">
                         {datasets.map((ds) => (
                             <div key={ds._id} className="flex items-center">
                                 <input
                                     id={`dataset-${ds._id}`}
                                     name="selectedDatasets"
                                     type="checkbox"
                                     checked={selectedDatasetIds.includes(ds._id)}
                                     onChange={() => handleDatasetToggle(ds._id)}
                                     className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:checked:bg-blue-500 cursor-pointer"
                                 />
                                 <label htmlFor={`dataset-${ds._id}`} className="ml-2 block text-xs font-normal text-gray-700 dark:text-gray-300 cursor-pointer truncate" title={ds.name}>
                                     {ds.name}
                                 </label>
                             </div>
                         ))}
                     </div>
                 )}
            </div>


             {/* Prompt Text Area */}
            <div className="flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 dark:bg-gray-800">
                <textarea
                    rows={1} // Start with 1 row, auto-expand
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    placeholder="Ask about your selected data..."
                    disabled={isLoading}
                    className="block w-full resize-none border-0 bg-transparent py-1.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-0 sm:text-sm sm:leading-6 flex-grow outline-none"
                    style={{ maxHeight: '100px', overflowY: 'auto' }} // Limit height and allow scroll
                     onKeyDown={(e) => {
                        // Submit on Enter unless Shift is pressed
                         if (e.key === 'Enter' && !e.shiftKey) {
                             e.preventDefault();
                             handleSubmit(e);
                         }
                     }}
                />
                 <div className="flex-shrink-0">
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm" // Smaller button
                        disabled={isLoading || !promptText.trim() || selectedDatasetIds.length === 0}
                        isLoading={isLoading}
                        className="p-2 rounded-full" // Make it round
                        aria-label="Send prompt"
                    >
                         <PaperAirplaneIcon className="h-5 w-5" />
                    </Button>
                </div>
            </div>
        </form>
    );
};

export default PromptInput;