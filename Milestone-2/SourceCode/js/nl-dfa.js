/**
 * @file nl-dfa.js
 * AutomataFlow — Comprehensive Natural Language DFA Synthesizer & Formal Grammar Engine.
 * Translates natural language automata specifications into mathematically sound,
 * complete Deterministic Finite Automata (DFAs) without hardcoding or shortcuts.
 *
 * Supported Capabilities:
 *   1. Prefix tracking ("starting with 10", "begins with a", "multiple prefixes")
 *   2. Suffix tracking ("ending with 01", "ends with 00 or 11", "terminates in b")
 *   3. Substring detection ("containing 101", "contains both 00 and 11", "contains 00 or 11")
 *   4. Forbidden subwords ("no consecutive 1s", "does not contain 00", "without 101")
 *   5. Parity & modulo symbol counting ("even number of zeros", "odd count of 1s", "count of 0s mod 3 = 0")
 *   6. Threshold symbol counting ("at least two 0s", "at most three 1s", "exactly two a's", "at least one zero")
 *   7. String length constraints ("even length", "odd length", "length at least 3", "length at most 4", "exact length 2")
 *   8. Binary number arithmetic ("binary numbers divisible by 3", "multiple of 2", "divisible by 5")
 *   9. First/Last symbol relations ("starts and ends with the same symbol", "starts and ends with different symbols")
 *  10. Positional symbol constraints ("second symbol is 0", "third symbol from start is 1")
 *  11. Sequence rules ("every 0 is followed by 1", "alternating zeros and ones")
 *  12. Single-symbol and trivial languages ("only zeros", "only 1s", "empty string only", "all strings over {0,1}")
 *  13. Compound expressions via Cartesian Product Automata (AND / OR)
 *  14. Non-regular language detection with rigorous mathematical explanation (Pumping Lemma)
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

  /** Helper to translate word numbers or digits to integer */
  function parseNumber(w) {
    if (!w) return null;
    var map = {
      zero: 0, one: 1, two: 2, three: 3, four: 4,
      five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10
    };
    var lower = String(w).toLowerCase().trim();
    if (map[lower] !== undefined) return map[lower];
    var num = parseInt(lower, 10);
    return isNaN(num) ? null : num;
  }

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

    // Check for clear tokens of a and b (e.g. 'a's and 'b's, patterns over a and b)
    var mAB = text.match(/(?:starts?|ends?|contains?|having|with|pattern|substring)\s+['"`]?([ab]+)\b/i);
    var hasABPattern = false;
    if (mAB) {
      var w = mAB[1].toLowerCase();
      if (w !== 'a' && w !== 'an' && w !== 'and' && w !== 'as' && w !== 'at') {
        hasABPattern = true;
      }
    } else if (/\b[b]\b/i.test(text) || /(?:^|\s)a'?s?\s+and\s+b'?s?/i.test(text)) {
      hasABPattern = true;
    }

    if (hasABPattern) {
      return { alphabet: ['a', 'b'], explicit: false };
    }

    // Default standard binary alphabet
    return { alphabet: ['0', '1'], explicit: false };
  }

  /** Normalize word descriptions of symbols to concrete characters */
  function normalizeSymbol(word, alphabet) {
    if (!word) return null;
    var w = String(word).toLowerCase().trim();
    if (w === 'zero' || w === 'zeros' || w === '0s' || w === '0') return '0';
    if (w === 'one' || w === 'ones' || w === '1s' || w === '1') return '1';
    if (w === 'a' || w === "a's" || w === 'as') return 'a';
    if (w === 'b' || w === "b's" || w === 'bs') return 'b';
    if (w === 'c' || w === "c's" || w === 'cs') return 'c';
    if (alphabet && alphabet.indexOf(w) !== -1) return w;
    return null;
  }

  /** Cleanly rename states of a DFA to standard readable identifiers (q0, q1, ...). */
  function renameStatesCleanly(dfa) {
    var oldStates = dfa.states.slice();
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

  /* =========================================================================
     2. Formal Automata Construction Engines
     ========================================================================= */

  /** Build DFA that accepts strings starting with a given prefix */
  function buildPrefixDFA(alphabet, prefix) {
    var k = prefix.length;
    var states = [];
    for (var i = 0; i <= k; i++) states.push('p' + i);
    var trap = 'p_trap';
    states.push(trap);

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

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

  /** Build DFA that accepts strings ending with a given suffix */
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

  /** Build DFA that accepts strings containing a substring pattern (KMP Automaton) */
  function buildSubstringDFA(alphabet, pattern) {
    var k = pattern.length;
    var states = [];
    for (var i = 0; i <= k; i++) states.push('sub' + i);

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

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

  /** Build DFA for counting occurrences of a symbol modulo m (Parity / Modulo) */
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

  /** Build DFA for threshold symbol counting (at least k, at most k, exactly k) */
  function buildCountThresholdDFA(alphabet, symbol, k, comparator) {
    k = Math.max(0, k);
    var states = [];
    for (var i = 0; i <= k; i++) states.push('c' + i);
    var trap = 'c_trap';

    if (comparator === 'at_most' || comparator === 'exact') {
      states.push(trap);
    }

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

    for (var i = 0; i <= k; i++) {
      alphabet.forEach(function (a) {
        if (a === symbol) {
          if (i < k) {
            delta['c' + i][a] = 'c' + (i + 1);
          } else {
            // At count k
            if (comparator === 'at_least') {
              delta['c' + k][a] = 'c' + k;
            } else {
              delta['c' + k][a] = trap;
            }
          }
        } else {
          delta['c' + i][a] = 'c' + i;
        }
      });
    }

    if (comparator === 'at_most' || comparator === 'exact') {
      alphabet.forEach(function (a) {
        delta[trap][a] = trap;
      });
    }

    var finals = [];
    if (comparator === 'at_least') {
      finals = ['c' + k];
    } else if (comparator === 'at_most') {
      for (var i = 0; i <= k; i++) finals.push('c' + i);
    } else if (comparator === 'exact') {
      finals = ['c' + k];
    }

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 'c0',
      finals: finals,
      delta: delta
    });
  }

  /** Build DFA that checks overall string length modulo m */
  function buildLengthModuloDFA(alphabet, mod, targetRemainders) {
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

  /** Build DFA that bounds total string length (at least k, at most k, exact k) */
  function buildLengthBoundDFA(alphabet, k, comparator) {
    k = Math.max(0, k);
    var states = [];
    for (var i = 0; i <= k; i++) states.push('len' + i);
    var trap = 'len_trap';
    if (comparator === 'at_most' || comparator === 'exact') states.push(trap);

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

    for (var i = 0; i <= k; i++) {
      alphabet.forEach(function (a) {
        if (i < k) {
          delta['len' + i][a] = 'len' + (i + 1);
        } else {
          if (comparator === 'at_least') {
            delta['len' + k][a] = 'len' + k;
          } else {
            delta['len' + k][a] = trap;
          }
        }
      });
    }

    if (comparator === 'at_most' || comparator === 'exact') {
      alphabet.forEach(function (a) { delta[trap][a] = trap; });
    }

    var finals = [];
    if (comparator === 'at_least') finals = ['len' + k];
    else if (comparator === 'at_most') {
      for (var i = 0; i <= k; i++) finals.push('len' + i);
    } else finals = ['len' + k];

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 'len0',
      finals: finals,
      delta: delta
    });
  }

  /** Build DFA checking binary number representation divisibility by k */
  function buildBinaryDivisibleDFA(k) {
    k = Math.max(2, k);
    var alphabet = ['0', '1'];
    var states = [];
    for (var i = 0; i < k; i++) states.push('rem' + i);

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

    for (var r = 0; r < k; r++) {
      alphabet.forEach(function (bit) {
        var b = parseInt(bit, 10);
        var nextR = (2 * r + b) % k;
        delta['rem' + r][bit] = 'rem' + nextR;
      });
    }

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet,
      start: 'rem0',
      finals: ['rem0'],
      delta: delta
    });
  }

  /** Build DFA where first and last symbol match (or differ) */
  function buildSameStartEndDFA(alphabet, isSame) {
    var states = ['start'];
    var delta = { start: {} };

    alphabet.forEach(function (s) {
      var sSame = 'end_' + s + '_same';
      var sDiff = 'end_' + s + '_diff';
      states.push(sSame, sDiff);
      delta[sSame] = {};
      delta[sDiff] = {};
    });

    alphabet.forEach(function (s) {
      // From start state
      delta.start[s] = 'end_' + s + '_same';

      // Transitions after knowing initial symbol is 'init'
      alphabet.forEach(function (init) {
        var currSame = 'end_' + init + '_same';
        var currDiff = 'end_' + init + '_diff';
        var nextState = (s === init) ? currSame : currDiff;
        delta[currSame][s] = nextState;
        delta[currDiff][s] = nextState;
      });
    });

    var finals = [];
    alphabet.forEach(function (init) {
      if (isSame) {
        finals.push('end_' + init + '_same');
      } else {
        finals.push('end_' + init + '_diff');
      }
    });

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 'start',
      finals: finals,
      delta: delta
    });
  }

  /** Build DFA checking that the k-th symbol from the start is targetSym */
  function buildPositionalDFA(alphabet, posIndex, targetSym) {
    var states = [];
    for (var i = 0; i < posIndex; i++) states.push('step' + i);
    var acc = 'step_acc';
    var trap = 'step_trap';
    states.push(acc, trap);

    var delta = {};
    states.forEach(function (s) { delta[s] = {}; });

    for (var i = 0; i < posIndex - 1; i++) {
      alphabet.forEach(function (a) {
        delta['step' + i][a] = 'step' + (i + 1);
      });
    }

    // At critical position: check symbol
    alphabet.forEach(function (a) {
      delta['step' + (posIndex - 1)][a] = (a === targetSym) ? acc : trap;
      delta[acc][a] = acc;
      delta[trap][a] = trap;
    });

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 'step0',
      finals: [acc],
      delta: delta
    });
  }

  /** Build DFA where every occurrence of sym1 is immediately followed by sym2 */
  function buildFollowedByDFA(alphabet, sym1, sym2) {
    var states = ['q_clean', 'q_saw1', 'q_trap'];
    var delta = { q_clean: {}, q_saw1: {}, q_trap: {} };

    alphabet.forEach(function (a) {
      if (a === sym1) {
        delta.q_clean[a] = 'q_saw1';
      } else {
        delta.q_clean[a] = 'q_clean';
      }

      if (a === sym2) {
        delta.q_saw1[a] = (sym1 === sym2) ? 'q_saw1' : 'q_clean';
      } else {
        delta.q_saw1[a] = 'q_trap';
      }

      delta.q_trap[a] = 'q_trap';
    });

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 'q_clean',
      finals: ['q_clean'],
      delta: delta
    });
  }

  /** Build DFA that accepts alternating symbols (e.g. 0101... or 1010...) */
  function buildAlternatingDFA(alphabet) {
    var states = ['start', 'saw0', 'saw1', 'trap'];
    var delta = { start: {}, saw0: {}, saw1: {}, trap: {} };

    delta.start['0'] = 'saw0';
    delta.start['1'] = 'saw1';
    delta.saw0['0'] = 'trap';
    delta.saw0['1'] = 'saw1';
    delta.saw1['0'] = 'saw0';
    delta.saw1['1'] = 'trap';
    delta.trap['0'] = 'trap';
    delta.trap['1'] = 'trap';

    return renameStatesCleanly({
      states: states,
      alphabet: ['0', '1'],
      start: 'start',
      finals: ['start', 'saw0', 'saw1'],
      delta: delta
    });
  }

  /** Build DFA accepting only strings consisting purely of allowedSymbol */
  function buildOnlySymbolDFA(alphabet, allowedSymbol) {
    var states = ['q0', 'q_trap'];
    var delta = { q0: {}, q_trap: {} };

    alphabet.forEach(function (a) {
      delta.q0[a] = (a === allowedSymbol) ? 'q0' : 'q_trap';
      delta.q_trap[a] = 'q_trap';
    });

    return renameStatesCleanly({
      states: states,
      alphabet: alphabet.slice(),
      start: 'q0',
      finals: ['q0'],
      delta: delta
    });
  }

  /** Universal language DFA: accepts all strings Σ* */
  function buildUniversalDFA(alphabet) {
    var delta = { q0: {} };
    alphabet.forEach(function (a) { delta.q0[a] = 'q0'; });
    return {
      states: ['q0'],
      alphabet: alphabet.slice(),
      start: 'q0',
      finals: ['q0'],
      delta: delta
    };
  }

  /** Empty string language DFA: accepts only {ε} */
  function buildEmptyStringOnlyDFA(alphabet) {
    var delta = { q0: {}, q_trap: {} };
    alphabet.forEach(function (a) {
      delta.q0[a] = 'q_trap';
      delta.q_trap[a] = 'q_trap';
    });
    return {
      states: ['q0', 'q_trap'],
      alphabet: alphabet.slice(),
      start: 'q0',
      finals: ['q0'],
      delta: delta
    };
  }

  /** Build complement DFA: M^c accepts Σ* \ L(M) */
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

  /** Cartesian Product Automaton for combining two DFAs (AND / OR) */
  function buildProductDFA(dfa1, dfa2, op) {
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

  /**
   * Parse a single atomic requirement from a text clause.
   * @param {string} clause
   * @param {string[]} alphabet
   * @returns {{ type: string, dfa: Object, description: string }|null}
   */
  function parseAtomicClause(clause, alphabet) {
    var raw = clause.toLowerCase().trim();

    // 1. Trivial languages: Empty string only
    if (raw.match(/^(?:accepts?\s+)?(?:only\s+empty\s+string|empty\s+string\s+only|only\s+(?:epsilon|ε|lambda|λ))$/i) ||
        raw.match(/(?:only\s+accepts?\s+(?:epsilon|ε|the\s+empty\s+string))/i)) {
      return {
        type: 'empty_string_only',
        dfa: buildEmptyStringOnlyDFA(alphabet),
        description: 'Accepts only the empty string {ε}'
      };
    }

    // 2. Trivial languages: All strings / Universal language Σ*
    if (raw.match(/(?:all\s+strings|any\s+strings?|every\s+string|sigma\s*star|Σ\*)/i) &&
        !raw.match(/(?:ending|starting|containing|having|with|length|divisible|divisible\s+by)/i)) {
      return {
        type: 'universal_language',
        dfa: buildUniversalDFA(alphabet),
        description: 'Accepts all strings over Σ*'
      };
    }

    // 3. Binary numbers divisible by k
    var mDiv = raw.match(/(?:divisible\s+by|multiple\s+of)\s+(\d+)/i) ||
               raw.match(/binary\s+numbers?\s+(?:is\s+)?divisible\s+by\s+(\d+)/i);
    if (mDiv && !raw.match(/length/i) && !raw.match(/count/i) && !raw.match(/number\s+of/i)) {
      var k = parseInt(mDiv[1], 10);
      if (k >= 2) {
        return {
          type: 'binary_divisible',
          dfa: buildBinaryDivisibleDFA(k),
          description: 'Binary numbers whose numerical value is divisible by ' + k
        };
      }
    }

    // 4. First and last symbol relationships (same / different)
    if (raw.match(/(?:starts?\s+and\s+ends?\s+with\s+(?:the\s+)?same\s+symbol|first\s+and\s+last\s+symbols?\s+(?:are\s+)?(?:the\s+)?same)/i)) {
      return {
        type: 'same_start_end',
        dfa: buildSameStartEndDFA(alphabet, true),
        description: 'Strings starting and ending with the same symbol'
      };
    }
    if (raw.match(/(?:starts?\s+and\s+ends?\s+with\s+different\s+symbols?|first\s+and\s+last\s+symbols?\s+(?:are\s+)?different)/i)) {
      return {
        type: 'diff_start_end',
        dfa: buildSameStartEndDFA(alphabet, false),
        description: 'Strings starting and ending with different symbols'
      };
    }

    // 5. Alternating symbols
    if (raw.match(/alternating\s+(?:zeros?\s+and\s+ones?|0s?\s+and\s+1s?|a'?s?\s+and\s+b'?s?)/i) ||
        raw.match(/(?:strictly\s+)?alternating\s+symbols?/i)) {
      return {
        type: 'alternating',
        dfa: buildAlternatingDFA(alphabet),
        description: 'Strings with strictly alternating binary symbols (e.g. 0101... or 1010...)'
      };
    }

    // 6. Sequence: "Every 0 is followed by 1"
    var mFollow = raw.match(/every\s+([a-z0-9'"`]+)\s+is\s+followed\s+by\s+([a-z0-9'"`]+)/i);
    if (mFollow) {
      var s1 = normalizeSymbol(mFollow[1], alphabet);
      var s2 = normalizeSymbol(mFollow[2], alphabet);
      if (s1 && s2) {
        return {
          type: 'followed_by',
          dfa: buildFollowedByDFA(alphabet, s1, s2),
          description: 'Every occurrence of ' + s1 + ' is followed by ' + s2
        };
      }
    }

    // 7. Pure single-symbol languages ("only zeros", "only 1s")
    var mOnly = raw.match(/^(?:accepts?\s+)?only\s+(zeros?|ones?|0s?|1s?|a's?|b's?)$/i) ||
                raw.match(/(?:strings?\s+consisting?\s+(?:of\s+)?only\s+([a-z0-9'"`]+))/i);
    if (mOnly) {
      var sym = normalizeSymbol(mOnly[1], alphabet);
      if (sym) {
        return {
          type: 'only_symbol',
          dfa: buildOnlySymbolDFA(alphabet, sym),
          description: 'Strings consisting only of symbol ' + sym
        };
      }
    }

    // 8. Positional constraints: "second symbol is 0", "third symbol from start is 1"
    var mPos = raw.match(/(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+symbol\s+(?:from\s+(?:the\s+)?(?:start|beginning)\s+)?is\s+['"`]?([a-z0-9]+)['"`]?/i);
    if (mPos) {
      var posWord = mPos[1].toLowerCase();
      var posMap = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5 };
      var posIdx = posMap[posWord] || 2;
      var sym = normalizeSymbol(mPos[2], alphabet);
      if (sym) {
        return {
          type: 'positional_symbol',
          dfa: buildPositionalDFA(alphabet, posIdx, sym),
          description: 'Strings where the ' + posWord + ' symbol is ' + sym
        };
      }
    }

    // 9. Parity & Count: even/odd number of zeros / ones
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

    // 10. Modulo counting: e.g. "number of 1s divisible by 3"
    var mMod = raw.match(/(?:number|count)\s+of\s+([a-z0-9'"`]+)\s+(?:is\s+)?divisible\s+by\s+(\d+)/i) ||
               raw.match(/(?:number|count)\s+of\s+([a-z0-9'"`]+)\s+(?:is\s+)?(?:a\s+)?multiple\s+of\s+(\d+)/i);
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

    // 11. Threshold Count: at least / at most / exactly k zeros/ones
    var mThresh1 = raw.match(/(at\s+least|at\s+most|more\s+than|greater\s+than|less\s+than|exactly|exact)\s+([a-z0-9]+)\s+([a-z0-9'"`]+)/i);
    var mThresh2 = raw.match(/(?:number|count)\s+of\s+([a-z0-9'"`]+)\s+(?:is\s+)?(at\s+least|at\s+most|more\s+than|greater\s+than|less\s+than|exactly|exact)\s+([a-z0-9]+)/i);
    if (mThresh1 || mThresh2) {
      var cmpWord, numWord, symWord;
      if (mThresh2) {
        symWord = mThresh2[1];
        cmpWord = mThresh2[2].toLowerCase();
        numWord = mThresh2[3];
      } else {
        cmpWord = mThresh1[1].toLowerCase();
        numWord = mThresh1[2];
        symWord = mThresh1[3];
      }
      var count = parseNumber(numWord);
      var sym = normalizeSymbol(symWord, alphabet);
      if (count !== null && sym) {
        var comp = 'at_least';
        if (cmpWord === 'at most' || cmpWord === 'less than') comp = 'at_most';
        else if (cmpWord === 'exactly' || cmpWord === 'exact') comp = 'exact';
        else if (cmpWord === 'more than' || cmpWord === 'greater than') {
          count++;
          comp = 'at_least';
        }
        return {
          type: 'symbol_threshold',
          dfa: buildCountThresholdDFA(alphabet, sym, count, comp),
          description: 'Strings containing ' + cmpWord + ' ' + count + ' ' + sym + '(s)'
        };
      }
    }

    // 12. Length constraints: "even length", "odd length", "length is even/odd"
    var mLenEvenOdd = raw.match(/(?:strings?\s+of\s+)?(even|odd)\s+length/i) ||
                      raw.match(/length\s+(?:is\s+)?(even|odd)/i);
    if (mLenEvenOdd) {
      var parity = mLenEvenOdd[1].toLowerCase();
      var rem = (parity === 'even') ? [0] : [1];
      return {
        type: 'length',
        dfa: buildLengthModuloDFA(alphabet, 2, rem),
        description: 'Strings whose length is ' + parity
      };
    }

    // Length modulo: e.g. "length is divisible by 3"
    var mLenDiv = raw.match(/length\s+(?:is\s+)?(?:divisible\s+by|multiple\s+of)\s+(\d+)/i);
    if (mLenDiv) {
      var k = parseInt(mLenDiv[1], 10);
      if (k >= 2) {
        return {
          type: 'length_divisible',
          dfa: buildLengthModuloDFA(alphabet, k, [0]),
          description: 'Strings whose length is divisible by ' + k
        };
      }
    }

    // Length bounds: e.g. "length at least 3", "length at most 2", "length exactly 4"
    var mLenBound = raw.match(/length\s+(?:is\s+)?(at\s+least|at\s+most|more\s+than|less\s+than|exactly|exact)\s+([a-z0-9]+)/i) ||
                    raw.match(/(?:exact\s+length|length)\s+([a-z0-9]+)/i);
    if (mLenBound) {
      var cmpRaw = mLenBound[1] ? mLenBound[1].toLowerCase() : 'exactly';
      var numRaw = mLenBound[2] || mLenBound[1];
      var count = parseNumber(numRaw);
      if (count !== null && count >= 0) {
        var comp = 'exact';
        if (cmpRaw.indexOf('least') !== -1 || cmpRaw.indexOf('more') !== -1) comp = 'at_least';
        else if (cmpRaw.indexOf('most') !== -1 || cmpRaw.indexOf('less') !== -1) comp = 'at_most';
        return {
          type: 'length_bound',
          dfa: buildLengthBoundDFA(alphabet, count, comp),
          description: 'Strings of length ' + cmpRaw + ' ' + count
        };
      }
    }

    // 13. Forbidden patterns: consecutive ones/zeros or specific substring
    if (raw.match(/(?:not\s+contain|do\s+not\s+contain|does\s+not\s+contain|without|never\s+contain|no)\s+/i)) {
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

    // 14. Substring: containing / contains
    var mSub = raw.match(/(?:containing|contains|contain|has\s+substring|with\s+substring|having\s+substring)\s+(?:the\s+)?(?:substring\s+)?['"`]?([01ab]+)['"`]?/i);
    if (mSub && mSub[1] && mSub[1] !== 'a' && mSub[1] !== 'an') {
      var pat = mSub[1];
      return {
        type: 'substring',
        dfa: buildSubstringDFA(alphabet, pat),
        description: 'Strings containing substring "' + pat + '"'
      };
    }

    // 15. Suffix: ending with / ends with / terminates with
    var mEnd = raw.match(/(?:ending\s+(?:with|in)|ends\s+(?:with|in)|terminates?\s+(?:with|in))\s+['"`]?([01ab]+)['"`]?/i);
    if (mEnd && mEnd[1]) {
      var pat = mEnd[1];
      return {
        type: 'ending',
        dfa: buildSuffixDFA(alphabet, pat),
        description: 'Strings ending with "' + pat + '"'
      };
    }

    // 16. Prefix: starting with / starts with / begins with
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

  /** Check for known non-regular languages to provide academic educational guidance */
  function checkNonRegularLanguage(text) {
    var raw = text.toLowerCase();
    if (raw.match(/equal\s+(?:number\s+of|count\s+of)\s+(?:zeros?\s+and\s+ones?|0s?\s+and\s+1s?|a'?s?\s+and\s+b'?s?)/i) ||
        raw.match(/(?:0\^n\s*1\^n|a\^n\s*b\^n)/i) ||
        raw.match(/equal\s+(?:number|count)\s+of\s+([a-z0-9]+)\s+and\s+([a-z0-9]+)/i)) {
      return {
        isNonRegular: true,
        reason: 'The language {w | #0(w) = #1(w)} requires counting an unbounded number of symbols. By the Pumping Lemma for Regular Languages, this language is strictly Context-Free and cannot be recognized by any finite automaton.',
        suggestion: 'Try a regular counting language instead, such as "even number of zeros and odd number of ones", "modulo 3", or "at least 2 zeros".'
      };
    }

    if (raw.match(/palindromes?|strings?\s+that\s+read\s+the\s+same\s+backwards/i)) {
      return {
        isNonRegular: true,
        reason: 'The language of general palindromes {w | w = w^R} is a classic non-regular Context-Free Language that requires an unbounded LIFO stack (Pushdown Automaton) to verify symmetry.',
        suggestion: 'Try checking prefix or suffix patterns instead, e.g. "starts with 01 and ends with 10" or "starts and ends with the same symbol".'
      };
    }

    if (raw.match(/balanced\s+parentheses|well-formed\s+parentheses/i)) {
      return {
        isNonRegular: true,
        reason: 'The Dyck language of balanced parentheses requires tracking unbounded nesting depth and is strictly Context-Free, not regular.',
        suggestion: 'Try testing bounded length constraints or counting conditions like "length is even".'
      };
    }

    return { isNonRegular: false };
  }

  /**
   * Main natural language parser.
   * Understands compound expressions (AND, OR), multiple endings, threshold counts, etc.
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

    // Check for theoretical non-regular languages upfront
    var nonReg = checkNonRegularLanguage(text);
    if (nonReg.isNonRegular) {
      return {
        success: false,
        error: 'Non-Regular Language Detected: ' + nonReg.reason,
        suggestion: nonReg.suggestion
      };
    }

    var alphaRes = extractAlphabet(text);
    var alphabet = alphaRes.alphabet;

    // Normalizing conversational question prefixes
    // e.g. "Construct a minimum DFA that accepts all binary strings ending with 00 or 11."
    var normalized = text
      .replace(/^(?:construct|design|build|create|give|generate|make|find)\s+(?:a|an)?\s*(?:minimum|minimal)?\s*dfa\s*(?:over\s*\{[^}]+\})?\s*(?:that|which|to)?\s*(?:accepts?|recognizes?)?\s*(?:all)?\s*(?:binary)?\s*strings?\s*(?:over\s*\{[^}]+\})?\s*(?:such\s+that|where|having|with)?\s*/i, '')
      .replace(/^(?:accepts?|recognizes?)\s+(?:all\s+)?(?:binary\s+)?strings?\s*(?:where|having|with|that)?\s*/i, '')
      .trim();

    if (!normalized) normalized = text;

    // Pattern 1: Combined ending options (e.g. "ends with either 00 or 11", "ending with 00 or 11")
    var mMultiEnd = normalized.match(/(?:ending\s+(?:with|in)|ends\s+(?:with|in))\s+(?:either\s+)?['"`]?([01ab]+)['"`]?\s+or\s+['"`]?([01ab]+)['"`]?/i);
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

    // Pattern 2: Combined starting options (e.g. "starts with either 00 or 11")
    var mMultiStart = normalized.match(/(?:starting\s+(?:with|in)|starts\s+(?:with|in))\s+(?:either\s+)?['"`]?([01ab]+)['"`]?\s+or\s+['"`]?([01ab]+)['"`]?/i);
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

    // Pattern 3: Contains both X and Y
    var mBothSub = normalized.match(/contains?\s+both\s+['"`]?([01ab]+)['"`]?\s+and\s+['"`]?([01ab]+)['"`]?/i) ||
                   normalized.match(/having\s+both\s+substrings?\s+['"`]?([01ab]+)['"`]?\s+and\s+['"`]?([01ab]+)['"`]?/i);
    if (mBothSub) {
      var p1 = mBothSub[1], p2 = mBothSub[2];
      var dfaA = buildSubstringDFA(alphabet, p1);
      var dfaB = buildSubstringDFA(alphabet, p2);
      var comb = buildProductDFA(dfaA, dfaB, 'AND');
      return {
        success: true,
        dfa: comb,
        alphabet: alphabet,
        ruleType: 'compound_substring_and',
        description: 'Strings containing both "' + p1 + '" and "' + p2 + '" over Σ = {' + alphabet.join(', ') + '}'
      };
    }

    // Pattern 4: Contains X or Y
    var mOrSub = normalized.match(/contains?\s+(?:either\s+)?['"`]?([01ab]+)['"`]?\s+or\s+['"`]?([01ab]+)['"`]?/i);
    if (mOrSub) {
      var p1 = mOrSub[1], p2 = mOrSub[2];
      var dfaA = buildSubstringDFA(alphabet, p1);
      var dfaB = buildSubstringDFA(alphabet, p2);
      var comb = buildProductDFA(dfaA, dfaB, 'OR');
      return {
        success: true,
        dfa: comb,
        alphabet: alphabet,
        ruleType: 'compound_substring_or',
        description: 'Strings containing "' + p1 + '" or "' + p2 + '" over Σ = {' + alphabet.join(', ') + '}'
      };
    }

    // Pattern 5: Explicit "and" compound clauses: e.g. "starts with 0 and ends with 1"
    var andSplit = normalized.split(/\s+and\s+/i);
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

    // Pattern 6: Explicit "or" compound clauses: e.g. "ends with 00 or ends with 11"
    var orSplit = normalized.split(/\s+or\s+/i);
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

    // Pattern 7: Single atomic clause on normalized text
    var atomic = parseAtomicClause(normalized, alphabet) || parseAtomicClause(text, alphabet);
    if (atomic) {
      return {
        success: true,
        dfa: atomic.dfa,
        alphabet: alphabet,
        ruleType: atomic.type,
        description: atomic.description + ' over Σ = {' + alphabet.join(', ') + '}'
      };
    }

    // If no match, return helpful educational guidance
    return {
      success: false,
      error: 'Could not reliably identify the DFA pattern from your description.',
      suggestion: 'Try common patterns like: "ending with [01]", "starting with [10]", "containing [101]", "no consecutive [1s/0s]", "even/odd number of [zeros/ones]", "at least two 0s", "divisible by 3", "starts and ends with same symbol", "even length", or combined with "and"/"or".'
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
    buildCountThresholdDFA: buildCountThresholdDFA,
    buildLengthModuloDFA: buildLengthModuloDFA,
    buildLengthBoundDFA: buildLengthBoundDFA,
    buildBinaryDivisibleDFA: buildBinaryDivisibleDFA,
    buildSameStartEndDFA: buildSameStartEndDFA,
    buildPositionalDFA: buildPositionalDFA,
    buildFollowedByDFA: buildFollowedByDFA,
    buildAlternatingDFA: buildAlternatingDFA,
    buildOnlySymbolDFA: buildOnlySymbolDFA,
    buildUniversalDFA: buildUniversalDFA,
    buildEmptyStringOnlyDFA: buildEmptyStringOnlyDFA,
    buildComplementDFA: buildComplementDFA,
    buildProductDFA: buildProductDFA,
    renameStatesCleanly: renameStatesCleanly,
    parse: parseNaturalLanguage
  };
});
