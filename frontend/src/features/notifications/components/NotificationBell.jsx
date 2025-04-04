// frontend/src/features/notifications/components/NotificationBell.jsx
import React, { useState } from 'react';
import { BellIcon, BellAlertIcon } from '@heroicons/react/24/outline';
import { useNotifications } from '../hooks/useNotifications';
import NotificationList from './NotificationList';

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount, markAsRead } = useNotifications();

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  // Mark all as read when opening the notifications
  const handleToggle = () => {
    if (!isOpen && unreadCount > 0) {
      markAsRead();
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150"
        aria-label="View notifications"
      >
        {unreadCount > 0 ? (
          <>
            <BellAlertIcon className="h-6 w-6" aria-hidden="true" />
            <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-gray-900 animate-pulse"></span>
            {unreadCount > 1 && (
              <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-medium text-white ring-1 ring-white dark:ring-gray-900">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </>
        ) : (
          <BellIcon className="h-6 w-6" aria-hidden="true" />
        )}
      </button>

      {isOpen && <NotificationList onClose={handleClose} />}
    </div>
  );
};

export default NotificationBell;