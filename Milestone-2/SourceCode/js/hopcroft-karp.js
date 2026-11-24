/**
 * @file hopcroft-karp.js
 * AutomataFlow — Hopcroft–Karp DFA Equivalence Algorithm.
 *
 * Implements the standard Hopcroft–Karp (1971) algorithm for testing language
 * equivalence of two Deterministic Finite Automata (DFAs) in near-linear time:
 *   O(k · n · α(n))
 * where:
 *   n = |Q₁| + |Q₂|  (total states across both DFAs)
 *   k = |Σ|          (alphabet size)
 *   α                (inverse Ackermann function)
 *
 * Employs a Disjoint Set Union (Union-Find) data structure featuring:
 *   - Full path compression in find()
 *   - Union by rank in union()
 *
 * Reconstructs the exact distinguishing counterexample and transition paths
 * directly from predecessor exploration if the DFAs recognize different languages.
 */

(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.HopcroftKarp = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* =========================================================================
     1. Disjoint Set Union (Union-Find) with Path Compression & Union-by-Rank
     ========================================================================= */

  /**
   * Union-Find data structure over a set of string element identifiers.
   * @constructor
   * @param {string[]} elements Initial universe of elements
   */
  function UnionFind(elements) {
    this.parent = {};
    this.rank = {};
    var self = this;
    if (elements && elements.length) {
      elements.forEach(function (e) {
        self.parent[e] = e;
        self.rank[e] = 0;
      });
    }
  }

  /**
   * Add a new singleton element to the partition.
   * @param {string} x
   */
  UnionFind.prototype.add = function (x) {
    if (this.parent[x] === undefined) {
      this.parent[x] = x;
      this.rank[x] = 0;
    }
  };

  /**
   * Find the representative root of element x with full path compression.
   * @param {string} x
   * @returns {string} Representative root of the equivalence class
   */
  UnionFind.prototype.find = function (x) {
    if (this.parent[x] === undefined) {
      this.add(x);
      return x;
    }
    // Iterative two-pass path compression (avoids call-stack recursion overflow)
    var root = x;
    while (this.parent[root] !== root) {
      root = this.parent[root];
    }
    var curr = x;
    while (curr !== root) {
      var next = this.parent[curr];
      this.parent[curr] = root;
      curr = next;
    }
    return root;
  };

  /**
   * Merge the sets containing x and y using union-by-rank.
   * @param {string} x
   * @param {string} y
   * @returns {boolean} True if elements were in disjoint sets and merged; false if already united.
   */
  UnionFind.prototype.union = function (x, y) {
    var rootX = this.find(x);
    var rootY = this.find(y);
    if (rootX === rootY) return false;

    // Attach tree of smaller rank under tree of higher rank
    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX]++;
    }
    return true;
  };

  /**
   * Check whether x and y belong to the same equivalence class.
   * @param {string} x
   * @param {string} y
   * @returns {boolean}
   */
  UnionFind.prototype.connected = function (x, y) {
    return this.find(x) === this.find(y);
  };

  /* =========================================================================
     2. DFA Normalization & Transition Completion
     ========================================================================= */

  /**
   * Normalize a DFA over a unified alphabet, adding an explicit dead/trap state
   * if any transition is missing or incomplete.
   * @param {Object} dfa
   * @param {string[]} unifiedAlphabet
   * @param {string} [trapName='__TRAP__']
   * @returns {Object} Complete DFA with total transition function
   */
  function normalizeDFA(dfa, unifiedAlphabet, trapName) {
    trapName = trapName || '__TRAP__';
    var states = dfa.states.slice();
    var delta = {};
    states.forEach(function (s) {
      delta[s] = Object.assign({}, dfa.delta && dfa.delta[s]);
    });

    var needsTrap = false;
    states.forEach(function (s) {
      unifiedAlphabet.forEach(function (a) {
        if (!delta[s] || delta[s][a] === undefined || delta[s][a] === '' || delta[s][a] === null) {
          needsTrap = true;
        }
      });
    });

    if (needsTrap) {
      // Pick a unique trap name not colliding with existing states
      var trap = trapName;
      var counter = 1;
      while (states.indexOf(trap) !== -1) {
        trap = trapName + '_' + (counter++);
      }
      states.push(trap);
      delta[trap] = {};
      unifiedAlphabet.forEach(function (a) { delta[trap][a] = trap; });

      states.forEach(function (s) {
        if (!delta[s]) delta[s] = {};
        unifiedAlphabet.forEach(function (a) {
          if (delta[s][a] === undefined || delta[s][a] === '' || delta[s][a] === null) {
            delta[s][a] = trap;
          }
        });
      });
    }

    return {
      states: states,
      alphabet: unifiedAlphabet.slice(),
      start: dfa.start,
      finals: (dfa.finals || []).slice(),
      delta: delta
    };
  }

  /**
   * Execute an input string on a DFA and record the full state path.
   * @param {Object} dfa Complete DFA
   * @param {string[]} symbols List of alphabet symbols
   * @returns {{ accepted: boolean, path: string[] }}
   */
  function traceString(dfa, symbols) {
    var cur = dfa.start;
    var path = [cur];
    var F = new Set(dfa.finals);
    for (var i = 0; i < symbols.length; i++) {
      var sym = symbols[i];
      if (!dfa.delta[cur] || dfa.delta[cur][sym] === undefined) {
        return { accepted: false, path: path, invalidSymbol: sym };
      }
      cur = dfa.delta[cur][sym];
      path.push(cur);
    }
    return { accepted: F.has(cur), path: path };
  }

  /* =========================================================================
     3. Hopcroft–Karp DFA Equivalence Algorithm
     ========================================================================= */

  /**
   * Determine whether two DFAs recognize exactly the same formal language
   * using the Hopcroft–Karp algorithm with Union-Find.
   *
   * @param {Object} dfa1 First DFA (e.g. Original)
   * @param {Object} dfa2 Second DFA (e.g. Minimized)
   * @param {Object} [options] Optional settings
   * @param {boolean} [options.allowAlphabetSuperset=true] Whether to unify alphabets
   * @returns {{
   *   equivalent: boolean,
   *   algorithm: string,
   *   processed_pairs: number,
   *   execution_time_ms: number,
   *   dfa1_states: number,
   *   dfa2_states: number,
   *   distinguishing_string: (string|null),
   *   symbols: (string[]|null),
   *   dfa1_accepts: (boolean|null),
   *   dfa2_accepts: (boolean|null),
   *   dfa1_path: (string[]|null),
   *   dfa2_path: (string[]|null),
   *   error?: string
   * }}
   */
  function areDFAsEquivalent(dfa1, dfa2, options) {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    options = options || {};
    var allowSuperset = options.allowAlphabetSuperset !== false;

    // Validate inputs
    if (!dfa1 || !dfa2) {
      return {
        equivalent: false,
        algorithm: 'Hopcroft–Karp',
        processed_pairs: 0,
        execution_time_ms: 0,
        dfa1_states: 0,
        dfa2_states: 0,
        distinguishing_string: null,
        error: 'Both DFAs must be provided.'
      };
    }

    var a1 = (dfa1.alphabet || []).slice().sort();
    var a2 = (dfa2.alphabet || []).slice().sort();

    // Check alphabet compatibility
    var sameAlphabet = a1.length === a2.length && a1.every(function (val, idx) { return val === a2[idx]; });
    var unifiedAlphabet;
    if (sameAlphabet) {
      unifiedAlphabet = a1.slice();
    } else if (allowSuperset) {
      unifiedAlphabet = Array.from(new Set(a1.concat(a2))).sort();
    } else {
      return {
        equivalent: false,
        algorithm: 'Hopcroft–Karp',
        processed_pairs: 0,
        execution_time_ms: 0,
        dfa1_states: dfa1.states ? dfa1.states.length : 0,
        dfa2_states: dfa2.states ? dfa2.states.length : 0,
        distinguishing_string: null,
        error: 'Alphabets are incompatible: Σ₁ = {' + a1.join(', ') + '}, Σ₂ = {' + a2.join(', ') + '}.'
      };
    }

    // Normalize and complete both DFAs (adding explicit dead/trap states if needed)
    var m1 = normalizeDFA(dfa1, unifiedAlphabet, '__TRAP1__');
    var m2 = normalizeDFA(dfa2, unifiedAlphabet, '__TRAP2__');

    var F1 = new Set(m1.finals);
    var F2 = new Set(m2.finals);

    // Disambiguate state names to prevent collisions between M1 and M2
    // State x in M1 -> "1:" + x; State y in M2 -> "2:" + y
    var allPrefixed = [];
    m1.states.forEach(function (s) { allPrefixed.push('1:' + s); });
    m2.states.forEach(function (s) { allPrefixed.push('2:' + s); });

    var uf = new UnionFind(allPrefixed);

    var start1 = '1:' + m1.start;
    var start2 = '2:' + m2.start;

    var processedPairs = 0;

    // Check base condition at initial states on empty string ε
    var acc1 = F1.has(m1.start);
    var acc2 = F2.has(m2.start);

    if (acc1 !== acc2) {
      var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var trace1 = traceString(m1, []);
      var trace2 = traceString(m2, []);
      return {
        equivalent: false,
        algorithm: 'Hopcroft–Karp',
        processed_pairs: 1,
        execution_time_ms: Math.round((t1 - t0) * 1000) / 1000,
        dfa1_states: m1.states.length,
        dfa2_states: m2.states.length,
        distinguishing_string: 'ε',
        symbols: [],
        dfa1_accepts: trace1.accepted,
        dfa2_accepts: trace2.accepted,
        dfa1_path: trace1.path,
        dfa2_path: trace2.path
      };
    }

    // Union initial states and seed the exploration queue
    uf.union(start1, start2);
    // Queue items: [prefixedU, prefixedV, arrayOfSymbolsLeadingHere]
    var queue = [[start1, start2, []]];

    var distinguishingCounterexample = null;

    while (queue.length > 0) {
      var top = queue.shift();
      processedPairs++;
      var uPrefixed = top[0];
      var vPrefixed = top[1];
      var pathToPair = top[2];

      var rawU = uPrefixed.slice(2);
      var rawV = vPrefixed.slice(2);

      // Explore corresponding transitions under every symbol in the unified alphabet
      for (var i = 0; i < unifiedAlphabet.length; i++) {
        var a = unifiedAlphabet[i];
        var nextU = m1.delta[rawU][a];
        var nextV = m2.delta[rawV][a];

        var prefNextU = '1:' + nextU;
        var prefNextV = '2:' + nextV;

        var rU = uf.find(prefNextU);
        var rV = uf.find(prefNextV);

        if (rU !== rV) {
          // Check whether one state is accepting and the other is rejecting
          var nacc1 = F1.has(nextU);
          var nacc2 = F2.has(nextV);

          if (nacc1 !== nacc2) {
            // Contradiction discovered: DFAs disagree on this input string!
            var counterSymbols = pathToPair.concat(a);
            var counterStr = counterSymbols.join('');
            if (counterStr === '') counterStr = 'ε';

            var tFail = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            var traceFail1 = traceString(m1, counterSymbols);
            var traceFail2 = traceString(m2, counterSymbols);

            return {
              equivalent: false,
              algorithm: 'Hopcroft–Karp',
              processed_pairs: processedPairs,
              execution_time_ms: Math.round((tFail - t0) * 1000) / 1000,
              dfa1_states: m1.states.length,
              dfa2_states: m2.states.length,
              distinguishing_string: counterStr,
              symbols: counterSymbols,
              dfa1_accepts: traceFail1.accepted,
              dfa2_accepts: traceFail2.accepted,
              dfa1_path: traceFail1.path,
              dfa2_path: traceFail2.path
            };
          }

          // Merge equivalence classes and enqueue corresponding pair
          uf.union(rU, rV);
          queue.push([prefNextU, prefNextV, pathToPair.concat(a)]);
        }
      }
    }

    // Queue exhausted with zero acceptance contradictions: DFAs are identical in language!
    var tEnd = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var timeTaken = Math.max(0.01, Math.round((tEnd - t0) * 1000) / 1000);

    return {
      equivalent: true,
      algorithm: 'Hopcroft–Karp',
      processed_pairs: processedPairs,
      execution_time_ms: timeTaken,
      dfa1_states: m1.states.length,
      dfa2_states: m2.states.length,
      distinguishing_string: null,
      symbols: null,
      dfa1_accepts: null,
      dfa2_accepts: null,
      dfa1_path: null,
      dfa2_path: null
    };
  }

  /* =========================================================================
     Public API
     ========================================================================= */
  return {
    UnionFind: UnionFind,
    normalizeDFA: normalizeDFA,
    traceString: traceString,
    areDFAsEquivalent: areDFAsEquivalent,
    checkEquivalence: areDFAsEquivalent
  };
});
