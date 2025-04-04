// frontend/src/features/team_management/hooks/useTeamInvites.js
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../shared/services/apiClient';
import { useAuth } from '../../../shared/hooks/useAuth';

export const useTeamInvites = () => {
  const [invites, setInvites] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const fetchInvites = useCallback(async () => {
    if (!user) {
      setInvites([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/teams/invites/pending');
      if (response.data.status === 'success') {
        setInvites(response.data.data || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch invites');
      }
    } catch (err) {
      console.error("Failed to fetch team invites:", err);
      setError(err.response?.data?.message || err.message || 'Could not load team invites.');
      setInvites([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Initial fetch on mount and when user changes
  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const acceptInvite = async (inviteId) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.post(`/teams/invites/${inviteId}/accept`);
      if (response.data.status === 'success') {
        // Remove the invite from the local state
        setInvites(prev => prev.filter(invite => invite._id !== inviteId));
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to accept invite');
      }
    } catch (err) {
      console.error("Failed to accept team invite:", err);
      setError(err.response?.data?.message || err.message || 'Could not accept invitation.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const rejectInvite = async (inviteId) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.post(`/teams/invites/${inviteId}/reject`);
      if (response.data.status === 'success') {
        // Remove the invite from the local state
        setInvites(prev => prev.filter(invite => invite._id !== inviteId));
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to reject invite');
      }
    } catch (err) {
      console.error("Failed to reject team invite:", err);
      setError(err.response?.data?.message || err.message || 'Could not reject invitation.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to manually refetch if needed
  const refetch = () => {
    fetchInvites();
  };

  return {
    invites,
    isLoading,
    error,
    refetch,
    acceptInvite,
    rejectInvite
  };
};