// frontend/src/shared/ui/Input.jsx
// ** UPDATED FILE - Refined form styling **
import React, { useState } from 'react';

const Input = ({
  id,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  readOnly = false,
  required = false,
  className = '',
  label,
  hint,
  error,
  successMessage,
  leadingIcon: LeadingIcon, // Optional icon
  trailingIcon: TrailingIcon, // Optional icon
  onTrailingIconClick, // Optional click handler for trailing icon
  autoComplete,
  ...props
}) => {
  // Track input focus state for enhanced styling
  const [isFocused, setIsFocused] = useState(false);

  // Base styling with transitions
  const baseStyle = `
    block w-full rounded-md shadow-sm
    text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500
    sm:text-sm transition-all duration-200
  `;

  // Border and ring styling based on state
  const getBorderStyle = () => {
    if (error) {
      return 'border-rose-500 dark:border-rose-500 focus:ring-rose-500/25 focus:border-rose-500';
    }
    if (successMessage) {
      return 'border-emerald-500 dark:border-emerald-500 focus:ring-emerald-500/25 focus:border-emerald-500';
    }
    if (isFocused) {
      return 'border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20';
    }
    return 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 focus:ring-blue-500/20 focus:border-blue-500';
  };

  // Background styling based on state
  const getBackgroundStyle = () => {
    if (disabled) return 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-60';
    if (readOnly) return 'bg-gray-50 dark:bg-gray-800';
    return 'bg-white dark:bg-gray-800';
  };

  // Padding based on icon presence
  const paddingLeft = LeadingIcon ? 'pl-10' : 'pl-3';
  const paddingRight = TrailingIcon ? 'pr-10' : 'pr-3';
  const paddingY = 'py-2'; // Consistent vertical padding

  // Generate unique ID for the input if not provided
  const inputId = id || name || `input-${Math.random().toString(36).substring(2, 9)}`;

  // Icon styles
  const iconBaseStyle = "absolute inset-y-0 flex items-center pointer-events-none text-gray-400 dark:text-gray-500";
  const leadingIconStyle = "left-0 pl-3";
  const trailingIconStyle = onTrailingIconClick
    ? "right-0 pr-3 cursor-pointer pointer-events-auto hover:text-gray-500 dark:hover:text-gray-400"
    : "right-0 pr-3";

  return (
    <div className={className}>
      {/* Label */}
      {label && (
        <label
          htmlFor={inputId}
          className={`block text-sm font-medium mb-1.5 ${error ? 'text-rose-500 dark:text-rose-400' : 'text-gray-700 dark:text-gray-300'}`}
        >
          {label}
          {required && <span className="ml-1 text-rose-500 dark:text-rose-400">*</span>}
        </label>
      )}

      {/* Input wrapper for icon positioning */}
      <div className="relative rounded-md shadow-sm">
        {/* Leading Icon */}
        {LeadingIcon && (
          <div className={`${iconBaseStyle} ${leadingIconStyle}`}>
            <LeadingIcon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}

        {/* Actual input element */}
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          autoComplete={autoComplete}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`
            ${baseStyle}
            ${paddingLeft} ${paddingRight} ${paddingY}
            ${getBorderStyle()}
            ${getBackgroundStyle()}
            border
          `}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            error ? `${inputId}-error` :
            hint ? `${inputId}-hint` :
            successMessage ? `${inputId}-success` : undefined
          }
          {...props}
        />

        {/* Trailing Icon */}
        {TrailingIcon && (
          <div
            className={`${iconBaseStyle} ${trailingIconStyle}`}
            onClick={onTrailingIconClick}
          >
            <TrailingIcon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400" id={`${inputId}-error`}>
          {error}
        </p>
      )}

      {/* Success message */}
      {!error && successMessage && (
        <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400" id={`${inputId}-success`}>
          {successMessage}
        </p>
      )}

      {/* Hint text */}
      {!error && !successMessage && hint && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400" id={`${inputId}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;