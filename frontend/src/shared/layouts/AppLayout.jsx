// frontend/src/shared/layouts/AppLayout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import ThemeSwitcher from '../theme/ThemeSwitcher';
import { useAuth } from '../hooks/useAuth';
import Button from '../ui/Button';
import Sidebar from '../components/Sidebar';
import { ChatProvider } from '../../features/dashboard/context/ChatContext';
import {
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline';
import { useOnboarding } from '../../features/onboarding/hooks/useOnboarding';
import TutorialModal from '../../features/onboarding/components/TutorialModal';
import NotificationBell from '../../features/notifications/components/NotificationBell';

const AppLayout = () => {
  const { user, loading, actions } = useAuth();
  const { showOnboarding, dismissOnboarding } = useOnboarding(user?.onboardingCompleted);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
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

  // Listen for sidebar collapse state changes from Sidebar component
  const handleSidebarCollapse = (collapsed) => {
    setIsSidebarCollapsed(collapsed);
  };

  // Get page title based on current route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') return 'Dashboard';
    if (path === '/chat') return 'Chat';
    if (path.startsWith('/account/profile')) return 'Profile';
    if (path.startsWith('/account/datasets')) return 'Datasets';
    if (path.startsWith('/account/teams')) return 'Teams';
    if (path.startsWith('/account/settings')) return 'Settings';
    if (path === '/select-plan') return 'Select a Plan';
    if (path === '/onboarding') return 'Getting Started';
    return '';
  };

  return (
    <ChatProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        {/* Static sidebar for desktop - Pass onCollapse callback to Sidebar */}
        <Sidebar onCollapse={handleSidebarCollapse} />

        {/* Mobile sidebar overlay */}
        <div className={`relative z-50 lg:hidden ${sidebarOpen ? "" : "hidden"}`} role="dialog" aria-modal="true">
          {/* Improved backdrop with blur */}
          <div
            className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm transition-opacity duration-300 ease-in-out"
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          ></div>

          {/* Sidebar panel with animation */}
          <div className="fixed inset-0 flex">
            <div className="relative mr-16 flex w-full max-w-xs flex-1 transform transition-transform duration-300 ease-out">
              {/* Close button */}
              <div className="absolute top-0 right-0 -mr-12 pt-4">
                <button
                  type="button"
                  className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 shadow-soft-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-all duration-150 hover:shadow-soft-lg"
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>

              {/* Mobile sidebar content */}
              <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 px-6 pb-4 shadow-soft-2xl dark:shadow-soft-dark-2xl animate-slideInRight">
                <div className="flex h-16 shrink-0 items-center">
                  <Link to="/dashboard" className="flex items-center gap-x-3">
                    <svg className="h-8 w-auto text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 48 48" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v4m6-4v4m6-4v4M9 15h6m-6 4h6m-6 4h6m6-4h6M15 3h6m-6 4h6m-6 4h6m-6 4h6m6-12h6M15 15h6m-6 4h6m6-4h6M15 23h6m6-4h6m6 4h6M21 3v4m6-4v4m6-4v4m6 8h6" />
                    </svg>
                    <span className="text-xl font-bold text-gray-900 dark:text-white">NeuroLedger</span>
                  </Link>
                </div>
                {/* Sidebar content is handled by Sidebar component */}
              </div>
            </div>
          </div>
        </div>

        {/* Content area - Now using dynamic padding based on sidebar collapsed state */}
        <div
          className={`
            ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}
            flex flex-col flex-1 transition-all duration-300 ease-in-out
          `}
        >
           {/* Sticky Header - Enhanced with better styling and animations */}
          <header className={`sticky top-0 z-20 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200/80 dark:border-gray-700/70 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-4 transition-all duration-300 sm:gap-x-6 sm:px-6 lg:px-8 ${isScrolled ? 'shadow-soft-md dark:shadow-soft-dark-md' : ''}`}>
               {/* Mobile Sidebar Toggle - Enhanced with better interaction */}
               <button
                 type="button"
                 className="-m-2.5 p-2.5 text-gray-700 dark:text-gray-300 lg:hidden hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors duration-150"
                 onClick={() => setSidebarOpen(true)}
               >
                   <span className="sr-only">Open sidebar</span>
                   <Bars3Icon className="h-6 w-6" aria-hidden="true" />
               </button>

               {/* Page title - Improved typography for mobile */}
               <div className="flex lg:hidden">
                 <span className="text-lg font-semibold text-gray-900 dark:text-white">{getPageTitle()}</span>
               </div>

               {/* Separator on mobile */}
               <div className="h-6 w-px bg-gray-900/10 dark:bg-white/5 lg:hidden" aria-hidden="true" />

               {/* Page title - Enhanced with animation for desktop */}
               <div className="hidden lg:flex lg:flex-1 lg:gap-x-4">
                 <h1 className="text-xl font-semibold text-gray-900 dark:text-white transition-all duration-300 animate-fadeIn">
                   {getPageTitle()}
                 </h1>
               </div>

               <div className="flex items-center gap-x-4 lg:gap-x-6">
                  {/* Notifications bell - ADDED HERE */}
                  <NotificationBell />

                  {/* Theme switcher */}
                  <ThemeSwitcher />

                  {/* Separator */}
                  <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-900/10 dark:lg:bg-white/5" aria-hidden="true" />

                  {/* Profile dropdown/logout - Enhanced with better visual design */}
                  {user && (
                      <div className="flex items-center gap-x-3">
                          <span className="hidden lg:inline lg:text-sm lg:font-medium lg:leading-6 lg:text-gray-900 dark:lg:text-white" aria-hidden="true">
                              {user.name || user.email}
                          </span>

                          <div className="relative group">
                            <button
                              className="flex rounded-full bg-gray-100 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 h-8 w-8 items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-700"
                              aria-label="User profile"
                            >
                              <UserCircleIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            </button>

                            {/* Quick menu on hover/focus - Will be expanded in future */}
                            <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white dark:bg-gray-800 py-1 shadow-soft-lg dark:shadow-soft-dark-lg ring-1 ring-black ring-opacity-5 focus:outline-none hidden group-hover:block animate-fadeIn z-10">
                              <Button
                                onClick={actions?.logout}
                                variant="ghost"
                                size="sm"
                                leftIcon={ArrowLeftOnRectangleIcon}
                                className="w-full justify-start rounded-none px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                Logout
                              </Button>
                            </div>
                          </div>
                      </div>
                  )}
               </div>
          </header>

          {/* Main Content Area - Enhanced with better transitions */}
          <main className="flex-grow p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto w-full animate-fadeIn transition-all duration-300">
              <Outlet />
          </main>

          {/* Footer - Enhanced with better styling and links */}
          <footer className="mt-auto border-t border-gray-200 dark:border-gray-800/60 py-4 px-4 sm:px-6 lg:px-8 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div>&copy; {new Date().getFullYear()} NeuroLedger. All rights reserved.</div>
              <div className="flex gap-4">
                <Link to="/privacy" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150">Privacy Policy</Link>
                <Link to="/terms" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150">Terms of Service</Link>
                <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150">Help Center</a>
              </div>
            </div>
          </footer>

          {/* Tutorial Modal */}
          <TutorialModal show={showOnboarding} onClose={dismissOnboarding} />
        </div>
      </div>
    </ChatProvider>
  );
};

export default AppLayout;