// frontend/src/features/subscription/pages/SubscriptionPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PlanSelectorCard from '../components/PlanSelectorCard';
import apiClient from '../../../shared/services/apiClient';
import { useAuth } from '../../../shared/hooks/useAuth';
import Spinner from '../../../shared/ui/Spinner';
import {
  SparklesIcon,
  ShieldCheckIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

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
    <div className="min-h-full relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-blue-100/40 to-indigo-100/40 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-full blur-3xl opacity-70 dark:opacity-30"></div>
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-gradient-to-br from-indigo-100/40 to-purple-100/40 dark:from-indigo-900/10 dark:to-purple-900/10 rounded-full blur-3xl opacity-70 dark:opacity-30"></div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-10 pb-16 relative">
        {/* Page Header - Enhanced with better typography and visual elements */}
        <div className="text-center mb-16 max-w-3xl mx-auto">
          <div className="inline-flex items-center justify-center p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
            <SparklesIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-100 dark:to-white">
            Choose the plan that's right for you
          </h1>

          <p className="mt-4 text-lg leading-8 text-gray-600 dark:text-gray-300">
            Start analyzing your finances faster with AI. Cancel anytime.
          </p>
        </div>

        {/* Security badge - New element */}
        <div className="flex items-center justify-center mb-12">
          <div className="inline-flex items-center bg-gray-100 dark:bg-gray-800/70 rounded-full py-1.5 px-3 shadow-soft-sm">
            <ShieldCheckIcon className="h-4 w-4 text-green-600 dark:text-green-400 mr-1.5" />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Secure payment & privacy protection</span>
          </div>
        </div>

        {/* Error message - Enhanced with better styling */}
        {error && (
          <div className="mb-10 max-w-md mx-auto text-center">
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 text-red-600 dark:text-red-400 text-sm rounded-lg shadow-soft-md flex items-center animate-fadeIn">
              <ExclamationCircleIcon className="h-5 w-5 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Plan Selector Cards Grid - Enhanced with better spacing and animations */}
        <div className="flex flex-col lg:flex-row justify-center items-stretch gap-8 px-4 animate-fadeIn">
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

        {/* Guarantee note - New element */}
        <div className="text-center mt-10 text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
          <p>
            All plans include a 14-day money-back guarantee. If you're not completely satisfied, contact our support team for a full refund.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPage;