import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Encryption key is supplied by the current user's DPAPI-protected Windows settings. */
export function encryptedState(path, encodedKey) {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error('Invalid state encryption key.');
  return {
    load() {
      let bytes;
      try { bytes = readFileSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      if (bytes.length < 29 || bytes[0] !== 1) throw new Error('Invalid encrypted state format.');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(1, 13));
      decipher.setAuthTag(bytes.subarray(13, 29));
      return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString('utf8'));
    },
    save(value) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      mkdirSync(dirname(path), { recursive: true });
      const temp = path + '.tmp';
      writeFileSync(temp, Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
      renameSync(temp, path);
    }
  };
}
