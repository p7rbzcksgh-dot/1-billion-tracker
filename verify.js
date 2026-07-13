const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = __dirname;
const required = [
  'index.html',
  'styles.css',
  'client.js',
  'server.js',
  'config.js',
  'auth.js',
  'counter-parser.js',
  'db.js',
  'store.js',
  'mailer.js',
  'socket.js',
  'scraper.js',
  'alert.js',
  'tcg-machines-logo.jpeg',
  'phyzbatch-wizard.webp',
  'package.json',
  'package-lock.json',
  '.env.example',
  '.gitignore',
  '.dockerignore',
  'Dockerfile',
  'docker-compose.yml',
  'Procfile',
  'README.md',
  'QUICK-START.txt',
  'DEPLOYMENT.md',
  'VALIDATION.md',
  'LICENSE'
];

const forbiddenDirectories = ['assets', 'lib', 'public', 'src', 'data', 'scripts', 'tests', '.github'];
const failures = [];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`Missing ${relative}`);
}

for (const directory of forbiddenDirectories) {
  if (fs.existsSync(path.join(root, directory))) failures.push(`Found forbidden containing folder: ${directory}/`);
}

const sourceDirectories = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !['node_modules', '.git'].includes(entry.name));
if (sourceDirectories.length) {
  failures.push(`All package files must be at root level. Found: ${sourceDirectories.map((entry) => `${entry.name}/`).join(', ')}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const script of ['start', 'verify', 'test', 'smoke', 'check']) {
  if (!packageJson.scripts?.[script]) failures.push(`package.json is missing the ${script} script.`);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
for (const stalePath of ['/assets/', './assets/', 'assets/']) {
  if (html.includes(stalePath) || css.includes(stalePath)) failures.push(`Found stale asset folder reference: ${stalePath}`);
}
if (!html.includes('/tcg-machines-logo.jpeg')) failures.push('index.html is not using the root-level TCG logo.');
if (!css.includes('/phyzbatch-wizard.webp')) failures.push('styles.css is not using the root-level wizard background.');

const jsFiles = fs.readdirSync(root)
  .filter((name) => name.endsWith('.js'));

for (const name of jsFiles) {
  const check = spawnSync(process.execPath, ['--check', path.join(root, name)], { encoding: 'utf8' });
  if (check.status !== 0) failures.push(`Syntax error in ${name}: ${check.stderr.trim()}`);
}

if (failures.length) {
  console.error('Package verification failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Package verification passed (${required.length} required files, ${jsFiles.length} JavaScript files).`);
console.log('All source files and both image assets are at repository root level.');
console.log('index.html is at repository root and the package includes Docker deployment files.');
