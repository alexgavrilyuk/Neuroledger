// ================================================================================
// FILE: NeuroLedger/frontend/src/features/report_display/components/ReportViewer.jsx
// PURPOSE: Renders the report sandbox iframe and handles communication.
// VERSION: Corrected postMessage targetOrigin. COMPLETE JSX. NO PLACEHOLDERS.
// ================================================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import logger from '../../../shared/utils/logger';
import Spinner from '../../../shared/ui/Spinner';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

const ReportViewer = ({ reportInfo, themeName = 'light' }) => {
    const iframeRef = useRef(null);
    const [iframeStatus, setIframeStatus] = useState('init'); // init, loading_html, ready_for_libs, ready_for_data, sending_data, rendering, rendered, error
    const [iframeError, setIframeError] = useState(null);
    const [isIframeReadyForData, setIsIframeReadyForData] = useState(false); // Track if iframe sent 'iframeReady'
    const [iframeContentWindow, setIframeContentWindow] = useState(null); // Store reference to iframe window

    // Define the target origin for postMessage security (use '*' for sandboxed iframes during dev/if needed)
    // Use window.location.origin for production if the iframe src is from the same origin (but it isn't here)
    const targetOrigin = '*'; // Changed for sandboxed iframe compatibility
    // const targetOrigin = window.location.origin; // Use this for same-origin iframes

    // Handle iframe onLoad event - get reference to its window
    const handleIframeLoad = useCallback(() => {
        logger.debug('ReportViewer: Iframe onLoad event fired.');
        const contentWin = iframeRef.current?.contentWindow;
        if (contentWin) {
             setIframeContentWindow(contentWin);
             setIframeStatus('ready_for_libs'); // HTML loaded, waiting for libraries inside iframe
             setIsIframeReadyForData(false); // Reset flag until iframe signals readiness
             setIframeError(null);
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
        logger.info("ReportViewer: Attempting to send data and code to iframe.");
        if (!iframeContentWindow) {
            logger.error("ReportViewer: Cannot send message, iframe contentWindow not available.");
            setIframeStatus('error');
            setIframeError('Iframe communication channel lost.');
            return;
        }
        if (!reportInfo || !reportInfo.code || !reportInfo.datasets) {
            logger.error("ReportViewer: Cannot send message, missing code or datasets in reportInfo.", reportInfo);
            setIframeStatus('error');
            setIframeError('Missing report code or data.');
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
                        datasets: reportInfo.datasets, // Send the array of { name, content, error }
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
                 setIframeStatus('ready_for_data'); // Now ready for data AND code
                 setIsIframeReadyForData(true); // Set the flag
             } else if (type === 'iframeReportStatus') {
                 logger.debug(`ReportViewer: Received iframeReportStatus from iframe: ${status}`);
                 if (status === 'success') {
                     setIframeStatus('rendered');
                     setIframeError(null);
                 } else if (status === 'error') {
                     setIframeStatus('error');
                     setIframeError(detail || 'Iframe reported an execution error');
                 } else {
                     logger.warn(`ReportViewer: Received unknown iframeReportStatus: ${status}`);
                 }
             }
        };
        window.addEventListener('message', handleIframeMessage);
        // Cleanup listener
        return () => window.removeEventListener('message', handleIframeMessage);
        // DEPENDENCIES: targetOrigin needed for check, iframeContentWindow needed for source check
    }, [targetOrigin, iframeContentWindow]);

    // Effect to *call* sendDataAndCodeToIframe when conditions are met
    useEffect(() => {
        logger.debug(`ReportViewer: Send data effect triggered. Status: ${iframeStatus}, ReadyFlag: ${isIframeReadyForData}, HasCode: ${!!reportInfo?.code}, HasWindowInState: ${!!iframeContentWindow}`);

        // Check if iframe has signaled it's ready AND we have the code/data AND we have the window reference
        if (iframeStatus === 'ready_for_data' && isIframeReadyForData && reportInfo?.code && reportInfo?.datasets && iframeContentWindow) {
            logger.info("ReportViewer: Conditions met, setting status to 'sending_data' and calling send function.");
            setIframeStatus('sending_data');
            // Use setTimeout to ensure the call happens in the next event loop tick, just after state update
             const timeoutId = setTimeout(() => {
                 logger.info("ReportViewer: setTimeout executing - Calling sendDataAndCodeToIframe.");
                 sendDataAndCodeToIframe(); // Call the actual send function
             }, 0); // 0ms delay is usually sufficient
             return () => clearTimeout(timeoutId); // Cleanup timeout if component unmounts or deps change
        }
        // DEPENDENCIES: Watch all conditions needed to trigger the send
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
         if (reportInfo) {
            logger.debug("ReportViewer: reportInfo changed/provided, resetting iframe state and triggering reload.");
            setIframeStatus('loading_html'); // Start the status cycle again
            setIframeError(null);
            setIsIframeReadyForData(false);
            setIframeContentWindow(null); // Clear old window reference
            // Force iframe reload by changing key or src slightly (if needed, usually key is enough)
         } else {
             // Clear state if reportInfo becomes null (e.g., modal closed and reset)
             setIframeStatus('init');
             setIframeError(null);
             setIsIframeReadyForData(false);
             setIframeContentWindow(null);
         }
     }, [reportInfo]); // Only trigger reset when reportInfo itself changes


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


    return (
        <div className="w-full h-[75vh] flex flex-col border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-gray-50 dark:bg-gray-800/50">
             {/* Status/Error Bar */}
             {showStatusBar && (
                 <div className={`p-2 text-xs text-center border-b ${
                     iframeStatus === 'error' ? 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-700 dark:text-red-200'
                     : 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-200'
                 } flex items-center justify-center gap-x-2`}>
                    {showErrorIcon ? <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" /> : <Spinner size="sm" className="h-4 w-4" />}
                    <span>{getStatusText()}</span>
                 </div>
             )}
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