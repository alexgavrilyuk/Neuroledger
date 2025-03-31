// frontend/src/shared/ui/Card.jsx
// ** UPDATED FILE **
import React from 'react';

const Card = ({ children, className = '', padding = 'default', ...props }) => {
  // Softer shadow, subtle border especially for dark mode, rounded corners
  const baseStyle = 'bg-white dark:bg-gray-800 shadow-soft-md dark:shadow-soft-lg rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden';

  const paddingStyles = {
      none: '',
      default: 'px-4 py-5 sm:p-6', // Standard padding for body
      compact: 'p-4'
  }

  // Determine padding for the main card div only if sub-components aren't used directly
  // However, it's usually better to apply padding via Card.Body
  const paddingClass = (typeof children?.type !== 'function' || !['Header', 'Body', 'Footer'].includes(children.type.name)) && padding !== 'none'
      ? paddingStyles[padding]
      : '';


  return (
    <div className={`${baseStyle} ${paddingClass} ${className}`} {...props}>
      {children}
    </div>
  );
};

// Optional: Add Card Header, Body, Footer components for structure
Card.Header = ({ children, className = '', hasBorder = true }) => (
    <div className={`px-4 py-4 sm:px-6 ${hasBorder ? 'border-b border-gray-200 dark:border-gray-700' : ''} ${className}`}>
        {/* Often contains a title - apply typography */}
        {typeof children === 'string' ? <h3 className="text-base font-semibold leading-6 text-gray-900 dark:text-white">{children}</h3> : children}
    </div>
);

Card.Body = ({ children, className = '', padding = 'default' }) => {
     const paddingStyles = {
          none: '',
          default: 'px-4 py-5 sm:p-6', // Standard padding for body
          compact: 'p-4'
      }
      const paddingClass = paddingStyles[padding];
    return (
        <div className={`${paddingClass} ${className}`}>
            {children}
        </div>
    );
}

Card.Footer = ({ children, className = '', hasBorder = true }) => (
    <div className={`px-4 py-4 sm:px-6 bg-gray-50 dark:bg-gray-800/50 ${hasBorder ? 'border-t border-gray-200 dark:border-gray-700' : ''} ${className}`}>
        {children}
    </div>
);


export default Card;