// frontend/src/shared/components/Sidebar.jsx
// ** UPDATED FILE - Fixed inactive link visibility in dark mode **
import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  HomeIcon, Cog6ToothIcon, CircleStackIcon, UsersIcon, QuestionMarkCircleIcon,
  UserCircleIcon, BuildingOfficeIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
];
const accountNavigation = [
   { name: 'Profile', href: '/account/profile', icon: UserCircleIcon },
   { name: 'Datasets', href: '/account/datasets', icon: CircleStackIcon },
   { name: 'Teams', href: '/account/teams', icon: UsersIcon },
   { name: 'Settings', href: '/account/settings', icon: Cog6ToothIcon },
];
const secondaryNavigation = [
  { name: 'Help/Tutorial', href: '/onboarding', icon: QuestionMarkCircleIcon },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

// Helper for NavLink active style
const getNavLinkClass = ({ isActive }) => {
     return classNames(
        isActive
        ? 'bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-300'
        // --- FIX: Changed dark:text-gray-300 to dark:text-gray-400 for better inactive visibility ---
        : 'text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800/50',
        'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold transition-colors duration-150'
     );
}
 // Helper for Icon class (remains the same)
 const getIconClass = (isActive) => {
    return classNames(
        isActive
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-300',
        'h-6 w-6 shrink-0 transition-colors duration-150'
    );
}


const Sidebar = () => {
    const { user } = useAuth();

    return (
        // Using hidden lg:fixed etc. for responsiveness handled in AppLayout potentially
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
            <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 pb-4">
                {/* Logo */}
                <Link to="/dashboard" className="flex h-16 shrink-0 items-center gap-x-3">
                     <svg className="h-8 w-auto text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 48 48" aria-hidden="true">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v4m6-4v4m6-4v4M9 15h6m-6 4h6m-6 4h6m6-4h6M15 3h6m-6 4h6m-6 4h6m-6 4h6m6-12h6M15 15h6m-6 4h6m6-4h6M15 23h6m6-4h6m6 4h6M21 3v4m6-4v4m6-4v4m6 8h6" />
                     </svg>
                     <span className="text-xl font-bold text-gray-900 dark:text-white">NeuroLedger</span>
                </Link>

                {/* Navigation */}
                <nav className="flex flex-1 flex-col">
                    <ul role="list" className="flex flex-1 flex-col gap-y-7">
                        {/* Main Nav */}
                        <li>
                            <div className="text-xs font-semibold leading-6 text-gray-400 dark:text-gray-500">Main</div>
                            <ul role="list" className="-mx-2 mt-2 space-y-1">
                                {navigation.map((item) => (
                                <li key={item.name}>
                                    <NavLink to={item.href} className={getNavLinkClass}>
                                        {({ isActive }) => (
                                            <>
                                                <item.icon className={getIconClass(isActive)} aria-hidden="true" />
                                                {item.name}
                                            </>
                                        )}
                                    </NavLink>
                                </li>
                                ))}
                            </ul>
                        </li>

                         {/* Account Nav */}
                         <li>
                            <div className="text-xs font-semibold leading-6 text-gray-400 dark:text-gray-500">Account</div>
                            <ul role="list" className="-mx-2 mt-2 space-y-1">
                                {accountNavigation.map((item) => (
                                <li key={item.name}>
                                    <NavLink to={item.href} className={getNavLinkClass} end={item.href === '/account'}>
                                         {({ isActive }) => (
                                            <>
                                                <item.icon className={getIconClass(isActive)} aria-hidden="true" />
                                                {item.name}
                                            </>
                                        )}
                                    </NavLink>
                                </li>
                                ))}
                            </ul>
                        </li>


                        {/* Secondary Nav - Pushed towards bottom */}
                        <li className="mt-auto">
                             <div className="text-xs font-semibold leading-6 text-gray-400 dark:text-gray-500">Support</div>
                             <ul role="list" className="-mx-2 mt-2 space-y-1">
                                {secondaryNavigation.map((item) => (
                                    <li key={item.name}>
                                        <NavLink to={item.href} className={getNavLinkClass}>
                                             {({ isActive }) => (
                                                <>
                                                    <item.icon className={getIconClass(isActive)} aria-hidden="true" />
                                                    {item.name}
                                                </>
                                            )}
                                        </NavLink>
                                    </li>
                                ))}
                             </ul>
                        </li>
                    </ul>
                </nav>
            </div>
        </div>
    );
}

export default Sidebar;