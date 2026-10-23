# UI/UX Rules

## Visual Quality
- Use Tailwind CSS v4 classes. Match the existing design system.
- Use Lucide React for icons. Do NOT introduce other icon libraries.
- Typography must use the project's configured fonts (Outfit, Inter).
- Maintain consistent spacing, color palette, and component patterns.

## UX States (Mandatory)
Every interactive component must handle:
- **Loading state**: Spinner or skeleton, disabled buttons during submission.
- **Empty state**: Meaningful message when no data exists.
- **Error state**: User-friendly error message with retry option where appropriate.
- **Success state**: Clear confirmation feedback.

## Responsive Design
- Mobile-first: All layouts must work at 375px minimum width.
- No horizontal overflow on any screen size.
- Touch targets must be at least 44x44px on mobile.
- Test navigation, forms, and checkout on mobile viewports.

## Accessibility
- All interactive elements must be keyboard navigable.
- Images must have meaningful `alt` text.
- Form inputs must have associated labels.
- Color contrast must meet WCAG AA (4.5:1 for text).
- Use semantic HTML: `<nav>`, `<main>`, `<section>`, `<article>`, `<button>`.
- Respect `prefers-reduced-motion` for all animations.

## Do NOT Over-Animate
- Animations must serve UX, not decoration.
- Use Framer Motion only where it already exists.
- Do NOT add GSAP, Lenis, Three.js, or heavy animation libraries to this e-commerce app unless explicitly requested.
