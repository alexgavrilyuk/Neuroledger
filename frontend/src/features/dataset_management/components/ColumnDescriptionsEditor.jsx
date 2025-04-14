// frontend/src/features/dataset_management/components/ColumnDescriptionsEditor.jsx
import React, { useState, useEffect } from 'react';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import Card from '../../../shared/ui/Card';
import Spinner from '../../../shared/ui/Spinner';
import {
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  InformationCircleIcon,
  TableCellsIcon,
  ExclamationCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import apiClient from '../../../shared/services/apiClient';
import logger from '../../../shared/utils/logger';

const ColumnDescriptionsEditor = ({ datasetId, onSaveSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [columns, setColumns] = useState([]);
  const [descriptions, setDescriptions] = useState({});
  const [datasetContext, setDatasetContext] = useState('');
  const [tempContext, setTempContext] = useState('');
  const [tempDescriptions, setTempDescriptions] = useState({});
  const [allSaved, setAllSaved] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);

  // Fetch dataset schema and existing descriptions
  useEffect(() => {
    const fetchDatasetSchema = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await apiClient.get(`/datasets/${datasetId}/schema`);

        if (response.data.status === 'success') {
          const { schemaInfo, columnDescriptions, description } = response.data.data;
          setColumns(schemaInfo || []);
          setDescriptions(columnDescriptions || {});
          setDatasetContext(description || '');
        } else {
          throw new Error(response.data.message || 'Failed to fetch dataset schema');
        }
      } catch (err) {
        logger.error('Error fetching dataset schema:', err);
        setError(err.response?.data?.message || err.message || 'Failed to load schema information');
      } finally {
        setLoading(false);
      }
    };

    if (datasetId) {
      fetchDatasetSchema();
    }
  }, [datasetId]);

  const handleEnterEditMode = () => {
    setIsEditMode(true);
    setTempContext(datasetContext);
    setTempDescriptions({...descriptions});
    setAllSaved(false);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setTempContext('');
    setTempDescriptions({});
    setAllSaved(true);
  };

  const handleUpdateTempDescription = (columnName, value) => {
    setTempDescriptions(prev => ({
      ...prev,
      [columnName]: value
    }));
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setError(null);

      const response = await apiClient.put(`/datasets/${datasetId}`, {
        columnDescriptions: tempDescriptions,
        description: tempContext
      });

      if (response.data.status === 'success') {
        logger.info('Successfully saved dataset context and column descriptions');
        setDescriptions(tempDescriptions);
        setDatasetContext(tempContext);
        setIsEditMode(false);
        setAllSaved(true);
        if (onSaveSuccess) {
          onSaveSuccess(response.data.data);
        }
      } else {
        throw new Error(response.data.message || 'Failed to save dataset information');
      }
    } catch (err) {
      logger.error('Error saving dataset information:', err);
      setError(err.response?.data?.message || err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card elevation="default">
        <Card.Body>
          <div className="flex flex-col justify-center items-center p-12">
            <Spinner size="lg" />
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading dataset schema...</p>
          </div>
        </Card.Body>
      </Card>
    );
  }

  if (error && !columns.length) {
    return (
      <Card elevation="default">
        <Card.Body>
          <div className="flex items-start p-6 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <ExclamationCircleIcon className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-base font-medium text-red-800 dark:text-red-300">Error Loading Schema</h3>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
              <Button
                className="mt-4"
                variant="outline"
                size="sm"
                leftIcon={ArrowPathIcon}
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card elevation="default" className="transition-all duration-300">
      <Card.Header>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <TableCellsIcon className="h-5 w-5 mr-2 text-blue-500" />
            <span className="font-medium">Dataset Context and Column Descriptions</span>
          </div>

          {/* Global Edit/Save button */}
          {!isEditMode ? (
            <Button
              onClick={handleEnterEditMode}
              size="sm"
              leftIcon={PencilIcon}
              className="shadow-soft-md hover:shadow-soft-lg"
            >
              Edit All
            </Button>
          ) : (
            <div className="flex space-x-2">
              <Button
                onClick={handleCancelEdit}
                size="sm"
                variant="ghost"
                leftIcon={XMarkIcon}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAll}
                disabled={saving}
                isLoading={saving}
                size="sm"
                leftIcon={CheckIcon}
                className="shadow-soft-md hover:shadow-soft-lg"
              >
                Save All
              </Button>
            </div>
          )}
        </div>
      </Card.Header>

      <Card.Body>
        {/* Error message if present */}
        {error && (
          <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg">
            <div className="flex items-center">
              <ExclamationCircleIcon className="h-5 w-5 text-red-500 mr-2 flex-shrink-0" />
              <span className="text-sm font-medium text-red-800 dark:text-red-300">{error}</span>
            </div>
          </div>
        )}

        {/* Dataset Context Section - Enhanced with better styling */}
        <div className="mb-8 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-soft-md dark:shadow-soft-dark-md transition-all duration-300">
          <div className="bg-gradient-subtle-light dark:bg-gradient-subtle-dark p-4 border-b border-gray-200 dark:border-gray-700/50">
            <div className="flex justify-between items-start">
              <div className="flex items-center">
                <div className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 mr-2">
                  <InformationCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">Dataset Context</h3>
              </div>
            </div>

            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Provide details about what this dataset represents, its timeframe, and any important information for analysis.
            </p>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800">
            {!isEditMode ? (
              datasetContext ? (
                <div className="text-gray-700 dark:text-gray-300 whitespace-pre-line p-3 bg-gray-50 dark:bg-gray-750 rounded-lg">
                  {datasetContext}
                </div>
              ) : (
                <div className="text-gray-400 dark:text-gray-500 italic p-3 bg-gray-50 dark:bg-gray-750 rounded-lg">
                  No context provided. Click Edit All to add a description of this dataset.
                </div>
              )
            ) : (
              <textarea
                value={tempContext}
                onChange={(e) => setTempContext(e.target.value)}
                placeholder="Describe what this dataset contains, its purpose, timeframe, and any relevant details..."
                className="w-full min-h-24 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-soft-sm focus:border-blue-500 focus:ring-blue-500/30 transition-all duration-200"
              />
            )}
          </div>
        </div>

        {/* Column Descriptions Section - Enhanced with better cards and interactions */}
        <div className="mb-6">
          <div className="flex items-center mb-4">
            <TableCellsIcon className="h-5 w-5 mr-2 text-blue-500" />
            <h3 className="text-base font-medium text-gray-800 dark:text-gray-200">Column Descriptions</h3>
          </div>

          {columns.length === 0 ? (
            <div className="p-6 text-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <TableCellsIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No columns found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                This dataset doesn't have any detected columns or the schema couldn't be processed.
              </p>
            </div>
          ) : (
            <div className="space-y-4 mb-4">
              {columns.map((column) => {
                const columnName = typeof column === 'object' ? column.name : column;
                const columnType = typeof column === 'object' && column.type ? column.type : 'unknown';
                const hasDescription = !isEditMode ? !!descriptions[columnName] : !!tempDescriptions[columnName];
                const description = isEditMode ? tempDescriptions[columnName] || '' : descriptions[columnName] || '';

                return (
                  <div
                    key={columnName}
                    className={`
                      rounded-xl border transition-all duration-200 overflow-hidden shadow-soft-md dark:shadow-soft-dark-md
                      ${isEditMode
                        ? 'border-blue-300 dark:border-blue-700 shadow-soft-lg dark:shadow-soft-dark-lg'
                        : 'border-gray-200 dark:border-gray-700'}
                      ${hasDescription
                        ? 'bg-gradient-subtle-light dark:bg-gradient-subtle-dark'
                        : 'bg-white dark:bg-gray-800'}
                    `}
                  >
                    <div className="flex justify-between items-center p-3 border-b border-gray-200 dark:border-gray-700/50">
                      <div className="flex items-center">
                        <div className={`
                          p-1.5 rounded-md mr-2
                          ${hasDescription
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-750 text-gray-500 dark:text-gray-400'}
                        `}>
                          <TableCellsIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="font-medium text-gray-800 dark:text-gray-200">{columnName}</span>
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                            {columnType}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3">
                      {isEditMode ? (
                        <Input
                          value={tempDescriptions[columnName] || ''}
                          onChange={(e) => handleUpdateTempDescription(columnName, e.target.value)}
                          placeholder="Describe what this column represents, its data format, and its significance..."
                          className="w-full transition-all duration-300"
                        />
                      ) : (
                        descriptions[columnName] ? (
                          <p className="text-sm text-gray-700 dark:text-gray-300 p-2 bg-white/80 dark:bg-gray-800/80 rounded-md">
                            {descriptions[columnName]}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                            No description provided. Adding context improves AI analysis accuracy.
                          </p>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Save button - Only shown in edit mode for mobile users who might miss the header button */}
        {isEditMode && (
          <div className="flex justify-end mt-6">
            <Button
              onClick={handleSaveAll}
              disabled={saving}
              isLoading={saving}
              leftIcon={CheckIcon}
              variant="primary"
              className="shadow-soft-md hover:shadow-soft-lg transition-all duration-200"
            >
              {saving ? 'Saving Changes...' : 'Save All Changes'}
            </Button>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default ColumnDescriptionsEditor;