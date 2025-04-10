import { useChat } from '../context/ChatContext';
import React, { useEffect } from 'react';
import { FiPlus } from 'react-icons/fi';
import ChatSessionItem from './ChatSessionItem';

/**
 * Component that displays the list of chat sessions and allows creating new ones
 */
const ChatSessionList = () => {
  const {
    chatSessions,
    currentSession,
    setCurrentSession,
    loadSessions,
    isLoadingSessions,
    createNewSession,
    error
  } = useChat();
  
  // Load sessions when component mounts
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);
  
  // Handle creating a new chat session
  const handleCreateNewSession = async () => {
    try {
      await createNewSession();
    } catch (error) {
      console.error('Error creating new chat session:', error);
    }
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Header with New Chat button */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Chats</h2>
        <button
          onClick={handleCreateNewSession}
          className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
          title="New Chat"
          disabled={isLoadingSessions}
        >
          <FiPlus size={18} />
        </button>
      </div>
      
      {/* Chat session list */}
      <div className="overflow-y-auto flex-1">
        {isLoadingSessions ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">Loading...</div>
        ) : error ? (
          <div className="p-4 text-center text-red-500 dark:text-red-400">{error}</div>
        ) : chatSessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            No chat sessions yet. Create one to get started!
          </div>
        ) : (
          chatSessions.map((session) => (
            <ChatSessionItem
              key={session._id}
              session={session}
              isActive={currentSession && currentSession._id === session._id}
              onClick={() => setCurrentSession(session)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ChatSessionList; 