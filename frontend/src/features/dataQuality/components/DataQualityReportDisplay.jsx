// frontend/src/features/dataQuality/components/DataQualityReportDisplay.jsx
import React, { useState } from 'react';
import Card from '../../../shared/ui/Card';
import Button from '../../../shared/ui/Button';
import {
  ChartPieIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  LightBulbIcon,
  ListBulletIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentMagnifyingGlassIcon,
  WrenchIcon
} from '@heroicons/react/24/outline';

const DataQualityReportDisplay = ({ reportData, onResetAudit, isResetting }) => {
  const [expandedSections, setExpandedSections] = useState({
    detailedAnalysis: false,
    recommendations: true
  });

  if (!reportData) return null;

  // Helper to determine status icon and color based on quality score
  const getScoreDetails = (score) => {
    if (score >= 80) {
      return {
        icon: CheckCircleIcon,
        color: 'text-green-500',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        textColor: 'text-green-800 dark:text-green-300',
        label: 'Good'
      };
    } else if (score >= 50) {
      return {
        icon: ExclamationTriangleIcon,
        color: 'text-amber-500',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
        textColor: 'text-amber-800 dark:text-amber-300',
        label: 'Needs Improvement'
      };
    } else {
      return {
        icon: ExclamationCircleIcon,
        color: 'text-red-500',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        textColor: 'text-red-800 dark:text-red-300',
        label: 'Poor'
      };
    }
  };

  const scoreDetails = getScoreDetails(reportData.qualityScore);
  const ScoreIcon = scoreDetails.icon;

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Determine color for priority badges
  const getPriorityColor = (priority) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      case 'medium':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300';
      case 'low':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      <Card elevation="default">
        <Card.Header>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <ChartPieIcon className="h-5 w-5 mr-2 text-blue-500" />
              <span className="font-medium">Data Quality Audit Report</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={ArrowPathIcon}
              onClick={onResetAudit}
              isLoading={isResetting}
              disabled={isResetting}
            >
              Reset Audit
            </Button>
          </div>
        </Card.Header>

        <Card.Body>
          {/* Score and Executive Summary */}
          <div className="mb-6 grid md:grid-cols-3 gap-6">
            {/* Score Card */}
            <div className={`${scoreDetails.bgColor} rounded-xl p-4 flex flex-col items-center justify-center text-center border border-${scoreDetails.color.split('-')[1]}-200 dark:border-${scoreDetails.color.split('-')[1]}-800/50`}>
              <ScoreIcon className={`h-8 w-8 ${scoreDetails.color} mb-2`} />
              <div className={`text-3xl font-bold ${scoreDetails.textColor}`}>
                {reportData.qualityScore}/100
              </div>
              <div className={`text-sm font-medium ${scoreDetails.textColor}`}>
                {scoreDetails.label}
              </div>
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                Quality Score
              </div>
            </div>

            {/* Executive Summary */}
            <div className="md:col-span-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
                Executive Summary
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {reportData.executiveSummary}
              </p>
            </div>
          </div>

          {/* Key Findings */}
          <div className="mb-6">
            <div className="flex items-center mb-3">
              <LightBulbIcon className="h-5 w-5 text-amber-500 mr-2" />
              <h3 className="text-base font-medium text-gray-900 dark:text-white">
                Key Findings
              </h3>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
              {reportData.keyFindings.map((finding, index) => (
                <div key={index} className="p-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    {finding.issue}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {finding.impact}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Analysis (Collapsible) */}
          <div className="mb-6">
            <button
              onClick={() => toggleSection('detailedAnalysis')}
              className="flex items-center justify-between w-full mb-3 group"
            >
              <div className="flex items-center">
                <DocumentMagnifyingGlassIcon className="h-5 w-5 text-blue-500 mr-2" />
                <h3 className="text-base font-medium text-gray-900 dark:text-white">
                  Detailed Analysis
                </h3>
              </div>
              {expandedSections.detailedAnalysis ? (
                <ChevronUpIcon className="h-5 w-5 text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400" />
              )}
            </button>

            {expandedSections.detailedAnalysis && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                {Object.entries(reportData.detailedAnalysis).map(([category, findings]) => (
                  <div key={category} className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white capitalize border-b border-gray-200 dark:border-gray-700 pb-2">
                      {category.replace(/_/g, ' ')}
                    </h4>
                    <div className="space-y-3">
                      {findings.map((finding, index) => (
                        <div key={index} className="bg-gray-50 dark:bg-gray-800/80 rounded-lg p-3">
                          {finding.title && (
                            <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                              {finding.title}
                            </h5>
                          )}
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {finding.content || finding.description}
                          </p>
                          {finding.severity && (
                            <span className={`mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(finding.severity)}`}>
                              {finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)} Severity
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recommendations (Collapsible) */}
          <div>
            <button
              onClick={() => toggleSection('recommendations')}
              className="flex items-center justify-between w-full mb-3 group"
            >
              <div className="flex items-center">
                <WrenchIcon className="h-5 w-5 text-blue-500 mr-2" />
                <h3 className="text-base font-medium text-gray-900 dark:text-white">
                  Recommendations
                </h3>
              </div>
              {expandedSections.recommendations ? (
                <ChevronUpIcon className="h-5 w-5 text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400" />
              )}
            </button>

            {expandedSections.recommendations && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="space-y-4">
                  {reportData.recommendations.map((rec, index) => (
                    <div key={index} className="flex space-x-3">
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <ListBulletIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                            {rec.recommendation}
                          </h4>
                          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(rec.priority)}`}>
                            {rec.priority}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {rec.rationale}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card.Body>

        <Card.Footer align="left">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Report generated: {new Date(reportData.metadata?.generatedAt).toLocaleString()} • Quality score explanation: {reportData.scoreExplanation}
          </div>
        </Card.Footer>
      </Card>
    </div>
  );
};

export default DataQualityReportDisplay;