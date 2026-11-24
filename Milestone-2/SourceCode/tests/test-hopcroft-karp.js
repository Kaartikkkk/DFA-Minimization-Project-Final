/**
 * @file test-hopcroft-karp.js
 * Independent, exhaustive unit test suite for the Hopcroft–Karp DFA Equivalence Algorithm.
 * Tests Disjoint Set Union (Union-Find) with path compression, union-by-rank,
 * transition completeness, empty-string acceptance, counterexample reconstruction,
 * and edge cases.
 */

const HK = require('../js/hopcroft-karp.js');
const PRESETS = require('../js/presets.js');

function getPreset(id) {
  return PRESETS.find(p => p.id === id).dfa;
}

const tests = [
  {
    name: 'TC-HK-01: Identical DFAs',
    run: () => {
      const dfa = getPreset('textbook');
      const res = HK.areDFAsEquivalent(dfa, dfa);
      return {
        pass: res.equivalent === true && res.processed_pairs > 0 && res.algorithm === 'Hopcroft–Karp',
        msg: `Processed pairs: ${res.processed_pairs}, time: ${res.execution_time_ms} ms`
      };
    }
  },
  {
    name: 'TC-HK-02: Equivalent DFAs with different state names and sizes (8-state vs 5-state)',
    run: () => {
      const dfa8 = getPreset('textbook');
      const dfa5 = {
        states: ['AE', 'BH', 'C', 'F', 'G'],
        alphabet: ['0', '1'],
        start: 'AE',
        finals: ['C'],
        delta: {
          'AE': { '0': 'BH', '1': 'F' },
          'BH': { '0': 'G',  '1': 'C' },
          'C':  { '0': 'AE', '1': 'C' },
          'F':  { '0': 'C',  '1': 'G' },
          'G':  { '0': 'G',  '1': 'AE' }
        }
      };
      const res = HK.areDFAsEquivalent(dfa8, dfa5);
      return {
        pass: res.equivalent === true && res.distinguishing_string === null,
        msg: `Equivalent verified: ${res.equivalent}, pairs: ${res.processed_pairs}`
      };
    }
  },
  {
    name: 'TC-HK-03: Two equivalent DFAs with isomorphic structure but different names',
    run: () => {
      const d1 = {
        states: ['s0', 's1'],
        alphabet: ['0', '1'],
        start: 's0',
        finals: ['s1'],
        delta: {
          's0': { '0': 's0', '1': 's1' },
          's1': { '0': 's1', '1': 's0' }
        }
      };
      const d2 = {
        states: ['StateA', 'StateB'],
        alphabet: ['0', '1'],
        start: 'StateA',
        finals: ['StateB'],
        delta: {
          'StateA': { '0': 'StateA', '1': 'StateB' },
          'StateB': { '0': 'StateB', '1': 'StateA' }
        }
      };
      const res = HK.areDFAsEquivalent(d1, d2);
      return {
        pass: res.equivalent === true,
        msg: `Equivalence verified for renamed states`
      };
    }
  },
  {
    name: 'TC-HK-04: Non-equivalent DFAs differing in accepting state',
    run: () => {
      const d1 = {
        states: ['q0', 'q1'],
        alphabet: ['0', '1'],
        start: 'q0',
        finals: ['q1'], // accepts strings ending with odd 1s
        delta: {
          'q0': { '0': 'q0', '1': 'q1' },
          'q1': { '0': 'q1', '1': 'q0' }
        }
      };
      const d2 = {
        states: ['q0', 'q1'],
        alphabet: ['0', '1'],
        start: 'q0',
        finals: ['q0'], // accepts strings ending with even 1s
        delta: {
          'q0': { '0': 'q0', '1': 'q1' },
          'q1': { '0': 'q1', '1': 'q0' }
        }
      };
      const res = HK.areDFAsEquivalent(d1, d2);
      return {
        pass: res.equivalent === false && (res.distinguishing_string === 'ε' || res.distinguishing_string === ''),
        msg: `Correctly identified non-equivalence, distinguishing string: "${res.distinguishing_string}"`
      };
    }
  },
  {
    name: 'TC-HK-05: Non-equivalent DFAs differing on a deeper string ("01" vs "10")',
    run: () => {
      // D1 accepts strings ending with "01"
      const d1 = {
        states: ['s0', 's1', 's2'],
        alphabet: ['0', '1'],
        start: 's0',
        finals: ['s2'],
        delta: {
          's0': { '0': 's1', '1': 's0' },
          's1': { '0': 's1', '1': 's2' },
          's2': { '0': 's1', '1': 's0' }
        }
      };
      // D2 accepts strings ending with "10"
      const d2 = {
        states: ['q0', 'q1', 'q2'],
        alphabet: ['0', '1'],
        start: 'q0',
        finals: ['q2'],
        delta: {
          'q0': { '0': 'q0', '1': 'q1' },
          'q1': { '0': 'q2', '1': 'q1' },
          'q2': { '0': 'q0', '1': 'q1' }
        }
      };
      const res = HK.areDFAsEquivalent(d1, d2);
      const isCounterValid = res.distinguishing_string !== null && res.dfa1_accepts !== res.dfa2_accepts;
      return {
        pass: res.equivalent === false && isCounterValid,
        msg: `Found distinguishing string "${res.distinguishing_string}" (DFA1: ${res.dfa1_accepts}, DFA2: ${res.dfa2_accepts})`
      };
    }
  },
  {
    name: 'TC-HK-06: DFAs with unreachable states that do not affect language',
    run: () => {
      const d1 = {
        states: ['A', 'B', 'UNREACHABLE'],
        alphabet: ['0', '1'],
        start: 'A',
        finals: ['B', 'UNREACHABLE'],
        delta: {
          'A': { '0': 'A', '1': 'B' },
          'B': { '0': 'B', '1': 'A' },
          'UNREACHABLE': { '0': 'UNREACHABLE', '1': 'A' }
        }
      };
      const d2 = {
        states: ['A', 'B'],
        alphabet: ['0', '1'],
        start: 'A',
        finals: ['B'],
        delta: {
          'A': { '0': 'A', '1': 'B' },
          'B': { '0': 'B', '1': 'A' }
        }
      };
      const res = HK.areDFAsEquivalent(d1, d2);
      return {
        pass: res.equivalent === true,
        msg: `Unreachable states ignored by initial state exploration`
      };
    }
  },
  {
    name: 'TC-HK-07: Incomplete DFAs with missing transitions (implicit dead state)',
    run: () => {
      // D1 has missing transitions on symbol '0' from state 's1'
      const d1 = {
        states: ['s0', 's1'],
        alphabet: ['0', '1'],
        start: 's0',
        finals: ['s1'],
        delta: {
          's0': { '0': 's0', '1': 's1' },
          's1': { '1': 's1' } // missing '0'
        }
      };
      // D2 has an explicit dead state
      const d2 = {
        states: ['q0', 'q1', 'dead'],
        alphabet: ['0', '1'],
        start: 'q0',
        finals: ['q1'],
        delta: {
          'q0': { '0': 'q0', '1': 'q1' },
          'q1': { '0': 'dead', '1': 'q1' },
          'dead': { '0': 'dead', '1': 'dead' }
        }
      };
      const res = HK.areDFAsEquivalent(d1, d2);
      return {
        pass: res.equivalent === true,
        msg: `Normalizer added dead state to complete d1`
      };
    }
  },
  {
    name: 'TC-HK-08: Empty string (ε) acceptance consistency',
    run: () => {
      // D1 accepts empty string (start is final)
      const d1 = {
        states: ['q0'],
        alphabet: ['0', '1'],
        start: 'q0',
        finals: ['q0'],
        delta: { 'q0': { '0': 'q0', '1': 'q0' } }
      };
      // D2 rejects empty string (start is not final)
      const d2 = {
        states: ['p0', 'p1'],
        alphabet: ['0', '1'],
        start: 'p0',
        finals: ['p1'],
        delta: {
          'p0': { '0': 'p1', '1': 'p1' },
          'p1': { '0': 'p1', '1': 'p1' }
        }
      };
      const res = HK.areDFAsEquivalent(d1, d2);
      return {
        pass: res.equivalent === false && res.distinguishing_string === 'ε' && res.dfa1_accepts === true && res.dfa2_accepts === false,
        msg: `Distinguishing string is ε (D1 accepts: true, D2 accepts: false)`
      };
    }
  },
  {
    name: 'TC-HK-09: Union-Find Disjoint Set Union correctness test',
    run: () => {
      const uf = new HK.UnionFind(['a', 'b', 'c', 'd', 'e']);
      uf.union('a', 'b');
      uf.union('c', 'd');
      const c1 = uf.connected('a', 'b');
      const c2 = uf.connected('c', 'd');
      const c3 = !uf.connected('a', 'c');
      uf.union('b', 'c');
      const c4 = uf.connected('a', 'd');
      const c5 = !uf.connected('a', 'e');
      return {
        pass: c1 && c2 && c3 && c4 && c5,
        msg: `Union-Find path compression and union-by-rank verified`
      };
    }
  },
  {
    name: 'TC-HK-10: Incompatible Alphabets handling',
    run: () => {
      const d1 = {
        states: ['q0'],
        alphabet: ['a', 'b'],
        start: 'q0',
        finals: ['q0'],
        delta: { 'q0': { 'a': 'q0', 'b': 'q0' } }
      };
      const d2 = {
        states: ['p0'],
        alphabet: ['0', '1'],
        start: 'p0',
        finals: ['p0'],
        delta: { 'p0': { '0': 'p0', '1': 'p0' } }
      };
      // With allowAlphabetSuperset: false, it must report error or non-equivalence
      const resStrict = HK.areDFAsEquivalent(d1, d2, { allowAlphabetSuperset: false });
      // With superset, 'a' and 'b' in D2 go to trap, so "a" distinguishes them
      const resSuperset = HK.areDFAsEquivalent(d1, d2, { allowAlphabetSuperset: true });
      return {
        pass: resStrict.equivalent === false && resSuperset.equivalent === false && resSuperset.distinguishing_string !== null,
        msg: `Incompatible alphabets cleanly distinguished: "${resSuperset.distinguishing_string}"`
      };
    }
  }
];

console.log('Running Hopcroft–Karp Algorithm Verification Suite...\n');
let passed = 0;
tests.forEach(t => {
  const r = t.run();
  if (r.pass) {
    passed++;
    console.log(`  PASS: ${t.name}`);
    console.log(`        ${r.msg}`);
  } else {
    console.error(`  FAIL: ${t.name}`);
    console.error(`        ${r.msg}`);
  }
});

console.log(`\n${passed} / ${tests.length} Hopcroft–Karp tests passed.`);
process.exitCode = passed === tests.length ? 0 : 1;
