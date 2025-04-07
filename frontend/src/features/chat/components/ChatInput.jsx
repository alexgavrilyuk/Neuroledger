import React, { useState, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import { useDatasets } from '../../dataset_management/hooks/useDatasets';
import Spinner from '../../../shared/ui/Spinner';

/**
 * Input component for sending messages in a chat session
 */
const ChatInput = ({ datasetSelectEnabled = true }) => {
  const [promptText, setPromptText] = useState('');
  const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);
  const { datasets, isLoading: datasetsLoading, error: datasetsError } = useDatasets();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { currentSession, messages, sendMessage, updateCurrentSessionData } = useChat();
  
  // Determine if dataset selection should be locked
  // Locked if the session exists and already has associated datasets
  const isDatasetSelectionLocked = !!currentSession?.associatedDatasetIds?.length;
  
  // Determine if this is the first message being sent
  const isFirstMessage = messages.length === 0 && !!currentSession;

  // When selection becomes locked, update local selection state
  useEffect(() => {
    if (isDatasetSelectionLocked) {
      setSelectedDatasetIds(currentSession.associatedDatasetIds);
    }
  }, [isDatasetSelectionLocked, currentSession?.associatedDatasetIds]);
  
  // Handle submitting a new message
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!promptText.trim() || !currentSession || isSubmitting) {
      return;
    }
    
    // Enforce dataset selection for the first message
    if (isFirstMessage && selectedDatasetIds.length === 0) {
      alert('Please select at least one dataset for the first message.'); // Simple alert for now
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Pass selectedDatasetIds only if it's the first message
      const datasetIdsToSend = isFirstMessage ? selectedDatasetIds : [];
      const result = await sendMessage(promptText, datasetIdsToSend);
      
      // If it was the first message and successful, update the session in context
      if (isFirstMessage && result?.updatedSession && updateCurrentSessionData) {
        updateCurrentSessionData(result.updatedSession);
      }
      
      setPromptText('');
      // Don't clear selectedDatasetIds here, rely on lock effect
    } catch (error) {
      console.error('Error sending message:', error);
      alert(`Error sending message: ${error.message}`); // Show error to user
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle dataset selection - only allow if not locked
  const handleDatasetToggle = (datasetId) => {
    if (isDatasetSelectionLocked) return; // Do nothing if locked
    
    setSelectedDatasetIds(prev => 
      prev.includes(datasetId)
        ? prev.filter(id => id !== datasetId) 
        : [...prev, datasetId]
    );
  };
  
  const getDatasetName = (id) => {
      const dataset = datasets.find(d => d._id === id);
      return dataset ? dataset.name : 'Unknown Dataset';
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      {datasetSelectEnabled && (
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {isDatasetSelectionLocked ? 'Datasets in this Session:' : 'Select Datasets (Required for first message)'}
          </label>
          
          {isDatasetSelectionLocked ? (
            // Display locked datasets
            <div className="flex flex-wrap gap-2">
              {currentSession.associatedDatasetIds.map(id => (
                <span key={id} className="px-3 py-1 text-sm rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  {getDatasetName(id)}
                </span>
              ))}
            </div>
          ) : (
            // Display selectable datasets
            <div className="flex flex-wrap gap-2">
              {datasetsLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <Spinner size="sm" className="inline mr-2" /> Loading datasets...
                </div>
              ) : datasetsError ? (
                <div className="text-sm text-red-500">
                  Error loading datasets: {datasetsError}
                </div>
              ) : datasets.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  No datasets available. Upload some in Account &gt; Datasets.
                </div>
              ) : (
                datasets.map(dataset => (
                  <button
                    key={dataset._id}
                    type="button"
                    onClick={() => handleDatasetToggle(dataset._id)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors ${
                      selectedDatasetIds.includes(dataset._id)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {dataset.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex items-end">
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder={isDatasetSelectionLocked ? "Ask about the session datasets..." : "Select datasets and type your first message..."}
          className="flex-1 resize-none border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
        />
        <button
          type="submit"
          disabled={
              !promptText.trim() || 
              isSubmitting || 
              !currentSession || 
              (isFirstMessage && selectedDatasetIds.length === 0)
          }
          className="ml-2 px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          title={isFirstMessage && selectedDatasetIds.length === 0 ? "Select dataset(s) first" : "Send message"}
        >
          {isSubmitting ? <Spinner size="sm" color="text-white" /> : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default ChatInput; 