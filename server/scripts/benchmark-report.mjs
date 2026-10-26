import { generateBenchmarkReport } from '../src/benchmark-report.mjs';
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  const key = { '--experiment': 'experiment', '--directory': 'directory', '--output': 'outputDirectory' }[args[i]];
  if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: node server/scripts/benchmark-report.mjs --experiment NAME [--directory PATH] [--output PATH]');
  options[key] = args[i + 1];
}
console.log(JSON.stringify(generateBenchmarkReport(options), null, 2));
