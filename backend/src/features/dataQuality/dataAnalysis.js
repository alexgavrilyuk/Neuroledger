// backend/src/features/dataQuality/dataAnalysis.js
const { getBucket } = require('../../shared/external_apis/gcs.client');
const logger = require('../../shared/utils/logger');
const Papa = require('papaparse');
const path = require('path');

/**
 * Analyzes the dataset programmatically
 * @param {string} gcsPath - Path to the file in GCS
 * @returns {Promise<Object>} - Programmatic report
 */
const analyzeProgrammatically = async (gcsPath) => {
  logger.info(`Starting programmatic analysis for file at ${gcsPath}`);

  const bucket = getBucket();
  const file = bucket.file(gcsPath);

  // Check if file exists
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`File not found at path: ${gcsPath}`);
  }

  // Create a read stream
  const readStream = file.createReadStream();

  return new Promise((resolve, reject) => {
    // Initialize statistics object
    const stats = {
      rowCount: 0,
      columnCount: 0,
      raggedRows: {
        count: 0,
        examples: []
      },
      columns: {},
      processingTime: 0,
      fileSizeBytes: 0,
      fileType: path.extname(gcsPath).toLowerCase().replace('.', '')
    };

    const startTime = Date.now();

    // Use PapaParse to process the CSV stream
    Papa.parse(readStream, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: false, // We want to detect empty lines

      // Process each row as it's parsed
      step: function(results, parser) {
        stats.rowCount++;

        // Get column names from the first row
        if (stats.rowCount === 1) {
          stats.columnCount = Object.keys(results.data).length;

          // Initialize column statistics
          Object.keys(results.data).forEach(colName => {
            stats.columns[colName] = {
              name: colName,
              nonNullCount: 0,
              nullCount: 0,
              emptyStringCount: 0,
              whitespaceCount: 0,
              uniqueValues: new Set(),
              numericCount: 0,
              nonNumericCount: 0,
              dateAttemptCount: 0,
              minValue: null,
              maxValue: null,
              examples: [],
              issues: []
            };
          });
        }

        // Check if row has different number of columns than expected
        const rowColumnCount = Object.keys(results.data).length;
        if (rowColumnCount !== stats.columnCount) {
          stats.raggedRows.count++;
          if (stats.raggedRows.examples.length < 5) {
            stats.raggedRows.examples.push({
              rowNumber: stats.rowCount,
              expectedColumns: stats.columnCount,
              actualColumns: rowColumnCount
            });
          }
        }

        // Analyze each column in the row
        Object.entries(results.data).forEach(([colName, value]) => {
          const col = stats.columns[colName];
          if (!col) return; // Skip if column wasn't in headers

          // Track null/empty values
          if (value === null || value === undefined) {
            col.nullCount++;
            return;
          }

          col.nonNullCount++;

          // Handle string values
          if (typeof value === 'string') {
            // Check for empty strings
            if (value === '') {
              col.emptyStringCount++;
              return;
            }

            // Check for whitespace-only strings
            if (value.trim() === '') {
              col.whitespaceCount++;
              return;
            }

            // Try to parse as number
            const numberValue = Number(value);
            if (!isNaN(numberValue)) {
              col.numericCount++;

              // Update min/max
              if (col.minValue === null || numberValue < col.minValue) {
                col.minValue = numberValue;
              }
              if (col.maxValue === null || numberValue > col.maxValue) {
                col.maxValue = numberValue;
              }
            } else {
              col.nonNumericCount++;

              // Try to parse as date
              const dateValue = new Date(value);
              if (!isNaN(dateValue.getTime())) {
                col.dateAttemptCount++;
              }
            }
          }
          // Handle numeric values directly
          else if (typeof value === 'number') {
            col.numericCount++;

            // Update min/max
            if (col.minValue === null || value < col.minValue) {
              col.minValue = value;
            }
            if (col.maxValue === null || value > col.maxValue) {
              col.maxValue = value;
            }
          }

          // Track unique values (up to 1000 to avoid memory issues)
          if (col.uniqueValues.size < 1000) {
            col.uniqueValues.add(value);
          }

          // Store up to 10 examples of non-null values
          if (col.examples.length < 10) {
            col.examples.push({
              rowNumber: stats.rowCount,
              value: value
            });
          }
        });
      },

      complete: function(results) {
        const endTime = Date.now();
        stats.processingTime = endTime - startTime;

        // Get file size from parse results if available
        if (results.meta && results.meta.size) {
          stats.fileSizeBytes = results.meta.size;
        }

        // Final column processing
        Object.values(stats.columns).forEach(col => {
          // Calculate percentages
          const totalRows = stats.rowCount;
          col.nullPercentage = totalRows > 0 ? (col.nullCount / totalRows) * 100 : 0;
          col.emptyStringPercentage = totalRows > 0 ? (col.emptyStringCount / totalRows) * 100 : 0;
          col.whitespacePercentage = totalRows > 0 ? (col.whitespaceCount / totalRows) * 100 : 0;
          col.missingPercentage = totalRows > 0 ?
            ((col.nullCount + col.emptyStringCount + col.whitespaceCount) / totalRows) * 100 : 0;

          // Calculate cardinality
          col.cardinality = col.uniqueValues.size;
          col.cardinalityPercentage = col.nonNullCount > 0 ?
            (col.cardinality / col.nonNullCount) * 100 : 0;

          // Determine if column appears numeric
          col.appearingNumeric = col.nonNullCount > 0 &&
            (col.numericCount / col.nonNullCount) > 0.8;

          // Determine if column appears to contain dates
          col.appearingDates = col.nonNullCount > 0 &&
            (col.dateAttemptCount / col.nonNullCount) > 0.8;

          // Identify potential issues
          if (col.missingPercentage > 10) {
            col.issues.push({
              type: 'high_missing_values',
              description: `High percentage of missing values: ${col.missingPercentage.toFixed(2)}%`,
              severity: col.missingPercentage > 50 ? 'high' : 'medium'
            });
          }

          if (col.appearingNumeric && col.nonNumericCount > 0) {
            col.issues.push({
              type: 'inconsistent_numeric',
              description: `Column appears numeric but has ${col.nonNumericCount} non-numeric values`,
              severity: 'medium'
            });
          }

          if (col.appearingDates && col.nonNullCount > col.dateAttemptCount) {
            col.issues.push({
              type: 'inconsistent_dates',
              description: `Column appears to contain dates but has ${col.nonNullCount - col.dateAttemptCount} non-date values`,
              severity: 'medium'
            });
          }

          // For string columns, check cardinality
          if (!col.appearingNumeric && !col.appearingDates && col.cardinalityPercentage > 95) {
            col.issues.push({
              type: 'high_cardinality',
              description: `High unique value ratio (${col.cardinalityPercentage.toFixed(2)}%), possibly unique identifiers or free text`,
              severity: 'low'
            });
          }

          // Convert Set to Array for JSON serialization
          col.uniqueValues = Array.from(col.uniqueValues).slice(0, 100); // Limit to 100 values
        });

        // Add overall dataset issues
        stats.issues = [];

        if (stats.raggedRows.count > 0) {
          stats.issues.push({
            type: 'ragged_rows',
            description: `Dataset contains ${stats.raggedRows.count} rows with inconsistent column counts`,
            severity: 'high',
            examples: stats.raggedRows.examples
          });
        }

        // Count columns with high missing values
        const columnsWithHighMissing = Object.values(stats.columns).filter(col => col.missingPercentage > 20).length;
        if (columnsWithHighMissing > 0) {
          stats.issues.push({
            type: 'multiple_high_missing_columns',
            description: `Dataset has ${columnsWithHighMissing} columns with >20% missing values`,
            severity: columnsWithHighMissing > (stats.columnCount / 3) ? 'high' : 'medium'
          });
        }

        resolve(stats);
      },

      error: function(error) {
        reject(new Error(`Error parsing CSV: ${error.message}`));
      }
    });
  });
};

module.exports = {
  analyzeProgrammatically
};