import { describe, expect, it } from 'vitest';
import { stripFillers } from './stripFillers';

// Input strings use raw Whisper-style spacing (spaces between Thai words) —
// stripFillers runs BEFORE normalizeThaiSpacing in the pipeline and relies on
// those spaces to bound filler tokens.

describe('stripFillers — real words must survive', () => {
  it.each([
    ['อ่าน หนังสือ ทุกวัน', 'อ่าน หนังสือ ทุกวัน'],
    ['ล้าง อ่าง น้ำ', 'ล้าง อ่าง น้ำ'],
    ['ไปเที่ยว อ่าว นาง', 'ไปเที่ยว อ่าว นาง'],
    ['รส อูมามิ', 'รส อูมามิ'],
    // Plain เออ is an agreement word ("yeah"), not hesitation — keep it.
    ['เออ ใช่เลย', 'เออ ใช่เลย'],
    ['summer camp ahead', 'summer camp ahead'],
    ['the error is in line five', 'the error is in line five'],
    ['uh-huh okay', 'uh-huh okay'],
  ])('keeps %j intact', (input, expected) => {
    expect(stripFillers(input)).toBe(expected);
  });
});

describe('stripFillers — fillers are removed', () => {
  it.each([
    ['เอ่อ วันนี้ ประชุม กี่โมง', 'วันนี้ ประชุม กี่โมง'],
    ['อืมม คิดว่า โอเค', 'คิดว่า โอเค'],
    ['อืมมม อ่า ตกลง', 'ตกลง'],
    ['เอ่ออ ลอง ดู', 'ลอง ดู'],
    ['อูมม ขอ คิด ก่อน', 'ขอ คิด ก่อน'],
    ['um let me think', 'let me think'],
    ['so uh we should uhm go', 'so we should go'],
    ['hmm sounds good', 'sounds good'],
    // Elongations and mid-sentence position.
    ['จะไป อ่าาา พรุ่งนี้', 'จะไป พรุ่งนี้'],
  ])('strips fillers from %j', (input, expected) => {
    expect(stripFillers(input)).toBe(expected);
  });
});

describe('stripFillers — edge cases', () => {
  it('handles empty and whitespace-only input', () => {
    expect(stripFillers('')).toBe('');
    expect(stripFillers('   ')).toBe('   ');
  });

  it('cleans up doubled commas left by a removed filler', () => {
    expect(stripFillers('okay, um, let us start')).toBe('okay, let us start');
  });

  it('leaves a filler glued to the next word alone (better miss than eat)', () => {
    // No space boundary — cannot safely tell filler from word prefix.
    expect(stripFillers('อ่าวันนี้')).toBe('อ่าวันนี้');
  });
});
