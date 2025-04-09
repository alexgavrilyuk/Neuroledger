import React, { useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useChat } from '../context/ChatContext';
import { PencilIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Displays a single chat session item in the session list
 */
const ChatSessionItem = ({ session, isActive, onClick }) => {
  const { updateChatSessionTitle, deleteChatSession } = useChat();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(session.title);
  const [isHovered, setIsHovered] = useState(false);
  
  // Format the session's updated timestamp
  const formattedTime = session.lastActivityAt
    ? formatDistanceToNow(new Date(session.lastActivityAt), { addSuffix: true })
    : 'unknown time';
  
  // Handle deleting the session
  const handleDelete = useCallback((e) => {
    e.stopPropagation(); // Prevent triggering the parent onClick
    if (window.confirm('Are you sure you want to delete this chat session?')) {
      deleteChatSession(session._id).catch(err => {
        console.error("Failed to delete session:", err);
        // Optionally show an error message to the user
      });
    }
  }, [deleteChatSession, session._id]);
  
  // Handle starting the rename process
  const handleStartRename = useCallback((e) => {
    e.stopPropagation();
    setNewTitle(session.title); // Reset title on starting rename
    setIsRenaming(true);
  }, [session.title]);
  
  // Handle cancelling the rename process
  const handleCancelRename = useCallback((e) => {
    e.stopPropagation();
    setIsRenaming(false);
  }, []);
  
  // Handle saving the new title
  const handleSaveRename = useCallback(async (e) => {
    e.stopPropagation();
    if (newTitle.trim() && newTitle !== session.title) {
      try {
        await updateChatSessionTitle(session._id, newTitle.trim());
        setIsRenaming(false);
      } catch (err) {
        console.error("Failed to rename session:", err);
        // Optionally show an error message to the user
      }
    } else {
      setIsRenaming(false); // If title is empty or unchanged, just cancel
    }
  }, [newTitle, session._id, session.title, updateChatSessionTitle]);
  
  // Allow saving with Enter key
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveRename(e);
    } else if (e.key === 'Escape') {
      handleCancelRename(e);
    }
  };
  
  return (
    <li
      className={`cursor-pointer group ${
        isActive ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
      onClick={() => !isRenaming && onClick()} // Prevent click when renaming
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between p-3">
        <div className="flex-1 min-w-0 mr-2">
          {isRenaming ? (
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
              onClick={(e) => e.stopPropagation()} // Prevent click propagation on input
            />
          ) : (
            <p className={`text-sm font-medium truncate ${
              isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-white'
            }`}>
              {session.title}
            </p>
          )}
          {!isRenaming && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formattedTime}
            </p>
          )}
        </div>
        
        <div className={`flex items-center space-x-1 transition-opacity duration-150 ${
          isHovered || isRenaming || isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          {isRenaming ? (
            <>
              <button
                onClick={handleSaveRename}
                className="p-1 text-green-500 hover:text-green-700 dark:hover:text-green-400"
                aria-label="Save title"
              >
                <CheckIcon className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancelRename}
                className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400"
                aria-label="Cancel rename"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartRename}
                className="p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400"
                aria-label="Rename chat session"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
              <button
                onClick={handleDelete}
                className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                aria-label="Delete chat session"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
};

export default ChatSessionItem; 