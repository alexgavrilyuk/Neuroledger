import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useChat } from '../context/ChatContext';

/**
 * Displays a single chat session item in the session list
 */
const ChatSessionItem = ({ session, isActive, onClick }) => {
  const { deleteSession } = useChat();
  
  // Format the session's updated timestamp
  const formattedTime = session.updatedAt 
    ? formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })
    : 'unknown time';
  
  // Handle deleting the session
  const handleDelete = (e) => {
    e.stopPropagation(); // Prevent triggering the parent onClick
    if (window.confirm('Are you sure you want to delete this chat session?')) {
      deleteSession(session._id);
    }
  };
  
  return (
    <li
      className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
        isActive ? 'bg-blue-50 dark:bg-blue-900/30' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex justify-between p-4">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${
            isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-white'
          }`}>
            {session.title}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formattedTime}
          </p>
        </div>
        
        <div className="flex items-start ml-2">
          <button
            onClick={handleDelete}
            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
            aria-label="Delete chat session"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
};

export default ChatSessionItem; 