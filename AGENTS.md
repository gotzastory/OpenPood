# AGENTS.md

Guidance for Codex when working in this repository.

## Product

**OpenPood** is a Windows voice-dictation app: press a global hotkey, speak, then paste the transcript into the app that originally had focus. Stack: Electron, TypeScript, Vite, Tailwind CSS v4.

## Commands

```powershell
npm.cmd run dev
npm.cmd test
npm.cmd run build
npm.cmd run dist
```

- `build` runs both TypeScript targets before Vite.
- No lint setup. Renderer and Electron use separate `tsconfig.json` files.
- Before restarting dev, stop only OpenPood-related Electron/Vite processes; never kill every `node.exe` process.

## Architecture

- Read `architecture/system-design.md` before changing process boundaries, windows, IPC, recording/transcription/paste flows, providers, persistence, lifecycle, or security controls.
- Keep `electron/preload.ts` and `src/types.d.ts` synchronized whenever the bridge changes.

## Design

- Read `DESIGN.md` before changing UI, styling, icons, copy, or motion.
- Keep dashboard, onboarding, and widget visually distinct as documented there.

## Verification

- Run `npm.cmd test` and `npm.cmd run build` for code changes.
- Electron/OS behavior still needs a manual Windows check: microphone, hotkey, Escape, focus guard, clipboard/paste, tray navigation, and quit.
- For packaging or publishing, follow `.agents/skills/openpud-release/SKILL.md`.
