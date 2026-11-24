/**
 * Comprehensive test script for Natural Language DFA synthesis and verification
 */
const NLDFA = require('../js/nl-dfa.js');
const A = require('../js/algorithms.js');

const cases = [
  {
    name: 'Example 1 – Ending Pattern',
    text: 'Construct a minimum DFA over the alphabet {0,1} that accepts all strings ending with 01.',
    testAccepted: ['01', '001', '101', '1101', '0101'],
    testRejected: ['', '0', '1', '00', '10', '11', '010']
  },
  {
    name: 'Example 2 – Even/Odd Counting',
    text: 'Construct a minimum DFA that accepts all strings containing an even number of zeros.',
    testAccepted: ['', '1', '11', '00', '010', '1001', '10101'],
    testRejected: ['0', '01', '10', '000', '1011']
  },
  {
    name: 'Example 3 – Starting Pattern',
    text: 'Construct a minimum DFA that accepts all binary strings starting with 10.',
    testAccepted: ['10', '100', '101', '10010', '10111'],
    testRejected: ['', '0', '1', '01', '11', '010']
  },
  {
    name: 'Example 4 – Substring Detection',
    text: 'Construct a minimum DFA that accepts all binary strings containing the substring 101.',
    testAccepted: ['101', '0101', '1101', '1010', '0010111'],
    testRejected: ['', '0', '1', '10', '01', '1100', '000']
  },
  {
    name: 'Example 5 – Odd Number Counting',
    text: 'Construct a minimum DFA that accepts all strings having an odd number of ones.',
    testAccepted: ['1', '01', '10', '100', '111', '0101010'],
    testRejected: ['', '0', '00', '11', '0110', '1111']
  },
  {
    name: 'Example 6 – Forbidden Pattern',
    text: 'Construct a minimum DFA that accepts all binary strings that do not contain consecutive ones.',
    testAccepted: ['', '0', '1', '01', '10', '010', '10101', '000'],
    testRejected: ['11', '011', '110', '10110', '001100']
  },
  {
    name: 'Example 7 – Multiple Ending Patterns',
    text: 'Construct a minimum DFA that accepts all binary strings ending with 00 or 11.',
    testAccepted: ['00', '11', '0100', '1011', '000', '111', '0111'],
    testRejected: ['', '0', '1', '01', '10', '010', '101']
  },
  {
    name: 'Example 8 – Combined Conditions',
    text: 'Construct a minimum DFA that accepts all binary strings having an even number of zeros and an odd number of ones.',
    testAccepted: ['1', '111', '001', '010', '100', '00111', '10101'],
    testRejected: ['', '0', '00', '11', '01', '10', '000', '0001']
  },
  // Additional Edge & Shorthand Cases from User Specification
  {
    name: 'Shorthand 1 – Accept strings ending with 01',
    text: 'Accept strings ending with 01.',
    testAccepted: ['01', '101', '001'],
    testRejected: ['', '0', '1', '10']
  },
  {
    name: 'Shorthand 2 – Accept strings containing 101',
    text: 'Accept strings containing 101.',
    testAccepted: ['101', '0101', '1011'],
    testRejected: ['', '10', '01']
  },
  {
    name: 'Shorthand 3 – Even number of zeros',
    text: 'Accept strings with an even number of zeros.',
    testAccepted: ['', '1', '00', '1001'],
    testRejected: ['0', '000', '01']
  },
  {
    name: 'Shorthand 4 – Accept strings starting with 1',
    text: 'Accept strings starting with 1.',
    testAccepted: ['1', '10', '11', '1001'],
    testRejected: ['', '0', '01', '001']
  },
  {
    name: 'Shorthand 5 – Odd number of ones',
    text: 'Create a DFA that accepts binary strings with an odd number of ones.',
    testAccepted: ['1', '01', '100', '111'],
    testRejected: ['', '0', '11', '00']
  },
  {
    name: 'Compound 2 – Starts with 0 and ends with 1',
    text: 'Construct a minimum DFA that accepts all strings starting with 0 and ending with 1.',
    testAccepted: ['01', '001', '0101', '011'],
    testRejected: ['', '0', '1', '10', '11', '00']
  }
];

console.log('Testing Extended Natural Language DFA Generator & Minimizer...\n');
let allPassed = true;

cases.forEach((tc) => {
  const res = NLDFA.parse(tc.text);
  if (!res.success) {
    console.error(`FAIL: ${tc.name}: Parse failed -> ${res.error}`);
    allPassed = false;
    return;
  }

  const minRes = A.minimize(res.dfa, 'both');
  if (!minRes.ok) {
    console.error(`FAIL: ${tc.name}: Minimization validation failed:`, minRes.validation.errors);
    allPassed = false;
    return;
  }

  const equiv = minRes.equivalence;
  if (!equiv.equal) {
    console.error(`FAIL: ${tc.name}: Equivalence failed! Counterexample: "${equiv.counterexample}"`);
    allPassed = false;
    return;
  }

  let stringFailed = false;
  tc.testAccepted.forEach(str => {
    const syms = str.length === 0 ? [] : str.split('');
    const r1 = A.runString(res.dfa, syms);
    const r2 = A.runString(minRes.min, syms);
    if (!r1.accepted || !r2.accepted) {
      console.error(`FAIL: ${tc.name}: Expected string "${str}" to be ACCEPTED, got original=${r1.accepted}, min=${r2.accepted}`);
      stringFailed = true;
      allPassed = false;
    }
  });

  tc.testRejected.forEach(str => {
    const syms = str.length === 0 ? [] : str.split('');
    const r1 = A.runString(res.dfa, syms);
    const r2 = A.runString(minRes.min, syms);
    if (r1.accepted || r2.accepted) {
      console.error(`FAIL: ${tc.name}: Expected string "${str}" to be REJECTED, got original=${r1.accepted}, min=${r2.accepted}`);
      stringFailed = true;
      allPassed = false;
    }
  });

  if (!stringFailed) {
    console.log(`  PASS: ${tc.name} (${res.dfa.states.length} -> ${minRes.min.states.length} states)`);
  }
});

// Test error handling
const emptyRes = NLDFA.parse('');
if (emptyRes.success) {
  console.error('FAIL: Empty input should fail gracefully');
  allPassed = false;
} else {
  console.log('  PASS: Empty input handled gracefully with helpful guidance.');
}

const gibberishRes = NLDFA.parse('Make a pizza with pepperoni and extra cheese');
if (gibberishRes.success) {
  console.error('FAIL: Gibberish input should fail gracefully');
  allPassed = false;
} else {
  console.log('  PASS: Unsupported natural language prompt failed gracefully with constructive suggestions.');
}

console.log(allPassed ? '\nAll Tests Passed Successfully!' : '\nSome tests failed.');
process.exitCode = allPassed ? 0 : 1;
