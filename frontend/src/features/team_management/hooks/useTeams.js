// frontend/src/features/team_management/hooks/useTeams.js
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../shared/services/apiClient';
import { useAuth } from '../../../shared/hooks/useAuth';

export const useTeams = () => {
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const fetchTeams = useCallback(async () => {
    if (!user) {
      setTeams([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/teams');
      if (response.data.status === 'success') {
        setTeams(response.data.data || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch teams');
      }
    } catch (err) {
      console.error("Failed to fetch teams:", err);
      setError(err.response?.data?.message || err.message || 'Could not load teams.');
      setTeams([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Initial fetch on mount and when user changes
  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const createTeam = async (teamData) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.post('/teams', teamData);
      if (response.data.status === 'success') {
        setTeams(prevTeams => [...prevTeams, response.data.data]);
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to create team');
      }
    } catch (err) {
      console.error("Failed to create team:", err);
      setError(err.response?.data?.message || err.message || 'Could not create team.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to manually refetch if needed
  const refetch = () => {
    fetchTeams();
  };

  return {
    teams,
    isLoading,
    error,
    refetch,
    createTeam
  };
};