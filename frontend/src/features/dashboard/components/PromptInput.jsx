// frontend/src/features/dashboard/components/PromptInput.jsx
import React, { useState, useEffect } from 'react';
import Button from '../../../shared/ui/Button';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import {
  CircleStackIcon,
  UserGroupIcon,
  ChevronDownIcon,
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  TagIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';
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
    const [expanded, setExpanded] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'personal', or team name
    const [isFirstVisit, setIsFirstVisit] = useState(true);

    // Check if first visit and no selections made
    useEffect(() => {
        const hasVisitedBefore = localStorage.getItem('hasVisitedPromptInput');
        if (hasVisitedBefore) {
            setIsFirstVisit(false);
        } else if (selectedDatasetIds.length > 0) {
            // Once user selects datasets, mark as visited
            localStorage.setItem('hasVisitedPromptInput', 'true');
            setIsFirstVisit(false);
        }
    }, [selectedDatasetIds]);

    // Organize datasets into personal and team categories
    const groupedDatasets = datasets.reduce((acc, ds) => {
        if (ds.isTeamDataset && ds.teamName) {
            if (!acc.teamDatasets[ds.teamName]) {
                acc.teamDatasets[ds.teamName] = [];
            }
            acc.teamDatasets[ds.teamName].push(ds);
        } else {
            acc.personalDatasets.push(ds);
        }
        return acc;
    }, { personalDatasets: [], teamDatasets: {} });

    // Filter datasets based on search query and active filter
    const filteredDatasets = React.useMemo(() => {
        let result = [];

        // Apply team/personal filter
        if (activeFilter === 'all') {
            result = [
                ...groupedDatasets.personalDatasets,
                ...Object.values(groupedDatasets.teamDatasets).flat()
            ];
        } else if (activeFilter === 'personal') {
            result = [...groupedDatasets.personalDatasets];
        } else {
            // Filter by team name
            result = groupedDatasets.teamDatasets[activeFilter] || [];
        }

        // Apply search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(ds =>
                ds.name.toLowerCase().includes(query) ||
                (ds.originalFilename && ds.originalFilename.toLowerCase().includes(query))
            );
        }

        return result;
    }, [groupedDatasets, searchQuery, activeFilter]);

    // Get all team names for filter options
    const teamNames = Object.keys(groupedDatasets.teamDatasets);

    // Count selected datasets for badge
    const selectedCount = selectedDatasetIds.length;

    // Get names of selected datasets for display
    const selectedDatasetNames = datasets
        .filter(ds => selectedDatasetIds.includes(ds._id))
        .map(ds => ds.name);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!promptText.trim() || isLoading || selectedDatasetIds.length === 0) return;
        onSubmit(promptText);
        setPromptText('');
    };

    const handleDatasetToggle = (datasetId) => {
        setSelectedDatasetIds(prev =>
            prev.includes(datasetId)
                ? prev.filter(id => id !== datasetId)
                : [...prev, datasetId]
        );
    };

    const handleSelectAll = () => {
        if (filteredDatasets.length === 0) return;

        if (filteredDatasets.every(ds => selectedDatasetIds.includes(ds._id))) {
            // If all visible datasets are selected, deselect them
            setSelectedDatasetIds(prev =>
                prev.filter(id => !filteredDatasets.some(ds => ds._id === id))
            );
        } else {
            // Otherwise, select all visible datasets
            const newIds = filteredDatasets
                .filter(ds => !selectedDatasetIds.includes(ds._id))
                .map(ds => ds._id);

            setSelectedDatasetIds(prev => [...prev, ...newIds]);
        }
    };

    const clearAllSelections = () => {
        setSelectedDatasetIds([]);
    };

    // Automatically close dataset selector when clicking outside
    useEffect(() => {
        if (!expanded) return;

        const handleClickOutside = (event) => {
            const selectorElement = document.getElementById('dataset-selector');
            if (selectorElement && !selectorElement.contains(event.target)) {
                setExpanded(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [expanded]);

    // Helper to determine file type icon & color
    const getFileTypeInfo = (filename) => {
        if (!filename) return { icon: FolderIcon, color: 'text-blue-500' };

        const ext = filename.split('.').pop().toLowerCase();

        if (['csv', 'tsv'].includes(ext)) {
            return { icon: TagIcon, color: 'text-emerald-500' };
        } else if (['xls', 'xlsx'].includes(ext)) {
            return { icon: TagIcon, color: 'text-green-600' };
        } else if (['json'].includes(ext)) {
            return { icon: TagIcon, color: 'text-amber-500' };
        } else {
            return { icon: FolderIcon, color: 'text-blue-500' };
        }
    };

    return (
        <div className="relative">
            {/* Dataset Selection Dropdown */}
            {expanded && (
                <div
                    id="dataset-selector"
                    className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-10 transition-all duration-300 transform animate-fadeIn"
                    style={{ maxHeight: '400px' }}
                >
                    {/* Header with Search */}
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Select Datasets</h3>
                            <button
                                onClick={() => setExpanded(false)}
                                className="p-1 rounded-full text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Search input */}
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search datasets..."
                                className="w-full pl-10 pr-4 py-2 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 block rounded-md text-sm dark:bg-gray-700 dark:text-white"
                            />
                        </div>
                    </div>

                    {/* Filter tabs */}
                    <div className="border-b border-gray-200 dark:border-gray-700 px-2 pt-2 flex overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setActiveFilter('all')}
                            className={`px-3 py-2 text-sm font-medium rounded-t-lg mr-1 ${
                                activeFilter === 'all'
                                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setActiveFilter('personal')}
                            className={`px-3 py-2 text-sm font-medium rounded-t-lg mr-1 flex items-center ${
                                activeFilter === 'personal'
                                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            }`}
                        >
                            <CircleStackIcon className="h-4 w-4 mr-1" />
                            Personal
                        </button>
                        {teamNames.map(team => (
                            <button
                                key={team}
                                onClick={() => setActiveFilter(team)}
                                className={`px-3 py-2 text-sm font-medium rounded-t-lg mr-1 flex items-center whitespace-nowrap ${
                                    activeFilter === team
                                    ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                }`}
                            >
                                <UserGroupIcon className="h-4 w-4 mr-1" />
                                {team}
                            </button>
                        ))}
                    </div>

                    {/* Actions toolbar */}
                    <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/80 dark:bg-gray-800/50">
                        <div className="flex items-center">
                            <button
                                onClick={handleSelectAll}
                                disabled={filteredDatasets.length === 0}
                                className="text-xs py-1 px-2 rounded font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed mr-2"
                            >
                                {filteredDatasets.length > 0 && filteredDatasets.every(ds => selectedDatasetIds.includes(ds._id))
                                    ? 'Deselect All'
                                    : 'Select All'
                                }
                            </button>
                            {selectedDatasetIds.length > 0 && (
                                <button
                                    onClick={clearAllSelections}
                                    className="text-xs py-1 px-2 rounded font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                    Clear All
                                </button>
                            )}
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {selectedDatasetIds.length} selected
                        </span>
                    </div>

                    {/* Dataset List */}
                    <div className="overflow-y-auto" style={{ maxHeight: '250px' }}>
                        {datasetsLoading ? (
                            <div className="flex justify-center items-center p-8">
                                <Spinner size="md" className="text-blue-500" />
                            </div>
                        ) : filteredDatasets.length === 0 ? (
                            <div className="p-8 text-center">
                                <CircleStackIcon className="h-10 w-10 mx-auto text-gray-400 dark:text-gray-500 mb-2" />
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {datasets.length === 0
                                        ? "No datasets available. Upload some in your Account > Datasets."
                                        : "No datasets match your current filters."}
                                </p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredDatasets.map(dataset => {
                                    const { icon: FileIcon, color: iconColor } = getFileTypeInfo(dataset.originalFilename);
                                    const isSelected = selectedDatasetIds.includes(dataset._id);

                                    return (
                                        <li
                                            key={dataset._id}
                                            className={`${
                                                isSelected
                                                ? 'bg-blue-50 dark:bg-blue-900/20'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/80'
                                            }`}
                                        >
                                            <div className="relative flex items-center py-3 px-4">
                                                <div
                                                    className={`absolute inset-y-0 left-0 w-1 ${
                                                        isSelected ? 'bg-blue-500 dark:bg-blue-600' : 'bg-transparent'
                                                    }`}
                                                />

                                                <div className="min-w-0 flex-1 flex items-center">
                                                    <div className="flex-shrink-0 mr-3">
                                                        <div className={`h-9 w-9 rounded-md flex items-center justify-center ${
                                                            isSelected
                                                            ? 'bg-blue-100 dark:bg-blue-800/30'
                                                            : 'bg-gray-100 dark:bg-gray-800'
                                                        }`}>
                                                            <FileIcon className={`h-5 w-5 ${iconColor}`} />
                                                        </div>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center">
                                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                                {dataset.name}
                                                            </p>
                                                            {dataset.isTeamDataset && dataset.teamName && (
                                                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300">
                                                                    <UserGroupIcon className="h-3 w-3 mr-1" />
                                                                    {dataset.teamName}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                            {dataset.originalFilename || 'Unknown file'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div>
                                                    <button
                                                        onClick={() => handleDatasetToggle(dataset._id)}
                                                        className={`h-6 w-6 flex items-center justify-center rounded-full
                                                            ${isSelected
                                                            ? 'bg-blue-500 text-white'
                                                            : 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-transparent'}`}
                                                    >
                                                        {isSelected && <CheckIcon className="h-4 w-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* Main Prompt Input Area */}
            <div className="relative">
                <div className="flex flex-col space-y-2">
                    {/* Selected datasets chips - outside the input */}
                    {selectedDatasetIds.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-1">
                            {selectedDatasetNames.map((name, index) => (
                                <span
                                    key={index}
                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                >
                                    <CircleStackIcon className="h-3 w-3 mr-1" />
                                    {name}
                                    <button
                                        onClick={() => handleDatasetToggle(selectedDatasetIds[index])}
                                        className="ml-1 h-4 w-4 rounded-full flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-800"
                                    >
                                        <XMarkIcon className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Main input field with dataset selector button */}
                    <form onSubmit={handleSubmit} className="relative">
                        <div className="flex items-center bg-white dark:bg-gray-800 overflow-hidden rounded-xl shadow-md border border-gray-200 dark:border-gray-700 focus-within:border-blue-300 dark:focus-within:border-blue-700 transition-all">
                            {/* Dataset selector button with pulsing animation for first-time users */}
                            <button
                                type="button"
                                onClick={() => setExpanded(!expanded)}
                                className={`relative flex items-center justify-center h-10 w-10 ml-1 rounded-lg transition-colors ${
                                    selectedDatasetIds.length > 0
                                    ? 'text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                                    : isFirstVisit
                                      ? 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 animate-pulse'
                                      : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                                title="Click to select datasets"
                            >
                                <CircleStackIcon className="h-5 w-5" />
                                {selectedCount > 0 && (
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-medium text-white">
                                        {selectedCount}
                                    </span>
                                )}
                            </button>

                            {/* Text Input */}
                            <textarea
                                rows={1}
                                value={promptText}
                                onChange={(e) => setPromptText(e.target.value)}
                                placeholder={selectedDatasetIds.length > 0
                                    ? "Ask about your selected data..."
                                    : selectedDatasetIds.length === 0 && !isFirstVisit
                                      ? "Click the database icon to select datasets first"
                                      : "Step 1: Click the database icon to select datasets"}
                                disabled={isLoading}
                                className="block w-full px-3 py-3 border-0 bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-0 sm:text-sm sm:leading-6 flex-grow outline-none resize-none"
                                style={{ maxHeight: '100px', overflowY: 'auto' }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit(e);
                                    }
                                }}
                            />

                            {/* Submit Button with guided text when nothing selected */}
                            {selectedDatasetIds.length === 0 ? (
                                <div className="flex items-center mr-4 text-sm text-gray-400 dark:text-gray-500">
                                    <ArrowLeftIcon className="h-4 w-4 mr-1 animate-pulse" />
                                    Select
                                </div>
                            ) : (
                                <div className="h-10 w-10 flex items-center justify-center mr-1">
                                    <button
                                        type="submit"
                                        disabled={isLoading || !promptText.trim() || selectedDatasetIds.length === 0}
                                        className={`flex items-center justify-center h-9 w-9 rounded-lg transition-all duration-150 transform ${
                                            isLoading || !promptText.trim() || selectedDatasetIds.length === 0
                                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                            : 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700 active:scale-95 shadow-md hover:shadow-lg'
                                        }`}
                                    >
                                        {isLoading ? (
                                            <Spinner size="sm" color="text-current" />
                                        ) : (
                                            <PaperAirplaneIcon className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Clearer guidance message when no datasets selected */}
                        {promptText.trim() && selectedDatasetIds.length === 0 && !datasetsLoading && datasets.length > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 ml-2 mt-1 font-medium">
                                ⚠️ Please select at least one dataset using the database icon first
                            </p>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
};

export default PromptInput;