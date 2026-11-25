/**
 * @file subset-construction.js
 * AutomataFlow — Subset Construction Algorithm (Powerset Construction: NFA-ε to DFA).
 * Converts any Non-deterministic Finite Automaton with epsilon transitions (NFA-ε)
 * into an equivalent, complete, Deterministic Finite Automaton (DFA).
 *
 * Implements:
 *   - Epsilon-closure computation (DFS/BFS traversal).
 *   - Move operation: move(T, a) = ∪ δ(q, a) for q ∈ T.
 *   - Dynamic powerset discovery with canonical state subset hashing.
 *   - Explicit dead/trap state insertion to ensure a complete transition function.
 *   - Clean state renaming (q0, q1, ...) with start state q0.
 *   - Detailed step-by-step tracing for educational visualization.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SubsetConstruction = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EPSILON = '';

  /**
   * Compute the epsilon-closure of a single state or set of states.
   * @param {Object} delta - NFA transition table
   * @param {string[]|Set<string>} states - Starting state(s)
   * @returns {string[]} Sorted array of reachable state IDs
   */
  function epsilonClosure(delta, states) {
    var initial = Array.isArray(states) ? states : Array.from(states);
    var visited = new Set(initial);
    var stack = initial.slice();

    while (stack.length > 0) {
      var curr = stack.pop();
      var nodeTransitions = delta[curr] || {};
      // Epsilon transitions can be stored as '' or 'ε'
      var epsTargets = (nodeTransitions[EPSILON] || []).concat(nodeTransitions['ε'] || []);

      for (var i = 0; i < epsTargets.length; i++) {
        var nxt = epsTargets[i];
        if (!visited.has(nxt)) {
          visited.add(nxt);
          stack.push(nxt);
        }
      }
    }

    return Array.from(visited).sort();
  }

  /**
   * Compute move(T, a): all states reachable from any state in T on input symbol a.
   * @param {Object} delta
   * @param {string[]} stateSet
   * @param {string} symbol
   * @returns {string[]} Sorted array of target state IDs
   */
  function move(delta, stateSet, symbol) {
    var targets = new Set();
    for (var i = 0; i < stateSet.length; i++) {
      var s = stateSet[i];
      var nodeTransitions = delta[s] || {};
      var direct = nodeTransitions[symbol] || [];
      for (var j = 0; j < direct.length; j++) {
        targets.add(direct[j]);
      }
    }
    return Array.from(targets).sort();
  }

  /**
   * Canonical string key for a set of states.
   * @param {string[]} stateSet
   * @returns {string}
   */
  function stateKey(stateSet) {
    return stateSet.slice().sort().join(',');
  }

  /**
   * Main entry point: converts NFA-ε into a complete, equivalent DFA.
   * @param {Object} nfa
   * @param {Object} [opts]
   * @returns {{
   *   dfa: Object,
   *   steps: Array<Object>,
   *   nfaStateMap: Object
   * }}
   */
  function nfaToDFA(nfa, opts) {
    opts = opts || {};
    var alphabet = (nfa.alphabet || []).slice().sort();
    if (!alphabet.length) alphabet = ['0', '1'];

    var nfaFinalsSet = new Set(nfa.finals || []);
    var initialClosure = epsilonClosure(nfa.delta, [nfa.start]);
    var initialKey = stateKey(initialClosure);

    var queue = [initialClosure];
    var seenKeys = new Map(); // key -> DFA state name
    var subsetToDfaName = {};
    var dfaNameToSubset = {};

    var dfaDelta = {}; // { dfaName: { symbol: dfaName } }
    var dfaFinals = new Set();
    var stepsTrace = [];

    var stateCounter = 0;
    var d0Name = 'q' + (stateCounter++);
    seenKeys.set(initialKey, d0Name);
    subsetToDfaName[initialKey] = d0Name;
    dfaNameToSubset[d0Name] = initialClosure;
    dfaDelta[d0Name] = {};

    // Check if initial state is accepting
    if (initialClosure.some(function (s) { return nfaFinalsSet.has(s); })) {
      dfaFinals.add(d0Name);
    }

    stepsTrace.push({
      step: 1,
      type: 'initial_closure',
      dfaState: d0Name,
      nfaStates: initialClosure,
      isAccepting: dfaFinals.has(d0Name),
      description: 'Initial DFA state ' + d0Name + ' = ε-closure({' + nfa.start + '}) = {' + initialClosure.join(', ') + '}'
    });

    var hasDeadState = false;
    var deadStateName = null;

    while (queue.length > 0) {
      var currentSubset = queue.shift();
      var currentKey = stateKey(currentSubset);
      var currentDfaName = seenKeys.get(currentKey);

      for (var ai = 0; ai < alphabet.length; ai++) {
        var symbol = alphabet[ai];
        var moved = move(nfa.delta, currentSubset, symbol);
        var targetClosure = epsilonClosure(nfa.delta, moved);

        if (targetClosure.length > 0) {
          var targetKey = stateKey(targetClosure);
          var targetDfaName;

          if (!seenKeys.has(targetKey)) {
            targetDfaName = 'q' + (stateCounter++);
            seenKeys.set(targetKey, targetDfaName);
            subsetToDfaName[targetKey] = targetDfaName;
            dfaNameToSubset[targetDfaName] = targetClosure;
            dfaDelta[targetDfaName] = {};
            queue.push(targetClosure);

            if (targetClosure.some(function (s) { return nfaFinalsSet.has(s); })) {
              dfaFinals.add(targetDfaName);
            }

            stepsTrace.push({
              type: 'new_state',
              from: currentDfaName,
              symbol: symbol,
              targetState: targetDfaName,
              moved: moved,
              closure: targetClosure,
              description: 'δ(' + currentDfaName + ', ' + symbol + ') → New state ' + targetDfaName + ' = ε-closure({' + moved.join(', ') + '}) = {' + targetClosure.join(', ') + '}'
            });
          } else {
            targetDfaName = seenKeys.get(targetKey);
          }

          dfaDelta[currentDfaName][symbol] = targetDfaName;
        } else {
          // Empty transition target: must route to an explicit dead/trap state for completeness
          if (!hasDeadState) {
            hasDeadState = true;
            deadStateName = 'q_dead';
            dfaDelta[deadStateName] = {};
            alphabet.forEach(function (sym) {
              dfaDelta[deadStateName][sym] = deadStateName;
            });
            dfaNameToSubset[deadStateName] = ['∅'];
          }
          dfaDelta[currentDfaName][symbol] = deadStateName;

          stepsTrace.push({
            type: 'dead_transition',
            from: currentDfaName,
            symbol: symbol,
            targetState: deadStateName,
            description: 'δ(' + currentDfaName + ', ' + symbol + ') has no moves → routes to complete dead state ' + deadStateName
          });
        }
      }
    }

    var allDfaStates = Object.keys(dfaDelta);

    // Cleanly standardize state names so q_dead becomes q[last] or keep canonical
    var dfa = {
      states: allDfaStates,
      alphabet: alphabet,
      start: d0Name,
      finals: Array.from(dfaFinals),
      delta: dfaDelta
    };

    return {
      dfa: dfa,
      steps: stepsTrace,
      nfaStateMap: dfaNameToSubset
    };
  }

  return {
    epsilonClosure: epsilonClosure,
    move: move,
    stateKey: stateKey,
    nfaToDFA: nfaToDFA
  };
});
