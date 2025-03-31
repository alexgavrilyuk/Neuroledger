// frontend/src/routes.jsx
// ** UPDATED FILE - Removed duplicate ProtectedRoute declaration **
import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './shared/hooks/useAuth';

// Layouts
import AppLayout from './shared/layouts/AppLayout';
import CenteredLayout from './shared/layouts/CenteredLayout';
import Spinner from './shared/ui/Spinner';
import AccountLayout from './features/account_management/layouts/AccountLayout'; // Import Account Layout

// --- Page Components ---
import LoginPage from './features/auth/pages/LoginPage';
import SignupPage from './features/auth/pages/SignupPage';
import SubscriptionPage from './features/subscription/pages/SubscriptionPage';

// Lazy load feature pages
const DashboardPage = lazy(() => import('./features/dashboard/pages/DashboardPage'));
// Lazy load Account pages
const AccountProfilePage = lazy(() => import('./features/account_management/pages/AccountProfilePage'));
const AccountDatasetsPage = lazy(() => import('./features/account_management/pages/AccountDatasetsPage'));
const AccountTeamsPage = lazy(() => import('./features/account_management/pages/AccountTeamsPage'));
const AccountSettingsPage = lazy(() => import('./features/account_management/pages/AccountSettingsPage'));


// --- Protected Route Component ---
// REMOVED the duplicate line above this definition
const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  const hasActiveSubscription = (userInfo) => {
      if (!userInfo?.subscriptionInfo) return false;
      const { status, trialEndsAt } = userInfo.subscriptionInfo;
      if (status === 'active') return true;
      if (status === 'trialing') {
          return trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();
      }
      return false;
  }

  if (loading) {
    return ( <div className="flex justify-center items-center h-screen"><Spinner size="lg" /></div> );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

   if (!hasActiveSubscription(user)) {
        if (location.pathname !== '/select-plan') {
            return <Navigate to="/select-plan" replace />;
        }
   }

  return (
     <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-4rem)]"><Spinner size="lg" /></div>}>
        <Outlet />
     </Suspense>
  );
};


// --- Public Only Route Component ---
const PublicOnlyRoute = () => {
    const { user, loading } = useAuth();
    if (loading) { return ( <div className="flex justify-center items-center h-screen"><Spinner size="lg" /></div> ); }
    if (user) { return <Navigate to="/dashboard" replace />; }
    return <Outlet />;
}


// --- Router Configuration ---
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'select-plan', element: <SubscriptionPage /> },
          {
             path: 'account',
             element: <AccountLayout />,
             children: [
                 { index: true, element: <Navigate to="/account/profile" replace /> },
                 { path: 'profile', element: <AccountProfilePage /> },
                 { path: 'datasets', element: <AccountDatasetsPage /> },
                 { path: 'teams', element: <AccountTeamsPage /> },
                 { path: 'settings', element: <AccountSettingsPage /> },
             ]
          },
        ],
      },
    ],
  },
  { // Public Routes
    element: <CenteredLayout />,
    children: [ { element: <PublicOnlyRoute />, children: [
           { path: 'login', element: <LoginPage /> },
           { path: 'signup', element: <SignupPage /> },
         ] } ]
  },
  { path: '*', element: <Navigate to="/" replace /> }
]);

// --- App Router Component ---
const AppRouter = () => { return <RouterProvider router={router} />; };

export default AppRouter;