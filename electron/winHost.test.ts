import { describe, expect, it } from 'vitest';
import { HOST_SCRIPT } from './winHost';

function pasteBranch(script: string): string {
  const start = script.indexOf("'paste'");
  const end = script.indexOf("'clipboard'");
  return script.slice(start, end);
}

describe('PowerShell host paste replies', () => {
  it('replies to a declined paste and stays in the host loop so the reply is flushed', () => {
    const paste = pasteBranch(HOST_SCRIPT);
    expect(paste).toContain('clipboard-changed');
    expect(paste).toContain('focus-changed');
    expect(paste).not.toMatch(/\b(break|continue|exit|return)\b/);
    const declinedAt = HOST_SCRIPT.indexOf('clipboard-changed');
    const flushAt = HOST_SCRIPT.lastIndexOf('$out.Flush()');
    expect(declinedAt).toBeGreaterThan(-1);
    expect(flushAt).toBeGreaterThan(declinedAt);
    expect(HOST_SCRIPT.match(/\bbreak\b/g)).toEqual(['break']);
    expect(HOST_SCRIPT).toContain('if ($null -eq $line) { break }');
  });
});
