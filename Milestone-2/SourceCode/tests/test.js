/**
 * @file tests/test.js
 * Command-line test runner. Runs the shared suite in js/testcases.js (the same
 * cases shown in the "Test cases" tab) and prints expected vs actual results.
 *
 * Usage:   node tests/test.js            (prints a table, exit code 1 if any test fails)
 *          node tests/test.js --csv      (prints the results as CSV for the report)
 * Requires Node.js 14 or newer; no packages to install.
 */
'use strict';
var S = require('../js/testcases.js');

var results = S.runAll();
var failed = results.filter(function (r) { return !r.pass; });

if (process.argv.indexOf('--csv') !== -1) {
  /** Quote a CSV field (doubles inner quotes). */
  var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
  console.log(['ID', 'Category', 'Test', 'Machine', 'Input', 'Expected', 'Actual', 'Status', 'ms'].join(','));
  results.forEach(function (r) {
    var t = r.test;
    console.log([t.id, t.category, t.title, t.machine, t.input, t.expected, r.actual, r.pass ? 'Pass' : 'Fail', r.ms].map(q).join(','));
  });
} else {
  console.log('DFA Minimization Simulator: test suite\n');
  results.forEach(function (r) {
    var t = r.test;
    console.log((r.pass ? '  PASS ' : '  FAIL ') + t.id + '  [' + t.category + '] ' + t.title);
    console.log('         expected: ' + t.expected);
    console.log('         actual:   ' + r.actual + '  (' + r.ms + ' ms)');
  });
  console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' tests passed.');
}
process.exitCode = failed.length ? 1 : 0;
