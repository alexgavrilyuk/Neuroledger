// frontend/src/features/notifications/components/NotificationList.jsx
import React, { useRef, useEffect, useState } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { useTeamInvites } from '../../team_management/hooks/useTeamInvites';
import Spinner from '../../../shared/ui/Spinner';
import {
  UserGroupIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  XMarkIcon,
  UserPlusIcon,
  UserMinusIcon,
  ShieldCheckIcon,
  CheckIcon,
  XCircleIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';

const NotificationList = ({ onClose }) => {
  const { notifications, isLoading, error, fetchMore, markAsRead, refetch, deleteNotification } = useNotifications();
  const { acceptInvite, rejectInvite, invites } = useTeamInvites();
  const [actionInProgress, setActionInProgress] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [processedInvites, setProcessedInvites] = useState({});
  const notifRef = useRef(null);

  // Load processed invites from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('processedInvites');
      if (saved) {
        setProcessedInvites(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Error loading processed invites from localStorage', err);
    }
  }, []);

  // Save processed invites to localStorage when they change
  useEffect(() => {
    if (Object.keys(processedInvites).length > 0) {
      localStorage.setItem('processedInvites', JSON.stringify(processedInvites));
    }
  }, [processedInvites]);

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

  // Check if an invite notification should show buttons
  const shouldShowInviteButtons = (notification) => {
    if (notification.type !== 'team_invite' || !notification.data?.inviteId) {
      return false;
    }

    // Check if the invite has been processed locally
    if (processedInvites[notification.data.inviteId]) {
      return false;
    }

    // Check if the invite still exists in the backend
    const inviteExists = invites.some(invite => invite._id === notification.data.inviteId);
    return inviteExists;
  };

  // Handle accept invite action
  const handleAcceptInvite = async (inviteId, notificationId, teamName) => {
    setActionInProgress(notificationId);
    setActionError(null);

    try {
      await acceptInvite(inviteId);

      // Mark invite as processed locally
      setProcessedInvites(prev => ({
        ...prev,
        [inviteId]: { status: 'accepted', teamName }
      }));

      // Mark notification as read
      await markAsRead([notificationId]);

      // Refresh notifications to show the new "Team Joined" notification
      setTimeout(() => {
        refetch();
      }, 500);
    } catch (err) {
      console.error("Failed to accept team invite:", err);
      setActionError({
        id: notificationId,
        message: err.message || 'Failed to accept invitation'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle reject invite action
  const handleRejectInvite = async (inviteId, notificationId) => {
    setActionInProgress(notificationId);
    setActionError(null);

    try {
      await rejectInvite(inviteId);

      // Mark invite as processed locally
      setProcessedInvites(prev => ({
        ...prev,
        [inviteId]: { status: 'declined' }
      }));

      // Mark notification as read
      await markAsRead([notificationId]);
    } catch (err) {
      console.error("Failed to reject team invite:", err);
      setActionError({
        id: notificationId,
        message: err.message || 'Failed to reject invitation'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle notification deletion
  const handleDeleteNotification = async (notificationId) => {
    try {
      await deleteNotification(notificationId);
      refetch();
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  };

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
            {notifications.map((notification) => {
              const showInviteButtons = shouldShowInviteButtons(notification);
              const isProcessed = notification.data?.inviteId && processedInvites[notification.data.inviteId];

              return (
                <div
                  key={notification._id}
                  className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 relative ${
                    !notification.isRead && !isProcessed ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  {/* Delete button */}
                  <button
                    onClick={() => handleDeleteNotification(notification._id)}
                    className="absolute top-2 right-2 p-1 rounded-full text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                    title="Delete notification"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>

                  <div className="flex pr-5">
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
                        {(() => {
                          try {
                            if (notification.createdAt) {
                              const date = new Date(notification.createdAt);
                              if (!isNaN(date.getTime())) {
                                return formatDistanceToNow(date, { addSuffix: true });
                              }
                            }
                            return '';
                          } catch (error) {
                            console.error('Error formatting notification date:', error);
                            return '';
                          }
                        })()}
                      </p>

                      {/* Team invite actions - only if needed */}
                      {showInviteButtons && (
                        <div className="mt-3">
                          {actionError?.id === notification._id && (
                            <p className="text-xs text-rose-500 dark:text-rose-400 mb-2">
                              {actionError.message}
                            </p>
                          )}
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleAcceptInvite(
                                notification.data.inviteId,
                                notification._id,
                                notification.data.teamName
                              )}
                              disabled={actionInProgress !== null}
                              className="flex-1 inline-flex justify-center items-center py-1.5 px-3 text-sm font-medium rounded-md
                                         bg-blue-500 text-white hover:bg-blue-600
                                         transition-colors duration-150
                                         disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {actionInProgress === notification._id ? (
                                <Spinner size="xs" color="text-white" className="mr-1" />
                              ) : (
                                <CheckIcon className="h-4 w-4 mr-1" />
                              )}
                              Accept
                            </button>
                            <button
                              onClick={() => handleRejectInvite(notification.data.inviteId, notification._id)}
                              disabled={actionInProgress !== null}
                              className="flex-1 inline-flex justify-center items-center py-1.5 px-3 text-sm font-medium rounded-md
                                         border border-gray-300 bg-white text-gray-700
                                         hover:bg-gray-50 hover:text-gray-900
                                         dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200
                                         dark:hover:bg-gray-600
                                         transition-colors duration-150
                                         disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {actionInProgress === notification._id ? (
                                <Spinner size="xs" className="mr-1" />
                              ) : (
                                <XCircleIcon className="h-4 w-4 mr-1" />
                              )}
                              Decline
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Show status for processed invitations */}
                      {isProcessed && (
                        <div className="mt-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              isProcessed.status === 'accepted'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {isProcessed.status === 'accepted' ? (
                              <>
                                <CheckIcon className="mr-1 h-3 w-3" />
                                Accepted
                              </>
                            ) : (
                              <>
                                <XCircleIcon className="mr-1 h-3 w-3" />
                                Declined
                              </>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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