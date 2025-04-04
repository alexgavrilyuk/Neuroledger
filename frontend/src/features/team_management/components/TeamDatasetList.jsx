// frontend/src/features/team_management/components/TeamDatasetList.jsx
import React from 'react';
import Card from '../../../shared/ui/Card';
import Button from '../../../shared/ui/Button';
import { Link } from 'react-router-dom';
import {
  DocumentTextIcon,
  ArrowUpTrayIcon,
  ChevronRightIcon,
  CircleStackIcon
} from '@heroicons/react/24/outline';
import Spinner from '../../../shared/ui/Spinner';
import { format, formatDistanceToNow } from 'date-fns';

// Helper function to format file size
const formatFileSizeToHuman = (bytes) => {
  if (bytes === undefined || bytes === null) return 'Unknown size';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const TeamDatasetList = ({ teamId, datasets = [], isLoading, isAdmin }) => {
  if (isLoading) {
    return (
      <Card>
        <Card.Header>Team Datasets</Card.Header>
        <Card.Body className="flex justify-center items-center py-8">
          <Spinner size="lg" />
        </Card.Body>
      </Card>
    );
  }

  if (!datasets || datasets.length === 0) {
    return (
      <Card>
        <Card.Header>Team Datasets</Card.Header>
        <Card.Body className="text-center py-8">
          <CircleStackIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Team Datasets</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Your team doesn't have any datasets yet.
          </p>
          {isAdmin && (
            <Link to="/account/datasets">
              <Button variant="primary" leftIcon={ArrowUpTrayIcon}>
                Upload Dataset
              </Button>
            </Link>
          )}
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <CircleStackIcon className="h-5 w-5 text-blue-500 mr-2" />
            <span>Team Datasets</span>
          </div>
          {isAdmin && (
            <Link to="/account/datasets">
              <Button size="sm" variant="outline" leftIcon={ArrowUpTrayIcon}>
                Upload Dataset
              </Button>
            </Link>
          )}
        </div>
      </Card.Header>
      <div className="overflow-hidden">
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {datasets.map((dataset) => (
            <li key={dataset._id}>
              <Link
                to={`/account/datasets/${dataset._id}`}
                className="block hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors duration-150"
              >
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center min-w-0">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <DocumentTextIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="ml-4 flex-grow min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white truncate">
                        {dataset.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {format(new Date(dataset.createdAt), 'MMM dd, yyyy')} • {formatFileSizeToHuman(dataset.fileSizeBytes)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center ml-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                      {formatDistanceToNow(new Date(dataset.createdAt), { addSuffix: true })}
                    </div>
                    <ChevronRightIcon className="h-5 w-5 text-gray-400 ml-4" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Card.Footer>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {datasets.length} dataset{datasets.length !== 1 ? 's' : ''} available to team members
        </div>
      </Card.Footer>
    </Card>
  );
};

export default TeamDatasetList;