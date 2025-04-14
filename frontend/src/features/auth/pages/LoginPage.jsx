// frontend/src/features/auth/pages/LoginPage.jsx
// ** UPDATED MODERN DESIGN **
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
      
      // Clear the message after 5 seconds
      const timer = setTimeout(() => {
        setSuccessMessage('');
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [location.state]);


  return (
    <>
      {/* Display success message with improved styling and animation */}
      {successMessage && (
        <div className="mb-6 rounded-lg bg-green-50 dark:bg-green-900/20 p-4 border border-green-200 dark:border-green-600/50 shadow-sm animate-slideInBottom">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="h-5 w-5 text-green-500 dark:text-green-400" aria-hidden="true" />
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