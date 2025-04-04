// frontend/src/features/onboarding/components/TutorialModal.jsx
import React, { useState, useEffect } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import TutorialStep from './TutorialStep';
import { Checkbox } from '../../../shared/ui/Checkbox';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  SparklesIcon,
  LightBulbIcon,
  ChatBubbleBottomCenterTextIcon,
  RocketLaunchIcon
} from '@heroicons/react/24/outline';

// Enhanced tutorial steps with better icons and content structure
const steps = [
  {
    title: "Welcome to NeuroLedger!",
    icon: SparklesIcon,
    iconColor: "text-blue-500 dark:text-blue-400",
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    image: "/placeholder-image.svg",
    content: "Let's quickly walk through how to get started with your financial data analysis journey."
  },
  {
    title: "Upload Your Data",
    icon: RocketLaunchIcon,
    iconColor: "text-purple-500 dark:text-purple-400",
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    image: "/placeholder-image.svg",
    content: "Go to 'Datasets' in the account section to upload your Excel or CSV files. Adding context to your data improves analysis quality."
  },
  {
    title: "Ask Questions",
    icon: ChatBubbleBottomCenterTextIcon,
    iconColor: "text-green-500 dark:text-green-400",
    iconBg: "bg-green-100 dark:bg-green-900/30",
    image: "/placeholder-image.svg",
    content: "Use the chat interface on the dashboard. Type your financial questions in plain English and select relevant datasets for context."
  },
  {
    title: "Get Insights",
    icon: LightBulbIcon,
    iconColor: "text-amber-500 dark:text-amber-400",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    image: "/placeholder-image.svg",
    content: "NeuroLedger will generate interactive reports and insights based on your data and prompts. Explore visualizations, trends, and actionable recommendations."
  },
];

const TutorialModal = ({ show, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [animationDirection, setAnimationDirection] = useState('right'); // 'left' or 'right'

  // Reset animation direction when modal opens
  useEffect(() => {
    if (show) {
      setAnimationDirection('right');
    }
  }, [show]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setAnimationDirection('right');
      setCurrentStep(currentStep + 1);
    } else {
      handleClose(true); // Close and potentially persist on last step
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setAnimationDirection('left');
      setCurrentStep(currentStep - 1);
    }
  };

  const handleClose = (isCompleting = false) => {
    onClose(isCompleting || dontShowAgain);
  };

  const handleStepClick = (stepIndex) => {
    setAnimationDirection(stepIndex > currentStep ? 'right' : 'left');
    setCurrentStep(stepIndex);
  };

  if (!show) return null;

  const step = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <Modal
      isOpen={show}
      onClose={() => handleClose(false)}
      title="" // Remove title, we'll handle it inside
      size="lg"
      slideFrom="bottom"
    >
      <Modal.Body padding="default" className="pt-8">
        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-t-lg"></div>

        {/* Progress indicator - Enhanced with animation */}
        <div className="flex justify-center space-x-3 mb-8">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => handleStepClick(index)}
              className={`
                group flex flex-col items-center
              `}
              aria-label={`Go to step ${index + 1}`}
            >
              <span className={`
                relative h-2.5 w-2.5 rounded-full transition-all duration-300
                ${index === currentStep
                  ? 'bg-blue-600 dark:bg-blue-400 scale-125'
                  : 'bg-gray-300 dark:bg-gray-600 group-hover:bg-gray-400 dark:group-hover:bg-gray-500'}
              `}>
                {index < currentStep && (
                  <span className="absolute inset-0 rounded-full bg-blue-500/30 dark:bg-blue-400/30 animate-ping" />
                )}
              </span>

              {/* Connecting lines between dots */}
              {index < steps.length - 1 && (
                <span className={`
                  absolute top-1.5 left-3 w-7 h-0.5 -ml-1
                  ${index < currentStep
                    ? 'bg-blue-500 dark:bg-blue-400'
                    : 'bg-gray-300 dark:bg-gray-600'}
                `}></span>
              )}
            </button>
          ))}
        </div>

        {/* Tutorial content with animation */}
        <div className="relative overflow-hidden">
          <div
            className={`
              transition-all duration-500 ease-in-out transform
              ${animationDirection === 'right' ? 'translate-x-0 opacity-100' : '-translate-x-8 opacity-0'}
            `}
          >
            <TutorialStep
              title={step.title}
              image={step.image}
              icon={step.icon}
              iconColor={step.iconColor}
              iconBg={step.iconBg}
            >
              {step.content}
            </TutorialStep>
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-gray-50 dark:bg-gray-800/50">
        <div className="w-full sm:w-auto">
          <Checkbox
            id="dont-show-again"
            label="Don't show this again"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
        </div>

        <div className="flex space-x-3 w-full sm:w-auto justify-end">
          {!isFirstStep && (
            <Button
              variant="ghost"
              onClick={handlePrev}
              leftIcon={ArrowLeftIcon}
              className="px-3"
            >
              Previous
            </Button>
          )}

          <Button
            variant="primary"
            onClick={handleNext}
            rightIcon={isLastStep ? CheckIcon : ArrowRightIcon}
            className={`shadow-soft-md hover:shadow-soft-lg ${isLastStep ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : ''}`}
          >
            {isLastStep ? 'Get Started' : 'Next'}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default TutorialModal;