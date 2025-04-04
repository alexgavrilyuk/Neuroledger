// frontend/src/features/team_management/hooks/useTeamDetails.js
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../shared/services/apiClient';

export const useTeamDetails = (teamId) => {
  const [team, setTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState(null);

  const fetchTeamDetails = useCallback(async () => {
    if (!teamId) {
      setTeam(null);
      setUserRole(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/teams/${teamId}`);
      if (response.data.status === 'success') {
        setTeam(response.data.data);

        // Find the current user's role in the team
        const userData = response.data.data?.members?.find(
          member => member._id === response.data.data.currentUserId
        );
        setUserRole(userData?.role || null);
      } else {
        throw new Error(response.data.message || 'Failed to fetch team details');
      }
    } catch (err) {
      console.error("Failed to fetch team details:", err);
      setError(err.response?.data?.message || err.message || 'Could not load team details.');
      setTeam(null);
      setUserRole(null);
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  // Initial fetch on mount and when teamId changes
  useEffect(() => {
    fetchTeamDetails();
  }, [fetchTeamDetails]);

  const updateTeamSettings = useCallback(async (settings) => {
    if (!teamId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.put(`/teams/${teamId}/settings`, { settings });
      if (response.data.status === 'success') {
        setTeam(prevTeam => ({
          ...prevTeam,
          settings: response.data.data.settings
        }));
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to update team settings');
      }
    } catch (err) {
      console.error("Failed to update team settings:", err);
      setError(err.response?.data?.message || err.message || 'Could not update team settings.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  const inviteUser = useCallback(async (email, role = 'member') => {
    if (!teamId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.post(`/teams/${teamId}/invites`, { email, role });
      if (response.data.status === 'success') {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to invite user');
      }
    } catch (err) {
      console.error("Failed to invite user:", err);
      setError(err.response?.data?.message || err.message || 'Could not invite user.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  const updateMemberRole = useCallback(async (memberId, role) => {
    if (!teamId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.put(`/teams/${teamId}/members/${memberId}/role`, { role });
      if (response.data.status === 'success') {
        // Update the local state
        setTeam(prevTeam => {
          if (!prevTeam || !prevTeam.members) return prevTeam;

          const updatedMembers = prevTeam.members.map(member => {
            if (member._id === memberId) {
              return { ...member, role };
            }
            return member;
          });

          return {
            ...prevTeam,
            members: updatedMembers
          };
        });

        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to update member role');
      }
    } catch (err) {
      console.error("Failed to update member role:", err);
      setError(err.response?.data?.message || err.message || 'Could not update member role.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  const removeMember = useCallback(async (memberId) => {
    if (!teamId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.delete(`/teams/${teamId}/members/${memberId}`);
      if (response.data.status === 'success') {
        // Update the local state
        setTeam(prevTeam => {
          if (!prevTeam || !prevTeam.members) return prevTeam;

          return {
            ...prevTeam,
            members: prevTeam.members.filter(member => member._id !== memberId)
          };
        });

        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to remove member');
      }
    } catch (err) {
      console.error("Failed to remove member:", err);
      setError(err.response?.data?.message || err.message || 'Could not remove team member.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  const fetchTeamDatasets = useCallback(async () => {
    if (!teamId) return [];

    try {
      const response = await apiClient.get(`/teams/${teamId}/datasets`);
      if (response.data.status === 'success') {
        return response.data.data || [];
      } else {
        throw new Error(response.data.message || 'Failed to fetch team datasets');
      }
    } catch (err) {
      console.error("Failed to fetch team datasets:", err);
      return [];
    }
  }, [teamId]);

  // Function to manually refetch
  const refetch = useCallback(() => {
    fetchTeamDetails();
  }, [fetchTeamDetails]);

  return {
    team,
    isLoading,
    error,
    userRole,
    isAdmin: userRole === 'admin',
    refetch,
    updateTeamSettings,
    inviteUser,
    updateMemberRole,
    removeMember,
    fetchTeamDatasets
  };
};