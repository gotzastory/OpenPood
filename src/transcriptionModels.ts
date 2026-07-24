export interface TranscriptionModel {
  id: string;
  name: string;
}

export const OPENAI_MODELS: TranscriptionModel[] = [
  { id: "whisper-1", name: "Whisper 1" },
];

// OpenRouter's /api/v1/models?output_modalities=transcription list, as of the last check.
// First entry is the app default when switching the Settings provider to OpenRouter.
export const OPENROUTER_MODELS: TranscriptionModel[] = [
  {
    id: "openai/whisper-large-v3-turbo",
    name: "OpenAI — Whisper Large V3 Turbo (แนะนำ)",
  },
  { id: "openai/whisper-large-v3", name: "OpenAI — Whisper Large V3" },
  { id: "openai/whisper-1", name: "OpenAI — Whisper 1" },
  {
    id: "openai/gpt-4o-mini-transcribe",
    name: "OpenAI — GPT-4o Mini Transcribe",
  },
  { id: "openai/gpt-4o-transcribe", name: "OpenAI — GPT-4o Transcribe" },
  { id: "deepgram/nova-3", name: "Deepgram — Nova-3" },
  { id: "google/chirp-3", name: "Google — Chirp 3" },
  {
    id: "mistralai/voxtral-mini-transcribe",
    name: "Mistral — Voxtral Mini Transcribe",
  },
  { id: "nvidia/parakeet-tdt-0.6b-v3", name: "NVIDIA — Parakeet TDT 0.6B v3" },
  { id: "qwen/qwen3-asr-flash-2026-02-10", name: "Qwen — Qwen3 ASR Flash" },
  {
    id: "microsoft/mai-transcribe-1.5",
    name: "Microsoft — MAI-Transcribe 1.5",
  },
  { id: "x-ai/grok-stt-1.0", name: "xAI — Grok STT 1.0" },
];
