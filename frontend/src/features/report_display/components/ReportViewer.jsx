// src/features/report_display/components/ReportViewer.jsx
// Dynamic report display that works with any data structure

import React from 'react';
import DOMPurify from 'dompurify';
import logger from '../../../shared/utils/logger';

const ReportViewer = ({ htmlContent }) => {
  logger.debug(`ReportViewer: Rendering HTML content (${htmlContent?.length || 0} bytes)`);

  // The key issue is that server-rendered React components (via renderToString)
  // lose their interactivity. This is not a React-hydration issue, but rather
  // a limitation in how the Web Worker processes and returns the HTML.

  // Solution: Configure DOMPurify to allow SVG and math elements that might be
  // included in charts or visualizations
  const purifyConfig = {
    ADD_TAGS: ['svg', 'path', 'line', 'polyline', 'rect', 'circle', 'ellipse'],
    ADD_ATTR: [
      'viewBox', 'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height',
      'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
      'transform', 'text-anchor', 'dominant-baseline', 'style'
    ],
  };

  // Create clean HTML that preserves SVG/chart elements
  const sanitizedHtml = htmlContent
    ? DOMPurify.sanitize(htmlContent, purifyConfig)
    : '<p>No content available</p>';

  return (
    <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
      <div
        className="prose dark:prose-invert max-w-none prose-sm sm:prose-base"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  );
};

export default ReportViewer;