import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encryptedState } from '../src/security/encrypted-state.mjs';

test('OAuth state is encrypted, survives reopening, and rejects tampering or the wrong key', t => {
  const dir = mkdtempSync(join(tmpdir(), 'phone-state-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.bin'), key = randomBytes(32).toString('base64');
  const store = encryptedState(path, key);
  assert.equal(store.load(), null);
  const value = { version: 1, credential: 'sensitive-test-value' };
  store.save(value);
  const first = readFileSync(path);
  assert.ok(!first.toString('utf8').includes(value.credential));
  assert.deepEqual(encryptedState(path, key).load(), value);
  store.save(value);
  assert.notDeepEqual(readFileSync(path), first);
  assert.throws(() => encryptedState(path, randomBytes(32).toString('base64')).load());
  const corrupt = readFileSync(path); corrupt[corrupt.length - 1] ^= 1; writeFileSync(path, corrupt);
  assert.throws(() => store.load());
});
