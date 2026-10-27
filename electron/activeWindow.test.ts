import { describe, expect, it } from 'vitest';
import { categoryForProcess, profileForProcess, sanitizeAppProfiles } from './activeWindow';

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

describe('sanitizeAppProfiles', () => {
  it('normalizes names, trims tone and drops bad or duplicate entries', () => {
    expect(sanitizeAppProfiles([
      { process: ' Outlook.EXE ', polish: true, tone: '  สุภาพ  ' },
      { process: 'outlook', polish: false, tone: '' },
      { process: '', polish: true, tone: '' },
      { process: 'x'.repeat(65), polish: true, tone: '' },
      { process: 'slack', polish: 'yes', tone: '' },
      null,
      { process: 'line', polish: false, tone: 'ก'.repeat(600) },
    ])).toEqual([
      { process: 'outlook', polish: true, tone: 'สุภาพ' },
      { process: 'line', polish: false, tone: 'ก'.repeat(500) },
    ]);
  });

  it('rejects non-arrays and caps the list length', () => {
    expect(sanitizeAppProfiles('outlook')).toEqual([]);
    const many = Array.from({ length: 60 }, (_, i) => ({ process: `app${i}`, polish: true, tone: '' }));
    expect(sanitizeAppProfiles(many)).toHaveLength(50);
  });
});

describe('profileForProcess', () => {
  const profiles = [
    { process: 'outlook', polish: true, tone: 'formal' },
    { process: 'out', polish: false, tone: '' },
  ];

  it('matches by case-insensitive substring and takes the first match', () => {
    expect(profileForProcess(profiles, 'OUTLOOK')?.tone).toBe('formal');
    expect(profileForProcess(profiles, 'outer')?.polish).toBe(false);
  });

  it('returns undefined for no match or an unknown target', () => {
    expect(profileForProcess(profiles, 'slack')).toBeUndefined();
    expect(profileForProcess(profiles, '')).toBeUndefined();
  });
});
