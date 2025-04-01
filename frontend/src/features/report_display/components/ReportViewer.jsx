// frontend/src/features/report_display/components/ReportViewer.jsx
// ** NEW FILE - Replaces DynamicRenderer logic, focused on viewing **
import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import logger from '../../../shared/utils/logger';

// Use the same sanitization config as before
const SANITIZE_CONFIG = {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'ul', 'ol', 'li', 'figure', 'canvas', 'svg', 'path', 'g', 'rect', 'circle', 'line', 'text'], // Allow basic SVG/Canvas for charts if needed
    ADD_ATTR: ['colspan', 'rowspan', 'width', 'height', 'viewbox', 'fill', 'stroke', 'strokewidth', 'cx', 'cy', 'r', 'x', 'y', 'd', 'transform', 'points'], // Allow presentation attributes
};

const ReportViewer = ({ htmlContent }) => {
    const sanitizedHtml = useMemo(() => {
        if (typeof htmlContent !== 'string' || !htmlContent.trim()) {
            logger.warn('ReportViewer received invalid or empty htmlContent');
            return { __html: '<p class="text-gray-500 dark:text-gray-400 italic p-4">Report content is empty or invalid.</p>' };
        }
        try {
            DOMPurify.removeAllHooks(); // Ensure clean state if re-used
            // Optional: Add hooks for processing specific elements, e.g., initializing charts
            // DOMPurify.addHook('afterSanitizeElements', (node) => {
            //     if (node.nodeName === 'CANVAS' && node.dataset.chartConfig) {
            //         // Logic to maybe render chart using Chart.js after mount? Complex.
            //     }
            // });
            const clean = DOMPurify.sanitize(htmlContent, SANITIZE_CONFIG);
            logger.debug(`ReportViewer: Sanitized HTML length: ${clean.length}`);
            if (clean.length < htmlContent.length * 0.8 && htmlContent.length > 100) {
                logger.warn('ReportViewer: HTML content significantly reduced after sanitization.');
            }
            return { __html: clean };
        } catch (error) {
             logger.error('ReportViewer: Error during DOMPurify sanitization:', error);
             return { __html: '<p class="text-red-500 p-4">Error: Could not securely render report content.</p>' };
        }
    }, [htmlContent]);

    // Apply prose styles for default HTML element styling, plus padding inside the viewer
    // Max height and overflow for scrolling within the modal body
    return (
        <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
            <div
                className="prose dark:prose-invert max-w-none prose-sm sm:prose-base prose-table:border prose-th:border prose-td:border prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1" // Added basic table styling via prose modifiers
                dangerouslySetInnerHTML={sanitizedHtml}
            />
        </div>
    );
};

export default ReportViewer;