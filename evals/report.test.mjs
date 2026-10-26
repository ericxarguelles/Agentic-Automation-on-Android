import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuns, summarize } from './report.mjs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const row = { run_id: 'synthetic-1', task_id: 'synthetic-task', config_id: 'test-only', track: 'unit-fixture', trial: 1, seed: 1,
  model: 'fake-model', revision: 'fixture', status: 'passed', wall_ms: 1000, actions: 2, evidence_ref: 'unit-test-only' };
test('Reporter retains blocked/failing outcomes and does not invent missing cost', () => {
  const runs = parseRuns([row, {...row, run_id: 'synthetic-2', status: 'blocked', wall_ms: 3000}, {...row, run_id: 'synthetic-3', status: 'failed', wall_ms: 2000}].map(value => JSON.stringify(value)).join('\n'));
  const result = summarize(runs)[0];
  assert.equal(result.episodes, 3); assert.equal(result.passed, 1); assert.equal(result.blocked, 1);
  assert.equal(result.median_seconds_all, 2); assert.equal(result.median_seconds_passed, 1);
  assert.equal(result.mean_cost_usd_known, null); assert.equal(result.cost_known_episodes, 0);
});
test('Reporter rejects empty data, duplicated runs, invalid numbers and mixed configurations', () => {
  assert.throws(() => parseRuns(''), /No evaluation/);
  assert.throws(() => parseRuns(JSON.stringify(row) + '\n' + JSON.stringify(row)), /Duplicate/);
  assert.throws(() => parseRuns(JSON.stringify({...row, wall_ms: -1})), /Invalid/);
  assert.throws(() => parseRuns(JSON.stringify(row) + '\n' + JSON.stringify({...row, run_id: 'other', model: 'different'})), /mixes/);
});
test('Reporter CLI writes descriptive CSV and Markdown with explicit missing-cost coverage', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'android-agent-report-'));
  try {
    const source = join(folder, 'synthetic.jsonl'), output = join(folder, 'report');
    await writeFile(source, JSON.stringify(row));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./report.mjs', import.meta.url)), source, output], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(join(output, 'summary.csv'), 'utf8'), /cost_known_episodes/);
    const markdown = await readFile(join(output, 'results.md'), 'utf8');
    assert.match(markdown, /Unavailable/); assert.match(markdown, /planned-but-missing/);
  } finally {
    const target = resolve(folder);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('android-agent-report-'));
    await rm(target, { recursive: true, force: true });
  }
});
