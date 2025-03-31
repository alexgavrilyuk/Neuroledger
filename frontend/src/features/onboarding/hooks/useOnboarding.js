// frontend/src/features/onboarding/hooks/useOnboarding.js
// ** NEW FILE **
import { useState, useEffect, useCallback } from 'react';

const LOCAL_STORAGE_KEY = 'neuroledger-onboarding-completed';

export const useOnboarding = (userOnboardingCompleted = false) => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [localStorageChecked, setLocalStorageChecked] = useState(false);

  // Check local storage only once on mount
  useEffect(() => {
    const storedValue = localStorage.getItem(LOCAL_STORAGE_KEY);
    // Show onboarding if BOTH backend flag is false AND localStorage flag is not 'true'
    if (!userOnboardingCompleted && storedValue !== 'true') {
      setShowOnboarding(true);
    }
    setLocalStorageChecked(true); // Indicate check is complete
  }, [userOnboardingCompleted]); // Re-check if the backend flag changes (e.g., on user load)

  const dismissOnboarding = useCallback((persist = false) => {
    setShowOnboarding(false);
    if (persist) {
      localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
      // Optional: Make an API call to update user.onboardingCompleted on the backend
      // apiClient.post('/users/me/complete-onboarding').catch(err => console.error("Failed to update onboarding status on backend", err));
      console.log("Onboarding marked as completed in localStorage.");
    } else {
        console.log("Onboarding dismissed for this session only.");
    }
  }, []);

  // Only return show=true after the initial localStorage check is done
  const shouldShow = localStorageChecked && showOnboarding;

  return {
    showOnboarding: shouldShow,
    dismissOnboarding,
    // Add currentStep logic here if needed later
  };
};