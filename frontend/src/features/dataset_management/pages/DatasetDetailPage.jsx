// frontend/src/features/dataset_management/pages/DatasetDetailPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../../shared/ui/Button';
import Card from '../../../shared/ui/Card';
import Spinner from '../../../shared/ui/Spinner';
import { ArrowLeftIcon, DocumentTextIcon, CalendarIcon, ClockIcon } from '@heroicons/react/24/outline';
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

  const handleDescriptionsSaved = (updatedDataset) => {
    // Update the dataset state with the new information
    setDataset(updatedDataset);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center my-8">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button onClick={handleBack} variant="ghost" leftIcon={ArrowLeftIcon}>
          Back to Datasets
        </Button>

        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 p-4 rounded-md text-red-600 dark:text-red-300">
          <p className="font-medium">Error loading dataset:</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="space-y-4">
        <Button onClick={handleBack} variant="ghost" leftIcon={ArrowLeftIcon}>
          Back to Datasets
        </Button>

        <Card>
          <Card.Body>
            <p className="text-gray-500 dark:text-gray-400">Dataset not found.</p>
          </Card.Body>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button onClick={handleBack} variant="ghost" leftIcon={ArrowLeftIcon}>
          Back to Datasets
        </Button>
      </div>

      <Card>
        <Card.Header>
          <h2 className="text-xl font-semibold">{dataset.name}</h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="flex items-center">
              <DocumentTextIcon className="h-5 w-5 text-gray-400 mr-2" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Original Filename:</span>
              <span className="ml-2 text-sm font-medium">{dataset.originalFilename}</span>
            </div>

            <div className="flex items-center">
              <CalendarIcon className="h-5 w-5 text-gray-400 mr-2" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Uploaded:</span>
              <span className="ml-2 text-sm font-medium">{formatDate(dataset.createdAt)}</span>
            </div>

            {dataset.lastUpdatedAt && dataset.lastUpdatedAt !== dataset.createdAt && (
              <div className="flex items-center">
                <ClockIcon className="h-5 w-5 text-gray-400 mr-2" />
                <span className="text-sm text-gray-500 dark:text-gray-400">Last Updated:</span>
                <span className="ml-2 text-sm font-medium">{formatDate(dataset.lastUpdatedAt)}</span>
              </div>
            )}

            {dataset.fileSizeBytes && (
              <div className="flex items-center">
                <DocumentTextIcon className="h-5 w-5 text-gray-400 mr-2" />
                <span className="text-sm text-gray-500 dark:text-gray-400">Size:</span>
                <span className="ml-2 text-sm font-medium">
                  {(dataset.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      <ColumnDescriptionsEditor
        datasetId={datasetId}
        onSaveSuccess={handleDescriptionsSaved}
      />
    </div>
  );
};

export default DatasetDetailPage;