// frontend/src/shared/layouts/AppLayout.jsx
// ** UPDATED FILE - Add Onboarding Modal Trigger **
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import ThemeSwitcher from '../theme/ThemeSwitcher';
import { useAuth } from '../hooks/useAuth';
import Button from '../ui/Button';
import Sidebar from '../components/Sidebar';
import { ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';
import { useOnboarding } from '../../features/onboarding/hooks/useOnboarding'; // Import onboarding hook
import TutorialModal from '../../features/onboarding/components/TutorialModal'; // Import onboarding modal

const AppLayout = () => {
  const { user, loading, actions } = useAuth();
  // Pass the backend onboarding status to the hook
  const { showOnboarding, dismissOnboarding } = useOnboarding(user?.onboardingCompleted);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      <Sidebar />
      <div className="pl-64 flex flex-col flex-1">
        <header className="sticky top-0 z-5 bg-white dark:bg-gray-900 shadow-soft-sm dark:shadow-none border-b border-gray-100 dark:border-gray-800">
            <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-end items-center h-16">
                    <div className="flex items-center space-x-4">
                        <ThemeSwitcher />
                        {user && (
                        <div className="flex items-center space-x-3">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">
                            {user.name || user.email}
                            </span>
                            <Button
                                onClick={actions?.logout}
                                variant="ghost"
                                size="sm"
                                leftIcon={ArrowLeftOnRectangleIcon}
                                aria-label="Logout"
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            >
                                <span className="hidden md:inline">Logout</span>
                            </Button>
                        </div>
                        )}
                    </div>
                </div>
            </div>
         </header>
        <main className="flex-grow p-4 sm:p-6 lg:p-8">
            <Outlet />
        </main>

        {/* Render Onboarding Modal Conditionally */}
        {/* It shows based on hook logic (backend status + local storage) */}
         <TutorialModal show={showOnboarding} onClose={dismissOnboarding} />

      </div>
    </div>
  );
};

export default AppLayout;