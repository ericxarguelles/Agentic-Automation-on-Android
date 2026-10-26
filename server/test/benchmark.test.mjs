import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BenchmarkRecorder, unionMs, callGapReport } from '../src/benchmark.mjs';
import { generateBenchmarkReport } from '../src/benchmark-report.mjs';

const success = data => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true, data }) }], structuredContent: { ok: true, data } });
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'android-benchmark-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let now = 0;
  const recorder = new BenchmarkRecorder({ directory, clock: () => now });
  const begin = overrides => recorder.begin({ experiment: 'test-only', task_label: 'Synthetic test fixture', iteration: 0, ...overrides });
  return { directory, recorder, begin, at: time => { now = time; } };
}

test('workflow cleanup closes measurement and preserves internal errors', async t => {
  const { recorder: r, begin, at } = fixture(t); begin();
  await r.trackTool('phone_send_message', async () => {
    await r.phase('tool_execution', 'launch', async () => { at(10); });
    at(20);
    return success({ status: 'stopped', session_stopped: true, error: { code: 'DRAFT_MISMATCH' } });
  });
  at(1000);
  const run = r.view();
  assert.equal(run.measurement_open, false);
  assert.ok(run.stopped_at);
  assert.equal(run.summary.duration_ms, 20);
  assert.equal(run.calls[0].ok, false);
  assert.equal(run.calls[0].error_code, 'DRAFT_MISMATCH');
});

test('timing buckets partition elapsed wall time; gaps never become claimed inference', async t => {
  const { recorder: r, begin, at } = fixture(t); begin();
  await r.trackTool('phone_launch_app', async () => {
    await r.phase('tool_execution', 'launch', async () => { at(15); });
    at(20); return success({});
  });
  at(50);
  await r.trackTool('phone_read_screen', async () => {
    await r.phase('accessibility_observation', 'read', async () => { at(60); });
    return success({});
  });
  at(80); await r.trackTool('phone_stop_session', async () => success({}));
  at(1000); // Time spent reviewing is outside the stopped task boundary.
  const run = r.finish({ outcome: 'success', verified: true, waste_reviewed: true });
  assert.equal(run.label, 'clean_success');
  assert.equal(run.summary.duration_ms, 80);
  assert.equal(run.summary.steps, 1);
  assert.equal(run.summary.screen_reads, 1);
  assert.equal(run.summary.timing.tool_execution.ms, 15);
  assert.equal(run.summary.timing.accessibility_observation.ms, 10);
  assert.equal(run.summary.timing.measured_server_overhead.ms, 5);
  assert.equal(run.summary.timing.unobserved_assistant_network_user_wait.ms, 50);
  assert.equal(run.summary.ai_inference_ms, null);
  assert.equal(run.summary.token_usage, null);
  assert.deepEqual(run.summary.call_gaps.per_call.map(c => c.gap_before_ms), [0, 30, 20]);
  assert.deepEqual(run.summary.call_gaps.per_call.map(c => c.duration_ms), [20, 10, 0]);
  assert.equal(run.summary.call_gaps.per_call[1].preceding_call_id, run.calls[0].id);
  assert.equal(run.summary.call_gaps.trailing_gap_ms, 0);
  assert.equal(run.summary.call_gaps.per_call.reduce((sum, c) => sum + c.gap_before_ms, 0), run.summary.timing.unobserved_assistant_network_user_wait.ms);
  assert.equal(Object.hasOwn(run.summary.timing, 'screenshots'), false);
  assert.equal(Object.values(run.summary.timing).reduce((n, x) => n + x.ms, 0), 80);
});

test('failed observation in a combined action preserves action count and excludes clean success', async t => {
  const { recorder: r, begin, at } = fixture(t); begin({ iteration: 1, root_cause: 'Test cause', change: 'Test change' });
  await r.trackTool('phone_action_and_observe', async () => {
    await r.phase('tool_execution', 'tap', async () => { at(10); });
    try { await r.phase('accessibility_observation', 'read', async () => { at(25); throw Object.assign(new Error('private text'), { code: 'TEST_READ_ERROR' }); }); } catch {}
    return success({ observation_error: { code: 'TEST_READ_ERROR' } });
  });
  at(30); await r.trackTool('phone_stop_session', async () => success({}));
  const run = r.finish({ outcome: 'success', verified: true, waste_reviewed: true });
  assert.equal(run.summary.steps, 1);
  assert.equal(run.summary.failed_tool_calls, 1);
  assert.equal(run.label, 'fix_iteration');
  assert.equal(JSON.stringify(run.events).includes('private text'), false);
});

test('wasted calls require explicit review, are deduplicated and remain a subset of elapsed', async t => {
  const { recorder: r, begin, at } = fixture(t); begin();
  await r.trackTool('phone_tap', async () => {
    try { await r.phase('tool_execution', 'tap', async () => { at(10); throw new Error('failed'); }); } catch {}
    return { structuredContent: { ok: false, error: { code: 'TEST' } } };
  });
  const id = r.view().calls[0].id;
  assert.throws(() => r.annotate({ call_ids: ['missing'], reason: 'test' }));
  r.annotate({ call_ids: [id], reason: 'Observed unsuccessful test action' });
  r.annotate({ call_ids: [id], reason: 'Duplicate review' });
  at(15); await r.trackTool('phone_stop_session', async () => success({}));
  const run = r.finish({ outcome: 'failed', waste_reviewed: true });
  assert.equal(run.summary.annotated_wasted_ms, 10);
  assert.equal(run.label, 'failed');
  assert.equal(run.summary.failed_action_attempts, 1);
  assert.equal(unionMs([[0, 10], [5, 20], [25, 30]]), 25);
});

test('no invented results, fixes, unverified successes or overlapping runs', t => {
  const { recorder: r, begin } = fixture(t);
  assert.throws(() => begin({ iteration: 1 }));
  begin();
  assert.throws(() => begin());
  assert.throws(() => r.finish({ outcome: 'success' }));
  assert.throws(() => r.finish({ outcome: 'success', verified: true }));
});

test('reports remain empty before real runs and omit unfinished records from charts', t => {
  const { recorder: r, begin, directory } = fixture(t);
  begin({ experiment: '<script>unsafe</script>' });
  const result = generateBenchmarkReport({ directory, experiment: '<script>unsafe</script>', outputDirectory: join(directory, 'report') });
  assert.equal(result.finalized_runs, 0);
  assert.equal(result.unfinished_runs, 1);
  const html = readFileSync(result.report_path, 'utf8');
  assert.match(html, /No finalized runs yet/);
  assert.equal(html.includes('<script>unsafe</script>'), false);
  assert.match(html, /&lt;script&gt;unsafe/);
  const data = JSON.parse(readFileSync(join(directory, 'report', 'runs.json')));
  assert.deepEqual(data.finalized_runs, []);
  assert.equal(readdirSync(directory).filter(x => x.endsWith('.json')).length, 1);
  assert.equal(r.view().outcome, 'pending');
});

test('finalized report preserves trials, actual fixes and failed outcomes', async t => {
  const { recorder: r, begin, directory, at } = fixture(t);
  begin({ iteration: 2, trial: 3, root_cause: 'Observed problem', change: 'Implemented correction' });
  await r.trackTool('phone_read_screen', async () => {
    await r.phase('accessibility_observation', 'read', async () => { at(20); });
    return success({});
  });
  at(30); await r.trackTool('phone_stop_session', async () => success({}));
  r.finish({ outcome: 'failed', waste_reviewed: true, notes: 'Synthetic failure for testing' });
  const result = generateBenchmarkReport({ directory, experiment: 'test-only', outputDirectory: join(directory, 'report') });
  const html = readFileSync(result.report_path, 'utf8');
  assert.equal(result.finalized_runs, 1);
  assert.match(html, /Observed problem/);
  assert.match(html, /Implemented correction/);
  assert.match(html, /failed \/ failed/);
  assert.match(readFileSync(join(directory, 'report', 'runs.csv'), 'utf8'), /"2","3","failed"/);
  assert.match(html, /Per-call gaps/);
  assert.match(html, /phone_read_screen/);
  const gaps = readFileSync(result.call_gaps_csv, 'utf8');
  assert.match(gaps, /gap_before_ms/);
  assert.match(gaps, /"phone_stop_session".*,"10","0"/);
  const json = JSON.parse(readFileSync(join(directory, 'report', 'runs.json'), 'utf8'));
  assert.equal(json.finalized_runs[0].summary.call_gaps.per_call[1].gap_before_ms, 10);
});

test('telemetry persistence failure does not turn an acknowledged action into a retry', async t => {
  const { recorder: r, begin, at } = fixture(t); begin();
  r.persist = () => { throw new Error('disk unavailable'); };
  const value = await r.trackTool('phone_tap', async () => {
    await r.phase('tool_execution', 'tap', async () => { at(10); });
    return success({ accepted: true });
  });
  assert.equal(value.structuredContent.ok, true);
  assert.equal(value.structuredContent.data.accepted, true);
  assert.match(value.structuredContent.data.benchmark_warning, /Do not repeat/);
  assert.match(value.content[0].text, /Do not repeat/);
  assert.doesNotMatch(value.content[0].text, /"accepted"/);
});

test('gap reporting handles overlap, original call order, idle tails and empty runs', () => {
  const calls = [
    { id: 'later', name: 'stop', start_ms: 50, end_ms: 60 },
    { id: 'outer', name: 'read', start_ms: 2, end_ms: 30 },
    { id: 'inner', name: 'read', start_ms: 5, end_ms: 10 }
  ];
  const report = callGapReport(calls, 65);
  assert.deepEqual(report.per_call.map(c => c.gap_before_ms), [2, 0, 20]);
  assert.equal(report.per_call[2].preceding_call_id, 'outer');
  assert.equal(report.trailing_gap_ms, 5);
  assert.equal(report.per_call.reduce((n, c) => n + c.gap_before_ms, report.trailing_gap_ms), 65 - unionMs(calls.map(c => [c.start_ms, c.end_ms])));
  assert.equal(calls[0].id, 'later');
  assert.deepEqual(callGapReport([], 0), { per_call: [], trailing_gap_ms: 0 });
});

test('an armed but unperformed run can be cancelled without becoming a result', t => {
  const { recorder: r, begin, directory } = fixture(t);
  begin();
  r.finish({ outcome: 'cancelled', notes: 'Never started' });
  const report = generateBenchmarkReport({ directory, experiment: 'test-only', outputDirectory: join(directory, 'report') });
  assert.equal(report.finalized_runs, 0);
  assert.equal(report.not_executed_runs, 1);
  begin({ trial: 2 });
  assert.equal(r.view().trial, 2);
});
