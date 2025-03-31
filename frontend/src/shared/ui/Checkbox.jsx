// frontend/src/shared/ui/Checkbox.jsx
// ** CORRECTED - MOVED FROM TutorialModal.jsx **
import React from 'react';

export const Checkbox = ({ id, label, checked, onChange, disabled, className = "", labelClassName="" }) => {
    return (
        <div className={`relative flex items-start ${className}`}>
            <div className="flex h-6 items-center">
                <input
                    id={id}
                    name={id}
                    type="checkbox"
                    checked={checked}
                    onChange={onChange}
                    disabled={disabled}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:checked:bg-blue-500 disabled:opacity-50 cursor-pointer"
                />
            </div>
            <div className="ml-3 text-sm leading-6">
                <label htmlFor={id} className={`font-medium cursor-pointer ${disabled ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'text-gray-700 dark:text-gray-300'} ${labelClassName}`}>
                    {label}
                </label>
            </div>
        </div>
    );
};

// No default export needed if imported as { Checkbox }