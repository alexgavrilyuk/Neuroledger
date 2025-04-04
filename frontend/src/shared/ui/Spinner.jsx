// frontend/src/shared/ui/Spinner.jsx
// ** UPDATED FILE - Refined animated spinner **
import React from 'react';

const Spinner = ({
  size = 'md',
  color = 'text-blue-500 dark:text-blue-400',
  secondaryColor = 'text-gray-200 dark:text-gray-700',
  variant = 'circle', // circle, dots, bars, pulse
  className = '',
  label = 'Loading...',
  showLabel = false,
}) => {
  // Size mappings
  const sizeClasses = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12',
  };

  // Text size for label
  const textSizeClasses = {
    xs: 'text-xs',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-sm',
    xl: 'text-base',
  };

  // Ensure size is valid
  const validSize = sizeClasses[size] ? size : 'md';

  // Spinner variants
  const renderSpinner = () => {
    switch(variant) {
      case 'dots':
        return (
          <div className={`flex gap-1 ${sizeClasses[validSize]} items-center justify-center`}>
            <div className={`animate-pulse-fast rounded-full ${color} h-full w-1/4`}></div>
            <div className={`animate-pulse-fast rounded-full ${color} h-full w-1/4 animation-delay-150`}></div>
            <div className={`animate-pulse-fast rounded-full ${color} h-full w-1/4 animation-delay-300`}></div>
          </div>
        );

      case 'bars':
        return (
          <div className={`flex gap-1 ${sizeClasses[validSize]} items-end justify-center`}>
            <div className={`animate-bounce-small rounded-sm ${color} h-1/2 w-1/4`}></div>
            <div className={`animate-bounce-small rounded-sm ${color} h-full w-1/4 animation-delay-150`}></div>
            <div className={`animate-bounce-small rounded-sm ${color} h-2/3 w-1/4 animation-delay-300`}></div>
          </div>
        );

      case 'pulse':
        return (
          <div className={`${sizeClasses[validSize]} ${color} opacity-75 animate-ping rounded-full`}></div>
        );

      case 'circle':
      default:
        return (
          <svg
            className={`animate-spin ${sizeClasses[validSize]} ${color} ${className}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden={!showLabel}
          >
            <circle
              className={`opacity-25 ${secondaryColor}`}
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-80"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        );
    }
  };

  return (
    <div className="inline-flex flex-col items-center justify-center">
      {renderSpinner()}

      {showLabel && (
        <span className={`mt-2 ${textSizeClasses[validSize]} text-gray-600 dark:text-gray-400`} role="status">
          {label}
        </span>
      )}
    </div>
  );
};

// Add animation keyframes to your CSS or index.css
// @keyframes bounce-small {
//   0%, 100% { transform: translateY(0); }
//   50% { transform: translateY(-25%); }
// }
//
// @keyframes pulse-fast {
//   0%, 100% { opacity: 1; }
//   50% { opacity: 0.3; }
// }
//
// .animation-delay-150 { animation-delay: 150ms; }
// .animation-delay-300 { animation-delay: 300ms; }

export default Spinner;