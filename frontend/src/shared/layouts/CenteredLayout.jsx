// frontend/src/shared/layouts/CenteredLayout.jsx
// ** UPDATED FILE - Split Screen Layout **
import React from 'react';
import { Outlet } from 'react-router-dom';
import ThemeSwitcher from '../theme/ThemeSwitcher';
import Card from '../ui/Card';

const CenteredLayout = () => {
  return (
    <div className="min-h-screen flex dark:bg-gray-900">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/5 bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900/30 items-center justify-center p-12 relative overflow-hidden">
          {/* Add subtle background patterns, illustrations or branding text here */}
          <div className="text-center z-10">
              {/* Example Branding */}
              <svg
                    className="mx-auto h-16 w-auto text-blue-600 dark:text-blue-400 mb-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 48 48" // Adjust viewBox if using a real logo
                    aria-hidden="true"
                 >
                     <path
                         strokeLinecap="round"
                         strokeLinejoin="round"
                         strokeWidth={1.5} // Thinner stroke maybe
                         d="M9 3v4m6-4v4m6-4v4M9 15h6m-6 4h6m-6 4h6m6-4h6M15 3h6m-6 4h6m-6 4h6m-6 4h6m6-12h6M15 15h6m-6 4h6m6-4h6M15 23h6m6-4h6m6 4h6M21 3v4m6-4v4m6-4v4m6 8h6" // Placeholder shape
                     />
                 </svg>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">NeuroLedger</h1>
              <p className="text-lg text-gray-600 dark:text-gray-300">
                  Unlock Financial Insights with AI.
              </p>
              {/* Add more marketing text or visuals */}
          </div>
           {/* Optional: Subtle background shapes */}
           <div className="absolute top-0 left-0 w-32 h-32 bg-blue-200 dark:bg-blue-900/50 rounded-full opacity-30 -translate-x-10 -translate-y-10"></div>
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-blue-300 dark:bg-blue-800/50 rounded-full opacity-20 translate-x-16 translate-y-16"></div>
      </div>

      {/* Right Form Panel */}
      <div className="flex flex-1 flex-col justify-center items-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-white dark:bg-gray-900">
        <div className="absolute top-4 right-4 lg:top-6 lg:right-6">
            <ThemeSwitcher />
        </div>
        <div className="mx-auto w-full max-w-sm lg:w-96">
          {/* Title (Optional, might be in the form card now) */}
          {/* <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
             Sign in / Sign up
           </h2> */}

           {/* Card now used within the panel */}
          <Card className="mt-8 shadow-soft-lg dark:shadow-soft-xl border-none dark:border-gray-700">
            {/* Remove Card.Body if form provides its own padding */}
            {/* Or ensure Card.Body has sufficient padding */}
             <Card.Body padding="default">
                 <Outlet /> {/* Login or Signup form will render here */}
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CenteredLayout;