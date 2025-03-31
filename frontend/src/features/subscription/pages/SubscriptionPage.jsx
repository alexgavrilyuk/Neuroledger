// frontend/src/features/subscription/pages/SubscriptionPage.jsx
// ** UPDATED FILE - Adjust background and layout slightly **
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PlanSelectorCard from '../components/PlanSelectorCard';
import apiClient from '../../../shared/services/apiClient';
import { useAuth } from '../../../shared/hooks/useAuth';
import Spinner from '../../../shared/ui/Spinner';

const DUMMY_PLANS_DATA = [ // Same data as before
  {
    id: 'trial', name: 'Free Trial', price: '$0', frequency: 'for 14 days',
    description: 'Explore all core features.', ctaText: 'Start Free Trial', isRecommended: false,
    features: ['Prompt-driven report generation', 'Interactive report artefacts', 'Basic dataset management', 'Limited usage'],
  },
  {
    id: 'plus', name: 'Plus', price: '$49', frequency: '/ month',
    description: 'For individuals & power users.', ctaText: 'Get Started with Plus', isRecommended: true,
    features: ['Everything in Trial', 'Higher usage limits', 'Advanced dataset analysis options', 'Team collaboration features', 'Priority email support', 'Access to new AI models'],
  },
];

const SubscriptionPage = () => {
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const handleSelectPlan = async (planId) => {
    setSelectedPlanId(planId);
    setIsLoading(true);
    setError('');
    try {
      const response = await apiClient.post('/subscriptions/select', { planId });
      if (response.data.status === 'success' && response.data.data) {
        if (setUser) setUser(response.data.data);
        navigate(response.data.data.onboardingCompleted ? '/dashboard' : '/dashboard', { replace: true });
      } else {
        throw new Error(response.data.message || 'Failed to select plan.');
      }
    } catch (err) {
      console.error('Plan selection error:', err);
      setError(err.response?.data?.message || err.message || 'An error occurred selecting the plan.');
      setIsLoading(false);
      setSelectedPlanId(null);
    }
  };

  return (
    // Use main layout padding. Page itself has minimal extra styling now.
    // Removed extra background/padding, relying on AppLayout and card styles.
    <div className="min-h-full">
        <div className="mx-auto max-w-5xl"> {/* Slightly wider max-width */}
            {/* Page Header */}
            <div className="text-center mb-12 sm:mb-16 px-4">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                    Choose the plan that's right for you
                </h1>
                <p className="mt-4 text-lg leading-8 text-gray-600 dark:text-gray-400">
                    Start analyzing your finances faster with AI. Cancel anytime.
                </p>
            </div>

            {error && (
                <div className="mb-8 text-center text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 p-3 rounded-md border border-red-300 dark:border-red-600/50 mx-4">{error}</div>
            )}

            {/* Plan Grid */}
            {/* Reduced gap slightly, added padding for overall spacing */}
            <div className="flex flex-col lg:flex-row justify-center items-stretch gap-6 px-4">
                {DUMMY_PLANS_DATA.map((plan) => (
                    <PlanSelectorCard
                        key={plan.id}
                        plan={plan}
                        onSelect={handleSelectPlan}
                        isSelected={selectedPlanId === plan.id}
                        isLoading={isLoading && selectedPlanId === plan.id}
                    />
                ))}
            </div>
        </div>
    </div>
  );
};

export default SubscriptionPage;