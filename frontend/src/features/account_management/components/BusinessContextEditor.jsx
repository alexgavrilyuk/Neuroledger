// frontend/src/features/account_management/components/BusinessContextEditor.jsx
import React, { useState, useEffect } from 'react';
import Card from '../../../shared/ui/Card';
import Button from '../../../shared/ui/Button';
import Spinner from '../../../shared/ui/Spinner';
import { CheckIcon, PencilIcon, XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import apiClient from '../../../shared/services/apiClient';
import logger from '../../../shared/utils/logger';
import { useAuth } from '../../../shared/hooks/useAuth';

const BusinessContextEditor = () => {
  const { user, setUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [businessContext, setBusinessContext] = useState('');
  const [tempContext, setTempContext] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Load current business context from user settings
  useEffect(() => {
    if (user?.settings?.aiContext !== undefined) {
      setBusinessContext(user.settings.aiContext);
      setIsLoading(false);
    } else {
      // If aiContext is not found in user object, fetch the latest user data
      fetchUserSettings();
    }
  }, [user]);

  const fetchUserSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.get('/users/me');

      if (response.data.status === 'success') {
        const userData = response.data.data;
        setBusinessContext(userData.settings?.aiContext || '');

        // Update the user in the auth context if needed
        if (userData && setUser) {
          setUser(userData);
        }
      } else {
        throw new Error(response.data.message || 'Failed to fetch user settings');
      }
    } catch (err) {
      logger.error('Error fetching user settings:', err);
      setError(err.response?.data?.message || err.message || 'Could not load your business context');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEditing = () => {
    setTempContext(businessContext);
    setIsEditing(true);
    setSuccessMessage('');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setTempContext('');
    setError(null);
  };

  const handleSaveContext = async () => {
    try {
      setIsSaving(true);
      setError(null);

      const response = await apiClient.put('/users/me/settings', {
        aiContext: tempContext
      });

      if (response.data.status === 'success') {
        setBusinessContext(tempContext);

        // Update user in auth context with the new settings
        if (response.data.data && setUser) {
          setUser(response.data.data);
        }

        setIsEditing(false);
        setSuccessMessage('Business context saved successfully!');

        // Clear success message after 3 seconds
        setTimeout(() => {
          setSuccessMessage('');
        }, 3000);
      } else {
        throw new Error(response.data.message || 'Failed to save business context');
      }
    } catch (err) {
      logger.error('Error saving business context:', err);
      setError(err.response?.data?.message || err.message || 'Could not save your business context');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center">
          <InformationCircleIcon className="h-5 w-5 mr-2 text-blue-500" />
          <span>Business Context</span>
        </div>
      </Card.Header>
      <Card.Body>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-gray-600 dark:text-gray-400">
                Add information about your company, industry, team, or financial practices.
                This context will be provided to the AI for all your data analyses.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 text-sm rounded-md">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-600 dark:text-green-400 text-sm rounded-md">
                {successMessage}
              </div>
            )}

            <div className="border border-gray-200 dark:border-gray-700 rounded-md">
              <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-medium text-gray-700 dark:text-gray-300">Company Information</h3>

                {!isEditing ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleStartEditing}
                    leftIcon={PencilIcon}
                  >
                    Edit
                  </Button>
                ) : (
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelEdit}
                      leftIcon={XMarkIcon}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleSaveContext}
                      isLoading={isSaving}
                      disabled={isSaving}
                      leftIcon={CheckIcon}
                    >
                      Save
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-4">
                {!isEditing ? (
                  businessContext ? (
                    <div className="whitespace-pre-line text-gray-700 dark:text-gray-300">
                      {businessContext}
                    </div>
                  ) : (
                    <div className="italic text-gray-400 dark:text-gray-500">
                      No business context added yet. Click "Edit" to add information about your company.
                    </div>
                  )
                ) : (
                  <textarea
                    value={tempContext}
                    onChange={(e) => setTempContext(e.target.value)}
                    className="w-full min-h-40 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Examples:
- Company: Acme Inc., a mid-size e-commerce business founded in 2015
- Industry: Retail, primarily selling electronics and accessories
- Accounting: We use FIFO inventory method and operate on a calendar fiscal year
- Teams: Sales team organized by region (North, South, East, West)
- KPIs: We focus on CAC, LTV, and Monthly Active Users as primary metrics
- Special Terms: 'Marketing Events' refers to our quarterly promotional campaigns"
                  />
                )}
              </div>
            </div>
          </>
        )}
      </Card.Body>
    </Card>
  );
};

export default BusinessContextEditor;