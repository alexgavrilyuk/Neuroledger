// frontend/src/routes.jsx
// ** UPDATED FILE - Minor refinement to ProtectedRoute logic **
import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom'; // Import useLocation
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
  const location = useLocation(); // Get current location

  // Helper function (can be moved to utils or kept here)
  const hasActiveSubscription = (userInfo) => {
      if (!userInfo?.subscriptionInfo) return false;
      const { status, trialEndsAt } = userInfo.subscriptionInfo;
      if (status === 'active') return true;
      if (status === 'trialing') {
          // Ensure date comparison is robust
          return trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();
      }
      return false;
  }

  // 1. Handle Loading State: Show spinner while checking auth
  if (loading) {
    // console.log("ProtectedRoute: Auth loading...");
    return ( <div className="flex justify-center items-center h-screen"><Spinner size="lg" /></div> );
  }

  // 2. Handle Not Authenticated: Redirect to login
  if (!user) {
    // console.log("ProtectedRoute: No user found, redirecting to login.");
    // Preserve the intended location to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Handle Authenticated but No Active Subscription: Redirect to plan selection
   if (!hasActiveSubscription(user)) {
        // Only redirect if NOT already on the plan selection page
        if (location.pathname !== '/select-plan') {
            console.log("ProtectedRoute: User lacks active subscription. Redirecting to /select-plan.");
            return <Navigate to="/select-plan" replace />;
        }
        // If on /select-plan, allow rendering (so user can select a plan)
        // console.log("ProtectedRoute: User lacks subscription, but is on /select-plan. Allowing access.");
   }

  // 4. Handle Authenticated AND Active Subscription (or on /select-plan): Render content
  // console.log("ProtectedRoute: User authenticated and subscription active (or on /select-plan). Rendering outlet.");
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

// --- Router Configuration --- (Structure remains the same)
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