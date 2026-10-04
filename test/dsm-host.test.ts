import { describe, expect, it } from 'vitest';
import { b32, fromB32, own } from '../src/integrations/dsm/host';

describe('the game reads DSM ids as DSM writes them', () => {
  it("reads and writes ERA's policy anchor byte for byte (Base32 Crockford, the SDK's vector)", () => {
    const era = 'NNG176RZ6ACTWCDPRNYHXZK2DCZ72SPA9Q6XWGRGQ9JGKZYTESG0';
    const bytes = fromB32(era);
    expect(bytes.length).toBe(32);
    expect(b32(bytes)).toBe(era);
    expect(b32(fromB32(era.toLowerCase()))).toBe(era);
  });
  it('refuses text that is not Base32 Crockford', () => {
    expect(() => fromB32('NOT-BASE32!')).toThrow('not Base32 Crockford');
  });
  it('copies bytes into a buffer this process owns', () => {
    const view = new Uint8Array(new Uint8Array([9, 8, 7, 6]).buffer, 1, 2);
    const owned = own(view);
    expect([...owned]).toEqual([8, 7]);
    expect(owned.buffer.byteLength).toBe(2);
  });
});
