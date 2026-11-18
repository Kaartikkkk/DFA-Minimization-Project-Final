/**
 * @file presets.js
 * Ready-made example DFAs for the "Load an example" menu (normal and edge cases).
 * Each preset: {id, name, note, expectedStates (size of the minimal DFA), dfa}.
 * The same machines are reused by the test suite in testcases.js.
 */
(function (root) {
  'use strict';
  var PRESETS = [
    {
      id: 'textbook',
      name: 'Textbook example (8 states, 1 unreachable)',
      note: 'Classic Hopcroft–Ullman example. D is unreachable; A≡E and B≡H. Expected: 5 states.',
      expectedStates: 5,
      dfa: { states: ['A','B','C','D','E','F','G','H'], alphabet: ['0','1'], start: 'A', finals: ['C'],
        delta: { A:{0:'B',1:'F'}, B:{0:'G',1:'C'}, C:{0:'A',1:'C'}, D:{0:'C',1:'G'},
                 E:{0:'H',1:'F'}, F:{0:'C',1:'G'}, G:{0:'G',1:'E'}, H:{0:'G',1:'C'} } }
    },
    {
      id: 'six',
      name: 'Manual example (6 states → 3)',
      note: 'The example solved by hand in the Project Design tab. Expected: 3 states.',
      expectedStates: 3,
      dfa: { states: ['q0','q1','q2','q3','q4','q5'], alphabet: ['0','1'], start: 'q0', finals: ['q2','q3','q4'],
        delta: { q0:{0:'q1',1:'q2'}, q1:{0:'q0',1:'q3'}, q2:{0:'q4',1:'q5'},
                 q3:{0:'q4',1:'q5'}, q4:{0:'q4',1:'q5'}, q5:{0:'q5',1:'q5'} } }
    },
    {
      id: 'mod4',
      name: 'Even number of a\'s (counting mod 4)',
      note: 'Counts a\'s mod 4 but only parity matters, so 0≡2 and 1≡3. Expected: 2 states.',
      expectedStates: 2,
      dfa: { states: ['p0','p1','p2','p3'], alphabet: ['a','b'], start: 'p0', finals: ['p0','p2'],
        delta: { p0:{a:'p1',b:'p0'}, p1:{a:'p2',b:'p1'}, p2:{a:'p3',b:'p2'}, p3:{a:'p0',b:'p3'} } }
    },
    {
      id: 'minimal',
      name: 'Edge case: already minimal (ends in "ab")',
      note: 'No two states are equivalent, so nothing should change. Expected: 3 states.',
      expectedStates: 3,
      dfa: { states: ['S','X','Y'], alphabet: ['a','b'], start: 'S', finals: ['Y'],
        delta: { S:{a:'X',b:'S'}, X:{a:'X',b:'Y'}, Y:{a:'X',b:'S'} } }
    },
    {
      id: 'partial',
      name: 'Edge case: missing transitions (a*b)',
      note: 'Some moves are undefined, so a dead state is added first. R is unreachable. Expected: 3 states.',
      expectedStates: 3,
      dfa: { states: ['P','Q','R'], alphabet: ['a','b'], start: 'P', finals: ['Q'],
        delta: { P:{a:'P',b:'Q'}, Q:{}, R:{a:'Q',b:'P'} } }
    },
    {
      id: 'allfinal',
      name: 'Edge case: every state final (Σ*)',
      note: 'All states are equivalent and collapse into one. Expected: 1 state.',
      expectedStates: 1,
      dfa: { states: ['A','B','C'], alphabet: ['0','1'], start: 'A', finals: ['A','B','C'],
        delta: { A:{0:'B',1:'C'}, B:{0:'C',1:'A'}, C:{0:'A',1:'B'} } }
    },
    {
      id: 'nofinal',
      name: 'Edge case: no final states (∅)',
      note: 'Accepts nothing, so all states collapse into one non-final state. Expected: 1 state.',
      expectedStates: 1,
      dfa: { states: ['A','B'], alphabet: ['0','1'], start: 'A', finals: [],
        delta: { A:{0:'B',1:'A'}, B:{0:'A',1:'B'} } }
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = PRESETS;
  else root.DFA_PRESETS = PRESETS;
})(this);
