// frontend/src/shared/ui/Button.jsx
// ** UPDATED FILE - Modern styling with gradients and animations **
import React from 'react';
import Spinner from './Spinner'; // Assuming Spinner is kept simple

const Button = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary', // primary, secondary, danger, ghost, outline
  size = 'md', // sm, md, lg
  disabled = false,
  isLoading = false,
  className = '',
  leftIcon: LeftIcon, // Optional icon component
  rightIcon: RightIcon, // Optional icon component
  fullWidth = false, // Option for full width button
  ...props
}) => {
  // Base styling with transitions and focus states
  const baseStyle = 'inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-all duration-200';

  // Size styles
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-x-1.5',
    md: 'px-4 py-2 text-sm gap-x-2',
    lg: 'px-6 py-2.5 text-base gap-x-2.5',
  };

  // Refined variant styles
  const variantStyles = {
    primary: 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:from-blue-700 active:to-blue-800 text-white shadow-sm focus-visible:ring-blue-500/50 transform hover:scale-102 active:scale-98',

    secondary: 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 active:bg-gray-100 dark:active:bg-gray-600/80 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 shadow-sm hover:shadow focus-visible:ring-gray-400/50 transform hover:scale-102 active:scale-98',

    danger: 'bg-gradient-to-br from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 active:from-rose-700 active:to-rose-800 text-white shadow-sm focus-visible:ring-rose-500/50 transform hover:scale-102 active:scale-98',

    ghost: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 focus-visible:ring-gray-500/30 transform hover:scale-102 active:scale-98',

    outline: 'bg-transparent border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 focus-visible:ring-gray-400/50',
  };

  // States
  const disabledStyle = 'opacity-60 cursor-not-allowed transform-none';
  const loadingStyle = 'opacity-80 cursor-wait'; // Slightly different style for loading

  // Icon sizing
  const iconSizeClass = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

  // Full width option
  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        ${baseStyle}
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        ${disabled ? disabledStyle : ''}
        ${isLoading ? loadingStyle : ''}
        ${widthClass}
        ${className}
      `}
      {...props}
    >
      {/* Loading spinner positioned to replace left icon, or at start if no icons */}
      {isLoading ? (
        <Spinner
          size={size === 'sm' ? 'xs' : size === 'lg' ? 'md' : 'sm'}
          color="currentColor"
          className={`animate-spin ${children ? 'mr-1.5' : ''}`}
        />
      ) : (
        LeftIcon && <LeftIcon className={`${iconSizeClass} flex-shrink-0`} aria-hidden="true" />
      )}

      {/* Button text */}
      {children}

      {/* Right icon, only shown when not loading */}
      {!isLoading && RightIcon && (
        <RightIcon className={`${iconSizeClass} flex-shrink-0`} aria-hidden="true" />
      )}
    </button>
  );
};

export default Button;