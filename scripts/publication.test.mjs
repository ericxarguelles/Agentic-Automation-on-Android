import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const script = fileURLToPath(new URL('./prepare-publication.mjs', import.meta.url));
test('Publication scan blocks an exact synthetic private marker without printing its value', () => {
  const marker = 'Ask your assistant to use your Android phone.';
  const destination = fileURLToPath(new URL(`../outputs/publication-test-${randomUUID()}`, import.meta.url));
  const result = spawnSync(process.execPath, [script, destination], {
    encoding: 'utf8', env: {...process.env, APC_PUBLICATION_AUDIT_VALUES: JSON.stringify([marker])}
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /private-value-match/);
  assert.ok(!result.stderr.includes(marker) && !result.stdout.includes(marker));
  assert.equal(existsSync(destination), false);
});
test('Publication export refuses a destination outside its designated outputs directory', () => {
  const destination = fileURLToPath(new URL('../server/not-a-publication-destination', import.meta.url));
  const result = spawnSync(process.execPath, [script, destination], {
    encoding: 'utf8', env: {...process.env, APC_PUBLICATION_AUDIT_VALUES: '[]'}
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /inside this workspace outputs/);
  assert.equal(existsSync(destination), false);
});
