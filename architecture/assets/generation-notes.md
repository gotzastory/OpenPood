# Architecture image generation

- Tool: built-in `image_gen` (imagegen skill), not CLI.
- Output: `openpood-current-architecture.png`.
- Source: repository implementation checked on 2026-10-05; editable topology and source map are in `../current-architecture.md`.
- Final prompt specification: a landscape OpenPood current-architecture infographic using White, Light Blue `#EEF4FF`, Blue `#0055FF`, Ink `#0B1218` and Slate `#64748B`. Arrange Renderer (React dashboard/onboarding and DOM recording widget with MicRecorder), Preload (`window.typeless`, contextBridge/IPC), Electron Main (validation, sender authorization, dictation pipeline, lifecycle/hotkeys/tray/updater), and external endpoints (AI APIs, local JSON stores, hidden PowerShell/Win32 host, target Windows app, GitHub Releases). All external access goes through Main. Include the actual Dictate/Translate processing order, conditional safeStorage encryption, known-focus-change/paste-failure clipboard fallback, and renderer security flags. No backend or server database.
- Final targeted edit prompt: replace `End-to-end flow (in main process)` with `End-to-end flow (across processes)`, preserving the rest of the generated diagram.

## Technology icon edition

- Tool: built-in `image_gen`, editing the original diagram.
- Output: `openpood-current-architecture-icons.png`; original image retained.
- Edit prompt: add recognizable Electron, TypeScript, React, Vite, Node.js, GitHub, OpenAI, Gemini, ElevenLabs, PowerShell and Windows icons next to their relevant labels. Add generic JSON-document, lock and bridge icons for local storage, safeStorage and preload. Preserve all text, process boundaries, arrows and brand colors; adjust spacing only to avoid overlap. No invented technologies or database.
