// frontend/src/features/dataset_management/hooks/useDatasets.js
// ** NEW FILE **
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../shared/services/apiClient';
import { useAuth } from '../../../shared/hooks/useAuth'; // Needed to re-fetch on auth change maybe

export const useDatasets = () => {
  const [datasets, setDatasets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth(); // Get user to ensure we only fetch when logged in

  const fetchDatasets = useCallback(async () => {
    if (!user) {
         setDatasets([]); // Clear datasets if user logs out
         return;
    }; // Don't fetch if not logged in

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/datasets');
      if (response.data.status === 'success') {
        setDatasets(response.data.data || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch datasets');
      }
    } catch (err) {
      console.error("Failed to fetch datasets:", err);
      setError(err.response?.data?.message || err.message || 'Could not load datasets.');
      setDatasets([]); // Clear datasets on error
    } finally {
      setIsLoading(false);
    }
  }, [user]); // Re-fetch if user changes

  // Initial fetch on mount and when user changes
  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  // Function to manually refetch if needed (e.g., after upload)
  const refetch = () => {
    fetchDatasets();
  };

  // Add delete/update functions here later if needed

  return { datasets, isLoading, error, refetch };
};