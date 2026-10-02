# OpenPud Design System

OpenPud is a focused Windows utility, not a generic SaaS dashboard. Its three surfaces have distinct jobs and intentionally different visual treatments.

## Shared principles

- Prioritize speed, legibility, and confidence over decoration.
- Keep actions explicit and status text useful; errors say what happened and what to do next.
- Preserve visible keyboard focus, sufficient contrast, and reduced-motion behavior.
- Do not use emoji. Use monochrome SVG UI icons from `src/icons.ts`; keep official brand artwork in `public/icons/`.
- Avoid adding new colors, typefaces, motion, or component patterns without a product reason.

## Dashboard

The dashboard is a quiet Windows utility surface for history, dictionary, settings, and usage.

- Font: Segoe UI with system sans-serif fallback.
- Palette: Tailwind neutral whites, grays, and near-black; color is reserved for status and destructive feedback.
- Structure: neutral sidebar, white content surfaces, subtle borders, restrained `shadow-sm` only where hierarchy needs it.
- Shape: `rounded-lg` controls and `rounded-xl` cards; do not flatten the interface or make every surface equally rounded.
- Density: compact controls with generous page padding; prefer clear grouping over decorative containers.
- Reuse `BTN`, `BTN_PRIMARY`, `FIELD_*`, `PAGE_TITLE`, and `EMPTY_STATE` from `src/uiClasses.ts`.

## Onboarding

Onboarding is a deliberate dark editorial welcome flow, separate from the dashboard theme.

- Display font: Fraunces.
- Utility/body font: JetBrains Mono.
- Tokens: ink `#141311`, raised ink `#1c1a17`, paper `#f5efe6`, coral `#ff4e33`.
- Coral is the single primary accent for progress, selection, and primary action.
- Preserve the subtle grain, restrained coral glow, and one panel entrance animation.
- Keep the four-step flow full-bleed and sidebar-free.
- Do not restyle onboarding to match the dashboard without an explicit redesign request.

## Recording widget

The widget is a transient status indicator, not an interactive control.

- Keep it compact, dark, translucent, pill-shaped, and bottom-centered.
- Use white/neutral waveform and status content with a restrained dark shadow for separation.
- Idle remains invisible; recording, processing, and skipped states may appear.
- Do not add buttons, navigation, hover affordances, or anything that suggests clickability.

## Implementation rules

- Use Tailwind CSS v4 utilities in existing template strings.
- Use daisyUI 5 components and semantic colors for dashboard controls; keep its plugin and light theme scoped to `src/dashboard.css`.
- Keep route-specific CSS in `src/dashboard.css` and `src/onboarding.css`; shared reset/runtime styling stays in `src/style.css`.
- Reuse `src/uiClasses.ts` before duplicating a multi-utility class group.
- Use React for the dashboard shell and shared components; legacy page mounts, onboarding, and the widget may migrate incrementally.
- Do not add React UI libraries on top of daisyUI without a product reason.
- Use CSS for visual states and motion; use JavaScript only when state or behavior requires it.
- Keep motion brief and purposeful. Respect `prefers-reduced-motion` when adding or changing animation.

## UI verification

- Run `npm.cmd run build` after Tailwind class changes; TypeScript does not validate class syntax.
- Check dashboard, onboarding, and widget independently because they load different visual entry points.
- Confirm keyboard focus, disabled states, long Thai/English text, empty states, and error states.
- Treat build success as code validation, not visual acceptance; inspect the affected window manually.
