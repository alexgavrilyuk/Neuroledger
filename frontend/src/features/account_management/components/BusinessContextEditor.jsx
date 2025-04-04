// frontend/src/features/account_management/components/BusinessContextEditor.jsx
import React, { useState, useEffect } from 'react';
import Card from '../../../shared/ui/Card';
import Button from '../../../shared/ui/Button';
import Spinner from '../../../shared/ui/Spinner';
import {
  CheckIcon,
  PencilIcon,
  XMarkIcon,
  InformationCircleIcon,
  BuildingOfficeIcon,
  LightBulbIcon,
  ExclamationCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
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
    <Card elevation="default" className="overflow-hidden transition-all duration-300">
      <Card.Header>
        <div className="flex items-center">
          <BuildingOfficeIcon className="h-5 w-5 mr-2 text-blue-500" />
          <span className="font-medium">Business Context</span>
        </div>
      </Card.Header>

      <Card.Body>
        {isLoading ? (
          <div className="flex flex-col justify-center items-center py-12">
            <Spinner size="lg" />
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading your business context...</p>
          </div>
        ) : (
          <>
            {/* Enhanced intro section with better typography and visual design */}
            <div className="mb-6 p-4 bg-gradient-subtle-light dark:bg-gradient-subtle-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-soft-sm">
              <div className="flex items-start">
                <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30 mr-3 flex-shrink-0">
                  <LightBulbIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Why Business Context Matters</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Adding information about your company, industry, and financial practices helps the AI generate more relevant insights.
                    This context is provided to the AI for all your data analyses.
                  </p>
                </div>
              </div>
            </div>

            {/* Enhanced error message */}
            {error && (
              <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 text-sm rounded-lg shadow-soft-sm flex items-center">
                <ExclamationCircleIcon className="h-5 w-5 mr-2 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Enhanced success message */}
            {successMessage && (
              <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-600 dark:text-green-400 text-sm rounded-lg shadow-soft-sm flex items-center animate-fadeIn">
                <CheckIcon className="h-5 w-5 mr-2 flex-shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Main context editor/display area with enhanced styling */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-soft-md dark:shadow-soft-dark-md transition-all duration-300">
              {/* Header area */}
              <div className="flex justify-between items-center p-4 bg-gradient-subtle-light dark:bg-gradient-subtle-dark border-b border-gray-200 dark:border-gray-700/50">
                <div className="flex items-center">
                  <div className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 mr-2">
                    <InformationCircleIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="font-medium text-gray-800 dark:text-gray-200">Company Information</h3>
                </div>

                {/* Action buttons */}
                {!isEditing ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleStartEditing}
                    leftIcon={PencilIcon}
                    className={!businessContext ? "animate-pulse-subtle" : ""}
                  >
                    {businessContext ? "Edit" : "Add Information"}
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

              {/* Content area */}
              <div className="p-4 bg-white dark:bg-gray-800">
                {!isEditing ? (
                  businessContext ? (
                    <div className="whitespace-pre-line text-gray-700 dark:text-gray-300 p-4 bg-gray-50 dark:bg-gray-750 rounded-lg border border-gray-100 dark:border-gray-700/50">
                      {businessContext}
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No business context added yet</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Click "Add Information" to help the AI better understand your business needs.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="space-y-3">
                    <textarea
                      value={tempContext}
                      onChange={(e) => setTempContext(e.target.value)}
                      className="w-full min-h-40 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-soft-sm transition-all duration-200"
                      placeholder="Examples:
- Company: Acme Inc., a mid-size e-commerce business founded in 2015
- Industry: Retail, primarily selling electronics and accessories
- Accounting: We use FIFO inventory method and operate on a calendar fiscal year
- Teams: Sales team organized by region (North, South, East, West)
- KPIs: We focus on CAC, LTV, and Monthly Active Users as primary metrics
- Special Terms: 'Marketing Events' refers to our quarterly promotional campaigns"
                    />

                    {/* Additional guidance section */}
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30">
                      <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">Tips for Better Results:</h4>
                      <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                        <li>Include your company size, industry, and business model</li>
                        <li>Mention specific accounting methods or standards you follow</li>
                        <li>Define any industry-specific or internal terminology</li>
                        <li>Share how your team is organized and what metrics matter most</li>
                      </ul>
                    </div>
                  </div>
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