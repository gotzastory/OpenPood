# OpenPud System Design

This document describes the current Windows implementation. It is not a roadmap.

## System boundaries

- OpenPud is a local Electron desktop app with no application server or database.
- The renderer captures audio and renders UI; it has no Node access.
- The main process owns settings, external API calls, global shortcuts, notifications, history, and OS integration.
- External dependencies at runtime are the configured transcription/LLM provider and a local PowerShell process for Windows input.

## Runtime topology

```text
Renderer windows
  widget / onboarding / dashboard
            |
            | window.typeless
            v
Preload bridge (contextBridge)
            |
            | validated IPC
            v
Electron main process
  settings | transcription | history | tray | shortcuts
            |
            +--> External AI provider
            |
            +--> Long-lived PowerShell host --> Win32 foreground window / Ctrl+V
```

- All renderer surfaces share `index.html`; `src/app/main.ts` selects the surface from the URL hash.
- The dashboard shell, navigation, Home, History, and Dictionary use React. Settings currently mounts through a small compatibility boundary; onboarding and the widget remain DOM-based.
- The widget is transparent, always on top, mouse-transparent, and non-focusable.
- The dashboard is a single normal window opened from the tray. Reopening it focuses the existing instance and sends a navigation event.
- `electron/preload.ts` is the only renderer-to-main bridge. Keep its API synchronized with `src/types.d.ts`.

## Lifecycle

1. `app.whenReady()` warms the Windows host, creates the widget and tray, registers hotkeys, and applies launch-at-startup.
2. First-run installations open onboarding; otherwise the dashboard stays closed until requested from the tray.
3. Closing windows does not quit the background app.
4. The tray quit action ends the app; shutdown unregisters shortcuts and disposes the Windows host.

## Dictation pipeline

```text
Global hotkey
  -> capture foreground HWND and process
  -> renderer records microphone audio
  -> silence / sub-400 ms guard
  -> IPC payload validation and 50 MB limit
  -> provider transcription
  -> local filler removal
  -> Thai spacing normalization
  -> dictate: optional AI polish -> correction rules
     translate: correction rules -> translation
  -> compare current HWND with captured target
  -> paste, or leave text on clipboard if focus changed
  -> write history and notify dashboard
```

- Escape is registered globally only while the widget reports `recording`.
- If a saved microphone disappears, recording retries with the OS default device.
- A focus change never triggers a blind paste into the new foreground app.
- Paste failure deliberately leaves the transcript on the clipboard and reports the failure.
- History records successful transcription output even when automatic paste is skipped or fails.

## Text injection

- `electron/winHost.ts` owns one hidden PowerShell process with a FIFO line protocol and request timeouts.
- The host resolves the foreground window and sends physical Ctrl+V key codes through Win32.
- This avoids Electron-ABI-sensitive native automation modules and works with Thai Kedmanee layouts.
- `pasteAtCursor()` temporarily replaces the clipboard, pastes, then restores the previous text only if the transcript is still present.
- A crashed or wedged host is dropped and lazily recreated on the next request.

## Provider routing

- OpenAI-compatible providers use `/audio/transcriptions` and `/chat/completions`.
- Gemini AI Studio uses native `generateContent`; audio is sent inline and capped below Gemini's request limit.
- Dictionary words bias transcription. Correction rules are deterministic local replacements.
- Dictation polish and translation share the configured chat-completion layer.
- Custom remote base URLs require HTTPS; plain HTTP is allowed only for loopback services.

## Persistence and secrets

- Settings, history, and dictionary use separate `electron-store` files.
- The API key is encrypted with Electron `safeStorage` when available and decrypted only in the main process.
- Renderer settings redact the key and expose only `hasApiKey`.
- History is capped at 500 entries. History text, dictionary words, correction rules, and non-secret settings remain local JSON data.
- Never log API keys, authorization headers, audio payloads, or full provider error bodies.

## Security boundaries

- Browser windows keep `contextIsolation: true` and `nodeIntegration: false`.
- New windows and external navigation are denied.
- Dashboard routes are allowlisted before crossing IPC.
- IPC inputs are treated as untrusted: settings keys/types, collections, routes, audio shape, and audio size are validated in main.
- IPC handlers also authorize the sender by capability: dashboard-only data APIs reject the widget, transcription rejects the dashboard, and unknown renderer senders are rejected.
- Server-controlled error text is length-limited before reaching logs or native notifications.

## Failure behavior

- Startup failures show a native error and quit instead of leaving a zombie process.
- Transcription/LLM failures return a typed error and show a native notification.
- Missing or changed focus falls back to clipboard delivery.
- Windows-host timeouts reject pending work and force a clean host restart on the next call.
- Near-silent audio is rejected before network use to prevent hallucinated transcripts and wasted API calls.

## Verification boundary

- `npm.cmd test` covers deterministic units; `npm.cmd run build` validates both TypeScript targets and bundles.
- Manual Windows checks remain required for microphone permission, global hotkeys, Escape, multi-monitor placement, focus guarding, clipboard restoration, Ctrl+V, tray lifecycle, and startup registration.
- For packaging and publishing, follow `.agents/skills/openpud-release/SKILL.md`.
