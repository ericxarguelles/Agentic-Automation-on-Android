import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { defaultBenchmarkDirectory, summarizeRun } from './benchmark.mjs';

const escape = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const seconds = n => (n / 1000).toFixed(2);
const csv = x => '"' + String(x ?? '').replaceAll('"', '""') + '"';
const colors = { failed: '#b83d3d', fix_iteration: '#ac7400', clean_success: '#087c5b', baseline: '#58667a' };
const categories = [
  ['tool_execution', 'Tool execution', '#387bb8'],
  ['accessibility_observation', 'Accessibility reads', '#7e57a5'],
  ['measured_server_overhead', 'Measured server overhead', '#ab7400'],
  ['unobserved_assistant_network_user_wait', 'Unobserved assistant/network/user wait', '#a8a8a8']
];
const svg = (height, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="img"><title>${escape(title)}</title><rect width="1200" height="${height}" fill="white"/><g font-family="Arial,sans-serif" fill="#182536">${body}</g></svg>`;
function runLabel(r) { return `Iteration ${r.iteration} · trial ${r.trial}`; }
function overview(runs) {
  const height = 165 + Math.max(1, runs.length) * 65;
  let b = '<text x="30" y="35" font-size="24" font-weight="bold">Recorded task runs — Samsung S23+ / operator-labeled model</text>';
  b += '<text x="30" y="63" font-size="15">Red: failed/cancelled · amber: fix iteration · green: reviewed clean success · slate: baseline</text>';
  if (!runs.length) return svg(height, b + '<text x="30" y="125" font-size="21">No finalized runs yet. No benchmark results have been invented.</text>', 'Benchmark runs');
  const max = Math.max(1, ...runs.map(r => r.summary.duration_ms));
  runs.forEach((r, i) => {
    const y = 100 + i * 65, width = r.summary.duration_ms / max * 560;
    b += `<text x="30" y="${y + 21}" font-size="16">${escape(runLabel(r))}</text><rect x="230" y="${y}" width="${Math.max(1, width)}" height="29" rx="3" fill="${colors[r.label] ?? colors.baseline}"/>`;
    b += `<text x="${240 + width}" y="${y + 20}" font-size="15">${seconds(r.summary.duration_ms)}s · ${r.summary.steps} actions · ${escape(r.label)}</text>`;
    b += `<text x="230" y="${y + 49}" font-size="13">Annotated wasted tool time: ${r.waste_reviewed ? seconds(r.summary.annotated_wasted_ms) + 's' : 'review pending'} · ${escape(r.outcome)}</text>`;
  });
  b += `<text x="30" y="${height - 20}" font-size="14">Elapsed time begins at the first phone tool and ends at Stop (or explicit finish). Failed runs remain visible.</text>`;
  return svg(height, b, 'Duration, action count and outcome for each recorded trial');
}
function breakdown(runs) {
  const height = 240 + Math.max(1, runs.length) * 65;
  let b = '<text x="30" y="35" font-size="24" font-weight="bold">Measured time distribution</text><text x="30" y="63" font-size="16">AI inference: unavailable · Screenshot capture: 0 (accessibility-only relay)</text>';
  if (!runs.length) b += '<text x="30" y="115" font-size="21">Waiting for your first completed trial.</text>';
  runs.forEach((r, i) => {
    const y = 92 + i * 65; let x = 230;
    b += `<text x="30" y="${y + 24}" font-size="16">${escape(runLabel(r))}</text>`;
    for (const [key, label, color] of categories) {
      const t = r.summary.timing[key], width = t.percent / 100 * 900;
      b += `<rect x="${x}" y="${y}" width="${width}" height="32" fill="${color}"><title>${escape(label)}: ${seconds(t.ms)}s (${t.percent.toFixed(1)}%)</title></rect>`;
      if (width > 65) b += `<text x="${x + width / 2}" y="${y + 22}" font-size="14" text-anchor="middle" fill="${key.startsWith('unobserved') ? '#182536' : 'white'}">${t.percent.toFixed(1)}%</text>`;
      x += width;
    }
  });
  categories.forEach(([, label, color], i) => {
    const y = height - 112 + i * 24;
    b += `<rect x="30" y="${y - 13}" width="15" height="15" fill="${color}"/><text x="55" y="${y}" font-size="15">${escape(label)}</text>`;
  });
  return svg(height, b, 'Timing categories with unobserved inference explicitly marked unavailable');
}

export function generateBenchmarkReport({ directory = defaultBenchmarkDirectory, experiment, outputDirectory } = {}) {
  if (!experiment?.trim()) throw new Error('An exact experiment name is required.');
  const slug = experiment.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 55) + '-' + createHash('sha256').update(experiment).digest('hex').slice(0, 8);
  const out = outputDirectory ?? fileURLToPath(new URL(`../../outputs/benchmarks/${slug}/`, import.meta.url));
  let files;
  try { files = readdirSync(directory); } catch (error) { if (error.code === 'ENOENT') files = []; else throw error; }
  const all = [];
  for (const name of files.filter(n => /^[a-f0-9-]{36}\.json$/.test(n))) {
    const run = JSON.parse(readFileSync(join(directory, name), 'utf8'));
    if (run.schema_version === 1 && run.experiment === experiment) all.push({ ...run, summary: summarizeRun(run) });
  }
  all.sort((a, b) => a.iteration - b.iteration || a.trial - b.trial || a.created_at.localeCompare(b.created_at));
  const runs = all.filter(r => r.finalized && r.started_at), pending = all.filter(r => !r.finalized);
  const notExecuted = all.filter(r => r.finalized && !r.started_at);
  const overviewSvg = overview(runs), breakdownSvg = breakdown(runs);
  const conditionRows = Array.from({ length: 7 }, (_, iteration) => {
    const group = runs.filter(r => r.iteration === iteration);
    const fixes = [...new Set(group.map(r => `${r.root_cause || 'Baseline'} → ${r.change || 'No fix yet'}`))];
    return `<tr><td>${iteration === 0 ? 'Baseline' : 'Fix ' + iteration}</td><td>${escape(fixes.join('; ') || 'Not recorded')}</td><td>${group.length}</td><td>${group.filter(r => r.outcome === 'success').length}</td></tr>`;
  }).join('');
  const rows = runs.map(r => `<tr><td>${escape(runLabel(r))}</td><td>${escape(r.model_label)} / ${escape(r.device)}</td><td>${seconds(r.summary.duration_ms)}s</td><td>${r.summary.steps}</td><td>${r.waste_reviewed ? seconds(r.summary.annotated_wasted_ms) + 's' : 'Not reviewed'}</td><td>${escape(r.outcome)} / ${escape(r.label)}</td><td>${escape(r.notes)}</td></tr>`).join('');
  const timingRows = runs.map(r => `<tr><td>${escape(runLabel(r))}</td>${categories.map(([key]) => { const t = r.summary.timing[key]; return `<td>${seconds(t.ms)}s / ${t.percent.toFixed(1)}%</td>`; }).join('')}<td>Unavailable</td></tr>`).join('');
  const gapHeader = ['run_id', 'iteration', 'trial', 'call_id', 'tool', 'preceding_call_id', 'gap_before_ms', 'call_duration_ms'];
  const gapRows = runs.flatMap(r => r.summary.call_gaps.per_call.map(c => [r.run_id, r.iteration, r.trial, c.call_id, c.name, c.preceding_call_id, c.gap_before_ms, c.duration_ms]));
  const gapSection = `<section><h2>Per-call gaps</h2><p>Gap before each call is uncovered time between server handlers, including assistant, network, host scheduling and user waiting. It cannot identify AI inference. The first gap starts at the run boundary. Overlapping calls contribute no duplicate waiting. Durations and gaps below are milliseconds. Trailing gaps (after the last handler): ${runs.map(r => `${escape(runLabel(r))}: ${r.summary.call_gaps.trailing_gap_ms} ms`).join('; ') || 'No finalized runs'}.</p><table><tr><th>Run</th><th>Call ID</th><th>Tool</th><th>Preceding covered call ID</th><th>Gap before (ms)</th><th>Call duration (ms)</th></tr>${runs.flatMap(r => r.summary.call_gaps.per_call.map(c => `<tr><td>${escape(runLabel(r))}</td><td>${escape(c.call_id)}</td><td>${escape(c.name)}</td><td>${escape(c.preceding_call_id ?? 'Run start')}</td><td>${c.gap_before_ms}</td><td>${c.duration_ms}</td></tr>`)).join('') || '<tr><td colspan="6">Awaiting measurements.</td></tr>'}</table></section>`;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(experiment)} — benchmark report</title><style>body{font:16px/1.5 system-ui,sans-serif;color:#182536;background:#f5f7fa;max-width:1250px;margin:35px auto;padding:0 24px}h1{margin-bottom:0}svg{width:100%;height:auto}section{background:white;padding:24px;margin:22px 0;border-radius:10px;overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;border-bottom:1px solid #dde3ea;padding:10px;vertical-align:top}p{max-width:1050px}.muted{color:#536171}</style><h1>${escape(experiment)}</h1><p>${runs.length} finalized real runs · ${pending.length} unfinished records. Model/device labels are operator supplied.</p><section>${overviewSvg}</section><section>${breakdownSvg}</section><section><h2>Baseline and six cumulative root fixes</h2><p>Empty entries are unperformed conditions, not measured results. Repeat each condition from the same starting state. This report makes no automatic causal or speedup claim.</p><table><tr><th>Condition</th><th>Recorded cause → implemented change</th><th>Trials</th><th>Verified successes</th></tr>${conditionRows}</table></section><section><h2>Individual runs</h2><table><tr><th>Run</th><th>Model / device</th><th>Elapsed</th><th>Action attempts</th><th>Annotated waste</th><th>Outcome / label</th><th>Verification notes</th></tr>${rows || '<tr><td colspan="7">No finalized runs yet.</td></tr>'}</table></section><section><h2>Timing values</h2><table><tr><th>Run</th>${categories.map(([, label]) => `<th>${escape(label)}</th>`).join('')}<th>AI inference</th></tr>${timingRows || '<tr><td colspan="6">Awaiting measurements.</td></tr>'}</table></section><section><h2>What these numbers mean</h2><p>AI inference and token usage cannot be measured inside this MCP relay. Unobserved wait includes assistant processing, network transit, user pauses and scheduling; it must not be relabeled AI inference. Accessibility screen reads are not screenshots. Command round-trip time includes device/network work. Server overhead includes settle delays and other in-handler work; telemetry serialization after the timing boundary is excluded.</p><p>Steps count action attempts, including launch; reads, status and session-management calls are excluded. Wasted time is a reviewed subset of tool-call time and may include a combined action plus verification read. It is not added to the timing distribution. Zero annotated waste is not proof that all behavior was optimal.</p><p>Unfinished records are excluded from charts. Clean success requires explicitly verified success, a stopped session, waste review and no recorded errors or annotated waste. A run's condition number remains available even when labeled clean success or failed.</p></section></html>`;
  const header = ['run_id', 'iteration', 'trial', 'outcome', 'label', 'duration_ms', 'steps', 'annotated_wasted_ms', 'waste_reviewed', 'ai_inference_ms', 'tool_execution_ms', 'accessibility_observation_ms', 'measured_server_overhead_ms', 'unobserved_wait_ms', 'root_cause', 'change'];
  const csvRows = runs.map(r => [r.run_id, r.iteration, r.trial, r.outcome, r.label, r.summary.duration_ms, r.summary.steps, r.summary.annotated_wasted_ms, r.waste_reviewed, '', r.summary.timing.tool_execution.ms, r.summary.timing.accessibility_observation.ms, r.summary.timing.measured_server_overhead.ms, r.summary.timing.unobserved_assistant_network_user_wait.ms, r.root_cause, r.change]);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'report.html'), html.replace('</html>', `${gapSection}</html>`));
  writeFileSync(join(out, 'run-comparison.svg'), overviewSvg);
  writeFileSync(join(out, 'time-distribution.svg'), breakdownSvg);
  writeFileSync(join(out, 'runs.csv'), [header, ...csvRows].map(row => row.map(csv).join(',')).join('\n') + '\n');
  writeFileSync(join(out, 'call-gaps.csv'), [gapHeader, ...gapRows].map(row => row.map(csv).join(',')).join('\n') + '\n');
  writeFileSync(join(out, 'runs.json'), JSON.stringify({ experiment, finalized_runs: runs, unfinished_run_ids: pending.map(r => r.run_id), not_executed_run_ids: notExecuted.map(r => r.run_id) }, null, 2) + '\n');
  return { report_path: join(out, 'report.html'), finalized_runs: runs.length, unfinished_runs: pending.length, not_executed_runs: notExecuted.length, comparison_svg: join(out, 'run-comparison.svg'), timing_svg: join(out, 'time-distribution.svg'), call_gaps_csv: join(out, 'call-gaps.csv') };
}
