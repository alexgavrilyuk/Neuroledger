// src/features/report_display/components/ReportViewer.jsx
// Fixed with quality assessment indicator hidden by default

import React from 'react';
import DOMPurify from 'dompurify';
import logger from '../../../shared/utils/logger';

const ReportViewer = ({ htmlContent, quality, showQualityIndicator = false }) => { // Default to hidden
  logger.debug(`ReportViewer: Rendering HTML content (${htmlContent?.length || 0} bytes)`);

  // Configure DOMPurify to allow SVG and math elements that might be
  // included in charts or visualizations
  const purifyConfig = {
    ADD_TAGS: ['svg', 'path', 'line', 'polyline', 'rect', 'circle', 'ellipse', 'g', 'text', 'tspan'],
    ADD_ATTR: [
      'viewBox', 'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height',
      'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
      'transform', 'text-anchor', 'dominant-baseline', 'style',
      'class', 'preserveAspectRatio', 'font-size', 'font-weight',
      'textLength', 'lengthAdjust'
    ],
  };

  // Create clean HTML that preserves SVG/chart elements
  const sanitizedHtml = htmlContent
    ? DOMPurify.sanitize(htmlContent, purifyConfig)
    : '<p>No content available</p>';

  return (
    <div className="flex flex-col h-full">
      {/* Report content */}
      <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-grow">
        <div
          className="prose dark:prose-invert max-w-none prose-sm sm:prose-base"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      </div>
    </div>
  );
};

export default ReportViewer;