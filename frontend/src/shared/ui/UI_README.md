# NeuroLedger UI Style Guide & Principles

This document outlines the core principles and conventions used for styling the NeuroLedger frontend application to ensure a consistent, modern, and high-quality user experience.

## 1. Core Design Philosophy

### Modern Financial Intelligence

NeuroLedger's UI conveys the sophistication of an AI-powered financial analysis tool through:

*   **Sophistication & Trust:** Professional aesthetics with refined color usage and visual hierarchy communicate reliability and precision.
*   **Innovation & Intelligence:** Strategic use of micro-animations, layered UI, and thoughtful interactions suggest the power of the underlying AI capabilities.
*   **Clarity & Focus:** Clean layouts with appropriate breathing space and visual hierarchy guide users through complex financial data and interactions.
*   **Consistency:** Unified design patterns provide a cohesive experience throughout the application.
*   **Accessibility:** Sufficient color contrast, clear focus states, and semantic HTML ensure usability for all users.

## 2. Color System

### Primary Palette

*   **Primary Brand:** A refined blue gradient spectrum (`blue-500` → `blue-600`), conveying trust and intelligence.
    * Primary action: `bg-gradient-to-br from-blue-500 to-blue-600`
    * Hover state: `bg-gradient-to-br from-blue-600 to-blue-700`
    * Focus ring: `ring-blue-500/50`

*   **Secondary Accents:** Strategic pops of color to highlight important actions or information.
    * Success: `emerald-500`
    * Warning: `amber-500`
    * Error: `rose-500`
    * Info: `sky-400`

*   **Neutrals:** A sophisticated gray spectrum for UI structure and hierarchy:
    * Light Mode: Surface colors range from `white` to `gray-100` with text in `gray-900` (headings) to `gray-600` (body).
    * Dark Mode: Surface colors range from `gray-900` to `gray-800` with text in `white` (headings) to `gray-300` (body).

### Gradient Usage

Subtle gradients add depth and sophistication:

* Primary buttons: `bg-gradient-to-br from-blue-500 to-blue-600`
* Feature cards: `bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-850`
* Split-screen background: `bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-850 dark:to-indigo-950/10`

## 3. Layout System

*   **Main Application Layout (`AppLayout.jsx`):**
    *   Uses a **fixed-width left Sidebar** (`w-64`) with subtle background texture for branding and primary navigation.
    *   The main content area features generous padding (`p-6 lg:p-8`) and appropriate max-width constraints for optimal readability.
    *   A **subtle header** contains user info and global controls with refined shadow separation.

*   **Authentication/Public Layout (`CenteredLayout.jsx`):**
    *   Uses a **split-screen layout** with dynamic visual elements:
        *   Left panel: Features branded gradient background with subtle animated patterns, dynamic illustrations, and concise value propositions.
        *   Right panel: Contains the main form with refined card styling and clear visual hierarchy.
    *   Responsive behavior prioritizes the form on smaller screens.

*   **Content Containers:**
    *   `Card` components use layered shadows and subtle border highlights to create depth.
    *   Different card variations accommodate various content types (data display, forms, feature highlights).
    *   Internal spacing follows a consistent rhythm (base: `16px`/`1rem`, with mathematically related increments).

## 4. Depth & Elevation

NeuroLedger uses a consistent system of visual elevation to create a sense of depth and hierarchy:

*   **Shadow Levels:**
    *   `shadow-sm`: Subtle separation (e.g., divider elements)
    *   `shadow-soft-md`: Standard elevation (e.g., Cards, Dropdowns)
    *   `shadow-soft-lg`: Emphasized elevation (e.g., Modals, Pop-overs)
    *   `shadow-soft-xl`: Highest elevation (e.g., Critical notifications)

*   **Border Usage:**
    *   Light mode: `border border-gray-200/80`
    *   Dark mode: `border border-gray-700/50`

*   **Layer Separation:**
    Elements use subtle background color shifts between layers to reinforce hierarchy:
    *   Primary background → Card background → Nested element background
    *   Light: `bg-gray-100` → `bg-white` → `bg-gray-50`
    *   Dark: `bg-gray-900` → `bg-gray-800` → `bg-gray-750`

## 5. Typography

*   **Font Family:** `Inter` (Sans Serif), implementing variable font features for optimal display.

*   **Type Scale:**
    *   Display: `text-4xl font-bold tracking-tight`
    *   Heading 1: `text-3xl font-bold tracking-tight`
    *   Heading 2: `text-2xl font-semibold`
    *   Heading 3: `text-xl font-semibold`
    *   Heading 4: `text-lg font-medium`
    *   Body: `text-base`
    *   Small: `text-sm`
    *   Caption: `text-xs`

*   **Weight Spectrum:**
    Strategic use of font weights creates clear hierarchy:
    *   `font-bold`: Primary headings, key numbers/metrics
    *   `font-semibold`: Secondary headings, emphasized elements
    *   `font-medium`: Tertiary headings, buttons, labels
    *   `font-normal`: Body text, descriptions

*   **Line Heights:**
    *   Headings: `leading-tight` (1.25)
    *   Body text: `leading-normal` (1.5)
    *   Multi-line UI elements: `leading-relaxed` (1.625)

## 6. Component Styling

### Buttons
Buttons communicate interactivity and importance through visual styling:

*   **Base Properties:**
    *   `rounded-md px-4 py-2 font-medium text-sm transition-all duration-200`
    *   Clear hover/active states with subtle scaling (`transform hover:scale-[1.02]`)
    *   Disabled state: `opacity-60` with removed hover effects

*   **Variants:**
    *   **Primary:** Gradient fill `bg-gradient-to-br from-blue-500 to-blue-600 text-white`
    *   **Secondary:** Subtle background `bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200`
    *   **Outline:** Transparent with border `border border-gray-300 dark:border-gray-600`
    *   **Ghost:** Minimal styling for lower emphasis `text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800`
    *   **Danger:** Reserved for destructive actions `bg-rose-500 text-white`

*   **Loading State:**
    Uses a subtle fade and custom spinner animation

### Cards
Cards provide structure and visual grouping for content blocks:

*   **Base Styling:**
    *   `bg-white dark:bg-gray-800 rounded-lg overflow-hidden transition-all duration-200`
    *   `shadow-soft-md dark:shadow-soft-lg border border-gray-200/80 dark:border-gray-700/40`

*   **Hover Variant:**
    *   Subtle lift effect: `transform hover:-translate-y-1 hover:shadow-soft-lg`
    *   Slight border highlight: `hover:border-gray-300 dark:hover:border-gray-600`

*   **Card Headers:**
    *   Clear typographic hierarchy
    *   Optional subtle separator `border-b border-gray-200/70 dark:border-gray-700/30`

*   **Card Bodies:**
    *   Consistent internal padding: `px-5 py-4`
    *   Clear typographic hierarchy for nested elements

### Forms & Inputs

Inputs are designed for clarity and ease of use:

*   **Labels:**
    *   Clear association with fields: `text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5`

*   **Text Inputs:**
    *   Clean borders with inset shadows: `border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 shadow-sm`
    *   Focus state with ring effect: `focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500`
    *   Error state: Subtle red indicators
    *   Leading/trailing icons positioned with precision

*   **Selects & Checkboxes:**
    *   Custom-styled to match design language
    *   Clear focus and selected states

### Other Elements

*   **Progress Indicators:** Dynamic, animated indicators of process status
*   **Tooltips:** Subtle, helpful context with refined positioning
*   **Modals:** Layered design with entrance/exit animations
*   **Tables:** Clear data presentation with row highlighting and subtle dividers

## 7. Motion & Animation

NeuroLedger uses motion purposefully to enhance the user experience:

*   **Transitions:** Smooth state changes with appropriate easing
    *   Base transition: `transition-all duration-200 ease-in-out`
    *   Interface state changes: `duration-150`
    *   Modal/popup entrance: `duration-300`

*   **Micro-interactions:** Subtle feedback for user actions
    *   Button clicks: Subtle scale reduction on active state
    *   Toggle switches: Smooth position transitions
    *   Form interactions: Subtle highlighting on focus

*   **Loading States:** Refined animations that represent the NeuroLedger brand
    *   Primary spinner: Gradient animated rotation
    *   Progress indicators: Animated fills with appropriate timing

*   **Page Transitions:** Subtle content entrance animations

## 8. Icons & Imagery

*   **Icons:** `@heroicons/react` (Primarily outline style)
    *   Consistent sizing: Navigation (24px), UI elements (20px), Indicators (16px)
    *   Strategic color usage to indicate states and highlight important elements

*   **Illustrations:**
    *   Modern, minimal style that complements the NeuroLedger brand
    *   Used sparingly to enhance empty states, onboarding, and key feature explanations

*   **Data Visualization:**
    *   Clean, professional charts with brand-appropriate colors
    *   Subtle grid lines and clear labels
    *   Appropriate data density based on screen size

## 9. Responsive Design

While primarily desktop-focused, NeuroLedger provides appropriate experiences across devices:

*   **Breakpoints:**
    *   `sm`: 640px
    *   `md`: 768px
    *   `lg`: 1024px
    *   `xl`: 1280px
    *   `2xl`: 1536px

*   **Mobile Considerations:**
    *   Single-column layouts that prioritize key functionality
    *   Touch-friendly tap targets (min 44px)
    *   Collapsible patterns for complex interfaces

*   **Larger Displays:**
    *   Appropriate max-width constraints prevent content from becoming too wide
    *   Multi-column layouts for more efficient use of space

## 10. Example Application

This style guide is implemented across all NeuroLedger UI components:

*   **Dashboard:** Dynamic data display with clear information hierarchy
*   **Authentication:** Refined, trustworthy forms with clear error handling
*   **Dataset Management:** Intuitive, visual interfaces for data handling
*   **Chat Interface:** Modern message bubbles with clear user/AI distinction
*   **Settings & Profile:** Well-structured forms with visual grouping
*   **Reports & Visualizations:** Professional data presentation with brand-appropriate styling

---

By adhering to these refined design principles, NeuroLedger presents a sophisticated, trustworthy interface that communicates the power of AI-driven financial analysis while maintaining excellent usability and clarity.