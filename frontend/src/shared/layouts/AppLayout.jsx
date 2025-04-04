// frontend/src/shared/layouts/AppLayout.jsx
// ** UPDATED FILE - Enhanced styling and responsive behavior **
import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import ThemeSwitcher from '../theme/ThemeSwitcher';
import { useAuth } from '../hooks/useAuth';
import Button from '../ui/Button';
import Sidebar from '../components/Sidebar';
import {
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon
} from '@heroicons/react/24/outline';
import { useOnboarding } from '../../features/onboarding/hooks/useOnboarding';
import TutorialModal from '../../features/onboarding/components/TutorialModal';

const AppLayout = () => {
  const { user, loading, actions } = useAuth();
  const { showOnboarding, dismissOnboarding } = useOnboarding(user?.onboardingCompleted);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();

  // Track scroll position to add shadow to header when scrolled
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Get page title based on current route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') return 'Dashboard';
    if (path.startsWith('/account/profile')) return 'Profile';
    if (path.startsWith('/account/datasets')) return 'Datasets';
    if (path.startsWith('/account/teams')) return 'Teams';
    if (path.startsWith('/account/settings')) return 'Settings';
    if (path === '/select-plan') return 'Select a Plan';
    if (path === '/onboarding') return 'Getting Started';
    return '';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Static sidebar for desktop */}
      <Sidebar />

      {/* Mobile sidebar overlay */}
      <div className={`relative z-50 lg:hidden ${sidebarOpen ? "" : "hidden"}`} role="dialog" aria-modal="true">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm transition-opacity duration-300 ease-in-out"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        ></div>

        {/* Sidebar panel */}
        <div className="fixed inset-0 flex">
          <div className="relative mr-16 flex w-full max-w-xs flex-1">
            {/* Close button */}
            <div className="absolute top-0 right-0 -mr-12 pt-4">
              <button
                type="button"
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sr-only">Close sidebar</span>
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>

            {/* Mobile sidebar content - Will be replaced with a more responsive Sidebar later */}
            <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 px-6 pb-4">
              <div className="flex h-16 shrink-0 items-center">
                <Link to="/dashboard" className="flex items-center gap-x-3">
                  <svg className="h-8 w-auto text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 48 48" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v4m6-4v4m6-4v4M9 15h6m-6 4h6m-6 4h6m6-4h6M15 3h6m-6 4h6m-6 4h6m-6 4h6m6-12h6M15 15h6m-6 4h6m6-4h6M15 23h6m6-4h6m6 4h6M21 3v4m6-4v4m6-4v4m6 8h6" />
                  </svg>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">NeuroLedger</span>
                </Link>
              </div>
              {/* Rest of mobile sidebar - using main Sidebar for now */}
            </div>
          </div>
        </div>
      </div>


      {/* Content area */}
      <div className="lg:pl-64 flex flex-col flex-1">
         {/* Sticky Header */}
        <header className={`sticky top-0 z-20 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 dark:border-gray-700/70 bg-white dark:bg-gray-900 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8 transition-shadow duration-200 ${isScrolled ? 'shadow-md dark:shadow-gray-950/50' : ''}`}>
             {/* Mobile Sidebar Toggle */}
             <button
               type="button"
               className="-m-2.5 p-2.5 text-gray-700 dark:text-gray-300 lg:hidden"
               onClick={() => setSidebarOpen(true)}
             >
                 <span className="sr-only">Open sidebar</span>
                 <Bars3Icon className="h-6 w-6" aria-hidden="true" />
             </button>

             {/* Page title - only on mobile */}
             <div className="flex lg:hidden">
               <span className="text-lg font-semibold text-gray-900 dark:text-white">{getPageTitle()}</span>
             </div>

             {/* Separator on mobile */}
             <div className="h-6 w-px bg-gray-900/10 dark:bg-white/5 lg:hidden" aria-hidden="true" />

             {/* Page title - desktop */}
             <div className="hidden lg:flex lg:flex-1 lg:gap-x-4">
               <span className="text-xl font-semibold text-gray-900 dark:text-white">{getPageTitle()}</span>
             </div>

             <div className="flex items-center gap-x-4 lg:gap-x-6">
                {/* Notifications button */}
                <button
                  type="button"
                  className="relative p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150"
                >
                  <span className="sr-only">View notifications</span>
                  <BellIcon className="h-6 w-6" aria-hidden="true" />
                  {/* Optional notification badge */}
                  <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-rose-500"></span>
                </button>

                {/* Theme switcher */}
                <ThemeSwitcher />

                {/* Separator */}
                <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-900/10 dark:lg:bg-white/5" aria-hidden="true" />

                {/* Profile dropdown/logout */}
                {user && (
                    <div className="flex items-center gap-x-3">
                        <span className="hidden lg:inline lg:text-sm lg:font-medium lg:leading-6 lg:text-gray-900 dark:lg:text-white" aria-hidden="true">
                            {user.name || user.email}
                        </span>
                        <Button
                            onClick={actions?.logout}
                            variant="ghost"
                            size="sm"
                            leftIcon={ArrowLeftOnRectangleIcon}
                            aria-label="Logout"
                            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                             <span className="hidden md:inline">Logout</span>
                        </Button>
                    </div>
                )}
             </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-grow p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto w-full animate-fadeIn">
            <Outlet />
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-gray-200 dark:border-gray-800/60 py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <div>&copy; {new Date().getFullYear()} NeuroLedger. All rights reserved.</div>
            <div className="flex gap-4">
              <Link to="/privacy" className="hover:text-blue-600 dark:hover:text-blue-400">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-blue-600 dark:hover:text-blue-400">Terms of Service</Link>
            </div>
          </div>
        </footer>

        {/* Tutorial Modal */}
        <TutorialModal show={showOnboarding} onClose={dismissOnboarding} />
      </div>
    </div>
  );
};

export default AppLayout;