/**
 * @file algorithms.js
 * Core Automata Theory logic for the DFA Minimization Simulator (CSET302, topic 3).
 *
 * This module never touches the web page. Every algorithm returns its result
 * together with a list of plain "step records" that describe what happened and
 * why; the user interface (app.js) only replays those records. Because of this
 * separation the same file runs in the browser and in Node.js (tests/test.js).
 *
 * DFA representation used everywhere:
 * @typedef {Object} DFA
 * @property {string[]} states    Q, the state names, in display order.
 * @property {string[]} alphabet  Σ, the input symbols (single or multi-character strings).
 * @property {string}   start     q₀, the start state (must be in states).
 * @property {string[]} finals    F ⊆ Q, the accepting states.
 * @property {Object.<string, Object.<string, string>>} delta
 *           δ as a nested map: delta[state][symbol] = next state.
 *           The user may leave entries undefined; see completeWithDeadState().
 *
 * Example: { states: ['A','B'], alphabet: ['0','1'], start: 'A', finals: ['B'],
 *            delta: { A: { 0: 'B', 1: 'A' }, B: { 0: 'B', 1: 'A' } } }
 */
(function (root) {
  'use strict';

  /* =====================================================================
     Helpers
     ===================================================================== */

  /**
   * Split user text such as "A, B C" into a list of names.
   * @param {string} text  Comma- and/or space-separated names.
   * @returns {string[]}   Non-empty trimmed names, in the order typed.
   */
  function parseList(text) {
    return String(text || '').split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /**
   * Deep-copy a DFA so algorithms never modify the caller's object.
   * @param {DFA} dfa
   * @returns {DFA} An independent copy (delta rows are copied, not shared).
   */
  function cloneDFA(dfa) {
    var delta = {};
    dfa.states.forEach(function (s) { delta[s] = Object.assign({}, dfa.delta[s] || {}); });
    return { states: dfa.states.slice(), alphabet: dfa.alphabet.slice(), start: dfa.start,
             finals: dfa.finals.slice(), delta: delta };
  }

  /**
   * Split a test string into input symbols.
   * Rules: "", "ε" and "eps" mean the empty string. If every symbol of Σ is one
   * character, "0110" is split into characters; otherwise (multi-character
   * symbols such as "go") the symbols must be separated by spaces or commas.
   * @param {DFA} dfa      Supplies the alphabet.
   * @param {string} input Text typed by the user.
   * @returns {string[]}   The symbol sequence (may contain symbols outside Σ;
   *                       runString() reports those as an error).
   */
  function tokenize(dfa, input) {
    var text = String(input || '').trim();
    if (text === '' || text === 'ε' || text === 'eps') return [];
    var allSingle = dfa.alphabet.every(function (a) { return a.length === 1; });
    if (allSingle && !/[\s,]/.test(text)) return text.split('');
    return parseList(text);
  }

  /* =====================================================================
     Step 1. Input validation
     ===================================================================== */

  /**
   * Check that a user-defined machine is a valid (possibly incomplete) DFA.
   * Errors block minimization; warnings are shown but allowed.
   * Missing δ entries are not errors: they are returned in `missing` and later
   * sent to an explicit dead state (documented behaviour, never silent).
   * @param {DFA} dfa
   * @returns {{errors: string[], warnings: string[], missing: Array.<[string, string]>}}
   *   errors   — empty Q or Σ, duplicate names, ε used as a symbol, unknown start
   *              or final state, or a transition to a state that does not exist;
   *   warnings — no final states (language ∅) or all states final (language Σ*);
   *   missing  — [state, symbol] pairs where δ is undefined.
   */
  function validateDFA(dfa) {
    var errors = [], warnings = [], missing = [];
    var stateSet = new Set(dfa.states);
    if (dfa.states.length === 0) errors.push('Enter at least one state.');
    if (dfa.alphabet.length === 0) errors.push('Enter at least one input symbol.');
    if (stateSet.size !== dfa.states.length) errors.push('State names must be unique.');
    if (new Set(dfa.alphabet).size !== dfa.alphabet.length) errors.push('Input symbols must be unique.');
    if (dfa.alphabet.some(function (a) { return a === 'ε' || a === 'eps'; }))
      errors.push('A DFA cannot have ε as an input symbol.');
    if (!stateSet.has(dfa.start)) errors.push('Start state "' + dfa.start + '" is not in the state list.');
    dfa.finals.forEach(function (f) {
      if (!stateSet.has(f)) errors.push('Final state "' + f + '" is not in the state list.');
    });
    dfa.states.forEach(function (s) {
      dfa.alphabet.forEach(function (a) {
        var t = dfa.delta[s] && dfa.delta[s][a];
        if (t === undefined || t === null || t === '') missing.push([s, a]);
        else if (!stateSet.has(t)) errors.push('δ(' + s + ', ' + a + ') = "' + t + '" is not a valid state.');
      });
    });
    if (dfa.finals.length === 0) warnings.push('No final states: the DFA accepts the empty language ∅.');
    if (dfa.finals.length === dfa.states.length && dfa.states.length > 0)
      warnings.push('Every state is final: the DFA accepts Σ* (all strings).');
    return { errors: errors, warnings: warnings, missing: missing };
  }

  /**
   * Make δ total by adding one explicit non-final dead (trap) state.
   * Why: minimization compares δ(p, a) with δ(q, a) for every symbol, so δ must
   * be defined everywhere. A missing move already means "reject", and a
   * non-final sink also rejects, so the accepted language does not change.
   * @param {DFA} dfa
   * @param {Array.<[string, string]>} missing  Undefined (state, symbol) pairs from validateDFA().
   * @returns {{dfa: DFA, dead: (string|null)}}  The completed copy and the dead
   *   state's name ("Dead", or "Dead'"… if that name is taken), or null if δ was already total.
   */
  function completeWithDeadState(dfa, missing) {
    var d = cloneDFA(dfa);
    if (!missing.length) return { dfa: d, dead: null };
    var dead = 'Dead';
    while (d.states.indexOf(dead) !== -1) dead += "'";
    d.states.push(dead);
    d.delta[dead] = {};
    d.alphabet.forEach(function (a) { d.delta[dead][a] = dead; });
    missing.forEach(function (m) { d.delta[m[0]][m[1]] = dead; });
    return { dfa: d, dead: dead };
  }

  /* =====================================================================
     Step 2. Unreachable states (breadth-first search from q₀)
     ===================================================================== */

  /**
   * Find the states reachable from the start state. O(|Q|·|Σ|).
   * @param {DFA} dfa  Must be complete (δ total).
   * @returns {{reachable: string[], unreachable: string[], steps: Object[]}}
   *   steps: 'reach-init', one 'reach-visit' per dequeued state (with the newly
   *   found states), and 'reach-done'.
   */
  function findReachable(dfa) {
    var steps = [];
    var visited = new Set([dfa.start]);
    var queue = [dfa.start];
    steps.push({ type: 'reach-init', visited: [dfa.start], queue: [dfa.start] });
    while (queue.length) {
      var s = queue.shift();
      var found = [];
      dfa.alphabet.forEach(function (a) {
        var t = dfa.delta[s][a];
        if (!visited.has(t)) { visited.add(t); queue.push(t); found.push({ symbol: a, state: t }); }
      });
      steps.push({ type: 'reach-visit', state: s, found: found,
                   visited: Array.from(visited), queue: queue.slice() });
    }
    var reachable = dfa.states.filter(function (s) { return visited.has(s); });
    var unreachable = dfa.states.filter(function (s) { return !visited.has(s); });
    steps.push({ type: 'reach-done', reachable: reachable, unreachable: unreachable });
    return { reachable: reachable, unreachable: unreachable, steps: steps };
  }

  /**
   * Keep only the given states (used to delete unreachable states).
   * Assumes no kept state has a transition into a removed state, which holds
   * when `keep` is the reachable set.
   * @param {DFA} dfa
   * @param {string[]} keep
   * @returns {DFA}
   */
  function restrictDFA(dfa, keep) {
    var keepSet = new Set(keep);
    var d = cloneDFA(dfa);
    d.states = dfa.states.filter(function (s) { return keepSet.has(s); });
    d.finals = dfa.finals.filter(function (s) { return keepSet.has(s); });
    var delta = {};
    d.states.forEach(function (s) { delta[s] = Object.assign({}, dfa.delta[s]); });
    d.delta = delta;
    return d;
  }

  /* =====================================================================
     Step 3a. Table-filling (Myhill–Nerode)
     ===================================================================== */

  /**
   * Mark every distinguishable pair of states, pass by pass.
   *
   * Pass 0 marks (final, non-final) pairs: ε distinguishes them.
   * Pass k marks (p, q) if for some symbol a the pair (δ(p,a), δ(q,a)) was
   * marked in an EARLIER pass (< k). Using only earlier marks means a pair
   * marked in pass k is distinguished by a string of length exactly k.
   * Stops after a pass that marks nothing; unmarked pairs are equivalent.
   * Classes are formed with union-find (≡ is transitive).
   * Worst case O(|Q|³·|Σ|): at most |Q| passes over |Q|² pairs.
   *
   * @param {DFA} dfa  Complete DFA (normally with unreachable states removed).
   * @returns {{marks: Object[], classes: string[][], equivalentPairs: Array.<[string,string]>,
   *            passes: number, steps: Object[]}}
   *   marks  — every mark in the order made: {i, j, pass, reason, symbol?, via?};
   *   passes — number of the last (empty) pass.
   */
  function tableFilling(dfa) {
    var Q = dfa.states, n = Q.length;
    var F = new Set(dfa.finals);
    var idx = {};
    Q.forEach(function (s, i) { idx[s] = i; });
    var mark = [];                // mark[i][j] (i < j) = the mark object, or null if unmarked
    for (var r = 0; r < n; r++) mark.push(new Array(n).fill(null));
    var marks = [];               // ordered list of every mark made
    var steps = [];

    var base = [];
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      if (F.has(Q[i]) !== F.has(Q[j])) {
        var fin = F.has(Q[i]) ? Q[i] : Q[j], non = F.has(Q[i]) ? Q[j] : Q[i];
        var m0 = { i: i, j: j, pass: 0, reason: fin + ' is final and ' + non + ' is not (distinguished by ε).' };
        mark[i][j] = m0; marks.push(m0); base.push(m0);
      }
    }
    steps.push({ type: 'tf-base', marked: base, markCount: marks.length, totalPairs: n * (n - 1) / 2 });

    var pass = 0, changed = true;
    while (changed) {
      changed = false; pass++;
      var newly = 0;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        if (mark[i][j]) continue;
        for (var k = 0; k < dfa.alphabet.length; k++) {
          var a = dfa.alphabet[k];
          var x = idx[dfa.delta[Q[i]][a]], y = idx[dfa.delta[Q[j]][a]];
          if (x === y) continue;
          var lo = Math.min(x, y), hi = Math.max(x, y);
          // only marks from earlier passes count, so pass number = string length
          if (mark[lo][hi] && mark[lo][hi].pass < pass) {
            var m = { i: i, j: j, pass: pass, symbol: a, via: [Q[lo], Q[hi]],
                      reason: 'On "' + a + '": ' + Q[i] + '→' + Q[x] + ', ' + Q[j] + '→' + Q[y] +
                              ', and pair (' + Q[lo] + ', ' + Q[hi] + ') is already marked.' };
            mark[i][j] = m; marks.push(m); newly++; changed = true;
            steps.push({ type: 'tf-mark', mark: m, markCount: marks.length, pass: pass });
            break;
          }
        }
      }
      steps.push({ type: 'tf-pass', pass: pass, newly: newly, markCount: marks.length });
    }

    // Unmarked pairs are equivalent; group them with union-find.
    var parent = Q.map(function (_, t) { return t; });
    function find(t) { while (parent[t] !== t) t = parent[t] = parent[parent[t]]; return t; }
    var equivalentPairs = [];
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) if (!mark[i][j]) {
      equivalentPairs.push([Q[i], Q[j]]);
      parent[find(j)] = find(i);
    }
    var classes = groupBy(Q, function (s) { return find(idx[s]); });
    steps.push({ type: 'tf-result', equivalentPairs: equivalentPairs, classes: classes, markCount: marks.length });
    return { marks: marks, classes: classes, equivalentPairs: equivalentPairs, passes: pass, steps: steps };
  }

  /* =====================================================================
     Step 3b. Partition refinement (Moore's algorithm)
     ===================================================================== */

  /**
   * Compute the equivalence classes by repeatedly splitting a partition.
   *
   * P₀ = {Q − F, F} (empty groups dropped). In each round every state gets a
   * signature: for each symbol, the index of the group δ(state, a) lies in.
   * States in the same group stay together only if their signatures are equal.
   * Refinement only ever splits, so when the number of groups stops changing the
   * partition is a fixed point: the equivalence relation. O(|Q|²·|Σ|).
   *
   * @param {DFA} dfa  Complete DFA.
   * @returns {{classes: string[][], iterations: number, steps: Object[]}}
   *   steps: 'pr-init', one 'pr-iter' per round (signatures and splits), 'pr-result'.
   */
  function partitionRefinement(dfa) {
    var F = new Set(dfa.finals);
    var P = [dfa.states.filter(function (s) { return !F.has(s); }),
             dfa.states.filter(function (s) { return F.has(s); })].filter(function (g) { return g.length; });
    var steps = [{ type: 'pr-init', partition: copyGroups(P) }];
    var k = 0;
    while (true) {
      k++;
      var groupOf = {};
      P.forEach(function (g, gi) { g.forEach(function (s) { groupOf[s] = gi; }); });
      var next = [], details = [];
      P.forEach(function (g) {
        var sigs = {};
        var buckets = new Map();      // signature → states with that signature, in order
        g.forEach(function (s) {
          var sig = dfa.alphabet.map(function (a) { return groupOf[dfa.delta[s][a]]; });
          sigs[s] = sig;
          var key = sig.join(',');
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(s);
        });
        var parts = Array.from(buckets.values());
        parts.forEach(function (p) { next.push(p); });
        details.push({ group: g.slice(), signatures: sigs, parts: parts });
      });
      var stable = next.length === P.length;
      steps.push({ type: 'pr-iter', k: k, before: copyGroups(P), after: copyGroups(next),
                   details: details, stable: stable });
      P = next;
      if (stable) break;
    }
    var classes = sortClasses(P, dfa.states);
    steps.push({ type: 'pr-result', classes: classes, iterations: k });
    return { classes: classes, iterations: k, steps: steps };
  }

  /* =====================================================================
     Step 4. Merge equivalent states
     ===================================================================== */

  /**
   * Display name of an equivalence class: the state itself, or "{A,E}".
   * @param {string[]} cls
   * @returns {string}
   */
  function className(cls) { return cls.length === 1 ? cls[0] : '{' + cls.join(',') + '}'; }

  /**
   * Build the minimized DFA: one state per equivalence class.
   * δ′([C], a) is copied from the first member of C. This is valid because ≡ is
   * a right-congruence (p ≡ q ⇒ δ(p,a) ≡ δ(q,a)). A class is final if its members
   * are final (pass 0 / P₀ guarantees members agree on this).
   * @param {DFA} dfa            The complete, reachable DFA the classes come from.
   * @param {string[][]} classes Equivalence classes covering every state of dfa.
   * @returns {{dfa: DFA, nameOf: Object.<string, string>}} The minimized DFA and
   *   a map from each original state to its new state's name.
   */
  function buildMinimized(dfa, classes) {
    var nameOf = {};
    classes.forEach(function (c) { var nm = className(c); c.forEach(function (s) { nameOf[s] = nm; }); });
    var F = new Set(dfa.finals);
    var min = { states: [], alphabet: dfa.alphabet.slice(), start: nameOf[dfa.start], finals: [], delta: {} };
    classes.forEach(function (c) {
      var nm = className(c), rep = c[0];
      min.states.push(nm);
      if (F.has(rep)) min.finals.push(nm);
      min.delta[nm] = {};
      dfa.alphabet.forEach(function (a) { min.delta[nm][a] = nameOf[dfa.delta[rep][a]]; });
    });
    return { dfa: min, nameOf: nameOf };
  }

  /* =====================================================================
     Step 5. Validation helpers
     ===================================================================== */

  /**
   * Run a complete DFA on a symbol sequence.
   * @param {DFA} dfa
   * @param {string[]} symbols  From tokenize(); [] is the empty string ε.
   * @returns {{accepted: boolean, path: string[]} | {error: string}}
   *   path lists every visited state, starting with q₀. Returns {error} if a
   *   symbol is not in Σ (alphabet validation for test strings).
   */
  function runString(dfa, symbols) {
    var path = [dfa.start], cur = dfa.start;
    for (var i = 0; i < symbols.length; i++) {
      if (dfa.alphabet.indexOf(symbols[i]) === -1)
        return { error: 'Symbol "' + symbols[i] + '" is not in Σ = {' + dfa.alphabet.join(', ') + '}.' };
      cur = dfa.delta[cur][symbols[i]];
      path.push(cur);
    }
    return { accepted: dfa.finals.indexOf(cur) !== -1, path: path };
  }

  /**
   * Decide whether two complete DFAs over the same alphabet accept the same
   * language, using breadth-first search on the product automaton.
   * If a reachable pair (p, p′) has exactly one final state, the BFS path to it
   * is a shortest string accepted by one DFA but not the other.
   * O(|Q₁|·|Q₂|·|Σ|).
   * @param {DFA} d1
   * @param {DFA} d2
   * @returns {{equal: true, pairsExplored: number} |
   *           {equal: false, counterexample: string, pairsExplored: number}}
   *   counterexample: symbols separated by spaces ('' means ε).
   */
  function checkEquivalence(d1, d2) {
    var F1 = new Set(d1.finals), F2 = new Set(d2.finals);
    var startKey = d1.start + '\u0000' + d2.start;
    var seen = new Map([[startKey, '']]);    // pair key → string that reaches it
    var queue = [[d1.start, d2.start]];
    while (queue.length) {
      var pq = queue.shift(), w = seen.get(pq[0] + '\u0000' + pq[1]);
      if (F1.has(pq[0]) !== F2.has(pq[1])) return { equal: false, counterexample: w, pairsExplored: seen.size };
      d1.alphabet.forEach(function (a) {
        var nx = [d1.delta[pq[0]][a], d2.delta[pq[1]][a]];
        var key = nx[0] + '\u0000' + nx[1];
        if (!seen.has(key)) { seen.set(key, w === '' ? a : w + ' ' + a); queue.push(nx); }
      });
    }
    return { equal: true, pairsExplored: seen.size };
  }

  /**
   * Run every string up to maxLen on both DFAs and compare accept/reject.
   * Stops early (before exceeding `cap` strings) to keep the interface fast.
   * @param {DFA} d1
   * @param {DFA} d2
   * @param {number} maxLen      Longest string length to try.
   * @param {number} [cap=50000] Maximum number of strings to test.
   * @returns {{tested: number, maxLength: number, mismatch: (string|null)}}
   *   maxLength is the longest length fully tested; mismatch is the first
   *   disagreeing string ('ε' for the empty string) or null.
   */
  function bruteForceCompare(d1, d2, maxLen, cap) {
    cap = cap || 50000;
    var tested = 0, len = 0, level = [[]], mismatch = null;
    while (len <= maxLen && !mismatch) {
      for (var i = 0; i < level.length; i++) {
        var r1 = runString(d1, level[i]), r2 = runString(d2, level[i]);
        tested++;
        if (r1.accepted !== r2.accepted) { mismatch = level[i].join(' ') || 'ε'; break; }
      }
      if (len === maxLen || mismatch) break;
      var nextLevel = [];
      for (i = 0; i < level.length && nextLevel.length + tested <= cap; i++)
        d1.alphabet.forEach(function (a) { nextLevel.push(level[i].concat(a)); });
      if (tested + nextLevel.length > cap) break;
      level = nextLevel; len++;
    }
    return { tested: tested, maxLength: len, mismatch: mismatch };
  }

  /**
   * Length of the shortest string that distinguishes states p and q of one DFA
   * (BFS on pairs). Used by the tests to check that table-filling's pass number
   * equals this length.
   * @param {DFA} dfa  Complete DFA.
   * @param {string} p
   * @param {string} q
   * @returns {number}  The length, or -1 if p ≡ q.
   */
  function shortestDistinguishingLength(dfa, p, q) {
    var F = new Set(dfa.finals);
    var seen = new Set([p + '\u0000' + q]), level = [[p, q]], len = 0;
    while (level.length) {
      var next = [];
      for (var i = 0; i < level.length; i++) {
        if (F.has(level[i][0]) !== F.has(level[i][1])) return len;
        dfa.alphabet.forEach(function (a) {
          var nx = [dfa.delta[level[i][0]][a], dfa.delta[level[i][1]][a]], key = nx[0] + '\u0000' + nx[1];
          if (!seen.has(key)) { seen.add(key); next.push(nx); }
        });
      }
      level = next; len++;
    }
    return -1;
  }

  /* =====================================================================
     Full pipeline
     ===================================================================== */

  /**
   * Minimize a user-defined DFA: validate → complete δ → remove unreachable →
   * find equivalent states → merge → validate the result.
   * @param {DFA} input
   * @param {('tf'|'pr'|'both')} method  Table-filling, partition refinement, or both.
   * @returns {Object} If the input is invalid: {ok: false, validation}.
   *   Otherwise {ok: true, validation, full (completed DFA), dead, reach, reduced,
   *   tf?, pr?, classes, methodsAgree? (when both), min (minimized DFA), nameOf,
   *   equivalence (product check), bruteForce (strings ≤ 8), isMinimal}.
   */
  function minimize(input, method) {
    var v = validateDFA(input);
    if (v.errors.length) return { ok: false, validation: v };
    var completed = completeWithDeadState(input, v.missing);
    var full = completed.dfa;
    var reach = findReachable(full);
    var reduced = restrictDFA(full, reach.reachable);
    var res = { ok: true, validation: v, input: input, full: full, dead: completed.dead,
                reach: reach, reduced: reduced, method: method };
    if (method !== 'pr') res.tf = tableFilling(reduced);
    if (method !== 'tf') res.pr = partitionRefinement(reduced);
    res.classes = sortClasses((res.tf || res.pr).classes, reduced.states);
    if (res.tf && res.pr) res.methodsAgree = sameClasses(res.tf.classes, res.pr.classes);
    var built = buildMinimized(reduced, res.classes);
    res.min = built.dfa;
    res.nameOf = built.nameOf;
    res.equivalence = checkEquivalence(full, res.min);
    res.bruteForce = bruteForceCompare(full, res.min, 8);
    // Minimality: running table-filling on the result must find no equivalent pairs.
    res.isMinimal = tableFilling(res.min).equivalentPairs.length === 0;
    return res;
  }

  /* =====================================================================
     Import / export (JSON files in TestCases/)
     ===================================================================== */

  /**
   * Serialize a DFA as pretty-printed JSON (the format of TestCases/*.json).
   * @param {DFA} dfa
   * @param {string} [name]  Optional label stored with the machine.
   * @returns {string}
   */
  function toJSON(dfa, name) {
    var out = {};
    if (name) out.name = name;
    out.states = dfa.states; out.alphabet = dfa.alphabet; out.start = dfa.start;
    out.finals = dfa.finals; out.delta = dfa.delta;
    return JSON.stringify(out, null, 2);
  }

  /**
   * Parse a DFA from JSON text. Accepts a bare DFA object or a test-case file
   * whose machine is under the key "dfa". Only checks the shape; the automata
   * rules are checked later by validateDFA().
   * @param {string} text
   * @returns {DFA}
   * @throws {Error} If the text is not JSON, or a field is missing or of the wrong type.
   */
  function fromJSON(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { throw new Error('The file is not valid JSON.'); }
    if (o && o.dfa) o = o.dfa;
    if (!o || typeof o !== 'object') throw new Error('The file does not contain a DFA object.');
    ['states', 'alphabet', 'finals'].forEach(function (k) {
      if (!Array.isArray(o[k]) || o[k].some(function (x) { return typeof x !== 'string'; }))
        throw new Error('"' + k + '" must be a list of names.');
    });
    if (typeof o.start !== 'string') throw new Error('"start" must be a state name.');
    if (!o.delta || typeof o.delta !== 'object' || Array.isArray(o.delta))
      throw new Error('"delta" must map each state to its transitions.');
    var delta = {};
    o.states.forEach(function (s) {
      var row = o.delta[s] || {};
      delta[s] = {};
      o.alphabet.forEach(function (a) { if (typeof row[a] === 'string' && row[a]) delta[s][a] = row[a]; });
    });
    return { states: o.states.slice(), alphabet: o.alphabet.slice(), start: o.start, finals: o.finals.slice(), delta: delta };
  }

  /* =====================================================================
     Small utilities
     ===================================================================== */

  /** Group list items by key, keeping first-seen order. @returns {Array[]} */
  function groupBy(list, keyFn) {
    var map = new Map();
    list.forEach(function (s) { var k = keyFn(s); if (!map.has(k)) map.set(k, []); map.get(k).push(s); });
    return Array.from(map.values());
  }
  /** Copy a list of groups. @returns {string[][]} */
  function copyGroups(P) { return P.map(function (g) { return g.slice(); }); }
  /** Sort classes (and states inside them) by the original state order. @returns {string[][]} */
  function sortClasses(classes, order) {
    var pos = {}; order.forEach(function (s, i) { pos[s] = i; });
    return classes.map(function (c) { return c.slice().sort(function (a, b) { return pos[a] - pos[b]; }); })
                  .sort(function (a, b) { return pos[a[0]] - pos[b[0]]; });
  }
  /** True if two partitions contain the same classes, in any order. @returns {boolean} */
  function sameClasses(a, b) {
    var key = function (cs) { return cs.map(function (c) { return c.slice().sort().join('|'); }).sort().join('#'); };
    return key(a) === key(b);
  }

  var api = { parseList: parseList, tokenize: tokenize, cloneDFA: cloneDFA, validateDFA: validateDFA,
              completeWithDeadState: completeWithDeadState, findReachable: findReachable,
              restrictDFA: restrictDFA, tableFilling: tableFilling, partitionRefinement: partitionRefinement,
              buildMinimized: buildMinimized, className: className, runString: runString,
              checkEquivalence: checkEquivalence, bruteForceCompare: bruteForceCompare,
              shortestDistinguishingLength: shortestDistinguishingLength,
              minimize: minimize, sameClasses: sameClasses, toJSON: toJSON, fromJSON: fromJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DFAAlgo = api;
})(this);
