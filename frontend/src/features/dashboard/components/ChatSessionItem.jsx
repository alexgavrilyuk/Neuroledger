import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';
import { formatDistanceToNow } from 'date-fns';
import { HiOutlinePencil, HiOutlineTrash, HiOutlineCheck } from 'react-icons/hi';
import { MdCancel } from 'react-icons/md';

/**
 * Component for displaying a single chat session in the sidebar list
 * Supports selection, renaming, and deletion
 */
const ChatSessionItem = ({ session, isActive, onClick }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState(session.title);
  const [isDeleting, setIsDeleting] = useState(false);
  const { updateChatSessionTitle, deleteChatSession } = useChat();

  // Format the last activity time to a relative string (e.g., "2 hours ago")
  // Add safety check for invalid date
  let formattedTime = "Unknown time";
  try {
    if (session.lastActivityAt) {
      const date = new Date(session.lastActivityAt);
      if (!isNaN(date.getTime())) {
        formattedTime = formatDistanceToNow(date, {
          addSuffix: true,
          includeSeconds: true
        });
      } else {
        formattedTime = "Invalid date";
      }
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    formattedTime = "Date error";
  }

  // Handle saving the edited title
  const handleSaveTitle = async (e) => {
    e.stopPropagation();
    if (newTitle.trim() !== session.title) {
      try {
        await updateChatSessionTitle(session._id, newTitle.trim());
      } catch (error) {
        console.error('Error updating session title:', error);
        // Revert to original title on error
        setNewTitle(session.title);
      }
    }
    setIsEditing(false);
  };

  // Handle canceling the edit mode
  const handleCancelEdit = (e) => {
    e.stopPropagation();
    setNewTitle(session.title);
    setIsEditing(false);
  };

  // Handle deleting the session
  const handleDelete = async (e) => {
    e.stopPropagation();
    if (isDeleting) {
      try {
        await deleteChatSession(session._id);
      } catch (error) {
        console.error('Error deleting session:', error);
        setIsDeleting(false);
      }
    } else {
      setIsDeleting(true);
    }
  };

  // Cancel delete confirmation
  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setIsDeleting(false);
  };

  return (
    <div
      className={`relative px-4 py-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer group 
                ${isActive ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
      onClick={onClick}
    >
      {/* Session content */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-full p-1 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          ) : (
            <>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {session.title}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formattedTime}
              </p>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className={`flex items-center space-x-1 ${isActive || isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
          {isEditing ? (
            <>
              <button
                onClick={handleSaveTitle}
                className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                title="Save"
              >
                <HiOutlineCheck size={18} />
              </button>
              <button
                onClick={handleCancelEdit}
                className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Cancel"
              >
                <MdCancel size={18} />
              </button>
            </>
          ) : isDeleting ? (
            <>
              <button
                onClick={handleDelete}
                className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                title="Confirm Delete"
              >
                <HiOutlineCheck size={18} />
              </button>
              <button
                onClick={handleCancelDelete}
                className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Cancel"
              >
                <MdCancel size={18} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Edit Title"
              >
                <HiOutlinePencil size={18} />
              </button>
              <button
                onClick={handleDelete}
                className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Delete Session"
              >
                <HiOutlineTrash size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatSessionItem; 