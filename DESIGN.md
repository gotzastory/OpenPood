# OpenPood Design System

OpenPood is a focused Windows utility, not a generic SaaS dashboard. Its three surfaces have distinct jobs and intentionally different visual treatments.

## Shared principles

### Approved rebrand scope

- Redesign Dashboard, Onboarding, and Recording widget as OpenPood.
- Dashboard: white sidebar with the supplied logo; Light Blue workspace; Dictate/Translate and hotkeys lead Home, usage is secondary; History/Dictionary/Apps remain readable lists; Settings has clear groups behind one Save, so instant-save lists get their own page.
- Onboarding: Ink background, rounded sans-serif headings, Blue actions, five steps including a dictation test after hotkey setup, no sidebar. Remove the former serif, coral, and grain treatment.
- Widget: translucent Ink pill with neutral waveform; no interactive controls.
- Logo: preserve the supplied mark and proportions. Ink wordmark on light surfaces, White wordmark on dark surfaces; Blue symbol for tray and application icon.
- Rename display/package/application identity to OpenPood. Preserve the existing NSIS upgrade identity and migrate local settings, encrypted API key, history, and dictionary before stores initialize. Never delete the legacy source or overwrite existing OpenPood data.

- Prioritize speed, legibility, and confidence over decoration.
- Keep actions explicit and status text useful; errors say what happened and what to do next.
- Preserve visible keyboard focus, sufficient contrast, and reduced-motion behavior.
- Do not use emoji. Use monochrome SVG UI icons from `src/lib/icons.ts`; keep official brand artwork in `public/icons/`.
- Avoid adding new colors, typefaces, motion, or component patterns without a product reason.

## Brand tokens

- Blue `#0055FF`: logo mark, primary brand accent, selected states, and primary button backgrounds.
- Ink `#0B1218`: main text, high-emphasis labels, and dark UI surfaces.
- White `#FFFFFF`: wordmark on dark surfaces, foreground on Blue/Ink buttons, and clean content surfaces. Use Ink for the wordmark on light surfaces.
- Light Blue `#EEF4FF`: app background, soft panels, and low-emphasis brand surfaces.
- Highlight Slate `#64748B`: secondary text, helper text, muted labels, and inactive metadata.
- Border `#E2E8F0`: dividers, input borders, table lines, and quiet card outlines.
- Retain distinct success, warning, and error colors for semantic feedback; do not use them as decorative brand accents.

## Typography

- App UI font: use the existing system sans-serif stack unless a product redesign explicitly changes it.
- Brand/wordmark direction: rounded geometric sans-serif, bold weight, soft terminals.
- Wordmark starting point: Nunito Sans ExtraBold `800`; adjust tracking and spacing to match the logo reference.
- Keep Thai text legible first; do not force the wordmark font onto body copy or dense dashboard controls.

## Dashboard

The dashboard is a quiet Windows utility surface for history, dictionary, settings, and usage.

- Font: system sans-serif stack for utility UI; reserve Nunito Sans ExtraBold `800` for brand/wordmark work only.
- Light palette: use Light Blue `#EEF4FF` for the app background, White `#FFFFFF` for content surfaces, Ink `#0B1218` for primary text, Highlight Slate `#64748B` for secondary text, Border `#E2E8F0` for lines, and Blue `#0055FF` for primary action/brand states.
- Dark palette (`data-theme="dark"`): Ink `#0B1218` for the app background (`base-200`), `#111A24` for content surfaces (`base-100`), `#223041` for lines (`base-300`), `#E6EDF6` for primary text, Slate `#94A3B8` for secondary text, `#1C2A3A` for neutral surfaces, and `#2563EB` for primary/info actions. Status colors: success `#4ADE80`, warning `#FACC15`, error `#F87171`. The sidebar logo uses the White wordmark with the Blue symbol.
- Theme toggle: the sidebar button (label `ธีมมืด`, sun/moon icon, `aria-pressed`) switches between light and dark. With no saved choice, the OS `prefers-color-scheme` decides; a manual choice is saved in localStorage key `openpood-theme` and applied as `data-theme` on `<html>` on later launches.
- Onboarding and the recording widget are dark-only and do not follow the dashboard theme toggle.
- Structure: Light Blue page background, White content surfaces, subtle Border lines, restrained `shadow-sm` only where hierarchy needs it.
- Shape: `rounded-lg` controls and `rounded-xl` cards; do not flatten the interface or make every surface equally rounded.
- Density: compact controls with generous page padding; prefer clear grouping over decorative containers.
- Reuse `BTN`, `BTN_PRIMARY`, `FIELD_*`, `PAGE_TITLE`, and `EMPTY_STATE` from `src/lib/uiClasses.ts`.

## Onboarding

Onboarding is a deliberate editorial welcome flow, separate from the dashboard theme.

- Display/brand direction: rounded geometric sans-serif; use Nunito Sans ExtraBold `800` as the first wordmark candidate.
- Utility/body font: system sans-serif stack unless the onboarding redesign explicitly needs a separate display face.
- Tokens: Ink `#0B1218`, Blue `#0055FF`, White `#FFFFFF`, Light Blue `#EEF4FF`, Highlight Slate `#64748B`, Border `#E2E8F0`.
- Blue is the single primary accent for progress, selection, and primary action.
- Preserve the restrained entrance animation and focused five-step pacing.
- Keep the five-step flow full-bleed and sidebar-free.
- Keep onboarding dark and full-bleed while sharing the new brand palette with the dashboard.

## Recording widget

The widget is a transient status indicator, not an interactive control.

- Keep it compact, dark, translucent, pill-shaped, and bottom-centered.
- Use white/neutral waveform and status content with a restrained dark shadow for separation.
- Idle remains invisible; recording, processing, and skipped states may appear.
- Do not add buttons, navigation, hover affordances, or anything that suggests clickability.

## Implementation rules

- Use Tailwind CSS v4 utilities in existing template strings.
- Use daisyUI 5 components and semantic colors for dashboard controls; keep its plugin and the `light` and `dark` themes scoped to `src/styles/dashboard.css`.
- New dashboard colors must use daisyUI semantic tokens (`bg-base-100`, `border-base-300`, `text-base-content`, `primary`, etc.) rather than hard-coded hex or light-only palette classes, so both themes work.
- Keep route-specific CSS in `src/styles/dashboard.css` and `src/styles/onboarding.css`; shared reset/runtime styling stays in `src/styles/style.css`.
- Reuse `src/lib/uiClasses.ts` before duplicating a multi-utility class group.
- Use React for the dashboard shell and shared components; legacy page mounts, onboarding, and the widget may migrate incrementally.
- Do not add React UI libraries on top of daisyUI without a product reason.
- Use CSS for visual states and motion; use JavaScript only when state or behavior requires it.
- Keep motion brief and purposeful. Respect `prefers-reduced-motion` when adding or changing animation.

## UI verification

- Run `npm.cmd run build` after Tailwind class changes; TypeScript does not validate class syntax.
- Check dashboard, onboarding, and widget independently because they load different visual entry points.
- Check the dashboard in both `light` and `dark` themes, including the sidebar toggle and logo, and confirm the saved choice survives a restart.
- Confirm keyboard focus, disabled states, long Thai/English text, empty states, and error states.
- Treat build success as code validation, not visual acceptance; inspect the affected window manually.
