// frontend/src/features/team_management/components/TeamList.jsx
import React from 'react';
import Card from '../../../shared/ui/Card';
import { Link } from 'react-router-dom';
import { UserGroupIcon, UserIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { ShieldCheckIcon } from '@heroicons/react/24/solid';
import Spinner from '../../../shared/ui/Spinner';
import { useTeams } from '../hooks/useTeams';

const TeamList = () => {
  const { teams, isLoading, error } = useTeams();

  if (isLoading) {
    return (
      <Card>
        <Card.Body className="flex justify-center items-center py-8">
          <Spinner size="lg" />
        </Card.Body>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-rose-200 dark:border-rose-800">
        <Card.Body className="text-rose-600 dark:text-rose-400 p-4">
          <p>Error loading teams: {error}</p>
        </Card.Body>
      </Card>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <Card>
        <Card.Body className="py-10 text-center">
          <UserGroupIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Teams Yet</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Create a team to collaborate with others or join a team when you receive an invitation.
          </p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {teams.map(team => (
          <li key={team._id}>
            <Link
              to={`/account/teams/${team._id}`}
              className="block hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors duration-150"
            >
              <div className="flex items-center justify-between px-4 py-4 sm:px-6">
                <div className="flex items-center">
                  <UserGroupIcon className="h-8 w-8 text-blue-500 mr-3" />
                  <div>
                    <p className="text-base font-medium text-gray-900 dark:text-white">
                      {team.name}
                    </p>
                    <div className="flex items-center mt-1">
                      {team.userRole === 'admin' ? (
                        <ShieldCheckIcon className="h-4 w-4 text-blue-500 mr-1" />
                      ) : (
                        <UserIcon className="h-4 w-4 text-gray-400 mr-1" />
                      )}
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {team.userRole === 'admin' ? 'Administrator' : 'Member'}
                      </p>
                    </div>
                  </div>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-gray-400" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
};

export default TeamList;