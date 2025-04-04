// frontend/src/features/account_management/pages/AccountSettingsPage.jsx
import React, { useState, useEffect } from 'react';
import Card from '../../../shared/ui/Card';
import BusinessContextEditor from '../components/BusinessContextEditor';
import Spinner from '../../../shared/ui/Spinner';
import Input from '../../../shared/ui/Input';
import Button from '../../../shared/ui/Button';
import { useAuth } from '../../../shared/hooks/useAuth';
import apiClient from '../../../shared/services/apiClient';
import logger from '../../../shared/utils/logger';
import {
  Cog6ToothIcon,
  GlobeAltIcon,
  CalendarIcon,
  CheckIcon,
  ArrowPathIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

const AccountSettingsPage = () => {
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // General settings
  const [currency, setCurrency] = useState('USD');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [hasChanges, setHasChanges] = useState(false);

  // Load current settings from user object
  useEffect(() => {
    if (user) {
      setCurrency(user.settings?.currency || 'USD');
      setDateFormat(user.settings?.dateFormat || 'YYYY-MM-DD');
      setLoading(false);
      setHasChanges(false);
    }
  }, [user]);

  // Track changes
  useEffect(() => {
    if (user && !loading) {
      const currentCurrency = user.settings?.currency || 'USD';
      const currentDateFormat = user.settings?.dateFormat || 'YYYY-MM-DD';

      setHasChanges(
        currency !== currentCurrency ||
        dateFormat !== currentDateFormat
      );
    }
  }, [currency, dateFormat, user, loading]);

  const handleSaveGeneralSettings = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage('');

      const response = await apiClient.put('/users/me/settings', {
        currency,
        dateFormat
      });

      if (response.data.status === 'success') {
        // Update user in auth context
        if (response.data.data && setUser) {
          setUser(response.data.data);
        }

        setSuccessMessage('Settings saved successfully!');
        setHasChanges(false);

        // Clear success message after 3 seconds
        setTimeout(() => {
          setSuccessMessage('');
        }, 3000);
      } else {
        throw new Error(response.data.message || 'Failed to save settings');
      }
    } catch (err) {
      logger.error('Error saving settings:', err);
      setError(err.response?.data?.message || err.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1 flex items-center">
        <Cog6ToothIcon className="h-6 w-6 mr-2 text-gray-500 dark:text-gray-400" />
        Account Settings
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-3xl">
        Configure your account preferences and provide business context to improve AI analysis results.
      </p>

      {/* General Settings Card - Enhanced with better visual organization */}
      <Card elevation="default" className="overflow-hidden">
        <Card.Header>
          <div className="flex items-center">
            <Cog6ToothIcon className="h-5 w-5 mr-2 text-blue-500" />
            <span className="font-medium">General Settings</span>
          </div>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <form onSubmit={handleSaveGeneralSettings}>
              {/* Feedback messages */}
              {error && (
                <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-lg shadow-soft-sm flex items-center animate-fadeIn">
                  <ExclamationCircleIcon className="h-5 w-5 text-red-500 mr-2 flex-shrink-0" />
                  <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
                </div>
              )}

              {successMessage && (
                <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700/50 rounded-lg shadow-soft-sm flex items-center animate-fadeIn">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                  <span className="text-sm text-green-600 dark:text-green-400">{successMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Currency Setting - Enhanced with icon and better select styling */}
                <div className="space-y-2">
                  <div className="flex items-center mb-2">
                    <GlobeAltIcon className="h-5 w-5 mr-2 text-blue-500" />
                    <label htmlFor="currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Currency
                    </label>
                  </div>

                  <div className="relative rounded-md shadow-soft-sm dark:shadow-soft-dark-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus-within:border-blue-500">
                    <select
                      id="currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="block w-full rounded-md border-0 bg-transparent py-2 pl-3 pr-10 text-gray-900 dark:text-white focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:ring-blue-400 sm:text-sm"
                    >
                      <option value="USD">US Dollar (USD)</option>
                      <option value="EUR">Euro (EUR)</option>
                      <option value="GBP">British Pound (GBP)</option>
                      <option value="JPY">Japanese Yen (JPY)</option>
                      <option value="CAD">Canadian Dollar (CAD)</option>
                      <option value="AUD">Australian Dollar (AUD)</option>
                      <option value="CNY">Chinese Yuan (CNY)</option>
                    </select>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Set the default currency for financial calculations and reports.
                  </p>
                </div>

                {/* Date Format Setting - Enhanced with icon and better select styling */}
                <div className="space-y-2">
                  <div className="flex items-center mb-2">
                    <CalendarIcon className="h-5 w-5 mr-2 text-blue-500" />
                    <label htmlFor="dateFormat" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Date Format
                    </label>
                  </div>

                  <div className="relative rounded-md shadow-soft-sm dark:shadow-soft-dark-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus-within:border-blue-500">
                    <select
                      id="dateFormat"
                      value={dateFormat}
                      onChange={(e) => setDateFormat(e.target.value)}
                      className="block w-full rounded-md border-0 bg-transparent py-2 pl-3 pr-10 text-gray-900 dark:text-white focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:ring-blue-400 sm:text-sm"
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MMM DD, YYYY">MMM DD, YYYY</option>
                    </select>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Choose how dates are displayed throughout the application.
                  </p>
                </div>
              </div>

              {/* Save button - Enhanced with animation and conditional styles */}
              <div className="mt-8 flex justify-end">
                <Button
                  type="submit"
                  isLoading={saving}
                  disabled={saving || !hasChanges}
                  leftIcon={hasChanges ? ArrowPathIcon : CheckIcon}
                  variant={hasChanges ? "primary" : "secondary"}
                  className="shadow-soft-md hover:shadow-soft-lg transition-all duration-200"
                >
                  {saving ? 'Saving...' : hasChanges ? 'Save Changes' : 'No Changes'}
                </Button>
              </div>
            </form>
          )}
        </Card.Body>
      </Card>

      {/* Business Context Editor */}
      <BusinessContextEditor />
    </div>
  );
};

export default AccountSettingsPage;