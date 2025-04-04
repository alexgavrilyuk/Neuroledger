// frontend/src/features/dataset_management/components/DatasetList.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useDatasets } from '../hooks/useDatasets';
import Spinner from '../../../shared/ui/Spinner';
import Card from '../../../shared/ui/Card';
import {
    CircleStackIcon,
    TrashIcon,
    PencilIcon,
    InformationCircleIcon,
    ArrowPathIcon,
    CalendarIcon,
    CheckBadgeIcon,
    ExclamationCircleIcon,
    DocumentMagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import Button from '../../../shared/ui/Button';

const DatasetList = () => {
  const { datasets, isLoading, error, refetch } = useDatasets();

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
         year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch (e) { return '-' }
  };

   // Add delete handler later
   const handleDelete = (datasetId) => {
       console.warn("Delete functionality not implemented yet for:", datasetId);
       // TODO: Call API to delete, then refetch()
   };

  return (
    <Card elevation="default" className="overflow-hidden">
      <Card.Header>
         <div className="flex items-center justify-between">
            <div className="flex items-center">
                <CircleStackIcon className="h-5 w-5 mr-2 text-blue-500" />
                <span className="font-medium">Your Datasets</span>
            </div>
            <Button
                onClick={refetch}
                variant="ghost"
                size="sm"
                disabled={isLoading}
                leftIcon={ArrowPathIcon}
                className={isLoading ? 'animate-spin' : ''}
            >
                {isLoading ? 'Refreshing...' : 'Refresh List'}
            </Button>
         </div>
      </Card.Header>

      <Card.Body padding="none"> {/* Remove default padding to allow table full width */}
        {/* Enhanced Loading State */}
        {isLoading && (
          <div className="flex flex-col justify-center items-center p-12 bg-gray-50 dark:bg-gray-800/50">
            <Spinner size="lg" color="text-blue-500 dark:text-blue-400" />
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading your datasets...</p>
          </div>
        )}

        {/* Enhanced Error State */}
        {error && (
          <div className="p-6 bg-red-50 dark:bg-red-900/20 border-y border-red-200 dark:border-red-700/50">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <ExclamationCircleIcon className="h-6 w-6 text-red-500" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Error Loading Datasets</h3>
                <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={refetch}
                    leftIcon={ArrowPathIcon}
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Empty State */}
        {!isLoading && !error && datasets.length === 0 && (
          <div className="p-12 text-center bg-gray-50 dark:bg-gray-800/50 border-y border-gray-200 dark:border-gray-700">
            <CircleStackIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No datasets</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Get started by uploading your first dataset above.</p>
          </div>
        )}

        {/* Enhanced Table with better interaction and visual styling */}
        {!isLoading && !error && datasets.length > 0 && (
           <div className="overflow-x-auto">
             <table className="min-w-full">
               <thead>
                 <tr className="bg-gray-50 dark:bg-gray-800/50 border-y border-gray-200 dark:border-gray-700/50">
                   <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                   <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Uploaded</th>
                   <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Context</th>
                   <th scope="col" className="relative px-6 py-3">
                     <span className="sr-only">Actions</span>
                   </th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                 {datasets.map((dataset) => (
                   <tr
                     key={dataset._id}
                     className="transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-800"
                   >
                     <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                              <CircleStackIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">{dataset.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{dataset.originalFilename}</div>
                            </div>
                         </div>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                          <CalendarIcon className="mr-1.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                          {formatDate(dataset.createdAt)}
                        </div>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap">
                        {dataset.description ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                            <CheckBadgeIcon className="mr-1 h-4 w-4" />
                            Described
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                            <ExclamationCircleIcon className="mr-1 h-4 w-4" />
                            Needs Context
                          </span>
                        )}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                       <div className="flex items-center justify-end space-x-3">
                         {/* View & Edit Button with enhanced styling */}
                         <Link
                           to={`/account/datasets/${dataset._id}`}
                           className="p-1.5 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors duration-200"
                           title="View & Edit Dataset"
                         >
                           <DocumentMagnifyingGlassIcon className="h-5 w-5" />
                         </Link>

                         {/* Future Delete Button - Commented out until implementation */}
                         {/* <button
                           className="p-1.5 rounded-md text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200"
                           onClick={() => handleDelete(dataset._id)}
                           title="Delete Dataset"
                         >
                           <TrashIcon className="h-5 w-5" />
                         </button> */}
                       </div>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        )}
      </Card.Body>

      {/* Optional Footer with dataset count */}
      {!isLoading && !error && datasets.length > 0 && (
        <Card.Footer>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {datasets.length} dataset{datasets.length !== 1 ? 's' : ''}
          </div>
        </Card.Footer>
      )}
    </Card>
  );
};

export default DatasetList;