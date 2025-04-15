// frontend/src/features/dataset_management/pages/DatasetDetailPage.jsx
// ** UPDATED FILE - Added data quality audit functionality **
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../../shared/ui/Button';
import Card from '../../../shared/ui/Card';
import Spinner from '../../../shared/ui/Spinner';
import Modal from '../../../shared/ui/Modal';
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
  TableCellsIcon,
  ChartPieIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import apiClient from '../../../shared/services/apiClient';
import logger from '../../../shared/utils/logger';
import ColumnDescriptionsEditor from '../components/ColumnDescriptionsEditor';
import DataQualityProgressIndicator from '../../dataQuality/components/DataQualityProgressIndicator';
import DataQualityReportDisplay from '../../dataQuality/components/DataQualityReportDisplay';

const DatasetDetailPage = () => {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data quality audit state
  const [auditStatus, setAuditStatus] = useState('not_run');
  const [auditRequestedAt, setAuditRequestedAt] = useState(null);
  const [auditCompletedAt, setAuditCompletedAt] = useState(null);
  const [auditReport, setAuditReport] = useState(null);
  const [auditError, setAuditError] = useState(null);
  const [isInitiatingAudit, setIsInitiatingAudit] = useState(false);
  const [isLoadingAuditReport, setIsLoadingAuditReport] = useState(false);
  const [isResettingAudit, setIsResettingAudit] = useState(false);
  const [isContextComplete, setIsContextComplete] = useState(false);
  const [showContextModal, setShowContextModal] = useState(false);

  // References for polling
  const pollingIntervalRef = useRef(null);

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

  useEffect(() => {
    // Check if dataset has all required context for quality audit
    if (dataset) {
      const hasDescription = dataset.description && dataset.description.trim() !== '';

      let hasAllColumnDescriptions = true;
      if (dataset.schemaInfo && dataset.schemaInfo.length > 0) {
        for (const column of dataset.schemaInfo) {
          const columnName = column.name;
          if (!dataset.columnDescriptions || !dataset.columnDescriptions[columnName] || dataset.columnDescriptions[columnName].trim() === '') {
            hasAllColumnDescriptions = false;
            break;
          }
        }
      }

      setIsContextComplete(hasDescription && hasAllColumnDescriptions);
    }
  }, [dataset]);

  useEffect(() => {
    // Fetch audit status on initial load
    if (datasetId) {
      fetchAuditStatus();
    }

    return () => {
      // Clean up polling interval if component unmounts
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [datasetId]);

  // Start polling when audit status is 'processing'
  useEffect(() => {
    if (auditStatus === 'processing') {
      // Only start polling interval if not already running
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(() => {
          fetchAuditStatus();
        }, 1000); // Poll API every 1 second
      }
    } else {
      // Stop polling when no longer processing
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      // If audit is complete, fetch the full report
      if (['ok', 'warning', 'error'].includes(auditStatus) && !auditReport) {
        fetchAuditReport();
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [auditStatus, auditRequestedAt]);

  const fetchAuditStatus = async () => {
    try {
      const response = await apiClient.get(`/datasets/${datasetId}/quality-audit/status`);

      if (response.data.status === 'success') {
        const { qualityStatus, requestedAt, completedAt } = response.data.data;
        setAuditStatus(qualityStatus);
        setAuditRequestedAt(requestedAt);
        setAuditCompletedAt(completedAt);

        // If status changed from processing to complete, fetch the report
        if (qualityStatus !== 'processing' && auditStatus === 'processing') {
          fetchAuditReport();
        }
      }
    } catch (err) {
      logger.error('Error fetching audit status:', err);
      // Don't set error state to avoid blocking the UI during polling
    }
  };

  const fetchAuditReport = async () => {
    try {
      setIsLoadingAuditReport(true);

      const response = await apiClient.get(`/datasets/${datasetId}/quality-audit`);

      if (response.data.status === 'success') {
        if (response.data.data.qualityStatus === 'processing') {
          // Still processing, update status
          setAuditStatus('processing');
          setAuditRequestedAt(response.data.data.requestedAt);
        } else {
          // Report is complete
          setAuditReport(response.data.data.report);
          setAuditStatus(response.data.data.qualityStatus);
          setAuditRequestedAt(response.data.data.requestedAt);
          setAuditCompletedAt(response.data.data.completedAt);
        }
      }
    } catch (err) {
      logger.error('Error fetching audit report:', err);
      setAuditError(err.response?.data?.message || err.message || 'Failed to load audit report');
    } finally {
      setIsLoadingAuditReport(false);
    }
  };

  const handleInitiateAudit = async () => {
    if (!isContextComplete) {
      setShowContextModal(true);
      return;
    }

    setIsInitiatingAudit(true);
    setAuditError(null);

    try {
      const response = await apiClient.post(`/datasets/${datasetId}/quality-audit`);

      if (response.data.status === 'success') {
        // Set states for audit processing
        setAuditStatus('processing');
        
        // Use the timestamp from the server if available, or current time as fallback
        const requestedTime = response.data.data?.requestedAt || new Date().toISOString();
        setAuditRequestedAt(requestedTime);
        setAuditReport(null);
        
        // Start polling interval immediately
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
        pollingIntervalRef.current = setInterval(() => {
          fetchAuditStatus();
        }, 1000); // Poll API every 1 second
        
        // Also fetch status once immediately
        fetchAuditStatus();
      }
    } catch (err) {
      logger.error('Error initiating quality audit:', err);

      // Handle specific error codes
      if (err.response?.data?.code === 'MISSING_CONTEXT' || err.response?.data?.code === 'MISSING_COLUMN_DESCRIPTIONS') {
        setShowContextModal(true);
      } else {
        setAuditError(err.response?.data?.message || err.message || 'Failed to start quality audit');
      }
    } finally {
      setIsInitiatingAudit(false);
    }
  };

  const handleResetAudit = async () => {
    setIsResettingAudit(true);
    setAuditError(null);

    try {
      const response = await apiClient.delete(`/datasets/${datasetId}/quality-audit`);

      if (response.data.status === 'success') {
        // Clear interval
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        
        // Reset all audit-related state
        setAuditStatus('not_run');
        setAuditRequestedAt(null);
        setAuditCompletedAt(null);
        setAuditReport(null);
      }
    } catch (err) {
      logger.error('Error resetting quality audit:', err);
      setAuditError(err.response?.data?.message || err.message || 'Failed to reset quality audit');
    } finally {
      setIsResettingAudit(false);
    }
  };

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
    // Update the dataset state with the new information including schema
    setDataset(prev => {
      if (!prev) return updatedDataset;
      
      return {
        ...prev,
        description: updatedDataset.description,
        columnDescriptions: updatedDataset.columnDescriptions,
        schemaInfo: updatedDataset.schemaInfo,
        lastUpdatedAt: updatedDataset.lastUpdatedAt
      };
    });
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

      {/* Data Quality Audit Card */}
      <Card elevation="default" className="overflow-hidden">
        <Card.Header>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <ChartPieIcon className="h-5 w-5 mr-2 text-blue-500" />
              <span className="font-medium">Data Quality Audit</span>
            </div>
            {auditStatus === 'not_run' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleInitiateAudit}
                isLoading={isInitiatingAudit}
                disabled={isInitiatingAudit || !isContextComplete}
                title={!isContextComplete ? 'Dataset context required (description and column descriptions)' : undefined}
              >
                Run Quality Audit
              </Button>
            )}
          </div>
        </Card.Header>

        <Card.Body>
          {/* Status based content */}
          {auditStatus === 'not_run' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="h-16 w-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <DocumentMagnifyingGlassIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
                No quality audit has been run yet
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
                Run a quality audit to get AI-powered insights into your dataset's quality, including inconsistencies, missing values, formatting issues, and recommendations.
              </p>

              {!isContextComplete && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg max-w-lg text-left">
                  <div className="flex">
                    <InformationCircleIcon className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        Context Required for Quality Audit
                      </p>
                      <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                        Please complete the dataset description and all column descriptions below before running a quality audit. This context helps the AI provide more accurate insights.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {auditStatus === 'processing' && (
            <DataQualityProgressIndicator
              status={auditStatus}
              requestedAt={auditRequestedAt}
            />
          )}

          {['ok', 'warning', 'error'].includes(auditStatus) && !auditReport && isLoadingAuditReport && (
            <div className="flex flex-col items-center justify-center py-12">
              <Spinner size="lg" color="text-blue-500 dark:text-blue-400" />
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading quality audit report...</p>
            </div>
          )}

          {['ok', 'warning', 'error'].includes(auditStatus) && !auditReport && !isLoadingAuditReport && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ExclamationCircleIcon className="h-12 w-12 text-red-500 mb-3" />
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
                Failed to load quality audit report
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
                {auditError || 'The report could not be loaded. Please try again or reset the audit.'}
              </p>
              <div className="flex space-x-4">
                <Button
                  variant="outline"
                  onClick={fetchAuditReport}
                  leftIcon={ArrowPathIcon}
                >
                  Retry
                </Button>
                <Button
                  variant="outline"
                  onClick={handleResetAudit}
                  isLoading={isResettingAudit}
                  disabled={isResettingAudit}
                >
                  Reset Audit
                </Button>
              </div>
            </div>
          )}

          {auditReport && (
            <DataQualityReportDisplay
              reportData={auditReport}
              onResetAudit={handleResetAudit}
              isResetting={isResettingAudit}
            />
          )}
        </Card.Body>
      </Card>

      {/* Column Descriptions Editor */}
      <ColumnDescriptionsEditor
        datasetId={datasetId}
        onSaveSuccess={handleDescriptionsSaved}
      />

      {/* Missing Context Modal */}
      <Modal
        isOpen={showContextModal}
        onClose={() => setShowContextModal(false)}
        title="Context Required for Quality Audit"
      >
        <Modal.Body>
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              To run a quality audit, please provide the following information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>
                <strong>Dataset Description:</strong> A clear explanation of what this dataset represents, its purpose, and its timeframe.
              </li>
              <li>
                <strong>Column Descriptions:</strong> A description for each column explaining what it represents, expected formats, and its significance.
              </li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              This context helps our AI provide more accurate and relevant insights about your data quality.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex">
                <InformationCircleIcon className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0" />
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Scroll down to add dataset description and column descriptions in the section below.
                </p>
              </div>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => setShowContextModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default DatasetDetailPage;