---
name: openpud-release
description: Validate, package, or publish an OpenPud Windows release. Use for release preparation, NSIS packaging, version tags, GitHub Actions release checks, or diagnosing OpenPud packaging failures. Do not invoke for ordinary feature development.
---

# OpenPud Release

Keep release work scoped to the user's request. Packaging does not authorize version changes, commits, tags, pushes, or GitHub releases.

## Preflight

1. Read `package.json` and `.github/workflows/release.yml`; do not assume versions or workflow behavior.
2. Check the worktree and report unrelated changes without modifying them.
3. Run:

```powershell
npm.cmd test
npm.cmd run build
```

Stop on failure and fix only when the user requested implementation.

## Windows manual gate

Before calling a release production-ready, ask the user to verify on a real Windows desktop:

- global hotkey starts and stops recording;
- microphone input transcribes and pastes into the original focused app;
- changing focus before completion leaves the transcript on the clipboard instead of pasting into the wrong app;
- Escape cancels only while recording;
- silent and sub-400 ms recordings skip the API;
- tray navigation and quit work.

Automated tests and CI do not replace this OS-level check.

## Package

Run `npm.cmd run dist`. The script must retain `--publish never`; publishing is handled explicitly by the GitHub workflow.

Verify `release/` contains the expected installer outputs. Do not delete or overwrite existing release artifacts unless the user requested it.

If electron-builder reports `EPERM` while renaming `win-unpacked.tmp`, identify only OpenPud/Electron/Vite processes using the directory, stop those processes with user authorization when needed, then retry once. Do not kill every `node.exe` process.

## Publish

Only when explicitly requested:

1. Confirm the intended semantic version and that `package.json` matches it.
2. Re-run tests and build after the version change.
3. Create and push the requested commit/tag without rewriting history.
4. Monitor the tag-triggered workflow.
5. Verify the GitHub Release contains the installer, blockmap, and `latest.yml`.

Report local checks, manual checks, CI checks, and published artifacts separately. Never claim an unperformed check passed.
