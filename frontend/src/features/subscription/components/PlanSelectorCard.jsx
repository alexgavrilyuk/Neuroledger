// frontend/src/features/subscription/components/PlanSelectorCard.jsx
import React from 'react';
import Button from '../../../shared/ui/Button';
import {
  CheckIcon,
  SparklesIcon,
  StarIcon
} from '@heroicons/react/24/solid';

const PlanSelectorCard = ({ plan, onSelect, isSelected, isLoading }) => {
  // Base styles with enhanced visual appeal
  const cardBaseStyle = "relative flex flex-col rounded-xl border w-full lg:w-1/2 transition-all duration-500 ease-in-out transform";

  // Enhanced conditional styles with better gradients and animations
  const recommendedStyles = plan.isRecommended
    ? "bg-gradient-subtle-light dark:bg-gradient-subtle-dark border-blue-300 dark:border-blue-700 shadow-soft-lg dark:shadow-soft-dark-lg hover:shadow-soft-xl dark:hover:shadow-soft-dark-xl hover:border-blue-400 dark:hover:border-blue-600 hover:scale-[1.03] z-10"
    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-soft-md dark:shadow-soft-dark-md hover:shadow-soft-lg dark:hover:shadow-soft-dark-lg hover:border-gray-300 dark:hover:border-gray-500 hover:scale-[1.02]";

  // Different header styling for recommended vs standard plans
  const headerStyle = plan.isRecommended
    ? "bg-gradient-to-br from-blue-50 to-blue-100/70 dark:from-blue-900/30 dark:to-blue-900/10"
    : "bg-gradient-to-br from-gray-50 to-gray-100/70 dark:from-gray-800 dark:to-gray-750";

  const buttonVariant = plan.isRecommended ? 'primary' : 'secondary';

  // Generate a unique ID for this plan's features list
  const featuresListId = `features-${plan.id}`;

  return (
    <div className={`${cardBaseStyle} ${recommendedStyles} overflow-hidden`}>
      {/* Recommended Indicator - New improved design */}
      {plan.isRecommended && (
        <div className="absolute -top-1 -right-1 transform rotate-0 z-20">
          <div className="relative">
            {/* Star icon with animation */}
            <div className="absolute -top-2 -left-2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="animate-pulse-subtle">
                <StarIcon className="h-8 w-8 text-blue-500 dark:text-blue-400" />
              </div>
            </div>

            {/* Recommended badge */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-500 text-white text-xs font-bold py-1.5 px-4 rounded-bl-xl rounded-tr-xl shadow-soft-md">
              Recommended
            </div>
          </div>
        </div>
      )}

      {/* Header Section - Enhanced with better typography and spacing */}
      <div className={`px-6 pt-8 pb-8 sm:px-8 ${headerStyle} rounded-t-xl relative overflow-hidden`}>
        {/* Subtle decorative elements for depth */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/20 dark:bg-white/5 rounded-full -mr-20 -mt-20 z-0"></div>

        <div className="relative z-10">
          <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-1">{plan.name}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{plan.description}</p>

          {/* Price section with enhanced typography */}
          <div className="mt-6 flex items-baseline gap-x-1.5">
            <span className="text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300">{plan.price}</span>
            <span className="text-base font-medium text-gray-500 dark:text-gray-400">{plan.frequency}</span>
          </div>
        </div>
      </div>

      {/* Features Section - Enhanced with better visual hierarchy */}
      <div className="flex flex-col flex-grow px-6 pt-8 pb-8 sm:px-8 bg-white dark:bg-gray-800 rounded-b-xl border-t border-gray-100 dark:border-gray-700/50 relative overflow-hidden">
        {/* Subtle decorative element */}
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gray-100/80 dark:bg-gray-700/20 rounded-full -ml-16 -mb-16 z-0"></div>

        <div className="relative z-10">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">
            What's included:
          </h4>

          <ul role="list" className="space-y-4 text-sm leading-6 text-gray-700 dark:text-gray-300 flex-grow" id={featuresListId}>
            {plan.features.map((feature, index) => (
              <li key={`${plan.id}-feature-${index}`} className="flex gap-x-3 items-start">
                <div className="flex-shrink-0 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <CheckIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                </div>
                <span className="text-gray-700 dark:text-gray-300">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA Button - Enhanced with animations and loading state */}
        <div className="mt-10 relative z-10">
          <Button
            onClick={() => onSelect(plan.id)}
            disabled={isLoading}
            isLoading={isLoading}
            className="w-full justify-center transition-all duration-300 shadow-soft-lg hover:shadow-soft-xl"
            variant={buttonVariant}
            size="lg"
            leftIcon={plan.isRecommended ? SparklesIcon : undefined}
          >
            {plan.ctaText}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PlanSelectorCard;