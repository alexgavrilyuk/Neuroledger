// frontend/src/shared/layouts/AppLayout.jsx
// ** UPDATED FILE - Adjust for mobile sidebar if needed **
import React, { useState } from 'react'; // Added useState
import { Outlet, Link } from 'react-router-dom';
import ThemeSwitcher from '../theme/ThemeSwitcher';
import { useAuth } from '../hooks/useAuth';
import Button from '../ui/Button';
import Sidebar from '../components/Sidebar';
import { ArrowLeftOnRectangleIcon, Bars3Icon } from '@heroicons/react/24/outline'; // Added Bars3Icon
import { useOnboarding } from '../../features/onboarding/hooks/useOnboarding';
import TutorialModal from '../../features/onboarding/components/TutorialModal';

const AppLayout = () => {
  const { user, loading, actions } = useAuth();
  const { showOnboarding, dismissOnboarding } = useOnboarding(user?.onboardingCompleted);
  const [sidebarOpen, setSidebarOpen] = useState(false); // State for mobile sidebar

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      {/* Static sidebar for desktop */}
      <Sidebar />

      {/* Mobile sidebar overlay and toggle */}
       {/* Add transition logic for mobile sidebar later if needed */}


      {/* Content area - Adjust padding based on lg breakpoint */}
      <div className="lg:pl-64 flex flex-col flex-1"> {/* Use lg:pl-64 */}
         {/* Sticky Header */}
        <div className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
             {/* Mobile Sidebar Toggle - hidden on large screens */}
             <button type="button" className="-m-2.5 p-2.5 text-gray-700 dark:text-gray-300 lg:hidden" onClick={() => setSidebarOpen(true)}>
                 <span className="sr-only">Open sidebar</span>
                 <Bars3Icon className="h-6 w-6" aria-hidden="true" />
             </button>

             {/* Separator on mobile */}
              <div className="h-6 w-px bg-gray-900/10 dark:bg-white/5 lg:hidden" aria-hidden="true" />

             <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6 justify-end"> {/* Use justify-end */}
                 <div className="flex items-center gap-x-4 lg:gap-x-6">
                     <ThemeSwitcher />

                     {/* Separator */}
                     <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-900/10 dark:lg:bg-white/5" aria-hidden="true" />

                     {/* Profile dropdown/logout */}
                     {user && (
                         <div className="flex items-center gap-x-3">
                             <span className="hidden lg:inline lg:text-sm lg:font-semibold lg:leading-6 lg:text-gray-900 dark:lg:text-white" aria-hidden="true">
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

        {/* Main Content Area */}
        <main className="flex-grow p-4 sm:p-6 lg:p-8">
            <Outlet />
        </main>

        <TutorialModal show={showOnboarding} onClose={dismissOnboarding} />

      </div>
    </div>
  );
};

export default AppLayout;