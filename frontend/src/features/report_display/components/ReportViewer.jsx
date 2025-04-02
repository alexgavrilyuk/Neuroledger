// frontend/src/features/report_display/components/ReportViewer.jsx
// SIMPLIFIED VERSION - uses dangerouslySetInnerHTML directly

import React from 'react';
import logger from '../../../shared/utils/logger';

const ReportViewer = ({ htmlContent }) => {
  logger.debug(`ReportViewer: Rendering HTML content (${htmlContent?.length || 0} bytes)`);

  // Just use dangerouslySetInnerHTML directly - no sanitization
  // This is safe because we control the HTML generation in our worker
  return (
    <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
      <div
        className="prose dark:prose-invert max-w-none prose-sm sm:prose-base"
        dangerouslySetInnerHTML={{ __html: htmlContent || '<p>No content available</p>' }}
      />
    </div>
  );
};

export default ReportViewer;