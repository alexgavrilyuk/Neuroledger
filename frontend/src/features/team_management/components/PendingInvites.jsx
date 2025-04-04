// frontend/src/features/team_management/components/PendingInvites.jsx
import React from 'react';
import Card from '../../../shared/ui/Card';
import Button from '../../../shared/ui/Button';
import { useTeamInvites } from '../hooks/useTeamInvites';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserPlusIcon
} from '@heroicons/react/24/outline';
import Spinner from '../../../shared/ui/Spinner';

const PendingInvites = () => {
  const { invites, isLoading, error, acceptInvite, rejectInvite } = useTeamInvites();

  if (isLoading) {
    return (
      <Card className="my-4">
        <Card.Header>Pending Team Invitations</Card.Header>
        <Card.Body className="flex justify-center items-center py-8">
          <Spinner size="lg" />
        </Card.Body>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="my-4 border-rose-200 dark:border-rose-800">
        <Card.Header>Pending Team Invitations</Card.Header>
        <Card.Body className="text-rose-600 dark:text-rose-400">
          <p>Error loading invitations: {error}</p>
        </Card.Body>
      </Card>
    );
  }

  if (!invites || invites.length === 0) {
    return null; // Don't show anything if no invites
  }

  return (
    <Card className="my-4 border-blue-200 dark:border-blue-800">
      <Card.Header>
        <div className="flex items-center">
          <UserPlusIcon className="h-5 w-5 text-blue-500 mr-2" />
          <span>Pending Team Invitations</span>
        </div>
      </Card.Header>
      <Card.Body className="p-0">
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {invites.map(invite => (
            <li key={invite._id} className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {invite.teamName}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Invited by {invite.invitedBy.name || invite.invitedBy.email}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1">
                    <ClockIcon className="h-4 w-4 mr-1" />
                    Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Role: <span className="font-medium">{invite.role}</span>
                  </p>
                </div>

                <div className="flex space-x-2">
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={CheckCircleIcon}
                    onClick={async () => {
                      try {
                        await acceptInvite(invite._id);
                      } catch (error) {
                        // Error is handled by the hook
                      }
                    }}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={XCircleIcon}
                    onClick={async () => {
                      try {
                        await rejectInvite(invite._id);
                      } catch (error) {
                        // Error is handled by the hook
                      }
                    }}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card.Body>
    </Card>
  );
};

export default PendingInvites;