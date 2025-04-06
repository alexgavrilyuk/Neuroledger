# frontend/src/shared/ui/README.md
# ** UPDATED FILE **

## Shared: UI Components

This directory contains foundational, reusable, and themeable UI building blocks based on Tailwind CSS. These components promote consistency and reduce duplication, adhering to the styles defined in `UI_README.md`.

### Principles

*   **Presentational:** Focused on look and feel, minimal internal state.
*   **Reusable:** Designed for use across different features.
*   **Themeable:** Styles adapt to light/dark mode using Tailwind's `dark:` variants and the configured color palette.
*   **Composable:** Can be combined to build more complex UI (e.g., `Card` sub-components, `Modal` sub-components).
*   **Accessible:** Includes appropriate ARIA attributes and focus management where applicable.

### Dependencies

*   `@heroicons/react` (for optional icons in Button, Input, etc.)
*   `@tailwindcss/forms` (plugin used for base input styling, configured in `tailwind.config.js`)
*   `react` (`forwardRef`, `createPortal`)

### Files

*   **`Button.jsx`**: Renders a styled button.
    *   **Props:** `children`, `onClick`, `type`, `variant` ('primary', 'secondary', 'danger', 'ghost'), `size` ('sm', 'md', 'lg'), `disabled`, `isLoading`, `className`, `leftIcon`, `rightIcon` (Heroicon components).
    *   Styling: Uses refined padding, `rounded-md`, supports icons, clear hover/focus states, loading indicator, and consistent variants.
*   **`Card.jsx`**: Renders a container with background, shadow/border, and rounded corners. Includes optional `Card.Header`, `Card.Body`, `Card.Footer` sub-components for structure.
    *   **Props:** `children`, `className`, `elevation` ('default', 'low'), `padding` ('default', 'compact', 'none' for Card.Body).
    *   Styling: Uses `rounded-lg`, soft shadows/borders, configured background colors. Sub-components provide structure and standard padding/borders.
*   **`Checkbox.jsx`**: Renders a styled checkbox with support for label, hint, error, and indeterminate states. Includes `CheckboxGroup` wrapper.
    *   **Props (Checkbox):** `id`, `name`, `value`, `label`, `checked`, `onChange`, `disabled`, `indeterminate`, `required`, `error`, `hint`, `className`, `labelClassName`, `size` ('sm', 'md', 'lg').
    *   **Props (CheckboxGroup):** `children`, `label`, `hint`, `error`, `className`, `orientation` ('vertical', 'horizontal').
    *   Styling: Custom appearance replacing default checkbox, handles different states (checked, indeterminate, disabled, error) and sizes.
*   **`Input.jsx`**: Renders a styled text input field with optional label, error message, and icons.
    *   **Props:** `id`, `name`, `type`, `value`, `onChange`, `placeholder`, `disabled`, `required`, `className`, `label`, `error`, `leadingIcon`, `trailingIcon` (Heroicon components).
    *   Styling: Uses base styles from `@tailwindcss/forms`, `rounded-md`, padding adjustment for icons, clear focus ring, standard border/background colors.
*   **`Modal.jsx`**: Renders a modal dialog using `createPortal`. Includes `Modal.Header`, `Modal.Body`, `Modal.Footer` sub-components.
    *   **Props:** `isOpen`, `onClose`, `title`, `children`, `size` ('xs'...'2xl', 'full'), `hideCloseButton`, `closeOnOverlayClick`, `trapFocus`, `closeOnEscape`, `slideFrom` ('bottom', 'top', 'left', 'right', 'none').
    *   Features: Focus trapping, Escape key closing, overlay click closing, entry animations.
*   **`Spinner.jsx`**: Renders an SVG/CSS loading indicator.
    *   **Props:** `size` ('xs'...'xl'), `color` (Tailwind class), `secondaryColor` (Tailwind class), `variant` ('circle', 'dots', 'bars', 'pulse'), `className`, `label`, `showLabel`.
    *   Supports different visual styles and sizes.

### Future Components

*   `Table.jsx`
*   `Select.jsx`
*   `TextArea.jsx`
*   `Tooltip.jsx`
*   `ChartWrapper.jsx`
*   `Icon.jsx` (if more generic icon handling is needed)
*   `Avatar.jsx`

### Usage

Import and use these components within feature components or pages instead of raw HTML elements or applying one-off Tailwind classes. Ensure consistency by relying on the variants and props provided. Refer to `UI_README.md` for overall style guidelines.

```jsx
import Button from '../shared/ui/Button';
import Card from '../shared/ui/Card';
import Input from '../shared/ui/Input';
import { EnvelopeIcon } from '@heroicons/react/24/outline';

function MyFormComponent() {
  return (
    <Card>
      <Card.Header>My Form</Card.Header>
      <Card.Body className="space-y-4">
        <Input label="Email" id="email" leadingIcon={EnvelopeIcon} />
        <Button type="submit" variant="primary">Submit</Button>
      </Card.Body>
    </Card>
  );
}
```
