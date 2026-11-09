import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isAppNavigationAllowed, isWidgetMediaAllowed } from './windowGuard';

const appPage = pathToFileURL('/Program Files/OpenPood/dist/index.html');

describe('app navigation', () => {
  it('allows only the app file URL in production', () => {
    expect(isAppNavigationAllowed(appPage.href, appPage, undefined)).toBe(true);
    expect(isAppNavigationAllowed(`${appPage.href}#/settings`, appPage, undefined)).toBe(true);
    expect(isAppNavigationAllowed(`${appPage.href}?next=https://evil.test`, appPage, undefined)).toBe(false);
    expect(isAppNavigationAllowed(pathToFileURL('/tmp/other.html').href, appPage, undefined)).toBe(false);
    expect(isAppNavigationAllowed('https://example.com', appPage, undefined)).toBe(false);
    expect(isAppNavigationAllowed('javascript:alert(1)', appPage, undefined)).toBe(false);
    expect(isAppNavigationAllowed('not a url', appPage, undefined)).toBe(false);
  });

  it('allows the dev server origin and rejects other origins', () => {
    const dev = 'http://localhost:5173/';
    expect(isAppNavigationAllowed('http://localhost:5173/src/main.tsx', appPage, dev)).toBe(true);
    expect(isAppNavigationAllowed('http://localhost:5173#/settings', appPage, dev)).toBe(true);
    expect(isAppNavigationAllowed('http://127.0.0.1:5173/', appPage, dev)).toBe(false);
    expect(isAppNavigationAllowed('http://localhost:5174/', appPage, dev)).toBe(false);
    expect(isAppNavigationAllowed('https://example.com', appPage, dev)).toBe(false);
    expect(isAppNavigationAllowed('http://user:pass@localhost:5173/', appPage, dev)).toBe(false);
  });
});

describe('renderer permissions', () => {
  it('allows microphone access only for the widget', () => {
    expect(isWidgetMediaAllowed('media', true)).toBe(true);
    expect(isWidgetMediaAllowed('media', false)).toBe(false);
    expect(isWidgetMediaAllowed('geolocation', true)).toBe(false);
    expect(isWidgetMediaAllowed('display-capture', true)).toBe(false);
    expect(isWidgetMediaAllowed('openExternal', true)).toBe(false);
  });
});
