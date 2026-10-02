export interface TranscriptionModel {
  id: string;
  name: string;
}

export const OPENAI_MODELS: TranscriptionModel[] = [
  { id: "whisper-1", name: "Whisper 1" },
  { id: "gpt-transcribe", name: "GPT Transcribe" },
  { id: "gpt-4o-transcribe", name: "GPT-4o Transcribe" },
  { id: "gpt-4o-mini-transcribe", name: "GPT-4o Mini Transcribe" },
  {
    id: "gpt-4o-mini-transcribe-2025-12-15",
    name: "GPT-4o Mini Transcribe (2025-12-15)",
  },
];

// Google AI Studio / Gemini multimodal models used as STT via generateContent + audio.
// First entry is the app default when switching the Settings provider to Gemini.
export const GEMINI_MODELS: TranscriptionModel[] = [
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash (แนะนำ)" },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
  { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash" },
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
];

// OpenRouter's /models?output_modalities=transcription list.
// Re-checked against the live catalog on 2026-10-02.
// First entry is the app default when switching the Settings provider to OpenRouter.
export const OPENROUTER_MODELS: TranscriptionModel[] = [
  {
    id: "openai/whisper-large-v3-turbo",
    name: "OpenAI — Whisper Large V3 Turbo",
  },
  { id: "openai/whisper-large-v3", name: "OpenAI — Whisper Large V3" },
  { id: "openai/whisper-1", name: "OpenAI — Whisper 1" },
  {
    id: "openai/gpt-4o-mini-transcribe",
    name: "OpenAI — GPT-4o Mini Transcribe",
  },
  { id: "openai/gpt-4o-transcribe", name: "OpenAI — GPT-4o Transcribe" },
  { id: "openai/gpt-transcribe", name: "OpenAI — GPT Transcribe" },
  {
    id: "google/gemini-3.5-transcribe",
    name: "Google — Gemini 3.5 Transcribe (แนะนำ)",
  },
  {
    id: "fish-audio/transcribe-1-pro",
    name: "Fish Audio — Transcribe 1 Pro",
  },
  {
    id: "assemblyai/universal-3-5-pro",
    name: "AssemblyAI — Universal 3.5 Pro",
  },
  {
    id: "meta/muse-voice-transcribe-1.0",
    name: "Meta — Muse Voice Transcribe 1.0",
  },
  { id: "deepgram/nova-3", name: "Deepgram — Nova-3" },
  { id: "google/chirp-3", name: "Google — Chirp 3" },
  {
    id: "mistralai/voxtral-mini-transcribe",
    name: "Mistral — Voxtral Mini Transcribe",
  },
  {
    id: "mistralai/voxtral-small-24b-2507-stt",
    name: "Mistral — Voxtral Small 24B 2507 STT",
  },
  {
    id: "mistralai/voxtral-mini-3b-2507",
    name: "Mistral — Voxtral Mini 3B 2507",
  },
  { id: "nvidia/parakeet-tdt-0.6b-v3", name: "NVIDIA — Parakeet TDT 0.6B v3" },
  {
    id: "nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b",
    name: "NVIDIA — Nemotron 3.5 ASR Streaming Multilingual 0.6B",
  },
  { id: "qwen/qwen3-asr-flash-2026-02-10", name: "Qwen — Qwen3 ASR Flash" },
  { id: "qwen/qwen3-asr-1.7b", name: "Qwen — Qwen3 ASR 1.7B" },
  { id: "qwen/qwen3-asr-0.6b", name: "Qwen — Qwen3 ASR 0.6B" },
  {
    id: "microsoft/mai-transcribe-2",
    name: "Microsoft — MAI-Transcribe 2",
  },
  {
    id: "microsoft/mai-transcribe-1.5",
    name: "Microsoft — MAI-Transcribe 1.5",
  },
  { id: "x-ai/grok-stt-1.0", name: "xAI — Grok STT 1.0" },
  { id: "fish-audio/transcribe-1", name: "Fish Audio — Transcribe 1" },
];
