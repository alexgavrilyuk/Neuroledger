// frontend/src/features/team_management/components/InviteForm.jsx
import React, { useState } from 'react';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import { UserIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const InviteForm = ({ teamId, onInvite }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await onInvite(email, role);
      setEmail('');
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Email Address"
        id="inviteEmail"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="colleague@example.com"
        error={error}
        required
      />

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Role
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            className={`p-3 border ${
              role === 'member'
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-200 dark:border-gray-700'
            } rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800`}
            onClick={() => setRole('member')}
          >
            <div className="flex items-center">
              <UserIcon className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <h3 className="font-medium">Member</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Can view team content</p>
              </div>
            </div>
          </div>

          <div
            className={`p-3 border ${
              role === 'admin'
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-200 dark:border-gray-700'
            } rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800`}
            onClick={() => setRole('admin')}
          >
            <div className="flex items-center">
              <ShieldCheckIcon className="h-5 w-5 text-blue-500 mr-2" />
              <div>
                <h3 className="font-medium">Administrator</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Can manage team</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {success && (
        <div className="text-sm text-emerald-600 dark:text-emerald-400 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">
          Invitation sent successfully!
        </div>
      )}

      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          isLoading={isLoading}
          disabled={isLoading || !email.trim()}
          className="w-full"
        >
          Send Invitation
        </Button>
      </div>
    </form>
  );
};

export default InviteForm;