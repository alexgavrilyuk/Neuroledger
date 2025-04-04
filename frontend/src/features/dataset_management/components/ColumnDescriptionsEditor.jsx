// frontend/src/features/dataset_management/components/ColumnDescriptionsEditor.jsx
import React, { useState, useEffect } from 'react';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import Card from '../../../shared/ui/Card';
import Spinner from '../../../shared/ui/Spinner';
import { PencilIcon, CheckIcon, XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import apiClient from '../../../shared/services/apiClient';
import logger from '../../../shared/utils/logger';

const ColumnDescriptionsEditor = ({ datasetId, onSaveSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [columns, setColumns] = useState([]);
  const [descriptions, setDescriptions] = useState({});
  const [editingDescription, setEditingDescription] = useState(null);
  const [tempDescription, setTempDescription] = useState('');
  const [datasetContext, setDatasetContext] = useState('');
  const [isContextEditing, setIsContextEditing] = useState(false);
  const [tempContext, setTempContext] = useState('');

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

  const handleEditDescription = (columnName) => {
    setEditingDescription(columnName);
    setTempDescription(descriptions[columnName] || '');
  };

  const handleCancelEdit = () => {
    setEditingDescription(null);
    setTempDescription('');
  };

  const handleSaveDescription = (columnName) => {
    setDescriptions(prev => ({
      ...prev,
      [columnName]: tempDescription
    }));
    setEditingDescription(null);
    setTempDescription('');
  };

  const handleEditContext = () => {
    setIsContextEditing(true);
    setTempContext(datasetContext);
  };

  const handleCancelContextEdit = () => {
    setIsContextEditing(false);
    setTempContext('');
  };

  const handleSaveContext = () => {
    setDatasetContext(tempContext);
    setIsContextEditing(false);
    setTempContext('');
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setError(null);

      const response = await apiClient.put(`/datasets/${datasetId}`, {
        columnDescriptions: descriptions,
        description: datasetContext
      });

      if (response.data.status === 'success') {
        logger.info('Successfully saved dataset context and column descriptions');
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
      <div className="flex justify-center items-center my-8">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 p-4 rounded-md text-red-600 dark:text-red-300 my-4">
        <p className="font-medium">Error loading schema:</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <Card>
      <Card.Header>Dataset Context and Column Descriptions</Card.Header>
      <Card.Body>
        {/* Dataset Context Section */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-md font-semibold text-gray-700 dark:text-gray-300 flex items-center">
              <InformationCircleIcon className="h-5 w-5 mr-1 text-blue-500" />
              Dataset Context
            </h3>
            {!isContextEditing ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleEditContext}
                leftIcon={PencilIcon}
              >
                Edit
              </Button>
            ) : (
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelContextEdit}
                  leftIcon={XMarkIcon}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveContext}
                  leftIcon={CheckIcon}
                >
                  Save
                </Button>
              </div>
            )}
          </div>

          <div className="text-sm">
            {!isContextEditing ? (
              datasetContext ? (
                <p className="text-gray-600 dark:text-gray-400 whitespace-pre-line">{datasetContext}</p>
              ) : (
                <p className="text-gray-400 dark:text-gray-500 italic">
                  No context provided. Click Edit to add a description of this dataset.
                </p>
              )
            ) : (
              <textarea
                value={tempContext}
                onChange={(e) => setTempContext(e.target.value)}
                placeholder="Describe what this dataset contains, its purpose, timeframe, and any relevant details..."
                className="w-full min-h-24 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            )}
          </div>
        </div>

        {/* Column Descriptions Section */}
        <div className="mb-4">
          <h3 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-2">Column Descriptions</h3>

          {columns.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 italic">No columns found in dataset schema.</p>
          ) : (
            <div className="space-y-4 mb-4">
              {columns.map((column) => {
                const columnName = typeof column === 'object' ? column.name : column;
                const columnType = typeof column === 'object' && column.type ? column.type : 'unknown';

                return (
                  <div key={columnName} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{columnName}</span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({columnType})</span>
                      </div>

                      {editingDescription !== columnName ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditDescription(columnName)}
                          leftIcon={PencilIcon}
                        >
                          {descriptions[columnName] ? 'Edit' : 'Add Description'}
                        </Button>
                      ) : (
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelEdit}
                            leftIcon={XMarkIcon}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSaveDescription(columnName)}
                            leftIcon={CheckIcon}
                          >
                            Save
                          </Button>
                        </div>
                      )}
                    </div>

                    {editingDescription === columnName ? (
                      <Input
                        value={tempDescription}
                        onChange={(e) => setTempDescription(e.target.value)}
                        placeholder="Describe what this column represents..."
                      />
                    ) : (
                      descriptions[columnName] ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400">{descriptions[columnName]}</p>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">No description provided</p>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="flex justify-end mt-6">
          <Button
            onClick={handleSaveAll}
            disabled={saving}
            isLoading={saving}
          >
            Save All Changes
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
};

export default ColumnDescriptionsEditor;