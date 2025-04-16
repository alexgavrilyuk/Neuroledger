// frontend/src/shared/ui/Modal.jsx
// ** UPDATED FILE - Enhanced with animations and refined styling **
import React, { useEffect, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { createPortal } from 'react-dom';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  hideCloseButton = false,
  closeOnOverlayClick = true,
  trapFocus = true,
  closeOnEscape = true,
  slideFrom = 'bottom', // 'bottom', 'right', 'top', 'left', 'none'
}) => {
  const modalRef = useRef(null);
  const lastActiveElement = useRef(null);

  // Focus trap: Keep all focus within modal
  useEffect(() => {
    if (!isOpen || !trapFocus) return;

    // Store last active element to restore focus later
    lastActiveElement.current = document.activeElement;

    // Focus the modal container
    setTimeout(() => {
      modalRef.current?.focus();
    }, 50);

    // All focusable elements query
    const focusableQuery = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e) => {
      // Escape key handling
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
        return;
      }

      // Tab key handling for focus trap
      if (e.key === 'Tab') {
        if (!modalRef.current) return;

        const focusableElements = modalRef.current.querySelectorAll(focusableQuery);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        // Shift+Tab from first element should go to last element
        if (e.shiftKey && document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
        // Tab from last element should wrap to first element
        else if (!e.shiftKey && document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Restore focus on cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (lastActiveElement.current) {
        lastActiveElement.current.focus();
      }
    };
  }, [isOpen, trapFocus, onClose, closeOnEscape]);

  // Handle modal transitions and DOM insertion
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'; // Prevent scrolling
    } else {
      document.body.style.overflow = ''; // Restore scrolling
    }

    return () => {
      document.body.style.overflow = ''; // Always restore on unmount
    };
  }, [isOpen]);

  // Size mappings for modal width
  const sizeClasses = {
    xs: 'sm:max-w-xs',
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-3xl',
    xl: 'sm:max-w-5xl',
    '2xl': 'sm:max-w-7xl',
    'full': 'sm:max-w-full sm:m-4',
  };

  // Slide animation classes based on direction
  const getSlideClasses = () => {
    if (slideFrom === 'none') return '';

    const baseClass = 'transition-all duration-250 ease-in-out';
    const slideClasses = {
      'bottom': `${baseClass} translate-y-4 sm:translate-y-0 sm:scale-95`,
      'top': `${baseClass} -translate-y-4 sm:translate-y-0 sm:scale-95`,
      'left': `${baseClass} -translate-x-4 sm:translate-x-0 sm:scale-95`,
      'right': `${baseClass} translate-x-4 sm:translate-x-0 sm:scale-95`,
    };

    return slideClasses[slideFrom] || slideClasses.bottom;
  };

  // Don't render anything if modal is closed
  if (!isOpen) return null;

  // Use portal to render modal outside of parent component hierarchy
  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby={title ? "modal-title" : undefined}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        // Close when clicking the overlay, if enabled
        if (closeOnOverlayClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Overlay */}
      <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity"
          aria-hidden="true"
        />

        {/* Center modal vertically in desktop */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        {/* Modal panel */}
        <div
          ref={modalRef}
          tabIndex={-1}
          className={`
            inline-block align-bottom sm:align-middle w-full
            text-left transform transition-all
            ${sizeClasses[size]}
            ${isOpen ? 'opacity-100 ' + getSlideClasses() : 'opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'}
           bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50
           shadow-soft-xl dark:shadow-soft-dark-xl
           sm:my-8 sm:w-full
           overflow-hidden
          `}
        >
          {/* Close button - positioned top-right */}
          {!hideCloseButton && (
            <button
              type="button"
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 dark:ring-offset-gray-800
              flex items-center justify-center"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}

          {/* We render children directly - Modal.Header, Modal.Body, and Modal.Footer are expected */}
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

// Sub-components to structure content
Modal.Header = ({ children, className = "" }) => (
  <div className={`px-5 py-4 sm:px-6 border-b border-gray-200 dark:border-gray-700/70 ${className}`}>
    {typeof children === 'string' ? (
      <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-white" id="modal-title">
        {children}
      </h3>
    ) : (
      children
    )}
  </div>
);

Modal.Body = ({ children, className = "", padding = "default" }) => {
  const paddingStyles = {
    none: '',
    compact: 'p-4',
    default: 'px-5 py-5 sm:p-6',
    loose: 'p-6 sm:p-8'
  };

  return (
    <div className={`${paddingStyles[padding]} overflow-y-auto ${className}`}>
      {children}
    </div>
  );
};

Modal.Footer = ({ children, className = "", align = "right" }) => {
  const alignStyles = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    between: 'justify-between',
    around: 'justify-around'
  };

  return (
    <div className={`
      px-5 py-4 sm:px-6
      bg-gray-50 dark:bg-gray-800/50
      border-t border-gray-200 dark:border-gray-700/70
      flex flex-wrap items-center gap-3 ${alignStyles[align]} ${className}
    `}>
      {children}
    </div>
  );
};

// Set displayNames to ensure proper detection in parent component
Modal.Header.displayName = 'ModalHeader';
Modal.Body.displayName = 'ModalBody';
Modal.Footer.displayName = 'ModalFooter';

export default Modal;