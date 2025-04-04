// frontend/src/features/onboarding/components/TutorialStep.jsx
import React from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';

const TutorialStep = ({
  title,
  children,
  image,
  icon: Icon = SparklesIcon,
  iconColor = "text-blue-500 dark:text-blue-400",
  iconBg = "bg-blue-100 dark:bg-blue-900/30"
}) => {
  return (
    <div className="flex flex-col items-center text-center max-w-xl mx-auto">
      {/* Icon with enhanced styling */}
      <div className={`mb-6 p-3.5 rounded-full ${iconBg} shadow-soft-md dark:shadow-soft-dark-md transition-all duration-300 transform hover:scale-105`}>
        <Icon className={`h-10 w-10 ${iconColor}`} />
      </div>

      {/* Title with gradient text and better typography */}
      <h3 className="text-xl sm:text-2xl font-bold mb-3 text-gradient-blue dark:text-gradient-blue">
        {title}
      </h3>

      {/* Content with improved readability */}
      <div className="text-base text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
        {children}
      </div>

      {/* Image with enhanced presentation */}
      {image && (
        <div className="relative mt-3 mb-6 w-full max-w-sm">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 rounded-lg transform -rotate-2"></div>
          <img
            src={image}
            alt={title}
            className="relative w-full rounded-lg shadow-soft-md dark:shadow-soft-dark-md border border-gray-200 dark:border-gray-700 transform rotate-1 transition-transform duration-300 hover:rotate-0 z-10"
          />

          {/* Decorative elements */}
          <div className="absolute -top-4 -right-4 h-12 w-12 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 opacity-70 dark:opacity-50 blur-xl z-0"></div>
          <div className="absolute -bottom-3 -left-6 h-16 w-16 rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 opacity-70 dark:opacity-50 blur-xl z-0"></div>
        </div>
      )}

      {/* Optional feature bullets - only shown if there are multiple paragraphs */}
      {children && children.toString().includes("\n") && (
        <div className="mt-4 text-left w-full max-w-md mx-auto">
          <ul className="space-y-2">
            {children.toString().split("\n").filter(line => line.trim()).map((line, index) => (
              <li key={index} className="flex items-start">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-2 mt-0.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400"></span>
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-300">{line.trim()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TutorialStep;