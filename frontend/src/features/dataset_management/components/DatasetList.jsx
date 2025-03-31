// frontend/src/features/dataset_management/components/DatasetList.jsx
// ** NEW FILE **
import React from 'react';
import { useDatasets } from '../hooks/useDatasets';
import Spinner from '../../../shared/ui/Spinner';
import Card from '../../../shared/ui/Card';
import { CircleStackIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'; // Add icons
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
    <Card>
      <Card.Header>
         <div className="flex items-center justify-between">
            <span>Your Datasets</span>
             <Button onClick={refetch} variant="ghost" size="sm" disabled={isLoading}>
                 {isLoading ? 'Refreshing...' : 'Refresh List'}
             </Button>
         </div>
      </Card.Header>
      <Card.Body padding="none"> {/* Remove default padding to allow table full width */}
        {isLoading && (
          <div className="flex justify-center items-center p-10">
            <Spinner />
          </div>
        )}
        {error && <div className="p-4 text-red-600 dark:text-red-400">{error}</div>}

        {!isLoading && !error && datasets.length === 0 && (
          <div className="p-6 text-center text-gray-500 dark:text-gray-400">
            You haven't uploaded any datasets yet.
          </div>
        )}

        {!isLoading && !error && datasets.length > 0 && (
           <div className="overflow-x-auto">
             <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
               <thead className="bg-gray-50 dark:bg-gray-800/50">
                 <tr>
                   <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                   <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Uploaded</th>
                   {/* Add more columns later: size, team, status? */}
                   <th scope="col" className="relative px-6 py-3">
                     <span className="sr-only">Actions</span>
                   </th>
                 </tr>
               </thead>
               <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                 {datasets.map((dataset) => (
                   <tr key={dataset._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                     <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                            <CircleStackIcon className="h-5 w-5 text-gray-400 mr-3" />
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{dataset.name}</div>
                         </div>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(dataset.createdAt)}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                       {/* Add Edit Link/Button later */}
                       {/* <Button size="sm" variant="ghost" title="Edit Metadata (Coming Soon)" disabled>
                           <PencilIcon className="h-4 w-4" />
                       </Button> */}
                       {/* Add Delete Button later */}
                       {/* <Button size="sm" variant="ghost" onClick={() => handleDelete(dataset._id)} title="Delete Dataset">
                           <TrashIcon className="h-4 w-4 text-red-500" />
                       </Button> */}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default DatasetList;