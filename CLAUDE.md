# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**OpenPud** — a Typeless-style voice dictation app for Windows: hold a global hotkey, speak, and the transcribed text is pasted at the cursor in whatever app currently has focus. Electron + TypeScript + Vite.

## Commands

```bash
npm run dev     # start Vite + Electron in dev mode (hot reload for both renderer and main process)
npm run build   # tsc --noEmit typecheck, then vite build (renderer + electron/main + preload)
npm run dist    # build, then electron-builder → produces a Windows .exe (NSIS installer)
```

There is no lint or test setup in this repo. Typecheck the two process targets separately since they have separate `tsconfig.json` files and different global types (`DOM` for renderer, `node` for main):

```bash
npx tsc -p tsconfig.json --noEmit          # renderer (src/)
npx tsc -p electron/tsconfig.json --noEmit # main process (electron/)
```

When testing manually, kill any stray `electron.exe`/`node.exe` processes before starting `npm run dev` again — a second instance will fail to re-register the global hotkey and can fight over the Vite dev server port.

## Architecture

Two separate TypeScript programs bundled by `vite-plugin-electron/simple` (see `vite.config.ts`), each with its own `tsconfig.json`:

- **`electron/`** — main process (Node context). Builds to `dist-electron/main.js` + `dist-electron/preload.mjs`.
- **`src/`** — renderer process (DOM context, no Node access). Builds via normal Vite to `dist/`.

The two only talk through `electron/preload.ts`, which exposes a single `window.typeless` object (typed in `src/types.d.ts` — keep that interface in sync with the preload's `api` object whenever IPC channels change) via `contextBridge`. `contextIsolation: true` / `nodeIntegration: false` everywhere.

### Three renderer entry points, one `index.html`

`src/main.ts` is the sole renderer entry point and branches on `location.hash` to decide what to mount:

- `#/onboarding` → dynamically imports `onboarding.css` and `pages/onboarding.ts` — a full-bleed, sidebar-less 4-step first-run wizard (own dark aesthetic, separate from the dashboard's light theme). Auto-opened by `electron/main.ts` on startup only when `store.get('onboardingCompleted')` is falsy.
- Hash is one of `/`, `/history`, `/dictionary`, `/settings` → dynamically imports `dashboard.css` and `shell.ts`, then `mountShell()` — the full dashboard window with sidebar nav.
- No hash (or unrecognized) → `mountWidget()` — the floating recording pill.

`electron/main.ts` creates two separate `BrowserWindow`s pointed at the same built `index.html`/dev-server URL, differing only by URL hash:

- **Widget window** — frameless, transparent, `alwaysOnTop`, `skipTaskbar`, `focusable: false` (so it never steals keyboard focus from the app you're dictating into), positioned bottom-center via `widgetBounds()`, repositioned on `display-metrics-changed`. Mouse events are ignored (`setIgnoreMouseEvents(true)`) — it is purely visual, driven only by the global hotkey, no buttons. Hidden (`opacity: 0`) at idle via CSS in `src/style.css`, shown while recording/processing.
- **Main dashboard window** — normal framed window, single instance (`mainWindow` singleton — calling `createMainWindow()` again just focuses it and sends a `nav:goto` IPC message rather than creating a second window). Opened from the **system tray icon** (there is no in-app button for this — the pill intentionally has zero interactive controls per product decision).

The app has no dock/taskbar presence when both windows are closed — `window-all-closed` is a no-op; only the tray's "ออกจากโปรแกรม" (quit) menu item calls `app.quit()`. Keep this in mind before "fixing" what looks like a missing quit-on-close handler.

### Recording → transcription → paste pipeline

1. `src/widget.ts` listens for `hotkey:toggle-recording` (sent by main process when the global shortcut fires) and toggles `MicRecorder` (`src/recorder.ts`) between idle/recording states — no manual buttons, purely hotkey-driven.
2. `MicRecorder.start()` opens `getUserMedia` (using the configured `micDeviceId`, falling back to system default if that device is gone), wires up a `MediaRecorder` for capture and an `AnalyserNode` for the live waveform drawn on canvas.
3. A `maxDurationSec` safety timer auto-stops recording if the user forgets to press the hotkey again.
4. On stop, the renderer calls `window.typeless.runTranscription(buffer, mimeType, durationMs)` → IPC `transcription:run` in `electron/main.ts`, which:
   - builds a Whisper-`prompt` bias string from the user's saved dictionary (`electron/dictionary.ts`) to improve recognition of custom/technical terms,
   - calls `transcribeAudio()` (`electron/transcribe.ts`) against the configured OpenAI-compatible endpoint,
   - pastes the result at the cursor via `pasteAtCursor()` (`electron/pasteText.ts`),
   - logs the entry to history (`electron/history.ts`),
   - on failure, fires a native OS `Notification` (the pill disappears quickly, so silent failures would otherwise go unnoticed).

### Text injection without native modules

`electron/pasteText.ts` deliberately avoids `robotjs`/`nut-js` (native modules whose prebuilt binaries are frequently out of sync with the current Electron ABI). Instead it writes the result to the clipboard and shells out to `powershell.exe` running `System.Windows.Forms.SendKeys` to simulate Ctrl+V, then restores the previous clipboard contents after a delay. This is Windows-only by design.

### Multi-provider transcription (OpenAI-compatible)

`electron/transcribe.ts` posts multipart form data to `{apiBaseUrl}/audio/transcriptions` for OpenAI-compatible providers. When `apiBaseUrl` is the Gemini AI Studio base (`generativelanguage.googleapis.com/v1beta`), it instead routes through `electron/gemini.ts` which calls `models/{model}:generateContent` with inline audio (`audio/webm` from MediaRecorder) — Gemini has no Whisper-shaped `/audio/transcriptions` endpoint. `electron/llm.ts` likewise branches to Gemini `generateContent` for polish / translate. `AppSettings.model` and `AppSettings.apiBaseUrl` are both user-configurable because providers use different model ID conventions — e.g. OpenAI expects `whisper-1`, OpenRouter expects the namespaced `openai/whisper-1`, Gemini expects `gemini-3.5-flash`. `src/transcriptionModels.ts` hardcodes the known model list per provider (`OPENAI_MODELS`, `OPENROUTER_MODELS`, `GEMINI_MODELS`). `src/pages/settings.ts` renders the Model field as a `<select>` from that list when the provider is `openai`/`openrouter`/`gemini`, or a free-text `<input>` for `custom` — see `modelFieldHtml()`. The provider dropdown (`PROVIDER_PRESETS`) also locks the Base URL field for the known presets; only `custom` allows editing it.

### Persistence

Three separate `electron-store` instances (all in `electron/`, all plain JSON on disk, not encrypted):
- `config.ts` → `AppSettings` (API key, base URL, model, hotkey, language, mic device, launch-at-startup, sound, max duration, `onboardingCompleted`) — default store.
- `history.ts` → capped ring buffer (`MAX_ENTRIES = 500`) of past transcriptions, named store `history`.
- `dictionary.ts` → custom word list used both for display (Dictionary page) and as Whisper prompt bias, named store `dictionary`.

### Dashboard pages

`src/shell.ts` is a minimal hash-based router/sidebar for the dashboard window (`src/pages/{home,history,dictionary,settings}.ts`). It listens to both `hashchange` and the main-process-pushed `nav:goto` IPC event (used when the tray menu re-focuses an already-open dashboard window on a different route). `home.ts` renders real usage stats from `history:stats` — the "Popular use cases" cards are static/decorative, not wired to anything.

### Icons

No emoji anywhere in the UI (product decision — emoji render inconsistently across platforms/fonts). `src/icons.ts` hand-authors a small stroke-based SVG set (24×24 viewBox, `stroke="currentColor"`, Lucide-style) as plain string templates — no icon package dependency, no network fetch. Add new icons there rather than reaching for an emoji or pulling in a library. Real brand marks for the Home page's "Popular use cases" cards live as static files in `public/icons/*.svg`, referenced by URL (`/icons/whatever.svg`) via `<img>`, not inlined — they're official multi-color logos, not themeable with `currentColor` like the hand-authored set.

### Styling: Tailwind CSS v4, no component library

All styling is Tailwind utility classes written inline in template-literal markup (`@tailwindcss/vite` in `vite.config.ts`, `@import 'tailwindcss'` at the top of each CSS entry point) — there is no React/Vue and deliberately no headless component library (shadcn/Radix are React-only; adopting one would mean rewriting the DOM-manipulation architecture for marginal benefit at this app's size). Three independent Tailwind entry points, one per renderer route, each pulled in from `src/main.ts`:

- `src/style.css` — global reset + Tailwind engine, imported unconditionally by every window (widget/dashboard/onboarding all load it).
- `src/dashboard.css` — dashboard-only additions on top of the shared engine: just a `.icon` component-layer rule (default 18×18 sizing for the hand-authored SVGs; override per-instance with a parent `[&_svg]:h-X [&_svg]:w-X` selector rather than editing `icons.ts`).
- `src/onboarding.css` — onboarding's own `@theme` tokens (`--color-ink`, `--color-ink-raised`, `--color-paper`, `--color-coral`, `--font-display` = Fraunces, `--font-mono` = JetBrains Mono, fonts loaded via Google Fonts `@import`) plus the handful of things Tailwind utilities can't express directly: the grain/glow pseudo-elements on `.ob-root`, the panel slide-in (`.ob-panel` / `@keyframes ob-in`), and the hero waveform bar animation (`@keyframes ob-wave`, referenced from markup via arbitrary `[animation:ob-wave_...]`).

Repeated class combinations that would otherwise be duplicated string-for-string across pages are factored into small exported constants in `src/uiClasses.ts` (`BTN`, `BTN_PRIMARY`, `PAGE_TITLE`, `EMPTY_STATE`, `FIELD_LABEL`, `FIELD_INPUT`) — reach for those before inlining a new multi-utility class string that already has a near-duplicate elsewhere. `tsc` does not validate Tailwind class syntax; run `npm run build` (not just `tsc --noEmit`) after touching class strings to catch arbitrary-value typos, since a malformed `[...]` value fails silently at the CSS layer rather than as a type error.
