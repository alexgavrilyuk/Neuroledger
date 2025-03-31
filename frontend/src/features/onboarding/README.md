# frontend/src/features/onboarding/README.md
# ** NEW FILE **

## Feature: Frontend Onboarding Tutorial

This feature provides a simple, multi-step tutorial modal shown to users upon their first interaction with the main application dashboard, guiding them through the basic workflow.

### Core Flow

1.  **Triggering (`AppLayout.jsx`):**
    *   The `AppLayout` component uses the `useOnboarding` hook.
    *   It passes the user's `onboardingCompleted` status (from the `AuthContext`) to the hook.
2.  **Hook Logic (`hooks/useOnboarding.js`):**
    *   The hook checks both the `user.onboardingCompleted` flag (from backend via context) AND a flag in `localStorage` (`neuroledger-onboarding-completed`).
    *   It only sets `showOnboarding` to `true` if *neither* the backend flag is true *nor* the localStorage flag is 'true'. This allows dismissing for the session without persisting, but also respects persistence across sessions/devices if chosen.
    *   It provides `showOnboarding` (boolean state) and `dismissOnboarding` (function) to the consuming component.
3.  **Modal Display (`AppLayout.jsx` & `components/TutorialModal.jsx`):**
    *   `AppLayout` conditionally renders `<TutorialModal />` based on the `showOnboarding` state from the hook.
    *   `TutorialModal` displays the steps using `TutorialStep` components.
    *   It manages the `currentStep` state internally.
    *   It provides 'Next'/'Previous'/'Finish' buttons for navigation.
    *   It includes a "Don't show this again" checkbox.
    *   When closed (via Finish, X button, or Escape key), it calls the `dismissOnboarding` function passed from the hook, passing `true` if the "Don't show again" checkbox was checked or if the user clicked 'Finish', causing the hook to update `localStorage`.
4.  **Persistence:** The `useOnboarding` hook sets the `localStorage` flag when `dismissOnboarding(true)` is called. (Optionally, it could also trigger a backend update).

### Files

*   **`components/`**
    *   `TutorialModal.jsx`: The main modal component housing the tutorial steps and navigation. Uses `shared/ui/Modal` and `shared/ui/Checkbox`.
    *   `TutorialStep.jsx`: A simple presentational component for the content of a single tutorial step.
*   **`hooks/`**
    *   `useOnboarding.js`: Hook managing the logic for when to show the tutorial and how to handle dismissal/persistence via `localStorage`.
*   **`README.md`**: This file.

### Related Files/Components (Need Creation if not existing)

*   `shared/ui/Modal.jsx`: A reusable Modal component.
*   `shared/ui/Checkbox.jsx`: A reusable Checkbox component.

### Dependencies

*   `shared/hooks/useAuth` (indirectly via `AppLayout` providing `user.onboardingCompleted`)
*   `shared/ui/Modal`, `shared/ui/Checkbox`, `shared/ui/Button`
*   `@heroicons/react` (potentially for icons within modal/steps)

### State Management

*   Local state within `TutorialModal` manages `currentStep` and the `dontShowAgain` checkbox state.
*   State within `useOnboarding` manages `showOnboarding` based on checks against `localStorage` and the user prop.
*   Persistence is handled via `localStorage`.