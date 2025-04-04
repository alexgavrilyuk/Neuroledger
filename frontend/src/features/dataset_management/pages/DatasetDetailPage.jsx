// frontend/src/features/dataset_management/pages/DatasetDetailPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../../shared/ui/Button';
import Card from '../../../shared/ui/Card';
import Spinner from '../../../shared/ui/Spinner';
import {
  ArrowLeftIcon,
  DocumentTextIcon,
  CalendarIcon,
  ClockIcon,
  CircleStackIcon,
  DocumentMagnifyingGlassIcon,
  DocumentIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  TableCellsIcon
} from '@heroicons/react/24/outline';
import apiClient from '../../../shared/services/apiClient';
import logger from '../../../shared/utils/logger';
import ColumnDescriptionsEditor from '../components/ColumnDescriptionsEditor';

const DatasetDetailPage = () => {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDataset = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await apiClient.get(`/datasets/${datasetId}`);

        if (response.data.status === 'success') {
          setDataset(response.data.data);
        } else {
          throw new Error(response.data.message || 'Failed to fetch dataset details');
        }
      } catch (err) {
        logger.error('Error fetching dataset details:', err);
        setError(err.response?.data?.message || err.message || 'Could not load dataset information');
      } finally {
        setLoading(false);
      }
    };

    if (datasetId) {
      fetchDataset();
    }
  }, [datasetId]);

  const handleBack = () => {
    navigate('/account/datasets');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return 'Invalid date';
    }
  };

  // Get file type icon based on filename
  const getFileTypeIcon = (filename) => {
    if (!filename) return DocumentIcon;

    const extension = filename.split('.').pop().toLowerCase();
    if (extension === 'csv') {
      return TableCellsIcon;
    } else if (['xls', 'xlsx'].includes(extension)) {
      return DocumentTextIcon;
    }

    return DocumentIcon;
  };

  const FileTypeIcon = dataset ? getFileTypeIcon(dataset.originalFilename) : DocumentIcon;

  const handleDescriptionsSaved = (updatedDataset) => {
    // Update the dataset state with the new information
    setDataset(updatedDataset);
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col justify-center items-center">
        <Spinner size="lg" color="text-blue-500 dark:text-blue-400" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading dataset details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Button
          onClick={handleBack}
          variant="ghost"
          leftIcon={ArrowLeftIcon}
          className="mb-4"
        >
          Back to Datasets
        </Button>

        <Card elevation="default">
          <Card.Body>
            <div className="flex items-start p-6 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <ExclamationCircleIcon className="h-10 w-10 text-red-500 mr-4 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-2">Error Loading Dataset</h3>
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button
                  className="mt-4"
                  variant="outline"
                  leftIcon={ArrowPathIcon}
                  onClick={() => window.location.reload()}
                >
                  Try Again
                </Button>
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="space-y-6">
        <Button onClick={handleBack} variant="ghost" leftIcon={ArrowLeftIcon}>
          Back to Datasets
        </Button>

        <Card>
          <Card.Body>
            <div className="p-6 text-center">
              <DocumentMagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <h3 className="mt-2 text-base font-medium text-gray-900 dark:text-white">Dataset not found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                The dataset you're looking for doesn't exist or you don't have access.
              </p>
            </div>
          </Card.Body>
        </Card>
      </div>
    );
  }

  // Get file extension for display
  const getFileExtension = (filename) => {
    if (!filename) return '';
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toUpperCase() : '';
  };

  const fileExtension = getFileExtension(dataset.originalFilename);

  return (
    <div className="space-y-8">
      {/* Back button and title area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Button
          onClick={handleBack}
          variant="ghost"
          leftIcon={ArrowLeftIcon}
          className="self-start"
        >
          Back to Datasets
        </Button>
      </div>

      {/* Dataset Overview Card - Enhanced with visual organization */}
      <Card elevation="default" className="overflow-hidden">
        <Card.Header>
          <div className="flex items-center">
            <CircleStackIcon className="h-5 w-5 mr-2 text-blue-500" />
            <span className="font-medium">Dataset Overview</span>
          </div>
        </Card.Header>

        <Card.Body>
          <div className="flex flex-col md:flex-row">
            {/* File icon/type section */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center px-6 py-4 md:border-r border-gray-200 dark:border-gray-700">
              <div className="h-20 w-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-3">
                <FileTypeIcon className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              </div>
              {fileExtension && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                  {fileExtension} File
                </span>
              )}
            </div>

            {/* Dataset details section */}
            <div className="flex-grow px-6 py-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                {dataset.name}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div className="flex items-center">
                  <DocumentTextIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-2 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Original Filename</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate" title={dataset.originalFilename}>
                      {dataset.originalFilename}
                    </span>
                  </div>
                </div>

                <div className="flex items-center">
                  <CalendarIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-2 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Upload Date</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatDate(dataset.createdAt)}
                    </span>
                  </div>
                </div>

                {dataset.lastUpdatedAt && dataset.lastUpdatedAt !== dataset.createdAt && (
                  <div className="flex items-center">
                    <ClockIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-2 flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Last Updated</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDate(dataset.lastUpdatedAt)}
                      </span>
                    </div>
                  </div>
                )}

                {dataset.fileSizeBytes && (
                  <div className="flex items-center">
                    <DocumentIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-2 flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">File Size</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {(dataset.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Column Descriptions Editor */}
      <ColumnDescriptionsEditor
        datasetId={datasetId}
        onSaveSuccess={handleDescriptionsSaved}
      />
    </div>
  );
};

export default DatasetDetailPage;