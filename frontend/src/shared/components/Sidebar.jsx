// frontend/src/shared/components/Sidebar.jsx
// ** UPDATED FILE - Enhanced styling and interactions **
import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  HomeIcon, Cog6ToothIcon, CircleStackIcon, UsersIcon, QuestionMarkCircleIcon,
  UserCircleIcon, BuildingOfficeIcon, ChevronLeftIcon, ChevronRightIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';

// Navigation configurations
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

// Helper for classname joining
function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

const Sidebar = () => {
    const { user } = useAuth();
    const location = useLocation();

    // State for collapsible sidebar
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    // Helper for NavLink active style
    const getNavLinkClass = ({ isActive }) => {
         return classNames(
            isActive
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
            : 'text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50',
            'group flex items-center gap-x-3 rounded-md p-2 text-sm font-medium transition-all duration-150'
         );
    };

    // Helper for Icon class
    const getIconClass = (isActive) => {
        return classNames(
            isActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400',
            'h-5 w-5 flex-shrink-0 transition-colors duration-150'
        );
    };

    // Function to check if a path is active or its subpath is active
    const isPathActive = (path) => {
        if (path === '/dashboard' && location.pathname === '/') return true;
        return location.pathname.startsWith(path);
    };

    return (
        <>
            {/* Desktop sidebar */}
            <div className={classNames(
                "hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:flex-col",
                isCollapsed ? 'lg:w-20' : 'lg:w-64',
                "transition-all duration-300 ease-in-out"
            )}>
                {/* Background with subtle pattern */}
                <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200/80 dark:border-gray-700/50 bg-pattern-light dark:bg-pattern-dark">
                    {/* Logo and collapse button */}
                    <div className={classNames(
                        "flex h-16 shrink-0 items-center border-b border-gray-200/80 dark:border-gray-700/50",
                        isCollapsed ? 'justify-center px-2' : 'px-6'
                    )}>
                        <Link to="/dashboard" className="flex items-center gap-x-3">
                            <svg className={classNames(
                                "text-blue-600 dark:text-blue-400 transition-all",
                                isCollapsed ? 'h-10 w-auto' : 'h-8 w-auto'
                            )} fill="none" stroke="currentColor" viewBox="0 0 48 48" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v4m6-4v4m6-4v4M9 15h6m-6 4h6m-6 4h6m6-4h6M15 3h6m-6 4h6m-6 4h6m-6 4h6m6-12h6M15 15h6m-6 4h6m6-4h6M15 23h6m6-4h6m6 4h6M21 3v4m6-4v4m6-4v4m6 8h6" />
                            </svg>

                            {!isCollapsed && (
                                <span className="text-xl font-bold text-gray-900 dark:text-white transition-all">
                                    NeuroLedger
                                </span>
                            )}
                        </Link>

                        {/* Collapse toggle button */}
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className={classNames(
                                "ml-auto lg:flex hidden items-center justify-center h-8 w-8 rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors",
                                isCollapsed ? "mx-auto" : ""
                            )}
                            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            {isCollapsed ? (
                                <ChevronRightIcon className="h-5 w-5" />
                            ) : (
                                <ChevronLeftIcon className="h-5 w-5" />
                            )}
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex flex-1 flex-col px-4">
                        <ul role="list" className="flex flex-1 flex-col gap-y-7">
                            {/* Main Nav */}
                            <li>
                                {!isCollapsed && (
                                    <div className="text-xs font-semibold leading-6 text-gray-400 dark:text-gray-500 pl-2">Main</div>
                                )}
                                <ul role="list" className={isCollapsed ? "space-y-1 mt-2" : "-mx-2 mt-2 space-y-1"}>
                                    {navigation.map((item) => {
                                        const isActive = isPathActive(item.href);

                                        return (
                                            <li key={item.name}>
                                                <NavLink
                                                    to={item.href}
                                                    className={
                                                        isCollapsed
                                                            ? classNames(
                                                                isActive
                                                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                                    : 'text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                                                'group flex flex-col items-center gap-y-2 rounded-md p-2 text-xs font-medium transition-all duration-150'
                                                            )
                                                            : getNavLinkClass
                                                    }
                                                >
                                                    {({ isActive }) => (
                                                        <>
                                                            <item.icon className={getIconClass(isActive || isPathActive(item.href))} aria-hidden="true" />
                                                            {isCollapsed ? (
                                                                <span className="text-[10px]">{item.name}</span>
                                                            ) : (
                                                                item.name
                                                            )}
                                                        </>
                                                    )}
                                                </NavLink>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </li>

                             {/* Account Nav */}
                             <li>
                                {!isCollapsed && (
                                    <div className="text-xs font-semibold leading-6 text-gray-400 dark:text-gray-500 pl-2">Account</div>
                                )}
                                <ul role="list" className={isCollapsed ? "space-y-1 mt-2" : "-mx-2 mt-2 space-y-1"}>
                                    {accountNavigation.map((item) => {
                                        const isActive = isPathActive(item.href);

                                        return (
                                            <li key={item.name}>
                                                <NavLink
                                                    to={item.href}
                                                    className={
                                                        isCollapsed
                                                            ? classNames(
                                                                isActive
                                                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                                    : 'text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                                                'group flex flex-col items-center gap-y-2 rounded-md p-2 text-xs font-medium transition-all duration-150'
                                                            )
                                                            : getNavLinkClass
                                                    }
                                                    end={item.href === '/account'}
                                                >
                                                    {({ isActive }) => (
                                                        <>
                                                            <item.icon className={getIconClass(isActive || isPathActive(item.href))} aria-hidden="true" />
                                                            {isCollapsed ? (
                                                                <span className="text-[10px]">{item.name}</span>
                                                            ) : (
                                                                item.name
                                                            )}
                                                        </>
                                                    )}
                                                </NavLink>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </li>


                            {/* Secondary Nav - Pushed towards bottom */}
                            <li className="mt-auto">
                                {!isCollapsed && (
                                    <div className="text-xs font-semibold leading-6 text-gray-400 dark:text-gray-500 pl-2">Support</div>
                                )}
                                <ul role="list" className={isCollapsed ? "space-y-1 mt-2" : "-mx-2 mt-2 space-y-1"}>
                                    {secondaryNavigation.map((item) => {
                                        const isActive = isPathActive(item.href);

                                        return (
                                            <li key={item.name}>
                                                <NavLink
                                                    to={item.href}
                                                    className={
                                                        isCollapsed
                                                            ? classNames(
                                                                isActive
                                                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                                    : 'text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                                                'group flex flex-col items-center gap-y-2 rounded-md p-2 text-xs font-medium transition-all duration-150'
                                                            )
                                                            : getNavLinkClass
                                                    }
                                                >
                                                    {({ isActive }) => (
                                                        <>
                                                            <item.icon className={getIconClass(isActive || isPathActive(item.href))} aria-hidden="true" />
                                                            {isCollapsed ? (
                                                                <span className="text-[10px]">{item.name}</span>
                                                            ) : (
                                                                item.name
                                                            )}
                                                        </>
                                                    )}
                                                </NavLink>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </li>

                            {/* User profile summary (always visible at bottom) */}
                            {user && (
                                <li className="-mx-2 mt-auto">
                                    <div className={classNames(
                                        "flex items-center gap-x-4 px-4 py-3 text-sm bg-gray-50 dark:bg-gray-800/50 rounded-md mx-2 mb-2",
                                        isCollapsed ? "flex-col justify-center" : "flex-row"
                                    )}>
                                        <div className={classNames(
                                            "font-medium text-gray-700 dark:text-gray-300",
                                            isCollapsed ? "text-xs text-center" : ""
                                        )}>
                                            {isCollapsed ? (
                                                user.name ? user.name.split(' ')[0] : user.email.split('@')[0]
                                            ) : (
                                                user.name || user.email
                                            )}
                                        </div>
                                    </div>
                                </li>
                            )}
                        </ul>
                    </nav>
                </div>
            </div>

            {/* Mobile sidebar - Will be implemented later for responsive design */}
        </>
    );
};

export default Sidebar;