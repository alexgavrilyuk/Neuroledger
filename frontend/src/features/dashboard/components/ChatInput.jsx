import { useChat } from '../context/ChatContext';
import React, { useState, useRef, useEffect } from 'react';
import { IoMdSend } from 'react-icons/io';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { useDatasets } from '../../dataset_management/hooks/useDatasets';

/**
 * Component for input area in chat interface, including dataset selection
 */
const ChatInput = () => {
  const { currentSession, messages, sendMessage, updateCurrentSessionData } = useChat();
  const [promptText, setPromptText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);
  const textareaRef = useRef(null);
  
  // Get datasets for selection dropdown
  const { datasets, isLoading: datasetsLoading, error: datasetsError } = useDatasets();
  
  // Set initial dataset selection based on currentSession's associatedDatasetIds
  useEffect(() => {
    if (currentSession?.associatedDatasetIds?.length > 0) {
      setSelectedDatasetIds(currentSession.associatedDatasetIds);
    }
  }, [currentSession]);
  
  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [promptText]);
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!promptText.trim()) return;
    if (!currentSession) return;
    
    // For the first message, we need to make sure datasets are selected
    if (messages.length === 0 && selectedDatasetIds.length === 0) {
      // Show some error or notification about needing to select datasets
      console.error('Please select at least one dataset for context');
      return;
    }
    
    try {
      // Send message with selected dataset IDs (only needed for first message)
      await sendMessage(promptText, selectedDatasetIds);
      setPromptText('');
      setIsExpanded(false);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };
  
  // Handle dataset selection
  const handleDatasetSelect = (datasetId) => {
    setSelectedDatasetIds(prev => {
      if (prev.includes(datasetId)) {
        return prev.filter(id => id !== datasetId);
      } else {
        return [...prev, datasetId];
      }
    });
  };
  
  // Check if dataset selection should be disabled (after first message sent)
  const isDatasetSelectionDisabled = messages.length > 0;
  
  return (
    <div className="border rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm transition-all">
      {/* Dataset selection panel (collapsible) */}
      {isExpanded && (
        <div className="p-3 border-b dark:border-gray-700">
          <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Select Datasets for Context {isDatasetSelectionDisabled && '(Locked)'}
          </div>
          
          {datasetsLoading ? (
            <div className="text-sm text-gray-500">Loading datasets...</div>
          ) : datasetsError ? (
            <div className="text-sm text-red-500">Error loading datasets</div>
          ) : datasets?.length === 0 ? (
            <div className="text-sm text-gray-500">No datasets available</div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              {datasets.map(dataset => (
                <div key={dataset._id} className="flex items-start">
                  <input
                    type="checkbox"
                    id={`dataset-${dataset._id}`}
                    checked={selectedDatasetIds.includes(dataset._id)}
                    onChange={() => handleDatasetSelect(dataset._id)}
                    disabled={isDatasetSelectionDisabled}
                    className="mt-1 mr-2"
                  />
                  <label
                    htmlFor={`dataset-${dataset._id}`}
                    className={`text-sm cursor-pointer ${
                      isDatasetSelectionDisabled ? 'text-gray-500 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {dataset.name || dataset.originalFilename}
                    {dataset.isTeamDataset && (
                      <span className="text-xs text-blue-500 dark:text-blue-400 ml-1">
                        (Team: {dataset.teamName})
                      </span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-2 flex items-end">
        <div className="flex-1 relative">
          {/* Toggle button for dataset selection */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="absolute top-2 left-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            title={isExpanded ? "Hide dataset selection" : "Show dataset selection"}
          >
            {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
          </button>
          
          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              // Submit on Enter (without Shift)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Type your message..."
            className="w-full border-0 focus:ring-0 resize-none px-8 py-2 max-h-32 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
            rows={1}
          />
        </div>
        
        {/* Send button */}
        <button
          type="submit"
          disabled={!promptText.trim()}
          className={`ml-2 p-2 rounded-full ${
            promptText.trim()
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          <IoMdSend size={20} />
        </button>
      </form>
    </div>
  );
};

export default ChatInput; 