// frontend/src/shared/components/Sidebar.jsx
// ** NEW FILE **
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  Cog6ToothIcon,
  ChartBarIcon, // Example icon
  CircleStackIcon, // Example icon for Datasets
  UsersIcon, // Example icon for Teams
  QuestionMarkCircleIcon, // Example icon for Onboarding/Help
} from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';

// Combine static and dynamic nav items if needed
const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Datasets', href: '/account/datasets', icon: CircleStackIcon }, // Example future link
  { name: 'Teams', href: '/account/teams', icon: UsersIcon }, // Example future link
];
const secondaryNavigation = [
  { name: 'Settings', href: '/account/settings', icon: Cog6ToothIcon }, // Example future link
  { name: 'Help/Tutorial', href: '/onboarding', icon: QuestionMarkCircleIcon }, // Example future link
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

const Sidebar = () => {
    const location = useLocation();
    const { user } = useAuth(); // Get user info if needed at bottom

    return (
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 w-64 fixed inset-y-0 z-10">
             {/* Logo */}
            <div className="flex h-16 shrink-0 items-center">
                 {/* Replace with your actual logo component or SVG */}
                <svg
                    className="h-8 w-auto text-blue-600 dark:text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 48 48" // Adjust viewBox if using a real logo
                    aria-hidden="true"
                 >
                     <path
                         strokeLinecap="round"
                         strokeLinejoin="round"
                         strokeWidth={2}
                         d="M9 3v4m6-4v4m6-4v4M9 15h6m-6 4h6m-6 4h6m6-4h6M15 3h6m-6 4h6m-6 4h6m-6 4h6m6-12h6M15 15h6m-6 4h6m6-4h6M15 23h6m6-4h6m6 4h6M21 3v4m6-4v4m6-4v4m6 8h6" // Placeholder shape
                     />
                 </svg>
                 <span className="ml-3 text-xl font-bold text-gray-900 dark:text-white">NeuroLedger</span>
            </div>

            {/* Navigation */}
            <nav className="flex flex-1 flex-col">
                <ul role="list" className="flex flex-1 flex-col gap-y-7">
                    {/* Main Nav */}
                    <li>
                        <ul role="list" className="-mx-2 space-y-1">
                            {navigation.map((item) => (
                            <li key={item.name}>
                                <Link
                                to={item.href}
                                className={classNames(
                                    location.pathname.startsWith(item.href) // Basic active check
                                    ? 'bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-300'
                                    : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                    'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                                )}
                                >
                                <item.icon
                                    className={classNames(
                                    location.pathname.startsWith(item.href)
                                        ? 'text-blue-600 dark:text-blue-300'
                                        : 'text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-300',
                                    'h-6 w-6 shrink-0'
                                    )}
                                    aria-hidden="true"
                                />
                                {item.name}
                                </Link>
                            </li>
                            ))}
                        </ul>
                    </li>

                    {/* Secondary Nav - Pushed towards bottom */}
                    <li className="mt-auto">
                         <ul role="list" className="-mx-2 space-y-1 mb-4">
                            {secondaryNavigation.map((item) => (
                                <li key={item.name}>
                                    <Link
                                        to={item.href}
                                        className={classNames(
                                            location.pathname.startsWith(item.href)
                                            ? 'bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-300'
                                            : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                            'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                                        )}
                                    >
                                     <item.icon
                                        className={classNames(
                                        location.pathname.startsWith(item.href)
                                            ? 'text-blue-600 dark:text-blue-300'
                                            : 'text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-300',
                                        'h-6 w-6 shrink-0'
                                        )}
                                        aria-hidden="true"
                                    />
                                        {item.name}
                                    </Link>
                                </li>
                            ))}
                         </ul>
                         {/* Optional: User profile link at bottom */}
                         {/* <div className="border-t border-gray-200 dark:border-gray-700 pt-4"> ... user avatar/name ... </div> */}
                    </li>
                </ul>
            </nav>
        </div>
    );
}

export default Sidebar;