// frontend/src/shared/ui/Checkbox.jsx
// ** UPDATED FILE - Modern styling with better states **
import React, { forwardRef } from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';

export const Checkbox = forwardRef(({
  id,
  name,
  value = "",
  label,
  checked,
  onChange,
  disabled = false,
  indeterminate = false,
  required = false,
  error,
  hint,
  className = "",
  labelClassName = "",
  size = "md", // sm, md, lg
  ...props
}, ref) => {
  // Generate an ID if not provided
  const inputId = id || name || `checkbox-${Math.random().toString(36).slice(2, 9)}`;

  // Size variations
  const sizeClasses = {
    sm: {
      checkbox: "h-3.5 w-3.5",
      label: "text-xs",
      icon: "h-2.5 w-2.5"
    },
    md: {
      checkbox: "h-4 w-4",
      label: "text-sm",
      icon: "h-3 w-3"
    },
    lg: {
      checkbox: "h-5 w-5",
      label: "text-base",
      icon: "h-3.5 w-3.5"
    }
  };

  // Set indeterminate property via ref when it changes
  React.useEffect(() => {
    if (ref && 'current' in ref && ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate, ref]);

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-start">
        {/* Hidden actual checkbox for accessibility */}
        <div className="flex h-5 items-center">
          <input
            id={inputId}
            name={name}
            value={value}
            type="checkbox"
            ref={ref}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            required={required}
            aria-describedby={
              error ? `${inputId}-error` :
              hint ? `${inputId}-hint` : undefined
            }
            className={`
              sr-only
              ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
            `}
            {...props}
          />

          {/* Custom checkbox appearance */}
          <div
            className={`
              ${sizeClasses[size].checkbox}
              flex items-center justify-center
              rounded border ${disabled ? 'opacity-60' : ''}
              transition-colors duration-150
              ${error
                ? 'border-rose-500 dark:border-rose-500'
                : checked || indeterminate
                  ? 'bg-blue-500 dark:bg-blue-500 border-blue-500 dark:border-blue-500'
                  : 'border-gray-300 dark:border-gray-600'
              }
              ${!disabled && !checked && !indeterminate ? 'group-hover:border-gray-400 dark:group-hover:border-gray-500' : ''}
              ${disabled ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : 'cursor-pointer'}
              ${disabled && (checked || indeterminate) ? 'bg-blue-400 dark:bg-blue-600' : ''}
            `}
            aria-hidden="true"
          >
            {checked && (
              <CheckIcon className={`text-white ${sizeClasses[size].icon}`} />
            )}

            {indeterminate && !checked && (
              <div className="h-0.5 w-2 bg-white rounded-full"></div>
            )}
          </div>
        </div>

        {/* Label text */}
        <div className="ml-2">
          <label
            htmlFor={inputId}
            className={`
              ${sizeClasses[size].label}
              font-medium
              ${disabled ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'text-gray-700 dark:text-gray-300 cursor-pointer'}
              ${labelClassName}
            `}
          >
            {label}
            {required && <span className="ml-1 text-rose-500 dark:text-rose-400">*</span>}
          </label>

          {/* Optional hint text */}
          {hint && !error && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" id={`${inputId}-hint`}>
              {hint}
            </p>
          )}

          {/* Error message */}
          {error && (
            <p className="mt-1 text-xs text-rose-500 dark:text-rose-400" id={`${inputId}-error`}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

// Set display name for React DevTools
Checkbox.displayName = 'Checkbox';

// Create a wrapper component for checkbox groups
export const CheckboxGroup = ({
  children,
  label,
  hint,
  error,
  className = "",
  orientation = "vertical", // vertical, horizontal
  ...props
}) => {
  const orientationClasses = {
    vertical: "flex flex-col space-y-3",
    horizontal: "flex flex-row flex-wrap gap-6"
  };

  // Apply an ID to the group for accessibility
  const groupId = `checkbox-group-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <fieldset className={className} {...props}>
      {label && (
        <legend className={`text-sm font-medium mb-1.5 ${error ? 'text-rose-500 dark:text-rose-400' : 'text-gray-700 dark:text-gray-300'}`}>
          {label}
        </legend>
      )}

      <div className={orientationClasses[orientation]} role="group" aria-labelledby={label ? groupId : undefined}>
        {children}
      </div>

      {/* Hint text */}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-1.5 text-xs text-rose-500 dark:text-rose-400">
          {error}
        </p>
      )}
    </fieldset>
  );
};

// Default export is Checkbox component
export default Checkbox;