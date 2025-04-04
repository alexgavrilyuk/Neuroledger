// frontend/src/features/account_management/pages/AccountSettingsPage.jsx
// ** UPDATED FILE - Added business context section **
import React, { useState, useEffect } from 'react';
import Card from '../../../shared/ui/Card';
import BusinessContextEditor from '../components/BusinessContextEditor';
import Spinner from '../../../shared/ui/Spinner';
import Input from '../../../shared/ui/Input';
import Button from '../../../shared/ui/Button';
import { useAuth } from '../../../shared/hooks/useAuth';
import apiClient from '../../../shared/services/apiClient';
import logger from '../../../shared/utils/logger';

const AccountSettingsPage = () => {
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // General settings
  const [currency, setCurrency] = useState('USD');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');

  // Load current settings from user object
  useEffect(() => {
    if (user) {
      setCurrency(user.settings?.currency || 'USD');
      setDateFormat(user.settings?.dateFormat || 'YYYY-MM-DD');
      setLoading(false);
    }
  }, [user]);

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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
        Account Settings
      </h1>

      {/* General Settings Card */}
      <Card>
        <Card.Header>General Settings</Card.Header>
        <Card.Body>
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <form onSubmit={handleSaveGeneralSettings}>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Currency
                  </label>
                  <select
                    id="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
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

                <div>
                  <label htmlFor="dateFormat" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Date Format
                  </label>
                  <select
                    id="dateFormat"
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  >
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MMM DD, YYYY">MMM DD, YYYY</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  type="submit"
                  isLoading={saving}
                  disabled={saving}
                >
                  Save Settings
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