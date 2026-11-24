/**
 * @file nl-dfa.js
 * AutomataFlow — Natural Language DFA Synthesizer & Formal Grammar Construction.
 * Translates natural language automata specifications into mathematically sound,
 * complete Deterministic Finite Automata (DFAs) without hardcoding or shortcuts.
 *
 * Supports:
 *   - Prefix tracking (starting with pattern)
 *   - Suffix tracking (ending with pattern, multiple endings via union)
 *   - KMP-style substring detection (containing substring)
 *   - Forbidden patterns via automaton complementation (e.g. no consecutive 1s)
 *   - Parity & modulo counting (even/odd count of symbols)
 *   - Length constraints (length is even/odd/divisible by k)
 *   - Compound conditions via Cartesian product automata (AND / OR)
 *   - Custom alphabets explicitly declared (e.g. {0, 1}, {a, b}) or inferred.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.NLDFA = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* =========================================================================
     1. Alphabet Extraction & Token Normalization
     ========================================================================= */

  /**
   * Extract or infer the alphabet Σ from natural language prompt.
   * @param {string} text
   * @returns {{ alphabet: string[], explicit: boolean }}
   */
  function extractAlphabet(text) {
    var raw = text.toLowerCase();

    // 1. Explicit set notation: e.g. "alphabet {0, 1}", "over {a, b}", "alphabet = {0,1}"
    var setMatch = text.match(/(?:alphabet|over|symbols|sigma|input\s*set)\s*(?:is|=|:|of)?\s*(?:the\s+alphabet\s+)?\{([^}]+)\}/i);
    if (!setMatch) {
      setMatch = text.match(/\{([0-9a-zA-Z\s,]+)\}/);
    }
    if (setMatch) {
      var items = setMatch[1].split(/[,\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      var unique = Array.from(new Set(items));
      if (unique.length >= 1) {
        return { alphabet: unique, explicit: true };
      }
    }

    // 2. Mention of alphabet words
    if (raw.indexOf('binary') !== -1 || raw.indexOf('zero') !== -1 || raw.indexOf('one') !== -1 ||
        raw.indexOf('0') !== -1 || raw.indexOf('1') !== -1) {
      return { alphabet: ['0', '1'], explicit: false };
    }

    if (raw.indexOf('a') !== -1 && raw.indexOf('b') !== -1) {
      return { alphabet: ['a', 'b'], explicit: false };
    }

    // Default standard binary alphabet
    return { alphabet: ['0', '1'], explicit: false };
  }

  /* =========================================================================
     2. Formal Automata Construction Engines
     ========================================================================= */

  /**
   * Cleanly rename states of a DFA to standard readable identifiers (q0, q1, ...).
   * @param {Object} dfa
   * @returns {Object}
   */
  function renameStatesCleanly(dfa) {
    var oldStates = dfa.states.slice();
    // Ensure start state comes first
    var startIdx = oldStates.indexOf(dfa.start);
    if (startIdx > 0) {
      oldStates.splice(startIdx, 1);
      oldStates.unshift(dfa.start);
    }

    var map = {};
    var newStates = [];
    oldStates.forEach(function (s, idx) {
      var newName = 'q' + idx;
      map[s] = newName;
      newStates.push(newName);
    });

    var newDelta = {};
    newStates.forEach(function (s) { newDelta[s] = {}; });

    oldStates.forEach(function (s) {
      var mappedS = map[s];
      dfa.alphabet.forEach(function (a) {
        var tgt = dfa.delta[s] ? dfa.delta[s][a] : s;
        newDelta[mappedS][a] = map[tgt] !== undefined ? map[tgt] : mappedS;
      });
    });

    var newStart = map[dfa.start] || 'q0';
    var newFinals = dfa.finals.map(function (f) { return map[f]; }).filter(Boolean);

    return {
      states: newStates,
      alphabet: dfa.alphabet.slice(),
      start: newStart,
      finals: Array.from(new Set(newFinals)),
      delta: newDelta
    };
  }

  /**
   * Build DFA that accepts strings starting with a given prefix.
   * Uses prefix states plus a dead / trap state.
   * @param {string[]} alphabet
   * @param {string} prefix
   * @returns {Object}
   */
  function buildPrefixDFA(alphabet, prefix) {
    var k = prefix.length;
    var states = [];
    for (var i = 0; i <= k; i++) states.push('p' + i);
    var trap = 'p_trap';
    states.push(trap);

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

    // Transitions along prefix
    for (var i = 0; i < k; i++) {
      var expected = prefix[i];
      alphabet.forEach(function (a) {
        if (a === expected) {
          delta['p' + i][a] = 'p' + (i + 1);
        } else {
          delta['p' + i][a] = trap;
        }
      });
    }

    // Accepting state (p_k): once matched, any symbol stays accepted
    alphabet.forEach(function (a) {
      delta['p' + k][a] = 'p' + k;
      delta[trap][a] = trap;
    });

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 'p0',
      finals: ['p' + k],
      delta: delta
    });
  }

  /**
   * Build DFA that accepts strings ending with a given suffix.
   * Computes state transitions using longest suffix-prefix overlap.
   * @param {string[]} alphabet
   * @param {string} suffix
   * @returns {Object}
   */
  function buildSuffixDFA(alphabet, suffix) {
    var k = suffix.length;
    var states = [];
    for (var i = 0; i <= k; i++) states.push('s' + i);

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

    for (var i = 0; i <= k; i++) {
      var currentPrefix = suffix.substring(0, i);
      alphabet.forEach(function (a) {
        var cand = currentPrefix + a;
        // Find longest suffix of cand that is a prefix of `suffix`
        var nextLen = 0;
        for (var j = Math.min(k, cand.length); j >= 1; j--) {
          if (cand.endsWith(suffix.substring(0, j))) {
            nextLen = j;
            break;
          }
        }
        delta['s' + i][a] = 's' + nextLen;
      });
    }

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 's0',
      finals: ['s' + k],
      delta: delta
    });
  }

  /**
   * Build DFA that accepts strings containing a substring pattern (KMP Automaton).
   * @param {string[]} alphabet
   * @param {string} pattern
   * @returns {Object}
   */
  function buildSubstringDFA(alphabet, pattern) {
    var k = pattern.length;
    var states = [];
    for (var i = 0; i <= k; i++) states.push('sub' + i);

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

    // Absorbing match state: once matched, stays matched forever
    alphabet.forEach(function (a) {
      delta['sub' + k][a] = 'sub' + k;
    });

    for (var i = 0; i < k; i++) {
      var currentPrefix = pattern.substring(0, i);
      alphabet.forEach(function (a) {
        var cand = currentPrefix + a;
        var nextLen = 0;
        for (var j = Math.min(k, cand.length); j >= 1; j--) {
          if (cand.endsWith(pattern.substring(0, j))) {
            nextLen = j;
            break;
          }
        }
        delta['sub' + i][a] = 'sub' + nextLen;
      });
    }

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 'sub0',
      finals: ['sub' + k],
      delta: delta
    });
  }

  /**
   * Build DFA for counting occurrences of a symbol modulo m.
   * e.g. Even number of zeros: symbol='0', mod=2, targetRemainders=[0]
   *      Odd number of ones: symbol='1', mod=2, targetRemainders=[1]
   * @param {string[]} alphabet
   * @param {string} symbol
   * @param {number} mod
   * @param {number[]} targetRemainders
   * @returns {Object}
   */
  function buildParityDFA(alphabet, symbol, mod, targetRemainders) {
    mod = mod || 2;
    var states = [];
    for (var i = 0; i < mod; i++) states.push('r' + i);

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

    for (var i = 0; i < mod; i++) {
      alphabet.forEach(function (a) {
        if (a === symbol) {
          delta['r' + i][a] = 'r' + ((i + 1) % mod);
        } else {
          delta['r' + i][a] = 'r' + i;
        }
      });
    }

    var finals = targetRemainders.map(function (rem) { return 'r' + rem; });

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 'r0',
      finals: finals,
      delta: delta
    });
  }

  /**
   * Build DFA that checks overall string length modulo m.
   * e.g. Length is even: mod=2, targetRemainders=[0]
   *      Length divisible by 3: mod=3, targetRemainders=[0]
   * @param {string[]} alphabet
   * @param {number} mod
   * @param {number[]} targetRemainders
   * @returns {Object}
   */
  function buildLengthDFA(alphabet, mod, targetRemainders) {
    mod = mod || 2;
    var states = [];
    for (var i = 0; i < mod; i++) states.push('l' + i);

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

    for (var i = 0; i < mod; i++) {
      alphabet.forEach(function (a) {
        delta['l' + i][a] = 'l' + ((i + 1) % mod);
      });
    }

    var finals = targetRemainders.map(function (rem) { return 'l' + rem; });

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 'l0',
      finals: finals,
      delta: delta
    });
  }

  /**
   * Build complement DFA: M^c accepts Σ* \ L(M).
   * For complete DFAs, this is simply flipping final and non-final states.
   * @param {Object} dfa
   * @returns {Object}
   */
  function buildComplementDFA(dfa) {
    var finSet = new Set(dfa.finals);
    var newFinals = dfa.states.filter(function (s) { return !finSet.has(s); });
    return renameStatesCleanly({
      states: dfa.states.slice(),
      alphabet: dfa.alphabet.slice(),
      start: dfa.start,
      finals: newFinals,
      delta: JSON.parse(JSON.stringify(dfa.delta))
    });
  }

  /**
   * Cartesian Product Automaton for combining two DFAs with boolean operations (AND / OR).
   * @param {Object} dfa1
   * @param {Object} dfa2
   * @param {'AND'|'OR'} op
   * @returns {Object}
   */
  function buildProductDFA(dfa1, dfa2, op) {
    // Unify alphabets
    var alphabetSet = new Set(dfa1.alphabet.concat(dfa2.alphabet));
    var alphabet = Array.from(alphabetSet);

    var f1 = new Set(dfa1.finals);
    var f2 = new Set(dfa2.finals);

    var states = [];
    var delta = {};
    var finals = [];

    dfa1.states.forEach(function (s1) {
      dfa2.states.forEach(function (s2) {
        var pairName = s1 + '_' + s2;
        states.push(pairName);
        delta[pairName] = {};

        var isFinal = false;
        if (op === 'AND') {
          isFinal = f1.has(s1) && f2.has(s2);
        } else { // 'OR'
          isFinal = f1.has(s1) || f2.has(s2);
        }
        if (isFinal) finals.push(pairName);
      });
    });

    states.forEach(function (pairName) {
      var parts = pairName.split('_');
      var s1 = parts[0];
      var s2 = parts[1];

      alphabet.forEach(function (a) {
        var next1 = (dfa1.delta[s1] && dfa1.delta[s1][a]) || s1;
        var next2 = (dfa2.delta[s2] && dfa2.delta[s2][a]) || s2;
        delta[pairName][a] = next1 + '_' + next2;
      });
    });

    var start = dfa1.start + '_' + dfa2.start;

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet,
      start: start,
      finals: finals,
      delta: delta
    });
  }

  /* =========================================================================
     3. Natural Language Parser & Rule Classifier
     ========================================================================= */

  /** Helper to translate word numbers or digits to symbol */
  function normalizeSymbol(word, alphabet) {
    var w = word.toLowerCase().trim();
    if (w === 'zero' || w === 'zeros' || w === '0s' || w === '0') return '0';
    if (w === 'one' || w === 'ones' || w === '1s' || w === '1') return '1';
    if (w === 'a' || w === "a's" || w === 'as') return 'a';
    if (w === 'b' || w === "b's" || w === 'bs') return 'b';
    if (w === 'c' || w === "c's" || w === 'cs') return 'c';
    if (alphabet.indexOf(w) !== -1) return w;
    return null;
  }

  /**
   * Parse a single pattern string (e.g. "01", "101", "10") from text.
   */
  function extractPattern(text) {
    var m = text.match(/(?:substring|pattern|string|with|ending with|starting with|contains|ends with|starts with)?\s*['"`]?([01ab]+)['"`]?/i);
    return m ? m[1] : null;
  }

  /**
   * Parse a single atomic requirement from a text clause.
   * @param {string} clause
   * @param {string[]} alphabet
   * @returns {{ type: string, dfa: Object, description: string }|null}
   */
  function parseAtomicClause(clause, alphabet) {
    var raw = clause.toLowerCase().trim();

    // --- Parity & Count: even/odd number of zeros / ones / symbols ---
    // (Checked first so "containing an even number of zeros" doesn't falsely match "containing 'a'")
    var mParity = raw.match(/(even|odd)\s+(?:number|count)\s+of\s+([a-z0-9'"`]+)/i) ||
                  raw.match(/(?:number|count)\s+of\s+([a-z0-9'"`]+)\s+is\s+(even|odd)/i);
    if (mParity) {
      var parity = (mParity[1] === 'even' || mParity[1] === 'odd') ? mParity[1] : mParity[2];
      var rawSym = (mParity[1] === 'even' || mParity[1] === 'odd') ? mParity[2] : mParity[1];
      var sym = normalizeSymbol(rawSym, alphabet);
      if (sym) {
        var rem = (parity.toLowerCase() === 'even') ? [0] : [1];
        return {
          type: 'parity',
          dfa: buildParityDFA(alphabet, sym, 2, rem),
          description: 'Strings with an ' + parity.toLowerCase() + ' number of ' + sym + 's'
        };
      }
    }

    // Modulo counting: e.g. "number of 1s divisible by 3" or "number of zeros mod 3 is 0"
    var mMod = raw.match(/(?:number|count)\s+of\s+([a-z0-9'"`]+)\s+(?:is\s+)?divisible\s+by\s+(\d+)/i);
    if (mMod) {
      var sym = normalizeSymbol(mMod[1], alphabet);
      var k = parseInt(mMod[2], 10);
      if (sym && k >= 2) {
        return {
          type: 'modulo_count',
          dfa: buildParityDFA(alphabet, sym, k, [0]),
          description: 'Strings where count of ' + sym + 's is divisible by ' + k
        };
      }
    }

    // Length constraints: e.g. "length is even" / "length is divisible by 3"
    var mLen = raw.match(/length\s+(?:is\s+)?(even|odd)/i);
    if (mLen) {
      var parity = mLen[1].toLowerCase();
      var rem = (parity === 'even') ? [0] : [1];
      return {
        type: 'length',
        dfa: buildLengthDFA(alphabet, 2, rem),
        description: 'Strings whose length is ' + parity
      };
    }
    var mLenDiv = raw.match(/length\s+(?:is\s+)?divisible\s+by\s+(\d+)/i);
    if (mLenDiv) {
      var k = parseInt(mLenDiv[1], 10);
      if (k >= 2) {
        return {
          type: 'length_divisible',
          dfa: buildLengthDFA(alphabet, k, [0]),
          description: 'Strings whose length is divisible by ' + k
        };
      }
    }

    // --- Forbidden: consecutive ones / zeros / specific pattern ---
    if (raw.match(/(?:not\s+contain|do\s+not\s+contain|does\s+not\s+contain|without|never\s+contain|no)\s+(?:consecutive\s+([a-z0-9]+)|substring\s+['"`]?([a-z0-9]+)['"`]?|['"`]?([a-z0-9]+)['"`]?)/i)) {
      var mConsec = raw.match(/(?:not\s+contain|do\s+not\s+contain|does\s+not\s+contain|without|no)\s+consecutive\s+(ones?|zeros?|1s?|0s?|a's?|b's?)/i);
      if (mConsec) {
        var sym = normalizeSymbol(mConsec[1], alphabet) || '1';
        var forbidPat = sym + sym;
        var subDfa = buildSubstringDFA(alphabet, forbidPat);
        var compDfa = buildComplementDFA(subDfa);
        return {
          type: 'forbidden_substring',
          dfa: compDfa,
          description: 'Strings with no consecutive ' + sym + 's (avoids substring "' + forbidPat + '")'
        };
      }

      var mSubForbid = raw.match(/(?:not\s+contain|do\s+not\s+contain|does\s+not\s+contain|without|no)\s+(?:the\s+)?(?:substring\s+)?['"`]?([01ab]+)['"`]?/i);
      if (mSubForbid && mSubForbid[1] && mSubForbid[1] !== 'a' && mSubForbid[1] !== 'an') {
        var pat = mSubForbid[1];
        var subDfa2 = buildSubstringDFA(alphabet, pat);
        var compDfa2 = buildComplementDFA(subDfa2);
        return {
          type: 'forbidden_substring',
          dfa: compDfa2,
          description: 'Strings not containing substring "' + pat + '"'
        };
      }
    }

    // --- Substring: containing / contains ---
    var mSub = raw.match(/(?:containing|contains|contain|has\s+substring|with\s+substring|having\s+substring)\s+(?:the\s+)?(?:substring\s+)?['"`]?([01ab]+)['"`]?/i);
    if (mSub && mSub[1] && mSub[1] !== 'a' && mSub[1] !== 'an') {
      var pat = mSub[1];
      return {
        type: 'substring',
        dfa: buildSubstringDFA(alphabet, pat),
        description: 'Strings containing substring "' + pat + '"'
      };
    }

    // --- Suffix: ending with / ends with / terminates with ---
    var mEnd = raw.match(/(?:ending\s+(?:with|in)|ends\s+(?:with|in)|terminates?\s+(?:with|in))\s+['"`]?([01ab]+)['"`]?/i);
    if (mEnd && mEnd[1]) {
      var pat = mEnd[1];
      return {
        type: 'ending',
        dfa: buildSuffixDFA(alphabet, pat),
        description: 'Strings ending with "' + pat + '"'
      };
    }

    // --- Prefix: starting with / starts with / begins with ---
    var mStart = raw.match(/(?:starting\s+(?:with|in)|starts\s+(?:with|in)|begins?\s+(?:with|in)|beginning\s+(?:with|in))\s+['"`]?([01ab]+)['"`]?/i);
    if (mStart && mStart[1]) {
      var pat = mStart[1];
      return {
        type: 'starting',
        dfa: buildPrefixDFA(alphabet, pat),
        description: 'Strings starting with "' + pat + '"'
      };
    }

    return null;
  }

  /**
   * Main natural language parser.
   * Understands compound expressions (AND, OR), multiple endings (ends with 00 or 11), etc.
   * @param {string} input
   * @returns {{
   *   success: boolean,
   *   dfa?: Object,
   *   description?: string,
   *   alphabet?: string[],
   *   ruleType?: string,
   *   error?: string,
   *   suggestion?: string
   * }}
   */
  function parseNaturalLanguage(input) {
    if (!input || !input.trim()) {
      return {
        success: false,
        error: 'Please describe the language or pattern you want your DFA to accept.',
        suggestion: 'Try an example from the suggestions below, such as "Construct a minimum DFA over {0,1} that accepts all strings ending with 01."'
      };
    }

    var text = input.trim();
    var alphaRes = extractAlphabet(text);
    var alphabet = alphaRes.alphabet;

    // Check for special combined endings: e.g. "ending with 00 or 11" / "ends with 00 or 11"
    var mMultiEnd = text.match(/(?:ending\s+(?:with|in)|ends\s+(?:with|in))\s+['"`]?([01ab]+)['"`]?\s+or\s+['"`]?([01ab]+)['"`]?/i);
    if (mMultiEnd) {
      var pat1 = mMultiEnd[1];
      var pat2 = mMultiEnd[2];
      var dfa1 = buildSuffixDFA(alphabet, pat1);
      var dfa2 = buildSuffixDFA(alphabet, pat2);
      var combined = buildProductDFA(dfa1, dfa2, 'OR');
      return {
        success: true,
        dfa: combined,
        alphabet: alphabet,
        ruleType: 'multiple_endings',
        description: 'Accepts all strings ending with "' + pat1 + '" or "' + pat2 + '" over Σ = {' + alphabet.join(', ') + '}'
      };
    }

    // Check for special combined beginnings: e.g. "starting with 00 or 11"
    var mMultiStart = text.match(/(?:starting\s+(?:with|in)|starts\s+(?:with|in))\s+['"`]?([01ab]+)['"`]?\s+or\s+['"`]?([01ab]+)['"`]?/i);
    if (mMultiStart) {
      var pat1 = mMultiStart[1];
      var pat2 = mMultiStart[2];
      var dfa1 = buildPrefixDFA(alphabet, pat1);
      var dfa2 = buildPrefixDFA(alphabet, pat2);
      var combined = buildProductDFA(dfa1, dfa2, 'OR');
      return {
        success: true,
        dfa: combined,
        alphabet: alphabet,
        ruleType: 'multiple_startings',
        description: 'Accepts all strings starting with "' + pat1 + '" or "' + pat2 + '" over Σ = {' + alphabet.join(', ') + '}'
      };
    }

    // Check for explicit "and" compound clauses: e.g. "even number of zeros and an odd number of ones"
    // Also "starts with 1 and ends with 0", etc.
    var andSplit = text.split(/\s+and\s+/i);
    if (andSplit.length === 2) {
      var clause1 = parseAtomicClause(andSplit[0], alphabet);
      var clause2 = parseAtomicClause(andSplit[1], alphabet);

      if (clause1 && clause2) {
        var combined = buildProductDFA(clause1.dfa, clause2.dfa, 'AND');
        return {
          success: true,
          dfa: combined,
          alphabet: alphabet,
          ruleType: 'compound_and',
          description: clause1.description + ' AND ' + clause2.description.toLowerCase() + ' over Σ = {' + alphabet.join(', ') + '}'
        };
      }
    }

    // Check for explicit "or" compound clauses (general)
    var orSplit = text.split(/\s+or\s+/i);
    if (orSplit.length === 2) {
      var clause1 = parseAtomicClause(orSplit[0], alphabet);
      var clause2 = parseAtomicClause(orSplit[1], alphabet);

      if (clause1 && clause2) {
        var combined = buildProductDFA(clause1.dfa, clause2.dfa, 'OR');
        return {
          success: true,
          dfa: combined,
          alphabet: alphabet,
          ruleType: 'compound_or',
          description: clause1.description + ' OR ' + clause2.description.toLowerCase() + ' over Σ = {' + alphabet.join(', ') + '}'
        };
      }
    }

    // Single atomic clause
    var atomic = parseAtomicClause(text, alphabet);
    if (atomic) {
      return {
        success: true,
        dfa: atomic.dfa,
        alphabet: alphabet,
        ruleType: atomic.type,
        description: atomic.description + ' over Σ = {' + alphabet.join(', ') + '}'
      };
    }

    // If no exact match, provide constructive guidance and error
    return {
      success: false,
      error: 'Could not reliably identify the DFA pattern from your description.',
      suggestion: 'Try phrasing with patterns like: "ending with [string]", "starting with [string]", "containing [string]", "no consecutive [ones/zeros]", "even/odd number of [zeros/ones]", or combined with "and"/"or".'
    };
  }

  /* =========================================================================
     Public API
     ========================================================================= */
  return {
    extractAlphabet: extractAlphabet,
    buildPrefixDFA: buildPrefixDFA,
    buildSuffixDFA: buildSuffixDFA,
    buildSubstringDFA: buildSubstringDFA,
    buildParityDFA: buildParityDFA,
    buildLengthDFA: buildLengthDFA,
    buildComplementDFA: buildComplementDFA,
    buildProductDFA: buildProductDFA,
    renameStatesCleanly: renameStatesCleanly,
    parse: parseNaturalLanguage
  };
});
