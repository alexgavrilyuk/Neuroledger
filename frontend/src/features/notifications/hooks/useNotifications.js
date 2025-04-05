// frontend/src/features/notifications/hooks/useNotifications.js
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../shared/services/apiClient';
import { useAuth } from '../../../shared/hooks/useAuth';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const fetchNotifications = useCallback(async (limit = 20, skip = 0) => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return { notifications: [], total: 0, hasMore: false };
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/notifications?limit=${limit}&skip=${skip}`);
      if (response.data.status === 'success') {
        const { notifications: fetchedNotifications, total, hasMore } = response.data.data;

        if (skip === 0) {
          // First page, replace all notifications
          setNotifications(fetchedNotifications || []);
        } else {
          // Subsequent pages, append notifications
          setNotifications(prev => [...prev, ...(fetchedNotifications || [])]);
        }

        return { notifications: fetchedNotifications || [], total, hasMore };
      } else {
        throw new Error(response.data.message || 'Failed to fetch notifications');
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
      setError(err.response?.data?.message || err.message || 'Could not load notifications.');
      return { notifications: [], total: 0, hasMore: false };
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return 0;
    }

    try {
      const response = await apiClient.get('/notifications/unread-count');
      if (response.data.status === 'success') {
        const { count } = response.data.data;
        setUnreadCount(count);
        return count;
      } else {
        throw new Error(response.data.message || 'Failed to fetch unread count');
      }
    } catch (err) {
      console.error("Failed to fetch unread notification count:", err);
      return 0;
    }
  }, [user]);

  // Initial fetch on mount and when user changes
  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  const markAsRead = async (notificationIds = null) => {
    if (!user) return;

    try {
      const response = await apiClient.put('/notifications/mark-read', {
        notificationIds // If null, mark all as read
      });

      if (response.data.status === 'success') {
        // Update local state
        if (notificationIds) {
          // Mark specific notifications as read
          setNotifications(prev => prev.map(notification => {
            if (notificationIds.includes(notification._id)) {
              return { ...notification, isRead: true };
            }
            return notification;
          }));

          // Decrement unread count
          setUnreadCount(prev => Math.max(0, prev - notificationIds.length));
        } else {
          // Mark all notifications as read
          setNotifications(prev => prev.map(notification => ({
            ...notification,
            isRead: true
          })));
          setUnreadCount(0);
        }

        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to mark notifications as read');
      }
    } catch (err) {
      console.error("Failed to mark notifications as read:", err);
      throw err;
    }
  };

  // New function to delete a notification
  const deleteNotification = async (notificationId) => {
    if (!user || !notificationId) return;

    try {
      const response = await apiClient.delete(`/notifications/${notificationId}`);

      if (response.data.status === 'success') {
        // Update local state
        setNotifications(prev => prev.filter(notification => notification._id !== notificationId));

        // Update unread count if needed
        const deletedNotification = notifications.find(n => n._id === notificationId);
        if (deletedNotification && !deletedNotification.isRead) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }

        return true;
      } else {
        throw new Error(response.data.message || 'Failed to delete notification');
      }
    } catch (err) {
      console.error("Failed to delete notification:", err);
      throw err;
    }
  };

  // Function to manually refetch if needed
  const refetch = () => {
    fetchNotifications();
    fetchUnreadCount();
  };

  // Polling for new notifications (every 30 seconds)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [user, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refetch,
    markAsRead,
    deleteNotification,
    fetchMore: (limit) => fetchNotifications(limit, notifications.length)
  };
};