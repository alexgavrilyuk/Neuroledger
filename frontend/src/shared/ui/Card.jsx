// frontend/src/shared/ui/Card.jsx
// ** UPDATED FILE - Refined styling with elevation system **
import React from 'react';

const Card = ({
  children,
  className = '',
  padding = 'default',
  elevation = 'default', // none, default, raised, floating
  hover = false,
  onClick = null,
  ...props
}) => {
  // Base style with borders and overflow control
  const baseStyle = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200/80 dark:border-gray-700/50 overflow-hidden transition-all duration-200";

  // Refined shadow system based on elevation
  const elevationStyles = {
    none: '',
    default: 'shadow-soft-md dark:shadow-soft-dark-md',
    raised: 'shadow-soft-lg dark:shadow-soft-dark-lg',
    floating: 'shadow-soft-xl dark:shadow-soft-dark-xl',
  };

  // Hover effects when enabled
  const hoverStyle = hover ? 'hover:-translate-y-0.5 hover:shadow-soft-lg dark:hover:shadow-soft-dark-lg hover:border-gray-300 dark:hover:border-gray-600/80' : '';

  // Clickable style when onClick is provided
  const clickableStyle = onClick ? 'cursor-pointer active:scale-[0.99] active:translate-y-0' : '';

  // Padding options for the main card
  const paddingStyles = {
    none: '',
    default: 'px-5 py-5 sm:p-6', // Standard padding for body
    compact: 'p-4',
    loose: 'p-6 sm:p-8'
  };

  // Determine card padding when not using sub-components
  const shouldApplyPadding = React.Children.toArray(children).every(child => {
    return typeof child?.type !== 'function' ||
           !['Header', 'Body', 'Footer'].includes(child.type?.displayName || child.type?.name);
  });

  const paddingClass = shouldApplyPadding && padding !== 'none' ? paddingStyles[padding] : '';

  return (
    <div
      className={`${baseStyle} ${elevationStyles[elevation]} ${hoverStyle} ${clickableStyle} ${paddingClass} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
};

// Card Header with refined styling
Card.Header = ({
  children,
  className = '',
  hasBorder = true,
  padding = 'default',
  action = null // Optional action component (button, dropdown, etc.)
}) => {
  const paddingStyles = {
    none: '',
    default: 'px-5 py-4 sm:px-6',
    compact: 'px-4 py-3',
    loose: 'px-6 py-5 sm:px-8'
  };

  const borderStyle = hasBorder ? 'border-b border-gray-200/80 dark:border-gray-700/50' : '';
  const paddingClass = paddingStyles[padding];

  return (
    <div className={`${borderStyle} ${paddingClass} flex items-center justify-between ${className}`}>
      <div className="flex-1">
        {/* Provide appropriate heading tag or use custom element */}
        {typeof children === 'string' ? (
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{children}</h3>
        ) : (
          children
        )}
      </div>
      {action && (
        <div className="ml-4 flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
};

// Set displayName to ensure correct padding logic
Card.Header.displayName = 'Header';

// Card Body with refined styling
Card.Body = ({
  children,
  className = '',
  padding = 'default',
  divided = false // Option for divided sections
}) => {
  const paddingStyles = {
    none: '',
    default: 'px-5 py-5 sm:p-6',
    compact: 'p-4',
    loose: 'p-6 sm:p-8'
  };

  const paddingClass = paddingStyles[padding];
  const dividedClass = divided ? 'divide-y divide-gray-200 dark:divide-gray-700/50' : '';

  return (
    <div className={`${paddingClass} ${dividedClass} ${className}`}>
      {children}
    </div>
  );
};

Card.Body.displayName = 'Body';

// Card Footer with refined styling
Card.Footer = ({
  children,
  className = '',
  hasBorder = true,
  padding = 'default',
  align = 'right' // left, center, right, stretch
}) => {
  const paddingStyles = {
    none: '',
    default: 'px-5 py-4 sm:px-6',
    compact: 'px-4 py-3',
    loose: 'px-6 py-5'
  };

  const alignStyles = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    stretch: 'justify-stretch'
  };

  const borderStyle = hasBorder ? 'border-t border-gray-200/80 dark:border-gray-700/50' : '';
  const backgroundStyle = 'bg-gray-50 dark:bg-gray-800/50';
  const paddingClass = paddingStyles[padding];
  const alignClass = alignStyles[align];

  return (
    <div className={`${paddingClass} ${borderStyle} ${backgroundStyle} flex items-center ${alignClass} ${className}`}>
      {children}
    </div>
  );
};

Card.Footer.displayName = 'Footer';

// New: Card Section for dividing content into sections
Card.Section = ({
  children,
  className = '',
  padding = 'default',
  hasBorder = true,
}) => {
  const paddingStyles = {
    none: '',
    default: 'px-5 py-5 sm:p-6',
    compact: 'p-4',
    loose: 'p-6 sm:p-8'
  };

  const borderStyle = hasBorder ? 'border-b border-gray-200/80 dark:border-gray-700/50 last:border-b-0' : '';
  const paddingClass = paddingStyles[padding];

  return (
    <div className={`${paddingClass} ${borderStyle} ${className}`}>
      {children}
    </div>
  );
};

Card.Section.displayName = 'Section';

export default Card;