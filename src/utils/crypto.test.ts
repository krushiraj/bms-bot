import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto.js';

describe('crypto', () => {
  it('should encrypt and decrypt a string', () => {
    const original = 'GIFT-CARD-1234-5678';
    const encrypted = encrypt(original);

    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':'); // IV:AuthTag:Ciphertext format

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should produce different ciphertexts for same input', () => {
    const original = 'same-input';
    const encrypted1 = encrypt(original);
    const encrypted2 = encrypt(original);

    expect(encrypted1).not.toBe(encrypted2); // Different IVs
  });

  it('should fail to decrypt tampered data', () => {
    const encrypted = encrypt('test');
    const tampered = encrypted.slice(0, -4) + 'xxxx';

    expect(() => decrypt(tampered)).toThrow();
  });
});
