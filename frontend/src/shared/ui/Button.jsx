// frontend/src/shared/ui/Button.jsx
// ** UPDATED FILE **
import React from 'react';
import Spinner from './Spinner'; // Assuming Spinner is kept simple

const Button = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary', // primary, secondary, danger, ghost
  size = 'md', // sm, md, lg
  disabled = false,
  isLoading = false,
  className = '',
  leftIcon: LeftIcon, // Optional icon component
  rightIcon: RightIcon, // Optional icon component
  ...props
}) => {
  const baseStyle = 'inline-flex items-center justify-center border font-medium rounded-md shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-colors duration-150';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs', // Smaller text/padding
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base', // Slightly more padding
  };

  // Refined variants using default Tailwind blue/gray
  const variantStyles = {
    primary: 'border-transparent text-white bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500',
    secondary: 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:ring-blue-500',
    danger: 'border-transparent text-white bg-red-600 hover:bg-red-700 focus-visible:ring-red-500',
    ghost: 'border-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:ring-blue-500',
  };

  const disabledStyle = 'opacity-60 cursor-not-allowed';
  const loadingStyle = 'opacity-80 cursor-wait'; // Slightly different style for loading

  const iconSizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'; // Adjust icon size based on button size
  const iconMarginClass = size === 'sm' ? 'mr-1.5' : 'mr-2'; // Adjust margin

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        ${baseStyle}
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        ${(disabled) ? disabledStyle : ''}
        ${(isLoading) ? loadingStyle : ''}
        ${className}
      `}
      {...props}
    >
      {isLoading ? (
         // Simple spinner, ensure it matches text color if needed
         <Spinner size={size === 'sm' ? 'sm' : 'sm'} color="currentColor" className={`animate-spin ${LeftIcon || RightIcon || children ? '-ml-1 mr-2' : ''} ${iconSizeClass}`} />
      ) : (
         LeftIcon && <LeftIcon className={`${iconSizeClass} ${children ? iconMarginClass : ''} -ml-0.5`} aria-hidden="true" />
      )}
      {children}
      {!isLoading && RightIcon && <RightIcon className={`${iconSizeClass} ${children ? 'ml-2' : ''} -mr-0.5`} aria-hidden="true" />}
    </button>
  );
};

export default Button;