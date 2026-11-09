// Sandboxed Electron preloads must be CommonJS. `.cjs` stays CommonJS
// even though package.json says `"type": "module"`.
export const PRELOAD_FILENAME = 'preload.cjs';
