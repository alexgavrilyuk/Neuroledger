// frontend/src/shared/ui/Input.jsx
// ** UPDATED FILE **
import React from 'react';

const Input = ({
  id,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  className = '',
  label,
  error,
  leadingIcon: LeadingIcon, // Optional icon
  trailingIcon: TrailingIcon, // Optional icon
  ...props
}) => {
  const baseStyle = 'block w-full rounded-md border-0 py-2 text-gray-900 dark:text-white shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-blue-600 dark:focus:ring-blue-500 sm:text-sm sm:leading-6 dark:bg-gray-800'; // Using @tailwindcss/forms defaults + dark mode
  const errorStyle = 'ring-red-500 dark:ring-red-400 focus:ring-red-500 dark:focus:ring-red-400';
  const disabledStyle = 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-70';
  const paddingLeft = LeadingIcon ? 'pl-10' : 'px-3';
  const paddingRight = TrailingIcon ? 'pr-10' : 'px-3'; // Note: px-3 is part of baseStyle, adjust if needed

  return (
    <div>
      {label && (
        <label htmlFor={id || name} className="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-200 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative rounded-md shadow-sm">
         {LeadingIcon && (
           <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
             <LeadingIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
           </div>
         )}
        <input
          id={id || name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`
             ${baseStyle}
             ${paddingLeft} ${paddingRight}
             ${error ? errorStyle : ''}
             ${disabled ? disabledStyle : ''}
             ${className}`
           }
          {...props}
        />
        {TrailingIcon && (
           <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
             <TrailingIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
           </div>
         )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};

export default Input;