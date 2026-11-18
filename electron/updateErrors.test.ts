import { describe, expect, it } from 'vitest';
import { classifyUpdateFailure } from './updateErrors';

describe('update failure classification', () => {
  it('treats 404 / missing latest-*.yml as no-feed for this platform', () => {
    expect(classifyUpdateFailure(new Error('HttpError: 404 Not Found'))).toBe('no-feed');
    expect(classifyUpdateFailure(new Error('Cannot find latest-linux.yml in the latest release'))).toBe('no-feed');
    expect(classifyUpdateFailure('Error: status code 404 while downloading latest.yml')).toBe('no-feed');
    expect(classifyUpdateFailure(new Error('No published versions on GitHub'))).toBe('no-feed');
  });

  it('keeps real connectivity failures as network', () => {
    expect(classifyUpdateFailure(new Error('getaddrinfo ENOTFOUND github.com'))).toBe('network');
    expect(classifyUpdateFailure(new Error('net::ERR_CONNECTION_RESET'))).toBe('network');
    expect(classifyUpdateFailure(new Error('socket hang up'))).toBe('network');
  });
});
