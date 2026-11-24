/**
 * @file testcases.js
 * The project's test suite, shared by the browser ("Test cases" tab) and by
 * Node.js (tests/test.js), so both always show the same expected vs actual results.
 *
 * Each test is an object:
 *   id, category, title — identification ("T01", "String test", ...)
 *   machine             — short description of the DFA used
 *   input               — the input string or action ("—" if none)
 *   expected            — the theoretically correct outcome, written before running
 *   dfa, testString     — optional: lets the UI open the case in the simulator
 *   run()               — executes the case and returns {actual: string, pass: boolean}
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var A = isNode ? require('./algorithms.js') : root.DFAAlgo;
  var PRESETS = isNode ? require('./presets.js') : root.DFA_PRESETS;
  var NL = isNode ? require('./nl-dfa.js') : root.NLDFA;

  /** Return a copy of a preset DFA by id. @param {string} id @returns {DFA} */
  function preset(id) { return A.cloneDFA(PRESETS.filter(function (p) { return p.id === id; })[0].dfa); }

  /**
   * Seeded pseudo-random generator (linear congruential), so random tests are repeatable.
   * @param {number} seed
   * @returns {function(number): number} rand(k) returns an integer in [0, k).
   */
  function makeRand(seed) {
    // use the high bits: the low bits of a power-of-two LCG repeat with a very short period
    return function (k) { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * k); };
  }

  /**
   * Build a random complete DFA (used by tests and by the "Random DFA" button).
   * @param {function(number): number} rand  From makeRand(), or Math.random-based.
   * @param {{minStates?: number, maxStates?: number, symbols?: string[]}} [opts]
   * @returns {DFA}
   */
  function randomDFA(rand, opts) {
    opts = opts || {};
    var lo = opts.minStates || 2, hi = opts.maxStates || 7;
    var n = lo + rand(hi - lo + 1), sigma = opts.symbols || ['a', 'b', 'c'].slice(0, 2 + rand(2));
    var states = [];
    for (var i = 0; i < n; i++) states.push('s' + i);
    var delta = {};
    states.forEach(function (s) { delta[s] = {}; sigma.forEach(function (a) { delta[s][a] = states[rand(n)]; }); });
    var finals = states.filter(function () { return rand(2) === 0; });
    return { states: states, alphabet: sigma, start: 's0', finals: finals, delta: delta };
  }

  /**
   * Independent brute-force oracle for the size of the minimal DFA.
   * Each reachable state gets a signature: which strings of length < n it accepts.
   * Two distinguishable states always differ on some string shorter than n, so the
   * number of distinct signatures equals the number of states of the minimal DFA.
   * Exponential, only for small test machines.
   * @param {DFA} dfa  Complete DFA.
   * @returns {number}
   */
  function oracleMinSize(dfa) {
    var reach = A.findReachable(dfa).reachable;
    var n = reach.length, words = [[]], all = [[]];
    for (var len = 1; len < n; len++) {
      var next = [];
      words.forEach(function (w) { dfa.alphabet.forEach(function (a) { next.push(w.concat(a)); }); });
      words = next; all = all.concat(next);
    }
    var F = new Set(dfa.finals);
    return new Set(reach.map(function (s) {
      return all.map(function (w) {
        var cur = s; w.forEach(function (a) { cur = dfa.delta[cur][a]; });
        return F.has(cur) ? '1' : '0';
      }).join('');
    })).size;
  }

  /* ---------- helpers that turn a minimization result into readable text ---------- */
  function setText(list) { return '{' + list.join(', ') + '}'; }
  /** One-line summary of a minimize() result for the Actual column (size, removed states, dead state, or the first error). @param {Object} r @returns {string} */
  function sizeText(r) {
    if (!r.ok) return 'rejected: ' + r.validation.errors[0];
    var parts = [r.min.states.length + (r.min.states.length === 1 ? ' state' : ' states')];
    if (r.reach.unreachable.length) parts.push('removed ' + setText(r.reach.unreachable));
    if (r.dead) parts.push('dead state added');
    var merged = r.classes.filter(function (c) { return c.length > 1; });
    if (merged.length) parts.push('merged ' + merged.map(setText).join(' '));
    return parts.join('; ');
  }
  /** A pass also needs: both methods agree, same language, nothing left to merge. */
  function sound(r) { return r.ok && r.methodsAgree && r.equivalence.equal && r.isMinimal; }

  /** Test factory: minimize `dfa`; pass if the result is sound and `check(result)` holds. @param {Object} dfa @param {function(Object):boolean} check @returns {function():{actual:string,pass:boolean}} */
  function minimizeTest(dfa, check) {
    return function () {
      var r = A.minimize(dfa, 'both');
      return { actual: sizeText(r), pass: sound(r) && check(r) };
    };
  }
  /** Test factory: run `input` on the original and minimized DFA; pass if both agree with `wantAccept` (or, for null, if an error is reported). @param {Object} dfa @param {string} input @param {?boolean} wantAccept @returns {function():{actual:string,pass:boolean}} */
  function stringTest(dfa, input, wantAccept) {
    return function () {
      var r = A.minimize(dfa, 'both'), syms = A.tokenize(r.full, input);
      var r1 = A.runString(r.full, syms), r2 = A.runString(r.min, syms);
      if (r1.error) return { actual: 'Error: ' + r1.error, pass: false };
      var word = function (x) { return x.accepted ? 'Accept' : 'Reject'; };
      return { actual: word(r1) + ' (original), ' + word(r2) + ' (minimized); path ' + r1.path.join('→'),
               pass: r1.accepted === wantAccept && r2.accepted === wantAccept };
    };
  }
  /** Test factory: pass only if validation rejects `dfa` with an error containing `mustContain`. @param {Object} dfa @param {string} mustContain @returns {function():{actual:string,pass:boolean}} */
  function invalidTest(dfa, mustContain) {
    return function () {
      var r = A.minimize(dfa, 'both');
      if (r.ok) return { actual: 'accepted (no error)', pass: false };
      var hit = r.validation.errors.filter(function (e) { return e.indexOf(mustContain) !== -1; })[0];
      return { actual: 'Error: ' + (hit || r.validation.errors[0]), pass: !!hit };
    };
  }
  /** True if the equivalence classes of result r equal `want` (order ignored). @param {Object} r @param {string[][]} want @returns {boolean} */
  function classesAre(r, want) { return A.sameClasses(r.classes, want); }

  /* ---------- extra machines used only by the tests ---------- */
  var SIX = preset('six'), TEXTBOOK = preset('textbook');
  var SINGLE = { states: ['s'], alphabet: ['a', 'b'], start: 's', finals: ['s'], delta: { s: { a: 's', b: 's' } } };
  var ENDS_IN_C = { states: ['S', 'S2', 'C'], alphabet: ['a', 'b', 'c'], start: 'S', finals: ['C'],
    delta: { S: { a: 'S2', b: 'S', c: 'C' }, S2: { a: 'S', b: 'S2', c: 'C' }, C: { a: 'S', b: 'S2', c: 'C' } } };
  var MULTI = { states: ['idle', 'moving', 'moving2'], alphabet: ['go', 'stop'], start: 'idle', finals: ['moving', 'moving2'],
    delta: { idle: { go: 'moving', stop: 'idle' }, moving: { go: 'moving2', stop: 'idle' }, moving2: { go: 'moving', stop: 'idle' } } };
  var UNREACH = { states: ['A', 'B', 'C', 'D', 'E'], alphabet: ['0', '1'], start: 'A', finals: ['B', 'D'],
    delta: { A: { 0: 'B', 1: 'A' }, B: { 0: 'A', 1: 'B' }, C: { 0: 'D', 1: 'E' }, D: { 0: 'E', 1: 'C' }, E: { 0: 'C', 1: 'D' } } };
  var MOD12 = (function () {
    var st = [], d = {};
    for (var i = 0; i < 12; i++) st.push('m' + i);
    st.forEach(function (s, i) { d[s] = { 0: s, 1: st[(i + 1) % 12] }; });
    return { states: st, alphabet: ['0', '1'], start: 'm0', finals: st.filter(function (_, i) { return i % 3 === 0; }), delta: d };
  })();
  var LEN5 = (function () {
    var st = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'], d = {};
    st.forEach(function (s, i) { var t = st[Math.min(i + 1, 5)]; d[s] = { a: t, b: t }; });
    return { states: st, alphabet: ['a', 'b'], start: 'L0', finals: ['L5'], delta: d };
  })();
  /** A fresh valid DFA (copy of the six-state example) for the invalid-input tests to break. @returns {Object} */
  var good = function () { return A.cloneDFA(SIX); };
  /** Copy of the valid DFA after applying fn to it, e.g. to introduce one specific error. @param {function(Object)} fn @returns {Object} */
  function withChange(fn) { var d = good(); fn(d); return d; }

  var TESTS = [
    /* ----- Guide template T01–T05 ----- */
    { id: 'T01', category: 'String test', title: 'Accepted string', machine: 'Worked 6-state example (L = 0*10*)',
      input: '0100', expected: 'Accept on both DFAs', dfa: SIX, testString: '0100', run: stringTest(SIX, '0100', true) },
    { id: 'T02', category: 'String test', title: 'Rejected string', machine: 'Worked 6-state example',
      input: '101', expected: 'Reject on both DFAs', dfa: SIX, testString: '101', run: stringTest(SIX, '101', false) },
    { id: 'T03', category: 'Invalid input', title: 'Unknown symbol in test string', machine: 'Worked 6-state example, Σ = {0, 1}',
      input: '012', expected: 'Validation error: "2" is not in Σ', dfa: SIX, testString: '012',
      run: function () {
        var r = A.minimize(SIX, 'tf'), out = A.runString(r.full, A.tokenize(r.full, '012'));
        return { actual: out.error ? 'Error: ' + out.error : 'no error', pass: !!out.error && out.error.indexOf('"2"') !== -1 };
      } },
    { id: 'T04', category: 'String test', title: 'Empty string ε, start state not final', machine: 'Worked 6-state example',
      input: 'ε', expected: 'Reject (q0 ∉ F)', dfa: SIX, testString: '', run: stringTest(SIX, '', false) },
    { id: 'T05', category: 'Edge case', title: 'Missing transitions (incomplete δ)', machine: 'a*b with δ(Q, ·) undefined; R unreachable',
      input: '—', expected: 'Explicit dead state added; R removed; 3 states', dfa: preset('partial'),
      run: minimizeTest(preset('partial'), function (r) { return !!r.dead && r.min.states.length === 3; }) },
    { id: 'T06', category: 'String test', title: 'Empty string ε, start state final', machine: 'Every state final (Σ*)',
      input: 'ε', expected: 'Accept', dfa: preset('allfinal'), testString: '', run: stringTest(preset('allfinal'), '', true) },

    /* ----- Minimization: normal cases ----- */
    { id: 'T07', category: 'Minimization', title: 'Textbook DFA with an unreachable state', machine: '8 states A–H (Hopcroft–Ullman)',
      input: '—', expected: '5 states; D removed; {A,E} and {B,H} merged', dfa: TEXTBOOK,
      run: minimizeTest(TEXTBOOK, function (r) {
        return r.min.states.length === 5 && r.reach.unreachable.join() === 'D' && classesAre(r, [['A', 'E'], ['B', 'H'], ['C'], ['F'], ['G']]);
      }) },
    { id: 'T08', category: 'Minimization', title: 'Worked example (hand solution)', machine: '6 states q0–q5',
      input: '—', expected: '3 states: {q0,q1}, {q2,q3,q4}, {q5}', dfa: SIX,
      run: minimizeTest(SIX, function (r) { return classesAre(r, [['q0', 'q1'], ['q2', 'q3', 'q4'], ['q5']]); }) },
    { id: 'T09', category: 'Minimization', title: 'Even number of a\'s, counted mod 4', machine: '4 states p0–p3',
      input: '—', expected: '2 states; p0≡p2 and p1≡p3', dfa: preset('mod4'),
      run: minimizeTest(preset('mod4'), function (r) { return classesAre(r, [['p0', 'p2'], ['p1', 'p3']]); }) },
    { id: 'T10', category: 'Minimization', title: 'Three-symbol alphabet', machine: 'Strings over {a,b,c} ending in c, 3 states',
      input: '—', expected: '2 states; S≡S2', dfa: ENDS_IN_C,
      run: minimizeTest(ENDS_IN_C, function (r) { return classesAre(r, [['S', 'S2'], ['C']]); }) },
    { id: 'T11', category: 'Minimization', title: 'Larger DFA: number of 1s mod 3, counted mod 12', machine: '12 states m0–m11',
      input: '—', expected: '3 states (one per remainder)', dfa: MOD12,
      run: minimizeTest(MOD12, function (r) { return r.min.states.length === 3; }) },

    /* ----- Edge cases ----- */
    { id: 'T12', category: 'Edge case', title: 'Already minimal DFA', machine: 'Strings ending in "ab", 3 states',
      input: '—', expected: 'Unchanged: 3 states, nothing merged', dfa: preset('minimal'),
      run: minimizeTest(preset('minimal'), function (r) { return r.min.states.length === 3 && r.classes.every(function (c) { return c.length === 1; }); }) },
    { id: 'T13', category: 'Edge case', title: 'Every state final (Σ*)', machine: '3 states, all final',
      input: '—', expected: '1 state', dfa: preset('allfinal'),
      run: minimizeTest(preset('allfinal'), function (r) { return r.min.states.length === 1; }) },
    { id: 'T14', category: 'Edge case', title: 'No final states (∅)', machine: '2 states, none final',
      input: '—', expected: '1 state', dfa: preset('nofinal'),
      run: minimizeTest(preset('nofinal'), function (r) { return r.min.states.length === 1; }) },
    { id: 'T15', category: 'Edge case', title: 'Single-state DFA', machine: '1 state with self-loops',
      input: '—', expected: '1 state; no pairs to compare', dfa: SINGLE,
      run: minimizeTest(SINGLE, function (r) { return r.min.states.length === 1 && r.tf.marks.length === 0; }) },
    { id: 'T16', category: 'Edge case', title: 'Several unreachable states forming a cycle', machine: 'A, B reachable; C→D→E→C unreachable',
      input: '—', expected: '2 states; C, D, E removed', dfa: UNREACH,
      run: minimizeTest(UNREACH, function (r) { return r.min.states.length === 2 && r.reach.unreachable.join() === 'C,D,E'; }) },
    { id: 'T17', category: 'Edge case', title: 'Multi-character symbols', machine: 'Σ = {go, stop}, 3 states',
      input: 'go stop go', expected: '2 states; the string is accepted', dfa: MULTI, testString: 'go stop go',
      run: function () {
        var r = A.minimize(MULTI, 'both'), s = A.runString(r.min, A.tokenize(r.min, 'go stop go'));
        return { actual: sizeText(r) + '; ' + (s.accepted ? 'Accept' : 'Reject'), pass: sound(r) && r.min.states.length === 2 && s.accepted === true };
      } },
    { id: 'T18', category: 'Edge case', title: 'Longest distinguishing string (many passes)', machine: 'Length ≥ 5 counter, 6 states',
      input: '—', expected: 'Already minimal; last mark in pass 4; pass 5 empty', dfa: LEN5,
      run: function () {
        var r = A.minimize(LEN5, 'both');
        var last = Math.max.apply(null, r.tf.marks.map(function (m) { return m.pass; }));
        return { actual: sizeText(r) + '; last mark in pass ' + last + '; ' + r.tf.passes + ' passes',
                 pass: sound(r) && r.min.states.length === 6 && last === 4 && r.tf.passes === 5 };
      } },

    /* ----- Invalid input ----- */
    { id: 'T19', category: 'Invalid input', title: 'Start state not in Q', machine: 'Worked example with q₀ = "z"',
      input: '—', expected: 'Error: start state "z" is not in the state list', dfa: withChange(function (d) { d.start = 'z'; }),
      run: invalidTest(withChange(function (d) { d.start = 'z'; }), 'Start state "z"') },
    { id: 'T20', category: 'Invalid input', title: 'Duplicate state name', machine: 'Q = {q0, q1, q1, …}',
      input: '—', expected: 'Error: state names must be unique', dfa: withChange(function (d) { d.states.splice(2, 0, 'q1'); }),
      run: invalidTest(withChange(function (d) { d.states.splice(2, 0, 'q1'); }), 'unique') },
    { id: 'T21', category: 'Invalid input', title: 'ε used as an input symbol', machine: 'Σ = {0, 1, ε}',
      input: '—', expected: 'Error: a DFA cannot have ε as a symbol', dfa: withChange(function (d) { d.alphabet.push('ε'); }),
      run: invalidTest(withChange(function (d) { d.alphabet.push('ε'); }), 'ε') },
    { id: 'T22', category: 'Invalid input', title: 'Transition to a state that does not exist', machine: 'δ(q0, 0) = "q9"',
      input: '—', expected: 'Error: "q9" is not a valid state', dfa: withChange(function (d) { d.delta.q0['0'] = 'q9'; }),
      run: invalidTest(withChange(function (d) { d.delta.q0['0'] = 'q9'; }), '"q9"') },
    { id: 'T23', category: 'Invalid input', title: 'Empty state list', machine: 'Q = ∅',
      input: '—', expected: 'Error: enter at least one state',
      run: invalidTest({ states: [], alphabet: ['0'], start: '', finals: [], delta: {} }, 'at least one state') },
    { id: 'T24', category: 'Invalid input', title: 'Malformed JSON file on import', machine: 'File text "{states: [A"',
      input: 'Import JSON', expected: 'Error: the file is not valid JSON',
      run: function () {
        try { A.fromJSON('{states: [A'); return { actual: 'imported (no error)', pass: false }; }
        catch (e) { return { actual: 'Error: ' + e.message, pass: e.message.indexOf('not valid JSON') !== -1 }; }
      } },

    /* ----- Mathematical correctness ----- */
    { id: 'T25', category: 'Correctness', title: '300 random DFAs vs brute-force oracle', machine: 'Seeded random, 2–7 states, 2–3 symbols',
      input: '—', expected: 'Both methods agree, same language, size = oracle for all 300',
      run: function () {
        var rand = makeRand(42), ok = 0;
        for (var t = 0; t < 300; t++) {
          var d = randomDFA(rand), r = A.minimize(d, 'both');
          if (sound(r) && r.min.states.length === oracleMinSize(d)) ok++;
        }
        return { actual: ok + ' / 300 correct', pass: ok === 300 };
      } },
    { id: 'T26', category: 'Correctness', title: 'Pass number = shortest distinguishing string', machine: 'Textbook DFA + 100 random DFAs',
      input: '—', expected: 'Every mark made in pass k has a shortest distinguishing string of length k',
      run: function () {
        var rand = makeRand(7), machines = [TEXTBOOK], checked = 0, bad = 0;
        for (var t = 0; t < 100; t++) machines.push(randomDFA(rand));
        machines.forEach(function (d) {
          var r = A.minimize(d, 'tf'), Q = r.reduced.states;
          r.tf.marks.forEach(function (m) {
            checked++;
            if (A.shortestDistinguishingLength(r.reduced, Q[m.i], Q[m.j]) !== m.pass) bad++;
          });
        });
        return { actual: (checked - bad) + ' / ' + checked + ' marks match', pass: bad === 0 && checked > 0 };
      } },
    { id: 'T27', category: 'Correctness', title: 'Minimizing twice changes nothing', machine: 'Textbook and worked example',
      input: '—', expected: 'Second run keeps the same number of states',
      run: function () {
        var out = [TEXTBOOK, SIX].map(function (d) {
          var r1 = A.minimize(d, 'both'), r2 = A.minimize(r1.min, 'both');
          return [r1.min.states.length, r2.min.states.length];
        });
        return { actual: out.map(function (p) { return p[0] + ' → ' + p[1]; }).join(', '),
                 pass: out.every(function (p) { return p[0] === p[1]; }) };
      } },
    { id: 'T28', category: 'Feature', title: 'Export then import keeps the DFA', machine: 'Textbook DFA',
      input: 'Export JSON → Import JSON', expected: 'Identical machine and the same 5-state result',
      run: function () {
        var back = A.fromJSON(A.toJSON(TEXTBOOK, 'textbook'));
        var same = JSON.stringify(back) === JSON.stringify(A.cloneDFA(TEXTBOOK));
        var r = A.minimize(back, 'both');
        return { actual: (same ? 'identical machine' : 'machine changed') + '; ' + sizeText(r), pass: same && sound(r) && r.min.states.length === 5 };
      } },
    { id: 'T29', category: 'Feature', title: 'Step-by-step records for every phase', machine: 'Textbook DFA, method "both"',
      input: '—', expected: 'BFS, table-filling and partition steps recorded; one table-filling step per mark', dfa: TEXTBOOK,
      run: function () {
        var r = A.minimize(TEXTBOOK, 'both');
        var count = function (steps, type) { return steps.filter(function (s) { return s.type === type; }).length; };
        var visits = count(r.reach.steps, 'reach-visit'), marks = count(r.tf.steps, 'tf-mark') + (r.tf.steps[0].marked || []).length;
        var rounds = count(r.pr.steps, 'pr-iter');
        var ok = visits === r.reach.reachable.length && marks === r.tf.marks.length && rounds === r.pr.iterations &&
                 count(r.reach.steps, 'reach-done') === 1 && count(r.tf.steps, 'tf-result') === 1 && count(r.pr.steps, 'pr-result') === 1;
        return { actual: visits + ' BFS visits, ' + marks + ' marks, ' + rounds + ' partition rounds recorded', pass: ok };
      } },
    { id: 'T30', category: 'Feature', title: 'Random DFA generator gives valid machines', machine: '200 machines from the Random DFA generator',
      input: 'Random DFA', expected: 'Every machine is a valid, complete DFA and minimizes correctly',
      run: function () {
        var rand = makeRand(99), ok = 0;
        for (var t = 0; t < 200; t++) {
          var d = randomDFA(rand, { minStates: 5, maxStates: 8, symbols: ['0', '1'] }), v = A.validateDFA(d);
          if (!v.errors.length && !v.missing.length && sound(A.minimize(d, 'both'))) ok++;
        }
        return { actual: ok + ' / 200 valid and correctly minimized', pass: ok === 200 };
      } },
    { id: 'T31', category: 'NL Synthesis', title: 'Ending pattern instruction ("ends with 01")', machine: 'Synthesized Suffix DFA',
      input: 'Construct a minimum DFA over {0,1} that accepts all strings ending with 01.', expected: '3 states, equivalent under Hopcroft–Karp, accepts "101", rejects "10"',
      run: function () {
        var parsed = NL.parse('Construct a minimum DFA over the alphabet {0,1} that accepts all strings ending with 01.');
        if (!parsed.success) return { actual: 'Parse error: ' + parsed.error, pass: false };
        var r = A.minimize(parsed.dfa, 'both');
        var strOk = A.runString(r.min, ['1', '0', '1']).accepted && !A.runString(r.min, ['1', '0']).accepted;
        return { actual: sizeText(r) + '; Hopcroft-Karp: ' + (r.equivalence.equal ? 'Equivalent' : 'Mismatch'),
                 pass: sound(r) && r.min.states.length === 3 && strOk };
      } },
    { id: 'T32', category: 'NL Synthesis', title: 'Even/odd counting instruction ("even number of zeros")', machine: 'Synthesized Parity DFA',
      input: 'Construct a minimum DFA that accepts all strings containing an even number of zeros.', expected: '2 states, accepts "" and "1001", rejects "0"',
      run: function () {
        var parsed = NL.parse('Construct a minimum DFA that accepts all strings containing an even number of zeros.');
        if (!parsed.success) return { actual: 'Parse error: ' + parsed.error, pass: false };
        var r = A.minimize(parsed.dfa, 'both');
        var strOk = A.runString(r.min, []).accepted && A.runString(r.min, ['1', '0', '0', '1']).accepted && !A.runString(r.min, ['0']).accepted;
        return { actual: sizeText(r) + '; Hopcroft-Karp: ' + (r.equivalence.equal ? 'Equivalent' : 'Mismatch'),
                 pass: sound(r) && r.min.states.length === 2 && strOk };
      } },
    { id: 'T33', category: 'NL Synthesis', title: 'Substring detection instruction ("contains 101")', machine: 'Synthesized KMP Substring DFA',
      input: 'Construct a minimum DFA that accepts all binary strings containing the substring 101.', expected: '4 states, absorbing final state, accepts "0101"',
      run: function () {
        var parsed = NL.parse('Construct a minimum DFA that accepts all binary strings containing the substring 101.');
        if (!parsed.success) return { actual: 'Parse error: ' + parsed.error, pass: false };
        var r = A.minimize(parsed.dfa, 'both');
        var strOk = A.runString(r.min, ['0', '1', '0', '1']).accepted && !A.runString(r.min, ['0', '1', '1', '0']).accepted;
        return { actual: sizeText(r) + '; Hopcroft-Karp: ' + (r.equivalence.equal ? 'Equivalent' : 'Mismatch'),
                 pass: sound(r) && r.min.states.length === 4 && strOk };
      } },
    { id: 'T34', category: 'NL Synthesis', title: 'Forbidden pattern instruction ("no consecutive ones")', machine: 'Synthesized Complement DFA',
      input: 'Construct a minimum DFA that accepts all binary strings that do not contain consecutive ones.', expected: '3 states, rejects "11" and "0110", accepts "10101"',
      run: function () {
        var parsed = NL.parse('Construct a minimum DFA that accepts all binary strings that do not contain consecutive ones.');
        if (!parsed.success) return { actual: 'Parse error: ' + parsed.error, parse: false };
        var r = A.minimize(parsed.dfa, 'both');
        var strOk = A.runString(r.min, ['1', '0', '1', '0', '1']).accepted && !A.runString(r.min, ['1', '1']).accepted;
        return { actual: sizeText(r) + '; Hopcroft-Karp: ' + (r.equivalence.equal ? 'Equivalent' : 'Mismatch'),
                 pass: sound(r) && r.min.states.length === 3 && strOk };
      } },
    { id: 'T35', category: 'NL Synthesis', title: 'Compound conditions & Hopcroft–Karp equivalence', machine: 'Synthesized Product Automaton',
      input: 'Construct a minimum DFA that accepts all binary strings having an even number of zeros and an odd number of ones.', expected: '4 states, verified equivalent by Hopcroft–Karp BFS',
      run: function () {
        var parsed = NL.parse('Construct a minimum DFA that accepts all binary strings having an even number of zeros and an odd number of ones.');
        if (!parsed.success) return { actual: 'Parse error: ' + parsed.error, pass: false };
        var r = A.minimize(parsed.dfa, 'both');
        var strOk = A.runString(r.min, ['1']).accepted && A.runString(r.min, ['0', '0', '1']).accepted && !A.runString(r.min, ['0']).accepted && !A.runString(r.min, ['1', '1']).accepted;
        return { actual: sizeText(r) + '; pairs: ' + r.equivalence.pairsExplored + '; Hopcroft-Karp: ' + (r.equivalence.equal ? 'Equivalent' : 'Mismatch'),
                 pass: sound(r) && r.min.states.length === 4 && strOk };
      } }
  ];

  /**
   * Run every test and time it.
   * @returns {Array.<{test: Object, actual: string, pass: boolean, ms: number}>}
   */
  function runAll() {
    return TESTS.map(function (t) {
      var t0 = Date.now(), out;
      try { out = t.run(); } catch (e) { out = { actual: 'Crashed: ' + e.message, pass: false }; }
      return { test: t, actual: out.actual, pass: out.pass, ms: Date.now() - t0 };
    });
  }

  var api = { TESTS: TESTS, runAll: runAll, randomDFA: randomDFA, makeRand: makeRand, oracleMinSize: oracleMinSize };
  if (isNode) module.exports = api;
  else root.DFATests = api;
})(this);
