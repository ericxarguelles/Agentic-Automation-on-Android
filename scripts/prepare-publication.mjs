import { readdir, readFile, mkdir, writeFile, copyFile, lstat } from 'node:fs/promises';
import { resolve, relative, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const destination = resolve(process.argv[2] || join(root, 'outputs', `publication-${Date.now()}`));
const roots = ['android', 'server', 'scripts', 'docs', 'evals', '.github', 'shared', 'tests', 'deploy'];
const rootFiles = ['README.md', 'AGENTS.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.gitignore', '.gitattributes', 'LICENSE', 'NOTICE'];
const ignoredDirectories = new Set(['node_modules', 'build', '.gradle', '.kotlin', '.idea', '.git', '.codex', '.agents', '.vscode', 'runs', 'private']);
const textExtensions = new Set(['.md', '.mjs', '.json', '.yaml', '.yml', '.ps1', '.kt', '.kts', '.xml', '.properties', '.toml', '.txt', '.bat']);
const approvedBinary = new Set(['android/gradle/wrapper/gradle-wrapper.jar', 'docs/media/task-thinking.png', 'docs/media/task-history.png']);
const files = [];
const normalize = path => path.split(sep).join('/');
let privateValues;
try { privateValues = JSON.parse(process.env.APC_PUBLICATION_AUDIT_VALUES || '[]'); }
catch { throw Error('Invalid private audit configuration. Values were not printed.'); }
delete process.env.APC_PUBLICATION_AUDIT_VALUES;
if (!Array.isArray(privateValues) || privateValues.some(value => typeof value !== 'string' || !value)) throw Error('Invalid private audit values');
const markers = privateValues.flatMap(value => [value, encodeURIComponent(value)]);
if (!destination.startsWith(join(root, 'outputs') + sep)) throw Error('Publication destination must be inside this workspace outputs directory.');
try { await lstat(destination); throw Error('Destination already exists; choose a new publication directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

async function visit(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw Error('Symlinks are not allowed in publication candidates.');
  const rel = normalize(relative(root, path));
  if (stat.isDirectory()) {
    if (ignoredDirectories.has(path.split(sep).at(-1).toLowerCase()) || rel === 'docs/images') return;
    for (const item of await readdir(path)) await visit(join(path, item));
  } else {
    const name = path.split(sep).at(-1).toLowerCase();
    if (name === 'local.properties' || name === '.gitkeep' || name.startsWith('.env') || name.endsWith('.dpapi')) return;
    if (approvedBinary.has(rel) || textExtensions.has(extname(name)) || ['.gitignore', '.gitattributes', 'gradlew', 'LICENSE', 'NOTICE'].includes(path.split(sep).at(-1))) files.push(rel);
  }
}
for (const name of [...rootFiles, ...roots]) {
  try { await visit(join(root, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const findings = [];
const fingerprints = [];
for (const rel of files.toSorted()) {
  const bytes = await readFile(join(root, rel));
  const text = bytes.toString('utf8');
  if (markers.some(value => bytes.includes(Buffer.from(value, 'utf8')))) findings.push({file: rel, kind: 'private-value-match'});
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|\bghp_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bAIza[A-Za-z0-9_-]{30,}/.test(text)) findings.push({file: rel, kind: 'credential-shaped-value'});
  if (/\b[A-Za-z0-9-]+\.tail[a-z0-9]+\.ts\.net\b/i.test(text)) findings.push({file: rel, kind: 'personal-tailnet-hostname'});
  if (/[A-Za-z]:[\\/]Users[\\/](?!Public[\\/])[^\s'"<>]+/.test(text)) findings.push({file: rel, kind: 'personal-windows-path'});
  fingerprints.push({file: rel, sha256: createHash('sha256').update(bytes).digest('hex')});
}
if (findings.length) {
  process.stderr.write(JSON.stringify({status: 'blocked', findings}, null, 2) + '\n');
  process.exitCode = 1;
} else {
  await mkdir(destination, { recursive: true });
  for (const rel of files) {
    await mkdir(resolve(destination, rel, '..'), { recursive: true });
    await copyFile(join(root, rel), join(destination, rel));
  }
  const audit = {status: 'passed-scoped-scan', files: files.length, private_values_checked: privateValues.length,
    scope: 'Allowlisted source files only; not a vulnerability audit, Git-history scan, or proof of absence of secrets.', fingerprints};
  await writeFile(join(destination, 'PUBLICATION-MANIFEST.json'), JSON.stringify(audit, null, 2) + '\n');
  process.stdout.write(JSON.stringify({status: audit.status, files: files.length, private_values_checked: privateValues.length, destination}, null, 2) + '\n');
}
