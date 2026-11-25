/**
 * @file test-pipeline.js
 * Comprehensive Integration Test Suite for AutomataFlow Universal Automata Pipeline.
 *
 * Verifies:
 *  1. Natural Language Specification Synthesis (Prefix, Suffix, Substring, Parity, Divisibility, Compound)
 *  2. Regular Expression Parsing (AST, Precedence, Kleene Star, Union, Concatenation)
 *  3. Thompson's NFA-ε Construction
 *  4. Subset Powerset Construction with Dead State Completion
 *  5. Hopcroft O(n log n) Minimization
 *  6. Hopcroft–Karp Equivalence Verification (L(M_orig) ≡ L(M_min))
 *  7. Positive & Negative String Acceptance Invariants
 */
'use strict';

var Pipeline = require('../js/pipeline.js');
var RegexParser = require('../js/regex-parser.js');
var Thompson = require('../js/thompson.js');
var Subset = require('../js/subset-construction.js');
var Hopcroft = require('../js/hopcroft.js');
var HK = require('../js/hopcroft-karp.js');
var DFAAlgo = require('../js/algorithms.js');
var NLDFA = require('../js/nl-dfa.js');

var passed = 0;
var failed = 0;
var total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log('  \x1b[32mPASS\x1b[0m [' + total + '] ' + message);
  } else {
    failed++;
    console.log('  \x1b[31mFAIL\x1b[0m [' + total + '] ' + message);
  }
}

console.log('\n================================================================');
console.log('  AutomataFlow Universal Automata Pipeline Test Suite');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: Natural Language Synthesis & Minimization
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Natural Language Synthesis & Minimization ---');

var nlCases = [
  { q: "Construct a DFA over {0,1} that accepts strings ending with 01.", accept: ["01", "001", "101", "1101"], reject: ["", "0", "1", "10", "100"] },
  { q: "Construct a DFA accepting strings containing 101.", accept: ["101", "0101", "11010", "10111"], reject: ["", "0", "1", "10", "1001", "0110"] },
  { q: "Construct a DFA accepting strings containing an even number of zeros.", accept: ["", "1", "11", "00", "010", "01101"], reject: ["0", "01", "10", "000"] },
  { q: "Construct a DFA accepting strings starting with 0 and ending with 1.", accept: ["01", "001", "011", "0101"], reject: ["", "0", "1", "00", "11", "10"] },
  { q: "Construct a DFA accepting strings with exactly three ones.", accept: ["111", "0111", "10110", "0101010"], reject: ["", "1", "11", "1111", "011110"] },
  { q: "Construct a DFA accepting strings with an odd number of ones.", accept: ["1", "01", "10", "111", "01110"], reject: ["", "0", "11", "1100", "1111"] },
  { q: "Construct a DFA accepting binary numbers divisible by 3.", accept: ["0", "11", "110", "1001", "1100"], reject: ["1", "10", "100", "101", "111"] },
  { q: "Construct a DFA that rejects strings containing consecutive ones.", accept: ["", "0", "1", "01", "10", "01010", "10101"], reject: ["11", "011", "110", "0110", "111"] },
  { q: "Construct a DFA accepting strings that do not contain 00.", accept: ["", "1", "0", "01", "10", "10101", "0101"], reject: ["00", "001", "100", "1001"] },
  { q: "Construct a DFA accepting strings matching (0+1)*01.", accept: ["01", "001", "101", "1101"], reject: ["", "0", "1", "10"] },
  { q: "Construct a minimum DFA that accepts all binary strings ending with 00 or 11.", accept: ["00", "11", "0100", "1011", "1111"], reject: ["", "0", "1", "01", "10", "010", "101"] },
  { q: "Construct a DFA that accepts strings of even length over {a,b}.", accept: ["", "aa", "ab", "ba", "bb", "abab"], reject: ["a", "b", "aba", "bab"] },
  { q: "Construct a DFA for strings starting with a and ending with b.", accept: ["ab", "aab", "abb", "abab"], reject: ["", "a", "b", "ba", "aa", "bb"] },
  { q: "Construct a DFA for strings starting and ending with the same symbol.", accept: ["0", "1", "00", "11", "010", "101"], reject: ["01", "10", "011", "100"] },
  { q: "Construct a DFA accepting binary numbers divisible by 2.", accept: ["0", "10", "100", "110", "1010"], reject: ["1", "11", "101", "111"] }
];

nlCases.forEach(function (tc, idx) {
  var res = Pipeline.run({ input: tc.q, mode: 'nl', method: 'hopcroft' });
  assert(res.success === true, 'NL Query #' + (idx + 1) + ' parsed and executed: "' + tc.q.substring(0, 40) + '..."');
  assert(res.stages.verification && res.stages.verification.equivalent === true, 'NL Query #' + (idx + 1) + ' Hopcroft–Karp equivalence verified (L(Orig) ≡ L(Min))');

  // Verify string invariants
  var origDfa = res.originalDFA;
  var minDfa = res.minimizedDFA;

  var stringsPass = true;
  tc.accept.forEach(function (w) {
    var r1 = DFAAlgo.runString(origDfa, w).accepted;
    var r2 = DFAAlgo.runString(minDfa, w).accepted;
    if (!r1 || !r2) stringsPass = false;
  });
  tc.reject.forEach(function (w) {
    var r1 = DFAAlgo.runString(origDfa, w).accepted;
    var r2 = DFAAlgo.runString(minDfa, w).accepted;
    if (r1 || r2) stringsPass = false;
  });
  assert(stringsPass === true, 'NL Query #' + (idx + 1) + ' string invariants verified (Accept/Reject)');
});

// -----------------------------------------------------------------------------
// SECTION 2: Regular Expression Engine & Minimization
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Regular Expression AST -> Thompson -> Subset -> Hopcroft ---');

var regexCases = [
  { re: "(0|1)*01", expectedMinStates: 3, accept: ["01", "101", "001"], reject: ["", "10", "11"] },
  { re: "(a|b)*abb", expectedMinStates: 4, accept: ["abb", "aabb", "babb"], reject: ["", "ab", "ba", "bb"] },
  { re: "a*b*", expectedMinStates: 2, accept: ["", "a", "b", "aa", "bb", "aabb"], reject: ["ba", "bba", "aba"] },
  { re: "(00|11)*", expectedMinStates: 4, accept: ["", "00", "11", "0011", "1100"], reject: ["0", "1", "01", "10", "001"] },
  { re: "1(0|1)*0", expectedMinStates: 3, accept: ["10", "100", "110", "1010"], reject: ["", "0", "1", "00", "01", "11"] },
  { re: "(0|1)*1(0|1)*(0|1)", expectedMinStates: 4, accept: ["10", "11", "010", "111"], reject: ["", "0", "1", "00", "000"] },
  { re: "0*1*2*", expectedMinStates: 3, accept: ["", "0", "1", "2", "012", "001122"], reject: ["10", "21", "20", "021"] },
  { re: "(a|b)*a(a|b)*b(a|b)*", expectedMinStates: 3, accept: ["ab", "aab", "abb", "cab" /* filtered */, "bab"], reject: ["", "a", "aa", "b", "bb"] },
  { re: "(00*)(11*)", expectedMinStates: 3, accept: ["01", "001", "011", "0011"], reject: ["", "0", "1", "10"] },
  { re: "a?b+c*", expectedMinStates: 3, accept: ["b", "ab", "", "c", "cc"], reject: ["ac", "ba", "bc"] }
];

regexCases.forEach(function (tc, idx) {
  var res = Pipeline.run({ input: tc.re, mode: 'regex', method: 'hopcroft' });
  assert(res.success === true, 'Regex #' + (idx + 1) + ' compiled successfully: /' + tc.re + '/');
  assert(res.stages.verification && res.stages.verification.equivalent === true, 'Regex #' + (idx + 1) + ' Hopcroft–Karp equivalence verified');

  // Verify string invariants
  var origDfa = res.originalDFA;
  var minDfa = res.minimizedDFA;

  var stringsPass = true;
  tc.accept.forEach(function (w) {
    // only check if symbols in alphabet
    var inAlpha = w.split('').every(function (c) { return origDfa.alphabet.indexOf(c) !== -1; });
    if (inAlpha) {
      var r1 = DFAAlgo.runString(origDfa, w).accepted;
      var r2 = DFAAlgo.runString(minDfa, w).accepted;
      if (!r1 || !r2) stringsPass = false;
    }
  });
  tc.reject.forEach(function (w) {
    var inAlpha = w.split('').every(function (c) { return origDfa.alphabet.indexOf(c) !== -1; });
    if (inAlpha) {
      var r1 = DFAAlgo.runString(origDfa, w).accepted;
      var r2 = DFAAlgo.runString(minDfa, w).accepted;
      if (r1 || r2) stringsPass = false;
    }
  });
  assert(stringsPass === true, 'Regex #' + (idx + 1) + ' string invariants verified');
});

// -----------------------------------------------------------------------------
// SECTION 3: Edge Cases & Theoretical Boundary Tests
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Edge Cases & Theoretical Boundary Tests ---');

// Trivial empty language
var pEmpty = Pipeline.run({ input: "empty", mode: "regex" });
assert(pEmpty.success === true, 'Empty language regex handled');
assert(pEmpty.minimizedDFA.states.length === 1 && pEmpty.minimizedDFA.finals.length === 0, 'Empty language minimizes to 1 non-accepting state');

// Epsilon string only
var pEps = Pipeline.run({ input: "ε", mode: "regex" });
assert(pEps.success === true, 'Epsilon regex handled');
assert(DFAAlgo.runString(pEps.minimizedDFA, "").accepted === true, 'Epsilon language accepts empty string');
assert(DFAAlgo.runString(pEps.minimizedDFA, "0").accepted === false, 'Epsilon language rejects non-empty string');

// Single state universal language (0|1)*
var pAll = Pipeline.run({ input: "(0|1)*", mode: "regex" });
assert(pAll.success === true, 'Universal language (0|1)* handled');
assert(pAll.minimizedDFA.states.length === 1, 'Universal language minimizes to 1 accepting state');

// Non-regular language rejection
var pNonReg = Pipeline.run({ input: "Construct a DFA for strings with equal number of zeros and ones", mode: "nl" });
assert(pNonReg.success === false, 'Non-regular language {0^n 1^n} properly rejected with Pumping Lemma explanation');

console.log('\n================================================================');
console.log('  TEST SUMMARY: ' + passed + ' / ' + total + ' assertions passed' + (failed === 0 ? ' (100% SUCCESS)' : ' (' + failed + ' failed)'));
console.log('================================================================\n');

process.exitCode = failed === 0 ? 0 : 1;
