/**
 * @file tests/export-testcases.js
 * Writes every test machine from js/testcases.js to TestCases/<ID>-<name>.json
 * (loadable with the simulator's "Import JSON" button) and saves the latest
 * results as TestCases/test-log.csv and TestCases/test-log.txt.
 *
 * Usage:  node tests/export-testcases.js [output folder]   (default: ./TestCases)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var S = require('../js/testcases.js');

var outDir = process.argv[2] || path.join(__dirname, '..', 'TestCases');
fs.mkdirSync(outDir, { recursive: true });

/** File-name slug from a test title, at most 40 characters. */
var slug = function (s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); };
var written = 0;
S.TESTS.forEach(function (t) {
  if (!t.dfa) return;
  var file = { id: t.id, category: t.category, title: t.title, machine: t.machine,
               input: t.input, expected: t.expected, dfa: t.dfa };
  fs.writeFileSync(path.join(outDir, t.id + '-' + slug(t.title) + '.json'), JSON.stringify(file, null, 2) + '\n');
  written++;
});

var results = S.runAll();
/** Quote a CSV field (doubles inner quotes). */
var q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
var csv = [['ID', 'Category', 'Test', 'Machine', 'Input', 'Expected', 'Actual', 'Status', 'ms'].join(',')].concat(
  results.map(function (r) {
    var t = r.test;
    return [t.id, t.category, t.title, t.machine, t.input, t.expected, r.actual, r.pass ? 'Pass' : 'Fail', r.ms].map(q).join(',');
  }));
fs.writeFileSync(path.join(outDir, 'test-log.csv'), '﻿' + csv.join('\n') + '\n');

var txt = ['DFA Minimization Simulator: test log (' + new Date().toISOString().slice(0, 10) + ')', ''];
results.forEach(function (r) {
  var t = r.test;
  txt.push((r.pass ? 'PASS ' : 'FAIL ') + t.id + ' [' + t.category + '] ' + t.title);
  txt.push('     machine:  ' + t.machine);
  txt.push('     input:    ' + t.input);
  txt.push('     expected: ' + t.expected);
  txt.push('     actual:   ' + r.actual);
});
var passed = results.filter(function (r) { return r.pass; }).length;
txt.push('', passed + ' / ' + results.length + ' tests passed.');
fs.writeFileSync(path.join(outDir, 'test-log.txt'), txt.join('\n') + '\n');

console.log('Wrote ' + written + ' machine files and the test logs to ' + outDir + ' (' + passed + '/' + results.length + ' passed).');
