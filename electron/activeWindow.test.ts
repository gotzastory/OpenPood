import { describe, expect, it } from 'vitest';
import { categoryForProcess } from './activeWindow';

describe('categoryForProcess', () => {
  it.each([
    ['outlook', 'email'],
    ['OUTLOOK', 'email'],
    ['slack', 'chat'],
    ['line', 'chat'],
    ['Code', 'code'],
    ['devenv', 'code'],
    ['notepad++', 'code'],
    ['chrome', 'browser'],
    ['msedge', 'browser'],
    ['notepad', 'general'],
    ['', 'general'],
  ])('%j -> %s', (processName, expected) => {
    expect(categoryForProcess(processName)).toBe(expected);
  });
});
