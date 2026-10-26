import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const statuses = ['passed', 'failed', 'blocked', 'timeout', 'infra_error'];
const textFields = ['run_id', 'task_id', 'config_id', 'track', 'model', 'revision', 'evidence_ref'];
const integerFields = ['trial', 'seed', 'actions', 'input_tokens', 'output_tokens', 'cached_input_tokens'];
const allowed = new Set([...textFields, ...integerFields, 'status', 'wall_ms', 'cost_usd', 'failure_category', 'evaluator_success', 'human_success']);

export function parseRuns(source) {
  const seen = new Set();
  const configurations = new Map();
  const runs = source.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    let run;
    try { run = JSON.parse(line); } catch { throw Error(`Invalid JSON record ${index + 1}`); }
    if (!run || typeof run !== 'object' || Array.isArray(run)) throw Error('Expected an episode object');
    if (Object.keys(run).some(key => !allowed.has(key))) throw Error('Unknown episode field');
    for (const key of textFields) if (typeof run[key] !== 'string' || !run[key].trim()) throw Error(`Missing ${key}`);
    if (seen.has(run.run_id)) throw Error('Duplicate run_id');
    seen.add(run.run_id);
    for (const key of ['trial', 'seed', 'actions']) if (!Number.isInteger(run[key]) || run[key] < (key === 'trial' ? 1 : 0)) throw Error(`Invalid ${key}`);
    if (!statuses.includes(run.status) || !Number.isFinite(run.wall_ms) || run.wall_ms < 0) throw Error('Invalid status or duration');
    for (const key of ['input_tokens', 'output_tokens', 'cached_input_tokens', 'cost_usd']) {
      if (run[key] != null && (!Number.isFinite(run[key]) || run[key] < 0 || (key !== 'cost_usd' && !Number.isInteger(run[key])))) throw Error(`Invalid ${key}`);
    }
    if (run.cached_input_tokens != null && run.input_tokens != null && run.cached_input_tokens > run.input_tokens) throw Error('Cached tokens exceed total input tokens');
    for (const key of ['evaluator_success', 'human_success']) if (run[key] != null && typeof run[key] !== 'boolean') throw Error(`Invalid ${key}`);
    if (run.failure_category != null && typeof run.failure_category !== 'string') throw Error('Invalid failure_category');
    const group = JSON.stringify([run.track, run.config_id]);
    const signature = JSON.stringify([run.model, run.revision]);
    if (configurations.has(group) && configurations.get(group) !== signature) throw Error('One config_id mixes models or revisions');
    configurations.set(group, signature);
    return run;
  });
  if (!runs.length) throw Error('No evaluation records; no score generated');
  return runs;
}

function quantile(values, p) {
  const sorted = values.toSorted((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position), high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function summarize(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = JSON.stringify([run.track, run.config_id]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  return [...groups.values()].map(group => {
    const passed = group.filter(run => run.status === 'passed');
    const costKnown = group.filter(run => run.cost_usd != null);
    return {
      track: group[0].track, config: group[0].config_id, model: group[0].model,
      revision: group[0].revision, episodes: group.length,
      templates: new Set(group.map(run => run.task_id)).size,
      passed: passed.length, success_pct_recorded: 100 * passed.length / group.length,
      blocked: group.filter(run => run.status === 'blocked').length,
      timeout: group.filter(run => run.status === 'timeout').length,
      infra_error: group.filter(run => run.status === 'infra_error').length,
      median_seconds_all: quantile(group.map(run => run.wall_ms / 1000), .5),
      p95_seconds_all: quantile(group.map(run => run.wall_ms / 1000), .95),
      median_seconds_passed: quantile(passed.map(run => run.wall_ms / 1000), .5),
      mean_actions: group.reduce((total, run) => total + run.actions, 0) / group.length,
      cost_known_episodes: costKnown.length,
      mean_cost_usd_known: costKnown.length ? costKnown.reduce((total, run) => total + run.cost_usd, 0) / costKnown.length : null
    };
  });
}

const display = value => value == null ? 'Unavailable' : typeof value === 'number' ? String(Math.round(value * 10000) / 10000) : String(value);
const markdown = value => display(value).replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
const csv = value => {
  let text = value == null ? '' : String(value);
  if (/^[=+@\-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('Usage: node evals/report.mjs runs.jsonl output-directory');
  const summary = summarize(parseRuns(await readFile(input, 'utf8')));
  const columns = Object.keys(summary[0]);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'summary.csv'), [columns.map(csv).join(','), ...summary.map(row => columns.map(key => csv(row[key])).join(','))].join('\n') + '\n');
  await writeFile(join(output, 'results.md'), '# Recorded evaluation episodes\n\nDescriptive results only. Denominator is supplied records, including policy blocks, timeouts and infrastructure errors; planned-but-missing episodes cannot be detected here. No confidence interval is computed. Costs are reported only for episodes with measured cost.\n\n| ' + columns.join(' | ') + ' |\n| ' + columns.map(() => '---').join(' | ') + ' |\n' + summary.map(row => '| ' + columns.map(key => markdown(row[key])).join(' | ') + ' |').join('\n') + '\n');
  process.stdout.write(`Wrote descriptive summaries for ${summary.length} configurations.\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
