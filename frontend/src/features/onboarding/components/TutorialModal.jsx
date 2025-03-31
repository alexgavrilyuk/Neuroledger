// frontend/src/features/onboarding/components/TutorialModal.jsx
// ** CORRECTED - Removed inline definitions **
import React, { useState } from 'react';
import Modal from '../../../shared/ui/Modal'; // Correct import
import Button from '../../../shared/ui/Button';
import TutorialStep from './TutorialStep';
import { Checkbox } from '../../../shared/ui/Checkbox'; // Correct import

// Define your tutorial steps here
const steps = [
    // Make sure placeholder image exists in public folder or adjust path
  { title: "Welcome to NeuroLedger!", image: "/placeholder-image.svg", content: "Let's quickly walk through how to get started." },
  { title: "1. Upload Your Data", image: "/placeholder-image.svg", content: "Go to 'Datasets' in the account section to upload your Excel or CSV files." },
  { title: "2. Ask Questions", image: "/placeholder-image.svg", content: "Use the chat interface on the dashboard. Type your financial questions in plain English." },
  { title: "3. Get Insights", image: "/placeholder-image.svg", content: "NeuroLedger will generate interactive reports and insights based on your data and prompts." },
];

const TutorialModal = ({ show, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose(true); // Close and potentially persist on last step
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

   const handleClose = (isCompleting = false) => {
       onClose(isCompleting || dontShowAgain);
   };

  if (!show) return null;

  const step = steps[currentStep];

  return (
    // Use the imported Modal component
    <Modal isOpen={show} onClose={() => handleClose(false)} title="Getting Started Guide" size="lg">
      <Modal.Body>
        <TutorialStep title={step.title} image={step.image}>
          {step.content}
        </TutorialStep>

         <div className="flex justify-center space-x-2 mt-6">
             {steps.map((_, index) => (
                 <button
                    key={index}
                    onClick={() => setCurrentStep(index)}
                    className={`h-2 w-2 rounded-full ${
                         index === currentStep ? 'bg-blue-600 dark:bg-blue-400' : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                    }`}
                    aria-label={`Go to step ${index + 1}`}
                 />
             ))}
         </div>

      </Modal.Body>
      <Modal.Footer className="flex flex-col gap-4 sm:flex-row items-center justify-between"> {/* Added gap for spacing */}
         <div className="w-full sm:w-auto"> {/* Allow checkbox to take full width on small screens */}
            <Checkbox
                id="dont-show-again"
                label="Don't show this again"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
             />
         </div>
         <div className="flex space-x-3 w-full sm:w-auto justify-end"> {/* Ensure buttons are at the end on small screens */}
          {currentStep > 0 && (
            <Button variant="secondary" onClick={handlePrev}>
              Previous
            </Button>
          )}
          <Button variant="primary" onClick={handleNext}>
            {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
          </Button>
         </div>
      </Modal.Footer>
    </Modal>
  );
};


export default TutorialModal;