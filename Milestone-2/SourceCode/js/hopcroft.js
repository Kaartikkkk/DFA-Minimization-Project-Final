/**
 * @file hopcroft.js
 * AutomataFlow — Hopcroft's DFA Minimization Algorithm (O(|Σ| · n log n)).
 * Implements John Hopcroft's state minimization algorithm using partition refinement
 * and an active splitter worklist (1971).
 *
 * Algorithm Structure:
 *   1. Reachability Check: BFS traversal from start state q0 to prune unreachable states.
 *   2. Completeness Verification: Ensures total transition function δ(q, a) over all a ∈ Σ.
 *   3. Initial Partition: P = {F, Q \ F} (ignoring empty sets).
 *   4. Worklist Initialization: W contains (A, a) where A is the smaller of F or Q \ F for all a ∈ Σ.
 *   5. Splitter Refinement Loop:
 *        While W is not empty:
 *          Pop (A, a) from W.
 *          Compute X = δ⁻¹(A, a) = {q ∈ Q | δ(q, a) ∈ A}.
 *          For each block B in P:
 *            If B ∩ X ≠ ∅ and B \ X ≠ ∅:
 *              Split B into B1 = B ∩ X and B2 = B \ X.
 *              Replace B in P with B1 and B2.
 *              Update W:
 *                If (B, c) is in W, replace it with (B1, c) and (B2, c).
 *                Else, add (smaller(B1, B2), c) to W for all c ∈ Σ.
 *   6. Quotient Machine Synthesis: Merges each final equivalence class into a canonical state.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Hopcroft = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Helper to format block of states as string: e.g. "{q0, q1}"
   */
  function formatBlock(block) {
    return '{' + block.slice().sort().join(', ') + '}';
  }

  /**
   * Display name of an equivalence class: e.g. "q0" or "{q0,q1}"
   */
  function className(cls) {
    return cls.length === 1 ? cls[0] : '{' + cls.slice().sort().join(',') + '}';
  }

  /**
   * Remove unreachable states from DFA using BFS starting at dfa.start.
   */
  function pruneUnreachable(dfa) {
    var visited = new Set();
    var queue = [dfa.start];
    visited.add(dfa.start);

    while (queue.length > 0) {
      var curr = queue.shift();
      var nodeTransitions = dfa.delta[curr] || {};
      dfa.alphabet.forEach(function (sym) {
        var nxt = nodeTransitions[sym];
        if (nxt !== undefined && !visited.has(nxt) && dfa.states.indexOf(nxt) !== -1) {
          visited.add(nxt);
          queue.push(nxt);
        }
      });
    }

    var reachableStates = dfa.states.filter(function (s) { return visited.has(s); });
    var unreachableStates = dfa.states.filter(function (s) { return !visited.has(s); });
    var reachableFinals = dfa.finals.filter(function (s) { return visited.has(s); });

    var reachableDelta = {};
    reachableStates.forEach(function (s) {
      reachableDelta[s] = {};
      dfa.alphabet.forEach(function (sym) {
        reachableDelta[s][sym] = dfa.delta[s][sym];
      });
    });

    return {
      dfa: {
        states: reachableStates,
        alphabet: dfa.alphabet.slice(),
        start: dfa.start,
        finals: reachableFinals,
        delta: reachableDelta
      },
      reachable: reachableStates,
      unreachable: unreachableStates
    };
  }

  /**
   * Make delta total by adding an explicit non-final dead/trap state if any transition is missing.
   */
  function completeWithDeadState(dfa) {
    var missing = [];
    dfa.states.forEach(function (s) {
      dfa.alphabet.forEach(function (a) {
        var t = dfa.delta[s] && dfa.delta[s][a];
        if (t === undefined || t === null || t === '') {
          missing.push([s, a]);
        }
      });
    });

    if (missing.length === 0) return { dfa: dfa, dead: null };

    var set = new Set(dfa.states);
    var dead = 'q_dead';
    var k = 0;
    while (set.has(dead)) dead = 'q_dead' + (++k);

    var newStates = dfa.states.concat([dead]);
    var newDelta = {};
    newStates.forEach(function (s) { newDelta[s] = {}; });

    dfa.states.forEach(function (s) {
      dfa.alphabet.forEach(function (a) {
        var t = dfa.delta[s] && dfa.delta[s][a];
        newDelta[s][a] = (t !== undefined && t !== null && t !== '') ? t : dead;
      });
    });

    dfa.alphabet.forEach(function (a) {
      newDelta[dead][a] = dead;
    });

    return {
      dfa: {
        states: newStates,
        alphabet: dfa.alphabet.slice(),
        start: dfa.start,
        finals: dfa.finals.slice(),
        delta: newDelta
      },
      dead: dead,
      missingCount: missing.length
    };
  }

  /**
   * Hopcroft's DFA Minimization Algorithm.
   * @param {Object} inputDFA
   * @returns {{
   *   classes: string[][],
   *   min: Object,
   *   steps: Array<Object>,
   *   iterations: number,
   *   prunedUnreachable: string[],
   *   nameOf: Object
   * }}
   */
  function minimize(inputDFA) {
    // 0. Ensure total transition function
    var completed = completeWithDeadState(inputDFA);
    var fullDFA = completed.dfa;

    // 1. Prune unreachable states
    var clean = pruneUnreachable(fullDFA);
    var dfa = clean.dfa;
    var Q = dfa.states.slice();
    var alphabet = dfa.alphabet.slice().sort();
    var F_set = new Set(dfa.finals);

    var steps = [];

    // Step 0: Record Reachability Pruning
    steps.push({
      step: 0,
      phase: 'Reachability',
      title: 'Graph Reachability Analysis',
      unreachable: clean.unreachable,
      reachable: clean.reachable,
      description: clean.unreachable.length
        ? 'Pruned ' + clean.unreachable.length + ' unreachable state(s): ' + clean.unreachable.join(', ')
        : 'All ' + clean.reachable.length + ' state(s) are reachable from start state ' + dfa.start
    });

    // Handle edge case: empty state list or single state
    if (Q.length <= 1) {
      var trivialClasses = Q.length ? [Q] : [];
      var trivialMin = {
        states: Q.slice(),
        alphabet: alphabet.slice(),
        start: dfa.start,
        finals: dfa.finals.slice(),
        delta: JSON.parse(JSON.stringify(dfa.delta))
      };
      var trivialNameOf = {};
      Q.forEach(function (s) { trivialNameOf[s] = s; });

      return {
        classes: trivialClasses,
        min: trivialMin,
        steps: steps,
        iterations: 0,
        prunedUnreachable: clean.unreachable,
        nameOf: trivialNameOf
      };
    }

    // 2. Precompute inverse transition table: inv[target][symbol] = [sources]
    var inv = {};
    Q.forEach(function (s) {
      inv[s] = {};
      alphabet.forEach(function (a) { inv[s][a] = []; });
    });
    Q.forEach(function (s) {
      alphabet.forEach(function (a) {
        var target = dfa.delta[s] && dfa.delta[s][a];
        if (target !== undefined && inv[target]) {
          inv[target][a].push(s);
        }
      });
    });

    // 3. Initial Partition P = { F, Q \ F }
    var groupF = Q.filter(function (s) { return F_set.has(s); });
    var groupNonF = Q.filter(function (s) { return !F_set.has(s); });

    var P = [];
    if (groupF.length) P.push(groupF);
    if (groupNonF.length) P.push(groupNonF);

    steps.push({
      step: 1,
      phase: 'Initial Partition',
      title: 'Initial Distinguishability Partition P₀',
      partitions: P.map(function (b) { return b.slice(); }),
      description: 'Initial partition separated by language acceptance: P₀ = {' +
        (groupF.length ? 'Final states: ' + formatBlock(groupF) : '') +
        (groupF.length && groupNonF.length ? ', ' : '') +
        (groupNonF.length ? 'Non-final states: ' + formatBlock(groupNonF) : '') + '}'
    });

    // 4. Initialize Worklist W with (smaller(F, Q\F), a) for all a ∈ Σ
    var W = [];
    var initialSplitter = (groupF.length > 0 && groupF.length <= groupNonF.length) || groupNonF.length === 0
      ? groupF
      : groupNonF;

    if (initialSplitter && initialSplitter.length > 0) {
      alphabet.forEach(function (a) {
        W.push({ set: initialSplitter.slice(), symbol: a });
      });
    }

    var iterationCount = 0;

    // Helper to check set equality
    function areSetsEqual(arr1, arr2) {
      if (arr1.length !== arr2.length) return false;
      var s = new Set(arr1);
      return arr2.every(function (x) { return s.has(x); });
    }

    // 5. Worklist Refinement Loop
    while (W.length > 0) {
      iterationCount++;
      var currentItem = W.shift();
      var A = currentItem.set;
      var c = currentItem.symbol;

      // Compute X = δ⁻¹(A, c) = {q ∈ Q | δ(q, c) ∈ A}
      var X_set = new Set();
      A.forEach(function (q) {
        if (inv[q] && inv[q][c]) {
          inv[q][c].forEach(function (pred) { X_set.add(pred); });
        }
      });

      if (X_set.size === 0) continue;

      var newP = [];
      var didSplitAny = false;

      for (var pi = 0; pi < P.length; pi++) {
        var B = P[pi];
        var B1 = []; // B ∩ X (states that transition into A on symbol c)
        var B2 = []; // B \ X (states that do not)

        for (var bi = 0; bi < B.length; bi++) {
          var state = B[bi];
          if (X_set.has(state)) {
            B1.push(state);
          } else {
            B2.push(state);
          }
        }

        if (B1.length > 0 && B2.length > 0) {
          // Block B is split into B1 and B2!
          didSplitAny = true;
          newP.push(B1);
          newP.push(B2);

          steps.push({
            step: steps.length + 1,
            phase: 'Refinement',
            title: 'Refined Partition on Splitter (' + formatBlock(A) + ', "' + c + '")',
            splitBlock: B.slice(),
            subBlock1: B1.slice(),
            subBlock2: B2.slice(),
            splitterSet: A.slice(),
            splitterSymbol: c,
            description: 'Block ' + formatBlock(B) + ' split on symbol "' + c + '" via splitter ' + formatBlock(A) +
              ' → ' + formatBlock(B1) + ' and ' + formatBlock(B2)
          });

          // Update Worklist W
          alphabet.forEach(function (sym) {
            // Check if (B, sym) is in W
            var wIdx = -1;
            for (var wi = 0; wi < W.length; wi++) {
              if (W[wi].symbol === sym && areSetsEqual(W[wi].set, B)) {
                wIdx = wi;
                break;
              }
            }

            if (wIdx !== -1) {
              // Replace (B, sym) with (B1, sym) and (B2, sym)
              W.splice(wIdx, 1);
              W.push({ set: B1.slice(), symbol: sym });
              W.push({ set: B2.slice(), symbol: sym });
            } else {
              // Add (smaller(B1, B2), sym) to W
              var smallerBlock = (B1.length <= B2.length) ? B1 : B2;
              W.push({ set: smallerBlock.slice(), symbol: sym });
            }
          });
        } else {
          newP.push(B);
        }
      }

      P = newP;
    }

    // Sort classes deterministically: start state's class comes first, then by earliest member
    P.forEach(function (block) { block.sort(); });
    P.sort(function (a, b) {
      var hasStartA = a.indexOf(dfa.start) !== -1;
      var hasStartB = b.indexOf(dfa.start) !== -1;
      if (hasStartA) return -1;
      if (hasStartB) return 1;
      return a[0].localeCompare(b[0]);
    });

    steps.push({
      step: steps.length + 1,
      phase: 'Equivalence Classes',
      title: 'Fixed-Point Convergence: Final Equivalence Classes',
      classes: P.map(function (b) { return b.slice(); }),
      description: 'Hopcroft partition refinement reached a fixed point in ' + iterationCount +
        ' splitter iteration(s). Found ' + P.length + ' minimal equivalence class(es): ' +
        P.map(formatBlock).join(', ')
    });

    // 6. Build Minimized Quotient DFA
    var nameOf = {};
    P.forEach(function (c) {
      var nm = className(c);
      c.forEach(function (s) { nameOf[s] = nm; });
    });

    var minStates = [];
    var minFinals = [];
    var minDelta = {};

    P.forEach(function (c) {
      var nm = className(c);
      minStates.push(nm);
      var rep = c[0];
      if (F_set.has(rep)) {
        minFinals.push(nm);
      }
      minDelta[nm] = {};
      alphabet.forEach(function (a) {
        var tgt = dfa.delta[rep] && dfa.delta[rep][a];
        minDelta[nm][a] = tgt !== undefined ? nameOf[tgt] : nm;
      });
    });

    var minDFA = {
      states: minStates,
      alphabet: alphabet,
      start: nameOf[dfa.start],
      finals: minFinals,
      delta: minDelta
    };

    return {
      classes: P,
      min: minDFA,
      steps: steps,
      iterations: iterationCount,
      prunedUnreachable: clean.unreachable,
      nameOf: nameOf
    };
  }

  return {
    minimize: minimize,
    pruneUnreachable: pruneUnreachable,
    className: className,
    formatBlock: formatBlock
  };
});
