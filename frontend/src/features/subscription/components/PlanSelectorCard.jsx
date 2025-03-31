// frontend/src/features/subscription/components/PlanSelectorCard.jsx
// ** UPDATED FILE - REMOVED Corner Banner, ADDED Internal Badge **
import React from 'react';
import Button from '../../../shared/ui/Button';
import { CheckIcon } from '@heroicons/react/20/solid';

const PlanSelectorCard = ({ plan, onSelect, isSelected, isLoading }) => {
  // Base styles + group for hover effects
  const cardBaseStyle = "flex flex-col rounded-xl border w-full lg:w-1/2 group transition-all duration-300 ease-in-out relative transform"; // Removed overflow-hidden as banner is gone

  // Conditional styles based on recommendation
  const recommendedStyles = plan.isRecommended
    ? "bg-white dark:bg-gray-800/90 border-blue-500 dark:border-blue-600 shadow-lg dark:shadow-blue-900/30 hover:shadow-xl dark:hover:shadow-blue-900/50 hover:border-blue-600 dark:hover:border-blue-500 hover:scale-[1.03]"
    : "bg-white dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 shadow-md dark:shadow-gray-900/40 hover:shadow-lg dark:hover:shadow-gray-700/60 hover:border-gray-300 dark:hover:border-gray-500 hover:scale-[1.02]";

  // Keep distinct header for recommended, slightly adjusted background
  const headerStyle = plan.isRecommended
    ? "bg-blue-50 dark:bg-gray-900/40" // Adjusted dark background slightly
    : "bg-gray-50 dark:bg-gray-800/50";

  const buttonVariant = plan.isRecommended ? 'primary' : 'secondary';

  // --- REMOVED Corner Banner Styles ---

  return (
    <div className={`${cardBaseStyle} ${recommendedStyles}`}> {/* No padding on outer div */}

        {/* Header Section */}
        {/* Added flex layout to header for badge alignment */}
        <div className={`px-6 pt-6 pb-8 sm:px-8 ${headerStyle} rounded-t-xl`}>
            <div className="flex justify-between items-center mb-1"> {/* Flex container for title and badge */}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
                {/* --- ADDED Internal Badge --- */}
                {plan.isRecommended && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/60 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:text-blue-200 shadow-sm">
                        Recommended
                    </span>
                )}
                {/* --- End Internal Badge --- */}
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plan.description}</p>
            <p className="mt-6 flex items-baseline gap-x-1.5">
                <span className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white">{plan.price}</span>
                <span className="text-base font-medium text-gray-500 dark:text-gray-400">{plan.frequency}</span>
            </p>
        </div>

        {/* Features Section */}
        <div className="flex flex-col flex-grow px-6 pt-8 pb-8 sm:px-8 bg-white dark:bg-gray-800/80 rounded-b-xl border-t border-gray-100 dark:border-gray-700/50">
            <ul role="list" className="space-y-4 text-sm leading-6 text-gray-700 dark:text-gray-300 flex-grow">
            {plan.features.map((feature) => (
                <li key={feature} className="flex gap-x-3 items-center">
                <CheckIcon className="h-5 w-5 flex-none text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>{feature}</span>
                </li>
            ))}
            </ul>

            {/* CTA Button */}
            <div className="mt-10">
                <Button
                onClick={() => onSelect(plan.id)}
                disabled={isLoading}
                isLoading={isLoading}
                className="w-full justify-center transition-transform duration-200 group-hover:scale-[1.02]"
                variant={buttonVariant}
                size="lg"
                >
                {plan.ctaText}
                </Button>
            </div>
        </div>
    </div>
  );
};

export default PlanSelectorCard;