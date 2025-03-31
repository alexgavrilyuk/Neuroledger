# frontend/UI_README.md

# NeuroLedger UI Style Guide & Principles

This document outlines the core principles and conventions used for styling the NeuroLedger frontend application to ensure a consistent, modern, and high-quality user experience.

## 1. Core Philosophy

*   **Modern & Clean:** Aim for a contemporary aesthetic that feels professional, intuitive, and visually appealing. Avoid clutter and overly complex designs.
*   **Consistent:** Apply styles, spacing, typography, and components uniformly across the application.
*   **Accessible:** Ensure sufficient color contrast, clear focus states, and semantic HTML for users with disabilities.
*   **Responsive:** Design should adapt gracefully to different screen sizes (though initial focus may be desktop-first for this type of app).

## 2. Layout System

*   **Main Application Layout (`AppLayout.jsx`):**
    *   Uses a **fixed-width left Sidebar** (`shared/components/Sidebar.jsx`, default `w-64`) for primary navigation and branding.
    *   The main content area occupies the remaining horizontal space (`pl-64`).
    *   A **sticky Header** within the content area may contain secondary actions, user info, and global controls (like ThemeSwitcher).
*   **Authentication/Public Layout (`CenteredLayout.jsx`):**
    *   Uses a **split-screen layout** on larger screens (`lg:` breakpoint and up).
        *   Left panel: Used for branding, illustrations, or marketing text. Typically has a subtle gradient or background pattern.
        *   Right panel: Contains the main form (`Outlet`) centered within a `Card`.
    *   On smaller screens, it collapses to a single column, centering the form card.
*   **Content Layout:** Within the main content area of `AppLayout`, use standard layout techniques (Flexbox, Grid), often placing primary content within `Card` components.

## 3. Spacing & Padding

*   **Generous Whitespace:** Use padding and margins liberally to create breathing room and visual separation. Avoid cramped elements. (Leverage Tailwind's spacing scale).
*   **Consistent Padding:** Apply consistent internal padding within components like Buttons, Inputs, Cards, List items.
    *   Standard padding for `Card.Body` is `px-4 py-5 sm:p-6`.
    *   Standard padding for medium `Button` is `px-4 py-2`.
    *   Standard padding for `Input` is `py-2` plus horizontal padding adjusting for icons.
*   **Stacking:** Use `space-y-*` or `gap-*` utilities for consistent spacing between stacked elements (e.g., form fields, list items).

## 4. Typography

*   **Font Family:** `Inter` (Sans Serif). Imported via Google Fonts in `index.html` and set as default in `tailwind.config.js`.
*   **Hierarchy:** Use Tailwind's font size (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, etc.) and weight (`font-normal`, `font-medium`, `font-semibold`, `font-bold`) utilities consistently to establish clear visual hierarchy for:
    *   Page Titles (e.g., `text-2xl font-semibold`)
    *   Card Headers (e.g., `text-base font-semibold`)
    *   Form Labels (e.g., `text-sm font-medium`)
    *   Body Text (e.g., `text-sm` or `text-base font-normal`)
    *   Button Text (e.g., `text-sm font-medium`)
*   **Color:** Use defined neutral text colors (`gray-900`/`gray-700` light, `white`/`gray-300` dark) for readability. Use accent colors sparingly for links or emphasis.
*   **Line Height:** Rely on Tailwind's default leading utilities (`leading-tight`, `leading-normal`, `leading-relaxed`).

## 5. Color Palette

*   **Primary Accent:** Tailwind CSS `blue` family (e.g., `blue-600` for primary actions, `blue-500` for focus rings).
*   **Neutrals:** Tailwind CSS `gray` family. Used extensively for:
    *   Backgrounds (`white`/`gray-100` light, `gray-900`/`gray-950` dark)
    *   Card Backgrounds (`white` light, `gray-800` dark)
    *   Text (See Typography)
    *   Borders (`gray-200`/`gray-300` light, `gray-700`/`gray-600` dark)
    *   Input Rings/Placeholders
*   **Feedback:** Use standard `red`, `yellow`/`orange`, `green` families for errors, warnings, and success states.
*   **Dark Mode:** Styles must be defined for dark mode using the `dark:` variant prefix. Ensure good contrast ratios in both modes.

## 6. Component Styling

*   **Rounding:** Use subtle rounding consistently. Default is `rounded-lg` for `Card` and `rounded-md` for `Button`, `Input`.
*   **Shadows/Borders:**
    *   Prefer soft, subtle shadows (`shadow-soft-sm`, `shadow-soft-md`) in light mode.
    *   Prefer subtle borders (`border border-gray-700`) in dark mode for definition, potentially removing shadows.
    *   Use shadows/borders purposefully to create depth and separate elements.
*   **Buttons:** See `shared/ui/Button.jsx`. Must have clear hover and focus-visible states using the primary color. Support optional icons.
*   **Inputs:** See `shared/ui/Input.jsx`. Must have clear focus-visible states (ring and/or border color change). Support optional leading/trailing icons. Use `@tailwindcss/forms` plugin for base styling reset.
*   **Cards:** See `shared/ui/Card.jsx`. Provide structure and visual grouping for content blocks.

## 7. Icons

*   **Library:** `@heroicons/react` (Outline style preferred by default).
*   **Usage:** Use icons purposefully to enhance clarity and provide visual cues, typically alongside text in navigation items, buttons, or inputs. Don't overuse.
*   **Consistency:** Use icons from the chosen library consistently. Ensure appropriate size and color.

## 8. Responsiveness

*   While the initial focus is desktop, use Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`) where necessary to adapt layouts and styles for smaller viewports. The `CenteredLayout` split-screen is a primary example.

---

By adhering to these principles, we can maintain a cohesive and polished user interface as new features are developed. Refer back to this guide and the shared UI components when building new elements.