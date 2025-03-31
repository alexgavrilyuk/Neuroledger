// frontend/src/features/auth/pages/LoginPage.jsx
// ** UPDATED FILE - Add display for signup success message **
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom'; // Import useLocation
import LoginForm from '../components/LoginForm';
import { CheckCircleIcon } from '@heroicons/react/24/solid'; // For success message

const LoginPage = () => {
  const location = useLocation(); // Get location object
  const [successMessage, setSuccessMessage] = useState('');

  // Check for the success message passed in state on component mount
  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Optional: Clear the state after displaying the message
      // window.history.replaceState({}, document.title) // This clears state but might be too aggressive
    }
  }, [location.state]);


  return (
    // This will be rendered inside the CenteredLayout's Outlet
    <>
        {/* Display success message if present */}
        {successMessage && (
            <div className="mb-4 rounded-md bg-green-50 dark:bg-green-900/30 p-4 border border-green-200 dark:border-green-600/50">
                <div className="flex">
                    <div className="flex-shrink-0">
                    <CheckCircleIcon className="h-5 w-5 text-green-400 dark:text-green-500" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">{successMessage}</p>
                    </div>
                </div>
            </div>
        )}
        <LoginForm />
    </>
  );
};

export default LoginPage;