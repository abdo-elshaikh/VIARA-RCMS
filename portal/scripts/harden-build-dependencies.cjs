// Temporary mitigation for GHSA-vfj7-8cjw-p6xm (no upstream fix as of
// 2026-10-05). Preserve Tailwind 3 styling while bounding braces AST recursion.
// npm audit will still report the original dependency version; do not hide it.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

let root;
try { root = path.dirname(require.resolve('braces/package.json')); }
catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    console.log('No braces build dependency installed.');
    process.exit(0);
}
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, '3.0.3', 'Review braces mitigation before changing its version');
const marker = 'VIARA_BRACES_DEPTH_GUARD';
const guard = `'use strict';
// ${marker}: iterative validation before recursive AST walkers.
module.exports = ast => {
  const pending = [[ast, 0]];
  const seen = new WeakSet();
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > 128 || ++count > 131072 || seen.has(node)) {
      throw new RangeError('Brace pattern exceeds safe AST limits');
    }
    seen.add(node);
    if (Array.isArray(node.nodes)) {
      for (const child of node.nodes) pending.push([child, depth + 1]);
    }
  }
};
`;
const files = {
    parse: ['e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310', "      stack.push(block);", "      if (stack.length >= 128) throw new RangeError('Brace pattern exceeds safe AST limits'); // VIARA_BRACES_DEPTH_GUARD\n      stack.push(block);"],
    compile: ['dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f', 'const compile = (ast, options = {}) => {', "const compile = (ast, options = {}) => {\n  require('./viara-depth-guard')(ast); // VIARA_BRACES_DEPTH_GUARD"],
    expand: ['41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7', 'const expand = (ast, options = {}) => {', "const expand = (ast, options = {}) => {\n  require('./viara-depth-guard')(ast); // VIARA_BRACES_DEPTH_GUARD"],
    stringify: ['379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a', 'module.exports = (ast, options = {}) => {', "module.exports = (ast, options = {}) => {\n  require('./viara-depth-guard')(ast); // VIARA_BRACES_DEPTH_GUARD"],
};

// Validate every input before modifying any installed file.
const pendingPatches = [];
for (const [name, [checksum, before, after]] of Object.entries(files)) {
    const target = path.join(root, 'lib', `${name}.js`);
    const source = fs.readFileSync(target, 'utf8');
    if (source.includes(marker)) continue;
    assert.equal(crypto.createHash('sha256').update(source).digest('hex'), checksum, `Unexpected braces ${name} source; refusing to patch`);
    assert.ok(source.includes(before), `Missing patch anchor: ${name}`);
    pendingPatches.push([target, source.replaceAll(before, after)]);
}
fs.writeFileSync(path.join(root, 'lib', 'viara-depth-guard.js'), guard);
for (const [target, source] of pendingPatches) fs.writeFileSync(target, source);

const braces = require(root);
assert.deepEqual(braces.expand('scan/{ct,mri}/{1..2}'), ['scan/ct/1', 'scan/ct/2', 'scan/mri/1', 'scan/mri/2']);
const deepPattern = '{'.repeat(3000) + 'a,b' + '}'.repeat(3000);
for (const method of ['compile', 'expand', 'stringify']) {
    assert.throws(() => braces[method](deepPattern), /safe AST limits/);
    let ast = { type: 'text', value: 'a' };
    for (let index = 0; index < 5000; index++) ast = { type: 'brace', nodes: [ast] };
    assert.throws(() => braces[method](ast), /safe AST limits/);
    const cycle = { type: 'brace', nodes: [] };
    cycle.nodes.push(cycle);
    assert.throws(() => braces[method](cycle), /safe AST limits/);
}
console.log('Braces build mitigation applied and verified (normal patterns, deep patterns, ASTs and cycles).');
