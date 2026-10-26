import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { resultText } from './mcp/result.mjs';

export const defaultBenchmarkDirectory = fileURLToPath(new URL('../../work/benchmarks/', import.meta.url));
const instances = new WeakMap();
const round = n => Math.round(n * 1000) / 1000;
const fail = message => { throw Object.assign(new Error(message), { code: 'BENCHMARK_ERROR' }); };

// Union lengths prevent concurrent operations from being counted twice.
export function unionMs(intervals) {
  const sorted = intervals.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let total = 0, end = -Infinity;
  for (const [a, b] of sorted) { total += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); }
  return total;
}
function exclusiveDuration(events, category) {
  const selected = events.filter(e => e.category === category);
  return unionMs(selected.map(e => [e.start_ms, e.end_ms]));
}

// Gaps are measured at server-handler boundaries, not model or transport spans.
// Track the furthest completed interval so overlapping calls never invent waits.
export function callGapReport(calls, elapsed) {
  let coveredThrough = 0, precedingCallId = null;
  const per_call = [...calls].sort((a, b) => a.start_ms - b.start_ms).map(call => {
    const row = {
      call_id: call.id, name: call.name, preceding_call_id: precedingCallId,
      gap_before_ms: round(Math.max(0, call.start_ms - coveredThrough)),
      duration_ms: round(Math.max(0, call.end_ms - call.start_ms))
    };
    if (call.end_ms >= coveredThrough) { coveredThrough = call.end_ms; precedingCallId = call.id; }
    return row;
  });
  return { per_call, trailing_gap_ms: round(Math.max(0, elapsed - coveredThrough)) };
}

export function summarizeRun(run) {
  const elapsed = run.elapsed_ms ?? 0;
  const events = run.events;
  const toolIntervals = run.calls.map(c => [c.start_ms, c.end_ms]);
  const observed = unionMs(toolIntervals);
  // Device commands are serialized by the existing connection server. On overlap,
  // allocate observation first, then tools. Never add nested timings twice.
  const observation = exclusiveDuration(events, 'accessibility_observation');
  const actionUnion = unionMs(events.filter(e => ['tool_execution', 'accessibility_observation'].includes(e.category)).map(e => [e.start_ms, e.end_ms]));
  const tools = Math.max(0, actionUnion - observation);
  const overhead = Math.max(0, observed - actionUnion);
  const unobserved = Math.max(0, elapsed - observed);
  const buckets = { tool_execution: tools, accessibility_observation: observation, measured_server_overhead: overhead, unobserved_assistant_network_user_wait: unobserved };
  const wastedIds = new Set(run.waste_annotations.flatMap(a => a.call_ids));
  const wasted = unionMs(run.calls.filter(c => wastedIds.has(c.id)).map(c => [c.start_ms, c.end_ms]));
  return {
    duration_ms: round(elapsed),
    steps: events.filter(e => e.category === 'tool_execution').length,
    successful_action_attempts: events.filter(e => e.category === 'tool_execution' && e.ok).length,
    failed_action_attempts: events.filter(e => e.category === 'tool_execution' && !e.ok).length,
    screen_reads: events.filter(e => e.category === 'accessibility_observation').length,
    tool_calls: run.calls.length,
    failed_tool_calls: run.calls.filter(c => !c.ok).length,
    ai_inference_ms: null,
    ai_inference_percent: null,
    token_usage: null,
    call_gaps: callGapReport(run.calls, elapsed),
    timing: Object.fromEntries(Object.entries(buckets).map(([key, ms]) => [key, { ms: round(ms), percent: elapsed ? round(ms / elapsed * 100) : 0 }])),
    annotated_wasted_ms: round(wasted),
    waste_reviewed: run.waste_reviewed,
    notes: [
      'AI inference is not observable in this chat-directed MCP relay. Unobserved wait also includes network, user and host scheduling time.',
      'Per-call gap_before_ms is uncovered time before handler entry, relative to the preceding covered handler interval (or run start). It is not AI inference. trailing_gap_ms covers time after the last handler.',
      'Screen reads are accessibility-tree observations, not screenshots. Screenshots are not captured by this implementation.',
      'Tool execution includes device command round trips; server overhead includes startup, settle delays and other work inside tool calls.',
      'Wasted time is a manually annotated subset of tool-call wall time, not an additional timing bucket; waiting outside calls is not classified as waste.',
      'Boundary: first measured phone-tool handler entry through stop-handler completion, or explicit finish if Stop was not called. Excludes the initial prompt and final answer.'
    ]
  };
}

export class BenchmarkRecorder {
  constructor({ directory = defaultBenchmarkDirectory, clock = () => performance.now(), wallClock = () => new Date().toISOString() } = {}) {
    this.directory = directory; this.clock = clock; this.wallClock = wallClock;
    this.context = new AsyncLocalStorage(); this.current = null;
  }
  persist() {
    const run = this.current;
    if (!run) return;
    mkdirSync(this.directory, { recursive: true });
    const path = join(this.directory, `${run.run_id}.json`);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ ...run, summary: summarizeRun(run) }, null, 2) + '\n', { mode: 0o600 });
    renameSync(tmp, path);
  }
  begin(meta) {
    if (this.current && !this.current.finalized) fail('Finish the previous benchmark run before starting another.');
    if (!meta.experiment?.trim() || !meta.task_label?.trim()) fail('Experiment and non-sensitive task label are required.');
    if (!Number.isInteger(meta.iteration) || meta.iteration < 0 || meta.iteration > 6) fail('Iteration must be 0 (baseline) through 6 (six cumulative root fixes).');
    if (meta.iteration > 0 && (!meta.root_cause?.trim() || !meta.change?.trim())) fail('A fix iteration requires the actual root cause and implemented change.');
    this.current = {
      schema_version: 1, run_id: randomUUID(), experiment: meta.experiment, task_label: meta.task_label,
      device: meta.device ?? 'Samsung S23+', model_label: meta.model ?? 'GPT-6', model_label_source: 'operator supplied; server cannot verify chat model',
      iteration: meta.iteration, trial: meta.trial ?? 1, root_cause: meta.root_cause ?? '', change: meta.change ?? '',
      created_at: this.wallClock(), started_at: null, elapsed_ms: 0, measurement_open: false, finalized: false,
      outcome: 'pending', label: meta.iteration === 0 ? 'baseline' : 'fix_iteration', verified: false,
      calls: [], events: [], waste_annotations: [], waste_reviewed: false
    };
    this.origin = null;
    try { this.persist(); } catch (error) { this.current = null; throw error; }
    return { run_id: this.current.run_id, state: 'armed', iteration: meta.iteration, next: 'Run the task normally. Timing begins on the first phone-tool call. Stop the phone session, review the run, then finish with a verified outcome.' };
  }
  offset() { return Math.max(0, this.clock() - this.origin); }
  async trackTool(name, fn) {
    const run = this.current;
    if (!run || run.finalized || run.stopped_at) return fn();
    if (this.origin === null) { this.origin = this.clock(); run.started_at = this.wallClock(); run.measurement_open = true; }
    const call = { id: randomUUID(), name, start_ms: this.offset(), end_ms: this.offset(), ok: false };
    run.calls.push(call);
    let value;
    try {
      value = await this.context.run({ run, call }, fn);
      call.ok = value.structuredContent?.ok === true && !value.structuredContent?.data?.observation_error && !value.structuredContent?.data?.error;
      const code = value.structuredContent?.error?.code ?? value.structuredContent?.data?.observation_error?.code ?? value.structuredContent?.data?.error?.code;
      if (code) call.error_code = code;
      return value;
    } finally {
      call.end_ms = this.offset(); run.elapsed_ms = Math.max(run.elapsed_ms, call.end_ms);
      if (name === 'phone_stop_session') { run.stopped_at = this.wallClock(); run.measurement_open = false; }
      if (name === 'phone_send_message' && value?.structuredContent?.data?.session_stopped) {
        run.stopped_at = this.wallClock(); run.measurement_open = false;
      }
      // A logging failure must not retry or discard an acknowledged phone action.
      try { this.persist(); } catch {
        if (value?.structuredContent?.data) {
          value.structuredContent.data.benchmark_warning = 'Benchmark save failed. Do not repeat the phone action; check local storage.';
          const text = value.content?.find(item => item.type === 'text');
          if (text) text.text = resultText(value.structuredContent);
        }
      }
    }
  }
  async phase(category, action, fn) {
    const ctx = this.context.getStore();
    if (!ctx || ctx.run !== this.current) return fn();
    const event = { id: randomUUID(), call_id: ctx.call.id, category, action, start_ms: this.offset(), end_ms: this.offset(), ok: false };
    ctx.run.events.push(event);
    try { const value = await fn(); event.ok = true; return value; }
    catch (error) { event.error_code = error.code ?? 'DEVICE_ERROR'; throw error; }
    finally { event.end_ms = this.offset(); }
  }
  view() {
    if (!this.current) return { state: 'idle', runs_recorded_in_this_process: 0 };
    const run = structuredClone(this.current);
    if (run.measurement_open) run.elapsed_ms = this.offset();
    return { ...run, summary: summarizeRun(run) };
  }
  annotate({ call_ids, reason }) {
    const run = this.current;
    if (!run || run.finalized) fail('No unfinished run to annotate.');
    if (!reason?.trim() || !call_ids?.length || call_ids.some(id => !run.calls.some(c => c.id === id))) fail('Supply existing call IDs and the observed reason they were wasted.');
    run.waste_annotations.push({ call_ids: [...new Set(call_ids)], reason });
    this.persist(); return this.view();
  }
  finish({ outcome, verified = false, waste_reviewed = false, notes = '' }) {
    const run = this.current;
    if (!run || run.finalized) fail('No unfinished benchmark run.');
    if (!['success', 'failed', 'cancelled'].includes(outcome)) fail('Outcome must be success, failed or cancelled.');
    if (outcome === 'success' && !verified) fail('Success requires verification of the actual result.');
    if (this.origin === null && outcome !== 'cancelled') fail('No phone-tool calls were recorded; cannot publish a benchmark result. Cancel the armed run instead.');
    if (run.measurement_open) { run.elapsed_ms = this.offset(); run.measurement_open = false; }
    const prior = structuredClone(run);
    run.finalized = true; run.finished_at = this.wallClock(); run.outcome = outcome;
    run.verified = verified; run.waste_reviewed = waste_reviewed; run.notes = notes;
    const summary = summarizeRun(run);
    run.label = outcome !== 'success' ? 'failed' : waste_reviewed && !summary.annotated_wasted_ms && !summary.failed_tool_calls && !summary.failed_action_attempts && run.stopped_at ? 'clean_success' : run.iteration > 0 ? 'fix_iteration' : 'baseline';
    try { this.persist(); } catch (error) { this.current = prior; throw error; }
    return this.view();
  }
}

export function benchmarkFor(device) {
  if (!instances.has(device)) instances.set(device, new BenchmarkRecorder());
  return instances.get(device);
}
