// frontend/src/features/notifications/components/NotificationList.jsx
import React, { useRef, useEffect } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import Spinner from '../../../shared/ui/Spinner';
import {
  UserGroupIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  XMarkIcon,
  UserPlusIcon,
  UserMinusIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { format, formatDistanceToNow } from 'date-fns';

const NotificationList = ({ onClose }) => {
  const { notifications, isLoading, error, fetchMore } = useNotifications();
  const notifRef = useRef(null);

  // Close when clicking outside of notification panel
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Icon mapping for different notification types
  const getIcon = (type) => {
    switch (type) {
      case 'team_invite':
        return <EnvelopeIcon className="h-5 w-5 text-blue-500" />;
      case 'team_join':
        return <UserPlusIcon className="h-5 w-5 text-green-500" />;
      case 'team_role_change':
        return <ShieldCheckIcon className="h-5 w-5 text-purple-500" />;
      case 'system':
        return <UserMinusIcon className="h-5 w-5 text-gray-500" />;
      default:
        return <CheckCircleIcon className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div
      ref={notifRef}
      className="absolute right-0 z-10 mt-2 w-80 origin-top-right rounded-md bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none animate-fadeIn"
    >
      <div className="py-1">
        {/* Header */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Notifications</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Loading state */}
        {isLoading && notifications.length === 0 && (
          <div className="px-4 py-8 text-center">
            <Spinner size="md" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="px-4 py-2 text-center text-sm text-rose-500 dark:text-rose-400">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && notifications.length === 0 && !error && (
          <div className="px-4 py-8 text-center">
            <UserGroupIcon className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No notifications</p>
          </div>
        )}

        {/* Notifications list */}
        {notifications.length > 0 && (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <div
                key={notification._id}
                className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 ${
                  !notification.isRead ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="flex">
                  <div className="flex-shrink-0 mr-3 mt-0.5">
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {notification.title}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {notification.message}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer with "Load more" button if there are notifications */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => fetchMore(10)}
              className="w-full text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 py-1"
            >
              {isLoading ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationList;