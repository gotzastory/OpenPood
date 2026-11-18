---
name: sync-openrouter-stt-models
description: Sync OpenRouter speech-to-text models into OpenPood's static catalog. Use when checking OpenRouter transcription models, adding new STT models, updating OPENROUTER_MODELS, or when the user links openrouter.ai/models with output_modalities=transcription.
---

# Sync OpenRouter STT Models

เวลาทุกครั้งเช็ค model ใหม่จาก openrouter ให้เข้าลิ้งค์ https://openrouter.ai/models?output_modalities=transcription และตรวจสอบโมเดลที่ยังไม่มีมี และให้เพิ่มเข้ามาเลย

## Source of truth

1. Live catalog page: https://openrouter.ai/models?output_modalities=transcription
2. Prefer the JSON API for IDs: `https://openrouter.ai/api/v1/models?output_modalities=transcription`
3. App catalog: `src/lib/transcriptionModels.ts` → `OPENROUTER_MODELS`

## Workflow

1. Fetch the API list (`data[].id`, `data[].name`).
2. Diff against every `id` in `OPENROUTER_MODELS`.
3. For each API model missing from the file: append `{ id, name }` using the naming pattern already in the file (`Vendor — Model`), derived from OpenRouter's `name` (replace `: ` with ` — `).
4. Place new entries next to the same vendor when possible; otherwise append before the trailing Fish Audio / older entries.
5. Update the re-check date comment above `OPENROUTER_MODELS` to today.
6. Do **not** remove or rename existing entries unless the user explicitly asks.
7. Do **not** change defaults in `electron/config.ts`, onboarding, or Settings unless asked.
8. Report what was added (id + display name). If nothing is missing, say so and stop.

## Constraints

- Static list only — no runtime OpenRouter fetch in the app.
- One-file change is enough (`transcriptionModels.ts`).
- Skip new provider plumbing, tests, or docs unless a new model needs a different API shape (it should not — OpenRouter STT uses the same path).
