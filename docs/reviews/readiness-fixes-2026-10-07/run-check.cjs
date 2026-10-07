const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const configs = {
    backend: ['backend', npm, ['run', 'test:ci', '--', '--json', `--outputFile=${path.join(__dirname, 'backend-results.json')}`]],
    frontend: ['frontend', npm, ['run', 'test:ci', '--', '--reporter=json', `--outputFile=${path.join(__dirname, 'frontend-results.json')}`]],
    portal: ['portal', npm, ['test', '--', '--reporter=json', `--outputFile=${path.join(__dirname, 'portal-results.json')}`]],
    'frontend-lint': ['frontend', npm, ['run', 'lint']],
    'portal-lint': ['portal', npm, ['run', 'lint']],
    'portal-types': ['portal', npm, ['run', 'typecheck']],
    'portal-format': ['portal', npm, ['run', 'format:check']],
    locales: ['', process.execPath, ['scripts/check-locales.mjs']],
    'frontend-build': ['frontend', npm, ['run', 'build']],
    'portal-build': ['portal', npm, ['run', 'build']],
    'backend-audit': ['backend', npm, ['audit', '--json']],
    'frontend-audit': ['frontend', npm, ['audit', '--json']],
    'portal-audit': ['portal', npm, ['audit', '--json']],
    'backend-prod-audit': ['backend', npm, ['audit', '--omit=dev', '--json']],
    'frontend-prod-audit': ['frontend', npm, ['audit', '--omit=dev', '--json']],
    'portal-prod-audit': ['portal', npm, ['audit', '--omit=dev', '--json']],
    worker: ['pacs/ai-worker', 'python', ['-m', 'pytest', '-q', 'tests', '-p', 'no:cacheprovider']],
};
const name = process.argv[2];
if (!configs[name]) throw new Error('Unknown check');
const [cwd, executable, args] = configs[name];
const log = fs.openSync(path.join(__dirname, `${name}.log`), 'w');
const started = Date.now();
const child = spawn(executable, args, { cwd: path.join(root, cwd), stdio: ['ignore', log, log], shell: process.platform === 'win32' && executable === npm });
child.on('error', error => { fs.writeFileSync(path.join(__dirname, `${name}-status.json`), JSON.stringify({ name, error: error.message })); console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => {
    const result = { name, command: [executable, ...args].join(' '), exitCode: code, signal, durationSeconds: (Date.now() - started) / 1000 };
    fs.writeFileSync(path.join(__dirname, `${name}-status.json`), JSON.stringify(result, null, 2));
    fs.closeSync(log);
    console.log(JSON.stringify(result));
    process.exitCode = code || 0;
});
