# OpenPud Design System

OpenPud is a focused Windows utility, not a generic SaaS dashboard. Its three surfaces have distinct jobs and intentionally different visual treatments.

## Shared principles

- Prioritize speed, legibility, and confidence over decoration.
- Keep actions explicit and status text useful; errors say what happened and what to do next.
- Preserve visible keyboard focus, sufficient contrast, and reduced-motion behavior.
- Do not use emoji. Use monochrome SVG UI icons from `src/icons.ts`; keep official brand artwork in `public/icons/`.
- Avoid adding new colors, typefaces, motion, or component patterns without a product reason.

## Brand tokens

- Blue `#0055FF`: logo mark, primary brand accent, selected states, and primary button backgrounds.
- Ink `#0B1218`: main text, high-emphasis labels, and dark UI surfaces.
- White `#FFFFFF`: wordmark, foreground on Blue/Ink buttons, and clean content surfaces.
- Light Blue `#EEF4FF`: app background, soft panels, and low-emphasis brand surfaces.
- Highlight Slate `#64748B`: secondary text, helper text, muted labels, and inactive metadata.
- Border `#E2E8F0`: dividers, input borders, table lines, and quiet card outlines.
- Do not introduce off-palette blues, grays, or near-blacks unless a state cannot meet contrast with the core tokens.

## Typography

- App UI font: use the existing system sans-serif stack unless a product redesign explicitly changes it.
- Brand/wordmark direction: rounded geometric sans-serif, bold weight, soft terminals.
- Wordmark starting point: Nunito Sans ExtraBold `800`; adjust tracking and spacing to match the logo reference.
- Keep Thai text legible first; do not force the wordmark font onto body copy or dense dashboard controls.

## Dashboard

The dashboard is a quiet Windows utility surface for history, dictionary, settings, and usage.

- Font: system sans-serif stack for utility UI; reserve Nunito Sans ExtraBold `800` for brand/wordmark work only.
- Palette: use Light Blue `#EEF4FF` for the app background, White `#FFFFFF` for content surfaces, Ink `#0B1218` for primary text, Highlight Slate `#64748B` for secondary text, Border `#E2E8F0` for lines, and Blue `#0055FF` for primary action/brand states.
- Structure: Light Blue page background, White content surfaces, subtle Border lines, restrained `shadow-sm` only where hierarchy needs it.
- Shape: `rounded-lg` controls and `rounded-xl` cards; do not flatten the interface or make every surface equally rounded.
- Density: compact controls with generous page padding; prefer clear grouping over decorative containers.
- Reuse `BTN`, `BTN_PRIMARY`, `FIELD_*`, `PAGE_TITLE`, and `EMPTY_STATE` from `src/uiClasses.ts`.

## Onboarding

Onboarding is a deliberate editorial welcome flow, separate from the dashboard theme.

- Display/brand direction: rounded geometric sans-serif; use Nunito Sans ExtraBold `800` as the first wordmark candidate.
- Utility/body font: system sans-serif stack unless the onboarding redesign explicitly needs a separate display face.
- Tokens: Ink `#0B1218`, Blue `#0055FF`, White `#FFFFFF`, Light Blue `#EEF4FF`, Highlight Slate `#64748B`, Border `#E2E8F0`.
- Blue is the single primary accent for progress, selection, and primary action.
- Preserve the restrained entrance animation and focused four-step pacing.
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
