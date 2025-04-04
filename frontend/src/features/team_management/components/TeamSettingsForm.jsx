// frontend/src/features/team_management/components/TeamSettingsForm.jsx
import React, { useState } from 'react';
import Card from '../../../shared/ui/Card';
import Input from '../../../shared/ui/Input';
import Button from '../../../shared/ui/Button';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';

const TeamSettingsForm = ({ teamId, initialSettings = {}, onUpdateSettings }) => {
  const [settings, setSettings] = useState({
    currency: initialSettings.currency || 'USD',
    dateFormat: initialSettings.dateFormat || 'YYYY-MM-DD',
    aiContext: initialSettings.aiContext || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
    setSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await onUpdateSettings(settings);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to update team settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center">
          <Cog6ToothIcon className="h-5 w-5 text-blue-500 mr-2" />
          <span>Team Settings</span>
        </div>
      </Card.Header>
      <Card.Body>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Currency"
            id="currency"
            name="currency"
            value={settings.currency}
            onChange={handleChange}
            placeholder="USD"
            hint="Default currency for team reports"
          />

          <Input
            label="Date Format"
            id="dateFormat"
            name="dateFormat"
            value={settings.dateFormat}
            onChange={handleChange}
            placeholder="YYYY-MM-DD"
            hint="Default date format for team reports"
          />

          <div className="space-y-2">
            <label
              htmlFor="aiContext"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Business Context
            </label>
            <textarea
              id="aiContext"
              name="aiContext"
              rows={5}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={settings.aiContext}
              onChange={handleChange}
              placeholder="Provide business context for AI analysis..."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This context will be used by the AI to better understand your team's data.
            </p>
          </div>

          {error && (
            <div className="text-sm text-rose-600 dark:text-rose-400 p-2 bg-rose-50 dark:bg-rose-900/20 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-emerald-600 dark:text-emerald-400 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">
              Team settings updated successfully!
            </div>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading}
              isLoading={isLoading}
            >
              Save Settings
            </Button>
          </div>
        </form>
      </Card.Body>
    </Card>
  );
};

export default TeamSettingsForm;