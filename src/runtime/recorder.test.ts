import { describe, expect, it } from 'vitest';
import { isSilentRecording } from './recorder';

describe('isSilentRecording', () => {
  it('skips accidental double-taps regardless of level', () => {
    expect(isSilentRecording(0.5, 100)).toBe(true);
    expect(isSilentRecording(0.5, 399)).toBe(true);
  });

  it('skips clips with no speech', () => {
    expect(isSilentRecording(0, 5000)).toBe(true);
    expect(isSilentRecording(0.005, 5000)).toBe(true);
  });

  it('keeps real speech', () => {
    expect(isSilentRecording(0.05, 400)).toBe(false);
    expect(isSilentRecording(0.3, 60000)).toBe(false);
  });
});
