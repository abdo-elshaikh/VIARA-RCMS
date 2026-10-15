'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const log = path.join(__dirname, 'backend-native-jest.log');
const fd = fs.openSync(log, 'w');
const started = Date.now();
const result = cp.spawnSync(process.execPath, [
  path.join(root, 'backend/node_modules/jest/bin/jest.js'), '--ci', '--runInBand', '--silent',
  '--coverage', '--coverageReporters=json-summary',
  '--coverageDirectory=' + path.join(__dirname, 'backend-native-coverage'),
  '--json', '--outputFile=' + path.join(__dirname, 'backend-native-jest.json')
], { cwd: path.join(root, 'backend'), env: { ...process.env, NODE_ENV: 'test' }, stdio: ['ignore', fd, fd], timeout: 240000 });
fs.closeSync(fd);
const output = { status: result.status, signal: result.signal, error: result.error?.message || null, durationSeconds: (Date.now() - started) / 1000 };
const testsPath = path.join(__dirname, 'backend-native-jest.json');
if (fs.existsSync(testsPath)) {
  const tests = JSON.parse(fs.readFileSync(testsPath, 'utf8'));
  Object.assign(output, { success: tests.success, suites: tests.numPassedTestSuites, totalSuites: tests.numTotalTestSuites, tests: tests.numPassedTests, failed: tests.numFailedTests, pending: tests.numPendingTests });
}
const coveragePath = path.join(__dirname, 'backend-native-coverage/coverage-summary.json');
if (fs.existsSync(coveragePath)) output.coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8')).total;
fs.writeFileSync(path.join(__dirname, 'backend-native-result.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
process.exitCode = result.status === 0 ? 0 : 1;
