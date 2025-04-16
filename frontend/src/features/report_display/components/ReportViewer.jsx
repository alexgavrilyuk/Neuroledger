// ================================================================================
// FILE: NeuroLedger/frontend/src/features/report_display/components/ReportViewer.jsx
// PURPOSE: Renders the report sandbox iframe and handles communication.
// VERSION: Corrected postMessage targetOrigin. COMPLETE JSX. NO PLACEHOLDERS.
// ================================================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import logger from '../../../shared/utils/logger';
import Spinner from '../../../shared/ui/Spinner';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Button from '../../../shared/ui/Button';
import apiClient from '../../../shared/services/apiClient'; // Restore apiClient import

const ReportViewer = ({ reportInfo, themeName = 'light' }) => {
    // ---- ADD DEBUG LOG ----
    console.log('[ReportViewer START] Rendering/Mounting. Initial reportInfo:', reportInfo);
    // ---- END DEBUG LOG ----

    const iframeRef = useRef(null);
    const [iframeStatus, setIframeStatus] = useState('init'); // init, loading_html, ready_for_libs, ready_for_data, sending_data, rendering, rendered, error
    const [iframeError, setIframeError] = useState(null);
    const [isIframeReadyForData, setIsIframeReadyForData] = useState(false); // Track if iframe sent 'iframeReady'
    const [iframeContentWindow, setIframeContentWindow] = useState(null); // Store reference to iframe window
    const [pdfExportStatus, setPdfExportStatus] = useState('idle'); // idle, starting, success, error
    const [pdfExportError, setPdfExportError] = useState(null);

    // Define the target origin for postMessage security (use '*' for sandboxed iframes during dev/if needed)
    // Use window.location.origin for production if the iframe src is from the same origin (but it isn't here)
    const targetOrigin = '*'; // Changed for sandboxed iframe compatibility
    // const targetOrigin = window.location.origin; // Use this for same-origin iframes

    // Handle iframe onLoad event - get reference to its window
    const handleIframeLoad = useCallback(() => {
        // ---- ADD DEBUG LOG ----
        console.log('[ReportViewer Callback] handleIframeLoad executing.');
        // ---- END DEBUG LOG ----
        logger.debug('ReportViewer: Iframe onLoad event fired.');
        const contentWin = iframeRef.current?.contentWindow;
        if (contentWin) {
             setIframeContentWindow(contentWin);
             setIframeStatus('ready_for_libs'); // HTML loaded, waiting for libraries inside iframe
             setIsIframeReadyForData(false); // Reset flag until iframe signals readiness
             setIframeError(null);
             setPdfExportStatus('idle'); // Reset export status on load
             logger.debug('ReportViewer: Stored iframe contentWindow in state.');
        } else {
             logger.error("ReportViewer: Iframe loaded but contentWindow is inaccessible!");
             setIframeStatus('error');
             setIframeError('Failed to access iframe content window.');
             setIframeContentWindow(null);
        }
    }, []); // No dependencies, only uses iframeRef

    // --- CORRECTED sendDataAndCodeToIframe ---
    // Sends the actual code and data to the iframe via postMessage
    const sendDataAndCodeToIframe = useCallback(() => {
        // ---- ADD DEBUG LOG ----
        // Log expecting analysisData in reportInfo
        console.log('[ReportViewer Callback] sendDataAndCodeToIframe executing. Report Info:', reportInfo);
        // ---- END DEBUG LOG ----
        logger.info("ReportViewer: Attempting to send data and code to iframe.");
        if (!iframeContentWindow) {
            logger.error("ReportViewer: Cannot send message, iframe contentWindow not available.");
            setIframeStatus('error');
            setIframeError('Iframe communication channel lost.');
            return;
        }
        // Modify this check to only require code
        if (!reportInfo || !reportInfo.code) {
            logger.error("ReportViewer: Cannot send message, missing code in reportInfo.", reportInfo);
            setIframeStatus('error');
            setIframeError('Missing report code.');
            return;
        }

        try {
            // Use the targetOrigin defined above ('*' or specific origin)
            logger.debug(`ReportViewer: Sending 'loadDataAndCode' message to iframe (Target Origin: ${targetOrigin})`);
            iframeContentWindow.postMessage(
                {
                    type: 'loadDataAndCode',
                    payload: {
                        code: reportInfo.code, // Send the actual code string
                        // Send analysisData as reportData
                        reportData: reportInfo.analysisData || {}, // Use analysisData, provide default empty object
                    },
                },
                targetOrigin // Use the defined targetOrigin
            );
            logger.info("ReportViewer: 'loadDataAndCode' message sent to iframe.");
            setIframeStatus('rendering'); // Assume iframe will start rendering now
        } catch (postError) {
            logger.error("ReportViewer: Error occurred during postMessage:", postError);
            setIframeStatus('error');
            setIframeError(`Failed to send data to sandbox: ${postError.message}`);
        }
        // DEPENDENCIES: iframeContentWindow and reportInfo are needed. targetOrigin is used from scope.
    }, [iframeContentWindow, reportInfo, targetOrigin]);
    // --- END CORRECTED ---

    // Effect to handle messages *from* the iframe
    useEffect(() => {
        // ---- ADD DEBUG LOG ----
        console.log('[ReportViewer Effect] Setting up message listener.');
        // ---- END DEBUG LOG ----
        const handleIframeMessage = (event) => {
            // Security: Check if the message is from the expected origin OR a null origin from the specific iframe window we know
             const isExpectedOrigin = event.origin === targetOrigin && targetOrigin !== '*'; // Don't check if target is '*'
             const isSandboxedFromOurIframe = event.origin === 'null' && event.source === iframeContentWindow;

            if (!isExpectedOrigin && !isSandboxedFromOurIframe && targetOrigin !== '*') {
                 logger.warn(`ReportViewer: Message received from unexpected origin: ${event.origin}. Expected: ${targetOrigin}. Ignoring.`);
                 return;
            }

             const { type, status, detail } = event.data || {}; // Add safety check for event.data

             if (type === 'iframeReady') {
                 logger.info('ReportViewer: Received iframeReady signal.');
                 // ---- ADD DEBUG LOG ----
                 console.log('[ReportViewer Effect] Received iframeReady message from iframe.');
                 // ---- END DEBUG LOG ----
                 setIframeStatus('ready_for_data'); // Now ready for data AND code
                 setIsIframeReadyForData(true); // Set the flag
             } else if (type === 'iframeReportStatus') {
                 logger.debug(`ReportViewer: Received iframeReportStatus from iframe: ${status}`);
                 if (status === 'success') {
                     setIframeStatus('rendered');
                     setIframeError(null);
                     setPdfExportStatus('idle'); // Ready to export once rendered
                 } else if (status === 'error') {
                     setIframeStatus('error');
                     setIframeError(detail || 'Iframe reported an execution error');
                     setPdfExportStatus('idle'); // Reset on general iframe error
                 } else {
                     logger.warn(`ReportViewer: Received unknown iframeReportStatus: ${status}`);
                 }
             } else if (type === 'reportHtmlResponse') {
                 logger.info(`ReportViewer: Received reportHtmlResponse from iframe. Status: ${status}`);
                 if (status === 'success' && detail?.html) {
                     setPdfExportStatus('generating'); // Update status
                     // Call backend API to generate PDF
                     callExportApi(detail.html);
                 } else {
                     logger.error('ReportViewer: Failed to get HTML from iframe.', detail);
                     setPdfExportStatus('error');
                     setPdfExportError(detail || 'Failed to retrieve report HTML from sandbox.');
                 }
             } else { // Handle other message types if necessary
                 logger.warn(`ReportViewer: Received unhandled message type: ${type}`);
             }
        };
        window.addEventListener('message', handleIframeMessage);
        // Cleanup listener
        return () => {
             // ---- ADD DEBUG LOG ----
             console.log('[ReportViewer Effect] Cleaning up message listener.');
             // ---- END DEBUG LOG ----
            window.removeEventListener('message', handleIframeMessage);
        };
        // DEPENDENCIES: targetOrigin needed for check, iframeContentWindow needed for source check
    }, [targetOrigin, iframeContentWindow]);

    // Effect to *call* sendDataAndCodeToIframe when conditions are met
    useEffect(() => {
        // ---- ADD DEBUG LOG ----
        // Log check, still based on reportInfo.code
        console.log(`[ReportViewer Effect] Send data check. Status: ${iframeStatus}, ReadyFlag: ${isIframeReadyForData}, HasCode: ${!!reportInfo?.code}, HasWindow: ${!!iframeContentWindow}`);
        // ---- END DEBUG LOG ----
        logger.debug(`ReportViewer: Send data effect triggered. Status: ${iframeStatus}, ReadyFlag: ${isIframeReadyForData}, HasCode: ${!!reportInfo?.code}, HasWindowInState: ${!!iframeContentWindow}`);

        // Check if iframe has signaled it's ready AND we have the code AND we have the window reference
        if (iframeStatus === 'ready_for_data' && isIframeReadyForData && reportInfo?.code && iframeContentWindow) {
             // ---- ADD DEBUG LOG ----
             console.log('[ReportViewer Effect] Conditions met for sending data.');
             // ---- END DEBUG LOG ----
            logger.info("ReportViewer: Conditions met (code received, iframe ready), setting status to 'sending_data' and calling send function.");
            setIframeStatus('sending_data');
            // Use setTimeout to ensure the call happens in the next event loop tick, just after state update
             const timeoutId = setTimeout(() => {
                 logger.info("ReportViewer: setTimeout executing - Calling sendDataAndCodeToIframe.");
                 sendDataAndCodeToIframe(); // Call the actual send function
             }, 0); // 0ms delay is usually sufficient
             return () => clearTimeout(timeoutId); // Cleanup timeout if component unmounts or deps change
        }
        // DEPENDENCIES: Watch all conditions needed to trigger the send (excluding datasets check)
    }, [iframeStatus, isIframeReadyForData, reportInfo, iframeContentWindow, sendDataAndCodeToIframe]);

    // Effect to send theme updates to the iframe
    useEffect(() => {
        // Send theme only if we have the window ref and it's ready for data (meaning libraries are loaded)
        if (iframeContentWindow && isIframeReadyForData) {
            // logger.debug(`ReportViewer: Sending theme update to ready iframe: ${themeName} (Target Origin: ${targetOrigin})`);
            try {
                 iframeContentWindow.postMessage(
                     { type: 'setTheme', payload: { name: themeName } },
                     targetOrigin // Use defined targetOrigin
                 );
            } catch (postError) {
                 logger.error("ReportViewer: Error sending theme update:", postError);
            }
        }
        // DEPENDENCIES: Theme name, readiness flag, window reference, target origin
    }, [themeName, targetOrigin, isIframeReadyForData, iframeContentWindow]);

     // Effect to reset status when new reportInfo comes in
     useEffect(() => {
         // ---- ADD DEBUG LOG ----
         // Log check, still based on reportInfo (which now contains analysisData)
         console.log('[ReportViewer Effect] reportInfo changed effect triggered. reportInfo:', reportInfo);
         // ---- END DEBUG LOG ----
         if (reportInfo && reportInfo.code) { // Check for code existence specifically
            logger.debug("ReportViewer: reportInfo changed/provided with code, resetting iframe state and triggering reload.");
             // ---- ADD DEBUG LOG ----
             console.log('[ReportViewer Effect] Resetting state due to new/changed reportInfo.');
             // ---- END DEBUG LOG ----
            setIframeStatus('loading_html'); // Start the status cycle again
            setIframeError(null);
            setIsIframeReadyForData(false);
            setIframeContentWindow(null); // Clear old window reference
            // Force iframe reload by changing key or src slightly (if needed, usually key is enough)
         } else {
             // ---- ADD DEBUG LOG ----
             console.log('[ReportViewer Effect] Clearing state due to null reportInfo.');
             // ---- END DEBUG LOG ----
             // Clear state if reportInfo becomes null (e.g., modal closed and reset)
             setIframeStatus('init');
             setIframeError(null);
             setIsIframeReadyForData(false);
             setIframeContentWindow(null);
         }
     }, [reportInfo]); // Only trigger reset when reportInfo itself changes

    // Function to trigger request for HTML from iframe
    const handleExportClick = useCallback(() => {
        logger.info('ReportViewer: PDF Export button clicked.');
        if (iframeContentWindow && (iframeStatus === 'rendered' || isIframeReadyForData)) {
            setPdfExportStatus('starting');
            setPdfExportError(null);
            logger.debug(`ReportViewer: Sending 'getReportHtml' message to iframe (Target Origin: ${targetOrigin})`);
            try {
                iframeContentWindow.postMessage({ type: 'getReportHtml' }, targetOrigin);
            } catch (postError) {
                logger.error("ReportViewer: Error sending getReportHtml message:", postError);
                setPdfExportStatus('error');
                setPdfExportError(`Failed to communicate with sandbox: ${postError.message}`);
                // Reset status after delay
                setTimeout(() => setPdfExportStatus('idle'), 3000);
            }
        } else {
            logger.warn('ReportViewer: Export clicked, but iframe is not ready or accessible.');
            setPdfExportStatus('error');
            setPdfExportError('Report is not ready for export yet.');
            // Reset status after delay
            setTimeout(() => setPdfExportStatus('idle'), 3000);
        }
    }, [iframeContentWindow, iframeStatus, isIframeReadyForData, targetOrigin]);

    // Function to call the backend PDF export API using apiClient
    const callExportApi = useCallback(async (htmlContent) => {
        logger.info('ReportViewer: Calling backend export endpoint via apiClient.');

        // Authentication is handled by the apiClient interceptor
        // API path needs adjustment relative to apiClient baseURL ('/api/v1')
        const relativeApiPath = '../export/pdf'; // Goes from /api/v1 up to /api then down to /export/pdf
        
        try {
            const response = await apiClient.post(relativeApiPath, {
                htmlContent,
                themeName // Send theme to backend for styling
            }, {
                responseType: 'blob' // Crucial: expect binary data (PDF)
            });

            // Create a Blob from the PDF Stream (axios puts blob in response.data)
            const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
 
            // Create a Blob URL from the PDF data
            const fileURL = URL.createObjectURL(pdfBlob);
            
            // Create temp link element and trigger download
            const link = document.createElement('a');
            link.href = fileURL;
            link.download = 'report.pdf';
            link.click();
            URL.revokeObjectURL(fileURL);

            setPdfExportStatus('success');
            setPdfExportError(null);
        } catch (error) {
            logger.error('ReportViewer: Backend PDF export failed:', error);
            let errorMsg = 'Failed to generate PDF on server.';
            // Axios error structure differs from fetch
            if (error.response && error.response.data) {
                // Try to parse error message from blob if API returns error as JSON blob
                try {
                    const errorJson = JSON.parse(await error.response.data.text());
                    errorMsg = errorJson.message || errorMsg;
                } catch (parseError) {
                    // Fallback if error response isn't JSON
                    errorMsg = error.response.statusText || errorMsg;
                }
            } else {
                 errorMsg = error.message || errorMsg;
            }
            
            setPdfExportStatus('error');
            setPdfExportError(errorMsg);
            setTimeout(() => setPdfExportStatus('idle'), 3000); // Reset after error
        }
    }, [themeName]); // Dependencies: themeName is sent, apiClient handles auth context implicitly

    // UI Status Mapping
    const getStatusText = () => {
         switch(iframeStatus) {
             case 'error': return `Error: ${iframeError || 'Unknown Error'}`;
             case 'rendered': return 'Report rendered successfully';
             case 'rendering': return 'Rendering report inside sandbox...';
             case 'sending_data': return 'Sending code and data to sandbox...';
             case 'ready_for_data': return 'Sandbox ready, preparing data...';
             case 'ready_for_libs': return 'Sandbox loaded, loading libraries...';
             case 'loading_html': return 'Loading sandbox environment...';
             case 'init': return 'Waiting for report data...';
             default: return 'Loading...';
         }
    }
    // Determine visibility of UI elements based on status
    const showSpinner = ['loading_html', 'ready_for_libs', 'ready_for_data', 'sending_data', 'rendering'].includes(iframeStatus) && !iframeError;
    const showErrorIcon = iframeStatus === 'error';
    const showStatusBar = iframeStatus !== 'rendered' || iframeError; // Show status unless successfully rendered

    // Determine button state
    const isExportDisabled = pdfExportStatus === 'starting' || iframeStatus !== 'rendered';
    const exportButtonText = () => {
        switch(pdfExportStatus) {
            case 'starting': return 'Exporting...';
            case 'success': return 'Exported!';
            case 'error': return 'Export Failed';
            default: return 'Export to PDF';
        }
    };

    return (
        <div className="w-full h-[75vh] flex flex-col border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-gray-50 dark:bg-gray-800/50">
             {/* Top Bar with Status and Export Button */}
             <div className="py-3 px-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
                 {/* Status Area */}
                 <div className={`flex items-center justify-start gap-x-2 text-xs flex-grow overflow-hidden ${
                     iframeStatus === 'error' ? 'text-red-700 dark:text-red-200'
                     : pdfExportStatus === 'error' ? 'text-red-700 dark:text-red-200'
                     : 'text-blue-700 dark:text-blue-200'
                 }`}>
                    {showErrorIcon || pdfExportStatus === 'error' ? <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                     : showSpinner ? <Spinner size="sm" className="h-4 w-4" />
                     : <span className="h-4 w-4 flex-shrink-0"></span> // Placeholder for alignment
                    }
                    <span className="truncate">{pdfExportStatus === 'error' ? `Export Error: ${pdfExportError}` : getStatusText()}</span>
                 </div>

                 {/* Export Button Area */}
                 <div className="flex-shrink-0 mr-10">
                     <Button
                         variant="outline" // Or your desired button style
                         size="sm"
                         onClick={handleExportClick}
                         disabled={isExportDisabled}
                         aria-label="Export report to PDF"
                     >
                         {exportButtonText()}
                     </Button>
                 </div>
             </div>
            {/* Iframe Container */}
            <div className="flex-grow relative">
                 {/* Loading Spinner Overlay (only visible during loading phases) */}
                 {showSpinner && (
                     <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 z-10 pointer-events-none">
                         <Spinner size="lg" />
                     </div>
                  )}
                {/* Iframe itself - Use reportInfo as key to force reload on new report */}
                {reportInfo ? (
                     <iframe
                         key={reportInfo.code || `iframe-${Date.now()}`} // Force reload on new code
                         ref={iframeRef}
                         src="/iframe-bootstrapper.html"
                         sandbox="allow-scripts" // Crucial: NO "allow-same-origin"
                         title="Report Sandbox"
                         className="w-full h-full border-0 block"
                         onLoad={handleIframeLoad}
                         onError={(e) => {
                             logger.error("ReportViewer: Iframe onError event triggered:", e);
                             setIframeStatus('error');
                             setIframeError('Failed to load the report sandbox environment (iframe onError).');
                             setIframeContentWindow(null); // Clear ref on error
                          }}
                     ></iframe>
                ) : (
                     // Placeholder when no reportInfo is provided
                      <div className="p-6 text-center text-gray-500 dark:text-gray-400 flex items-center justify-center h-full">
                         {iframeError ? ( // Show error here too if it happened before iframe tried loading
                            <span className="flex items-center gap-x-2 text-red-600 dark:text-red-400">
                                <ExclamationTriangleIcon className="h-5 w-5" /> Error: {iframeError}
                            </span>
                          ) : (
                            'Report will appear here.'
                          )}
                     </div>
                )}
            </div>
        </div>
    );
};

export default ReportViewer;