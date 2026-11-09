import { describe, expect, it } from 'vitest';

describe('QA gate', () => {
  it('fails on purpose so branch protection can be checked', () => {
    expect(1).toBe(2);
  });
});
