// frontend/src/features/account_management/layouts/AccountLayout.jsx
// ** NEW FILE **
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Card from '../../../shared/ui/Card'; // If needed for structure
import { UserCircleIcon, CircleStackIcon, UsersIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'; // Icons for sub-nav

const accountSubNavigation = [
   { name: 'Profile', href: '/account/profile', icon: UserCircleIcon },
   { name: 'Datasets', href: '/account/datasets', icon: CircleStackIcon },
   { name: 'Teams', href: '/account/teams', icon: UsersIcon },
   { name: 'Settings', href: '/account/settings', icon: Cog6ToothIcon },
   // Add billing, api keys etc later
];

 function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

const AccountLayout = () => {
  return (
    <div className="space-y-6">
       {/* Page Header */}
         <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Account Management
            </h1>
        </div>

        {/* Sub Navigation Tabs/Links */}
         <div className="border-b border-gray-200 dark:border-gray-700 pb-px">
             <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                 {accountSubNavigation.map((item) => (
                     <NavLink
                         key={item.name}
                         to={item.href}
                         // Exact match for sub-routes
                         end={item.href.split('/').length <= 3} // Basic logic, adjust if needed
                          className={({ isActive }) => classNames(
                             isActive
                                 ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-300'
                                 : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200',
                             'group inline-flex items-center gap-x-2 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors duration-150'
                         )}
                         // aria-current={item.current ? 'page' : undefined}
                     >
                          {({ isActive }) => (
                             <>
                                 <item.icon
                                     className={classNames(
                                         isActive ? 'text-blue-600 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-300',
                                         'h-5 w-5 flex-shrink-0 transition-colors duration-150'
                                     )}
                                     aria-hidden="true"
                                 />
                                  {item.name}
                             </>
                         )}
                     </NavLink>
                 ))}
             </nav>
         </div>


        {/* Outlet for nested account pages */}
        <div className="mt-6">
            <Outlet />
        </div>
    </div>
  );
};

export default AccountLayout;