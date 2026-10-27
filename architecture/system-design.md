# OpenPood System Design

This document describes the current Windows implementation. It is not a roadmap.

See [the current architecture diagram and source map](current-architecture.md) for a visual overview.

## System boundaries

- OpenPood is a local Electron desktop app with no application server or database.
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
- The dashboard shell, navigation, Home, History, Dictionary, Settings, and onboarding use React. The recording widget remains DOM-based; microphone capture is handled by `src/runtime/recorder.ts`.
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
  -> write history asynchronously and notify dashboard
  -> native HWND and clipboard-sequence check immediately before Ctrl+V
  -> paste, clipboard fallback, or preserve unsupported clipboard formats
```

- Escape is registered globally during microphone setup, recording, and processing. Processing cancellation aborts provider work and prevents late delivery; already-injected keystrokes cannot be retracted.
- Hotkey starts are serialized before microphone acquisition. The foreground target is captured once on the start press; a stop press never changes it. Slow or failed foreground capture becomes an unknown target.
- Recorder permission/stop operations have deadlines, late permission grants are released after cancellation, and errors/device disconnection stop tracks and close the audio context.
- If a saved microphone disappears, recording retries with the OS default device.
- Missing/unknown HWNDs never trigger automatic paste. The native host verifies the captured HWND and transcript clipboard sequence immediately before input injection; changed foreground falls back to clipboard delivery.
- Paste failure deliberately leaves the transcript on the clipboard and reports the failure.
- History records successful transcription output even when automatic paste is skipped or fails.
- Empty, malformed, or oversized provider output is rejected before history/paste. Empty output after local filtering is also rejected.

## Text injection

- `electron/winHost.ts` owns one hidden PowerShell process with a FIFO line protocol and request timeouts.
- The host resolves the foreground window and sends physical Ctrl+V key codes through Win32 `SendInput`, checking the submitted input count. This acknowledges injection, not that the destination app consumed the text.
- This avoids Electron-ABI-sensitive native automation modules and works with Thai Kedmanee layouts.
- `pasteAtCursor()` snapshots text/HTML/RTF/image data, temporarily replaces the clipboard, then restores the snapshot after a configurable grace period only if its clipboard sequence and text still match. A later user copy is preserved. There is no universal paste-consumption acknowledgement; slow/elevated apps still need Windows testing.
- File drops, unsupported/custom formats, oversized snapshots, and unavailable clipboard-state lookup preserve the original clipboard and direct the user to copy the transcript from History.
- A crashed or wedged host is dropped and lazily recreated on the next request.
- Widget renderer crashes/load failures abort outstanding transcription, release busy/Escape state, and recreate the widget with a fresh sender identity. Recovery is limited to three attempts per 60-second failure window.

## Provider routing

- OpenAI-compatible providers use `/audio/transcriptions` and `/chat/completions`.
- Gemini AI Studio uses native `generateContent`; audio is sent inline and capped below Gemini's request limit.
- ElevenLabs uses native `/speech-to-text` multipart uploads with `xi-api-key`, Scribe v2 (default) or v1, and a language hint. Audio events, diarization, and timestamps are disabled; dictionary keyterms are not sent. Local filler removal and correction rules still apply.
- ElevenLabs is STT-only in this app's single-provider configuration. Dictation skips AI polish; Translate fails before uploading audio with a message to select another provider. Settings disables its chat controls.
- With OpenRouter, the dashboard sidebar shows a credit-usage dropdown via dashboard-only `usage:get` (returns null for other providers): main calls `/key` (required) and `/credits` (optional balance; may need a management key) with the saved key.
- Dictionary words bias transcription. Correction rules are deterministic local replacements.
- Dictation polish and translation share the configured chat-completion layer.
- Custom remote base URLs require HTTPS; plain HTTP is allowed only for loopback services.
- All providers reject redirects and share safe HTTP/network error mapping without response bodies. STT requests have a 120-second deadline and chat requests a 45-second deadline, including response-body consumption. Optional polish failure falls back to the raw transcript; cancellation does not.

## Persistence and secrets

- Settings and dictionary use separate `electron-store` files. History retains the migrated `history.json` format, initializes through `electron-store`, then uses a memory cache and serialized asynchronous atomic file replacement.
- Stores use `%APPDATA%/OpenPood`. Before any store initializes, `storage.ts` copies the known legacy OpenPud JSON stores byte-for-byte, validating JSON first, retaining the source, and never overwriting existing destination stores. A completion marker prevents later remigration. Migration failure blocks startup with a generic native error; no secret data is logged.
- The NSIS GUID remains the original upgrade identity while the application ID, product name, and executable name become OpenPood. Installer upgrade behavior still requires a packaged Windows check.
- A single-instance lock is acquired before migration/store creation. A repeated launch opens the existing dashboard. Packaged startup registration removes the former OpenPud entry before applying the saved setting.
- The API key is encrypted with Electron `safeStorage` and decrypted only in main. Key saves fail when encryption is unavailable; ciphertext is never treated as plaintext. Legacy plaintext-key migration runs only after encryption is ready and removes the old field.
- Renderer settings redact the key and expose only `hasApiKey`.
- History is capped at 500 entries and 4 MB of serialized data, evicting oldest entries without truncating retained transcripts. History UI renders 30 entries per page. A failed history write retains the new transcript temporarily in memory and warns the user; a later successful write retries persistence. Quit waits for pending history writes.
- Settings are cached in main; a save validates/encrypts the complete patch before one atomic store write. Failed hotkey registration restores the previous hotkeys and reports the conflict.
- History text, dictionary words, correction rules, and non-secret settings remain local JSON data.
- Never log API keys, authorization headers, audio payloads, or full provider error bodies.

## Security boundaries

- Browser windows keep `contextIsolation: true` and `nodeIntegration: false`.
- New windows and external navigation are denied.
- Dashboard routes are allowlisted before crossing IPC.
- IPC inputs are treated as untrusted: settings keys/types, collections, routes, audio shape, and audio size are validated in main.
- IPC handlers also authorize the sender by capability: dashboard-only data APIs reject the widget, transcription rejects the dashboard, and unknown renderer senders are rejected.
- Provider errors use application-controlled messages; response bodies and transport details never reach logs or native notifications. Provider JSON/text sizes are bounded.

## Desktop updates

- `electron/updater.ts` owns `electron-updater` in main. Installed Windows builds check the public GitHub Releases feed configured by `build.publish` after startup and every six hours; development builds disable updates.
- Updates never download or install without an explicit dashboard action. Closing the dashboard or quitting via tray does not install a downloaded update.
- Settings displays current/new versions, plain-text release notes, download progress, retry, and Restart & Update. A native notification opens Settings when a new version is found.
- Update IPC is dashboard-only. Main rejects installation while a hotkey start is pending, the widget is recording/processing, or transcription/paste is active. Hotkeys are suspended during installation and restored if installation fails.
- Stable updates exclude prereleases and downgrades. Downloads use the updater's checksum validation; publisher signature verification additionally requires signed Windows builds. The current release pipeline has no signing certificate configured.
- CI builds the installer, blockmap and `latest.yml`, validates the version, uploads them to a draft release, then publishes it. Local packaging retains `--publish never`.
- OpenPud and OpenPood versions without this updater require one manual installation of v1.0.1 or newer before future in-app updates are available.

## Failure behavior

- Startup failures show a native error and quit instead of leaving a zombie process.
- Transcription/LLM failures return a typed error and show a native notification.
- Changed or unknown foreground HWNDs cannot inject paste. Unsupported clipboard formats preserve the original clipboard and leave transcript recovery to History.
- Windows-host timeouts reject pending work and force a clean host restart on the next call.
- Near-silent audio is rejected before network use to prevent hallucinated transcripts and wasted API calls.

## Diagnostics

- Timing/limit policy lives in `src/lib/runtimeConfig.ts`.
- `OPENPOOD_DIAGNOSTICS=1` enables aggregate CPU/working-set sampling and microphone/STT/polish/translation/history/paste timing. Diagnostics are disabled by default and contain no keys, audio, transcript, clipboard content, URLs, or app/window titles.
- See [Windows reliability checks](reliability-testing.md) for manual verification and the remaining OS boundaries.

## Verification boundary

- `npm.cmd test` covers deterministic units; `npm.cmd run build` validates both TypeScript targets and bundles.
- Manual Windows checks remain required for microphone permission, global hotkeys, Escape, multi-monitor placement, focus guarding, clipboard restoration, Ctrl+V, tray lifecycle, and startup registration.
- For packaging and publishing, follow `.agents/skills/openpud-release/SKILL.md`.
