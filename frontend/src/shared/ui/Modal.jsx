// frontend/src/shared/ui/Modal.jsx
// ** CORRECTED - MOVED FROM TutorialModal.jsx **
import React, { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline'; // Import the icon

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => { // Removed footerContent prop
    useEffect(() => {
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                onClose(false);
            }
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
        }
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'sm:max-w-sm',
        md: 'sm:max-w-lg',
        lg: 'sm:max-w-3xl',
        xl: 'sm:max-w-5xl'
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                {/* Background overlay */}
                <div className="fixed inset-0 bg-gray-500 dark:bg-gray-800 bg-opacity-75 dark:bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => onClose(false)}></div>

                {/* Modal panel */}
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">​</span>
                <div className={`inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle ${sizeClasses[size]} sm:w-full`}>
                    {title && (
                        <div className="flex items-center justify-between bg-white dark:bg-gray-800 px-4 py-4 sm:px-6 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                                {title}
                            </h3>
                            <button
                                type="button"
                                className="p-1 rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 dark:ring-offset-gray-800"
                                onClick={() => onClose(false)}
                            >
                                <span className="sr-only">Close</span>
                                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                            </button>
                        </div>
                    )}
                    {children} {/* Expects Modal.Body and Modal.Footer as direct children */}
                </div>
            </div>
        </div>
    );
};

// Sub-components to structure content
Modal.Body = ({ children, className = "" }) => <div className={`px-4 pt-5 pb-4 sm:p-6 ${className}`}>{children}</div>;
Modal.Footer = ({ children, className = "" }) => <div className={`bg-gray-50 dark:bg-gray-800/50 px-4 py-3 sm:px-6 sm:flex ${className}`}>{children}</div>;

export default Modal;