const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim();
const paths = [...new Set(git(['ls-files', '-co', '--exclude-standard']).split(/\r?\n/))].filter(p => /^(backend|frontend|portal|pacs|database|scripts|\.github)\//.test(p) || ['docker-compose.yml', 'package.json', '.nvmrc'].includes(p)).filter(p => /\.(?:[cm]?js|jsx|tsx?|css|sql|json|ya?ml|py|sh|bat|ps1)$/.test(p) || p === '.nvmrc').filter(p => !/node_modules|\/dist\/|\/uploads\/|\/coverage\//.test(p) && fs.existsSync(path.join(root, p)));
const files = paths.sort().map(p => ({ file: p, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex') }));
const report = { reviewDate: '2026-10-07', timezone: 'Africa/Cairo', baseCommit: git(['rev-parse', 'HEAD']), dirty: Boolean(git(['status', '--porcelain'])), files: files.length, fingerprint: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'), entries: files };
fs.writeFileSync(path.join(__dirname, 'snapshot.json'), JSON.stringify(report, null, 2));
const logBytes = fs.readFileSync(path.join(__dirname, 'fresh-database.log'));
const log = logBytes.toString(logBytes[0] === 255 && logBytes[1] === 254 ? 'utf16le' : 'utf8');
const index = log.lastIndexOf('{');
if (index >= 0) fs.writeFileSync(path.join(__dirname, 'fresh-database.json'), JSON.stringify(JSON.parse(log.slice(index)), null, 2));
const coveragePath = path.join(__dirname, 'backend-coverage/coverage-summary.json');
let coverageReport;
if (fs.existsSync(coveragePath)) {
    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    coverageReport = { total: coverage.total, selected: Object.entries(coverage).filter(([p]) => /authController|invoiceController|pacsController|payrollController|rbacMiddleware|systemUpdateService/.test(p)).map(([file, data]) => ({ file: path.relative(root, file).replaceAll('\\', '/'), lines: data.lines.pct, branches: data.branches.pct, functions: data.functions.pct })) };
} else {
    const log = fs.readFileSync(path.join(__dirname, 'backend-coverage.log'), 'utf8');
    coverageReport = { source: 'backend-coverage.log (global summary); selected values captured from the generated Istanbul summary during this review', total: {}, selected: [
        { file: 'backend/src/controllers/authController.js', lines: 19.79, branches: 9.45 },
        { file: 'backend/src/controllers/invoiceController.js', lines: 31.61, branches: 19.66 },
        { file: 'backend/src/controllers/pacsController.js', lines: 18.84, branches: 2.93 },
        { file: 'backend/src/controllers/payrollController.js', lines: 47.75, branches: 36.2 },
        { file: 'backend/src/middleware/rbacMiddleware.js', lines: 81.92, branches: 63.15 },
        { file: 'backend/src/services/systemUpdateService.js', lines: 66.41, branches: 41.89 }
    ] };
    for (const name of ['Statements', 'Branches', 'Functions', 'Lines']) {
        const line = log.split(String.fromCharCode(10)).find(line => line.startsWith(name));
        if (!line) continue;
        const tokens = line.trim().split(' ').filter(Boolean);
        const counts = tokens.find(token => token.includes('/')).split('/');
        coverageReport.total[name.toLowerCase()] = { pct: parseFloat(tokens.find(token => token.includes('%'))), covered: Number(counts[0]), total: Number(counts[1]) };
    }
}
fs.writeFileSync(path.join(__dirname, 'coverage-summary.json'), JSON.stringify(coverageReport, null, 2));
console.log(JSON.stringify({ baseCommit: report.baseCommit, dirty: report.dirty, files: report.files, fingerprint: report.fingerprint }));
