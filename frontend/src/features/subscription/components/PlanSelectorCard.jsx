// frontend/src/features/subscription/components/PlanSelectorCard.jsx
import React from 'react';
import Card from '../../../shared/ui/Card';
import Button from '../../../shared/ui/Button';
import { CheckIcon } from '@heroicons/react/20/solid'; // Using solid check

const PlanSelectorCard = ({ plan, onSelect, isSelected, isLoading }) => {
  return (
    <Card className={`flex flex-col ${isSelected ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}`}>
      <Card.Header hasBorder={false} className="text-center">
        <h3 className="text-lg font-semibold leading-6 text-gray-900 dark:text-white">{plan.name}</h3>
        <p className="mt-2 flex items-baseline justify-center gap-x-2">
          <span className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">{plan.price}</span>
          <span className="text-sm font-semibold leading-6 tracking-wide text-gray-600 dark:text-gray-400">{plan.frequency}</span>
        </p>
      </Card.Header>
      <Card.Body className="flex-grow">
         <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">{plan.description}</p>
         <ul role="list" className="space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
            {plan.features.map((feature) => (
             <li key={feature} className="flex gap-x-3">
                <CheckIcon className="h-6 w-5 flex-none text-blue-600 dark:text-blue-400" aria-hidden="true" />
                {feature}
             </li>
            ))}
        </ul>
      </Card.Body>
      <Card.Footer className="mt-auto">
        <Button
            onClick={() => onSelect(plan.id)}
            disabled={isLoading}
            isLoading={isLoading && isSelected} // Show spinner only on the selected button when loading
            className="w-full justify-center"
            variant={plan.id === 'trial' ? 'secondary' : 'primary'} // Style trial button differently
            size="lg"
        >
          {plan.id === 'trial' ? 'Start Free Trial' : 'Choose Plan'}
        </Button>
      </Card.Footer>
    </Card>
  );
};

export default PlanSelectorCard;