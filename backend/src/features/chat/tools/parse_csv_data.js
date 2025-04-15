import Dataset from '../../../models/Dataset.js';
import { Types } from 'mongoose';

/**
 * Parses CSV data using the dataset ID
 * @param {Object} params - Parameters for the function
 * @param {string} params.datasetId - The MongoDB ObjectId of the dataset to parse, not the filename
 * @param {string} [params.filters] - Optional filters to apply to the dataset
 * @returns {Promise<Object>} The parsed CSV data
 */
export default async function parse_csv_data({ datasetId, filters }) {
  try {
    // Validate that the datasetId is a valid MongoDB ObjectId
    if (!Types.ObjectId.isValid(datasetId)) {
      throw new Error(`Invalid dataset ID format: '${datasetId}'. You must use the MongoDB ObjectId format shown in the dataset header, not a filename.`);
    }

    // Find the dataset by ID
    const dataset = await Dataset.findById(datasetId);
    
    if (!dataset) {
      throw new Error(`Dataset with ID ${datasetId} not found. Please check the dataset ID and try again.`);
    }

    // Get the CSV data
    const parsedData = dataset.parsedData || [];
    
    // Apply filters if provided
    let filteredData = parsedData;
    if (filters) {
      try {
        const filterObj = typeof filters === 'string' ? JSON.parse(filters) : filters;
        filteredData = applyFilters(parsedData, filterObj);
      } catch (filterError) {
        throw new Error(`Error applying filters: ${filterError.message}`);
      }
    }

    return {
      data: filteredData,
      columns: dataset.schemaInfo.map(col => col.name),
      rowCount: filteredData.length,
      originalRowCount: parsedData.length
    };
  } catch (error) {
    console.error('Error in parse_csv_data:', error);
    throw error;
  }
}

/**
 * Applies filters to the dataset
 * @param {Array<Object>} data - The data to filter
 * @param {Object} filters - The filters to apply
 * @returns {Array<Object>} The filtered data
 */
function applyFilters(data, filters) {
  // Implementation of filter logic
  // This is a placeholder for actual filter implementation
  if (!filters || Object.keys(filters).length === 0) {
    return data;
  }

  return data.filter(row => {
    for (const [key, value] of Object.entries(filters)) {
      if (row[key] !== value) {
        return false;
      }
    }
    return true;
  });
} 