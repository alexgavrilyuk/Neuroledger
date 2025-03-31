// frontend/src/features/subscription/pages/SubscriptionPage.jsx
// ** NEW FILE **
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PlanSelectorCard from '../components/PlanSelectorCard';
import apiClient from '../../../shared/services/apiClient';
import { useAuth } from '../../../shared/hooks/useAuth';
import Spinner from '../../../shared/ui/Spinner'; // For overall loading

// Dummy plan data (replace with fetch from BE or config later)
const DUMMY_PLANS_DATA = [
  {
    id: 'trial',
    name: '14-Day Free Trial',
    price: '$0',
    frequency: '',
    description: 'Explore all features for 14 days.',
    features: [
      'Access to all AI models',
      'Unlimited reports',
      'Dataset management',
      'Team collaboration (coming soon)',
    ],
  },
  {
    id: 'plus',
    name: 'Plus Plan',
    price: '$49', // Example price
    frequency: '/ month',
    description: 'For individuals and small teams needing more power.',
    features: [
      'Everything in Trial',
      'Priority support',
      'Larger dataset limits',
      'Access to beta features',
    ],
  },
   // Add Pro plan here if needed
];

const SubscriptionPage = () => {
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
   const { setUser } = useAuth(); // We need a way to update the user in AuthContext - let's modify useAuth

  const handleSelectPlan = async (planId) => {
    setSelectedPlanId(planId); // Keep track of which button might show loading
    setIsLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/subscriptions/select', { planId });

      if (response.data.status === 'success' && response.data.data) {
          // --- IMPORTANT ---
          // Update the user state in AuthContext with the new user object from the backend
          // This requires AuthContext to expose a 'setUser' or similar function.
          // We'll modify AuthContext next to allow this update.
          if (setUser) {
              setUser(response.data.data);
              console.log("Subscription selected, user context updated.");
          } else {
              console.warn("AuthContext does not expose setUser function. Cannot update context.");
              // Force a reload or redirect to ensure context re-fetches - less ideal
              // window.location.reload();
          }
         // --- END IMPORTANT ---

         // Navigate to the dashboard or onboarding
         // Check onboarding status from the updated user data
         if (!response.data.data.onboardingCompleted) {
             // If onboarding not done, maybe go there first? Or let AppLayout handle it.
             // For now, just go to dashboard, AppLayout will show onboarding.
             navigate('/dashboard', { replace: true });
         } else {
             navigate('/dashboard', { replace: true });
         }

      } else {
        throw new Error(response.data.message || 'Failed to select plan.');
      }
    } catch (err) {
      console.error('Plan selection error:', err);
      setError(err.response?.data?.message || err.message || 'An error occurred.');
      setIsLoading(false);
      setSelectedPlanId(null); // Reset selection on error
    }
    // No need for finally { setIsLoading(false) } because navigation occurs on success
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-950 min-h-screen py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl sm:text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">Choose Your Plan</h2>
          <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-400">
            Select a plan to unlock NeuroLedger's capabilities. Start with a free trial!
          </p>
        </div>

        {error && (
             <div className="mt-8 text-center text-red-600 dark:text-red-400">{error}</div>
        )}

        <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 items-stretch gap-y-8 gap-x-8 sm:mt-20 lg:max-w-none lg:grid-cols-2">
          {DUMMY_PLANS_DATA.map((plan) => (
            <PlanSelectorCard
              key={plan.id}
              plan={plan}
              onSelect={handleSelectPlan}
              isSelected={selectedPlanId === plan.id}
              isLoading={isLoading}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPage;