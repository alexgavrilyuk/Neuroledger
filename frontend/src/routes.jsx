// frontend/src/routes.jsx
// ** UPDATED FILE - Removed duplicate declaration **
import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './shared/hooks/useAuth';

// Layouts
import AppLayout from './shared/layouts/AppLayout';
import CenteredLayout from './shared/layouts/CenteredLayout';
import Spinner from './shared/ui/Spinner'; // Loading indicator

// --- Page Components ---
import LoginPage from './features/auth/pages/LoginPage';
import SignupPage from './features/auth/pages/SignupPage';
import SubscriptionPage from './features/subscription/pages/SubscriptionPage';

// Lazy load feature pages
const DashboardPage = lazy(() => import('./features/dashboard/pages/DashboardPage'));
// const AccountLayoutPage = lazy(() => import('./features/account_management/pages/AccountLayoutPage'));

// --- Protected Route Component ---
const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  const hasActiveSubscription = (userInfo) => {
      if (!userInfo?.subscriptionInfo) return false;
      const { status, trialEndsAt } = userInfo.subscriptionInfo;
      if (status === 'active') return true;
      if (status === 'trialing') {
          return trialEndsAt && new Date(trialEndsAt) > new Date();
      }
      return false;
  }

  if (loading) {
    return ( <div className="flex justify-center items-center h-screen"><Spinner size="lg" /></div> );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

   if (!hasActiveSubscription(user)) {
        const currentPath = window.location.pathname;
        if (currentPath !== '/select-plan') {
            console.log("ProtectedRoute: User lacks active subscription. Redirecting to /select-plan.");
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
// Only one definition now
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
          // { path: 'account/*', element: <AccountLayoutPage /> },
        ],
      },
    ],
  },
  {
    element: <CenteredLayout />,
    children: [
       { element: <PublicOnlyRoute />, children: [
           { path: 'login', element: <LoginPage /> },
           { path: 'signup', element: <SignupPage /> },
         ]
       }
    ]
  },
  { path: '*', element: <Navigate to="/" replace /> }
]);

// --- App Router Component ---
const AppRouter = () => { return <RouterProvider router={router} />; };

export default AppRouter;