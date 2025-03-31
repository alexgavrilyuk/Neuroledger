// frontend/src/features/onboarding/components/TutorialStep.jsx
// ** NEW FILE **
import React from 'react';

const TutorialStep = ({ title, children, image }) => {
  return (
    <div className="flex flex-col items-center text-center">
      {image && <img src={image} alt={title} className="mb-4 w-full max-w-xs h-auto rounded" />}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <div className="text-sm text-gray-600 dark:text-gray-400">{children}</div>
    </div>
  );
};

export default TutorialStep;