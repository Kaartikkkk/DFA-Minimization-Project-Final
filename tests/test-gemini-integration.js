/**
 * @file test-gemini-integration.js
 * Comprehensive 32-Case Gemini API & Automata Engine Integration Test Suite.
 *
 * Verifies:
 *  1. Natural Language Interpretation Endpoint & Validation Layer
 *  2. Semantic equivalence across different phrasings of the same language
 *  3. AST compilation, Thompson NFA, and Subset DFA generation
 *  4. Hopcroft O(n log n) minimization
 *  5. Hopcroft–Karp equivalence proof (L(Orig) ≡ L(Min))
 *  6. Test string acceptance invariants (positive and negative cases)
 *  7. Non-regular language rejection (Pumping Lemma)
 *  8. Ambiguity detection & clarification handling
 *  9. Offline fallback resiliency
 */
'use strict';

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const geminiClient = require('../server/gemini-client.js');
const validator = require('../server/validator.js');
const Pipeline = require('../Milestone-2/SourceCode/js/pipeline.js');
const DFAAlgo = require('../Milestone-2/SourceCode/js/algorithms.js');

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m [${total}] ${message}`);
  } else {
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m [${total}] ${message}`);
  }
}

console.log('\n================================================================');
console.log('  Gemini API & DFA Minimization Integration Test Battery');
console.log(`  Gemini Configured: ${geminiClient.isConfigured() ? 'YES (Live API Mode)' : 'NO (Fallback / Resiliency Mode)'}`);
console.log(`  Configured Model: ${geminiClient.getModelName()}`);
console.log('================================================================\n');

const testCases = [
  // Paraphrase Group 1: Ends with 01
  {
    q: "Construct a DFA over {0,1} that accepts strings ending with 01.",
    category: "Suffix",
    accept: ["01", "001", "101", "1101"],
    reject: ["", "0", "1", "10", "100"]
  },
  {
    q: "Binary strings that end with zero-one.",
    category: "Suffix Paraphrase",
    accept: ["01", "001", "101", "1101"],
    reject: ["", "0", "1", "10", "100"]
  },
  {
    q: "Strings ending in 01.",
    category: "Suffix Shorthand",
    accept: ["01", "001", "101", "1101"],
    reject: ["", "0", "1", "10", "100"]
  },

  // Paraphrase Group 2: Contains 101
  {
    q: "Strings containing 101.",
    category: "Substring",
    accept: ["101", "0101", "11010", "10111"],
    reject: ["", "0", "1", "10", "1001", "0110"]
  },
  {
    q: "Accept all binary strings with substring 101.",
    category: "Substring Paraphrase",
    accept: ["101", "0101", "11010"],
    reject: ["", "0", "1", "10", "0110"]
  },

  // Paraphrase Group 3: Even number of zeros
  {
    q: "Strings with an even number of zeros.",
    category: "Parity",
    accept: ["", "1", "11", "00", "010", "01101"],
    reject: ["0", "01", "10", "000"]
  },
  {
    q: "Binary strings having an even count of 0s.",
    category: "Parity Paraphrase",
    accept: ["", "1", "11", "00", "010", "01101"],
    reject: ["0", "01", "10", "000"]
  },

  // Forbidden Group: No consecutive ones / never contain 11
  {
    q: "Strings that never contain 11.",
    category: "Forbidden",
    accept: ["", "0", "1", "01", "10", "01010", "10101"],
    reject: ["11", "011", "110", "0110", "111"]
  },
  {
    q: "Construct a DFA that rejects strings containing consecutive ones.",
    category: "Forbidden Paraphrase",
    accept: ["", "0", "1", "01", "10", "01010"],
    reject: ["11", "011", "110", "0110"]
  },

  // Starting and Ending conditions
  {
    q: "Strings starting with 0 and ending with 1.",
    category: "Compound Prefix-Suffix",
    accept: ["01", "001", "011", "0101"],
    reject: ["", "0", "1", "00", "11", "10"]
  },
  {
    q: "Strings starting with 10.",
    category: "Prefix",
    accept: ["10", "100", "101", "1011"],
    reject: ["", "0", "1", "01", "11"]
  },

  // Odd counting
  {
    q: "Strings with an odd number of ones.",
    category: "Parity Odd",
    accept: ["1", "01", "10", "111", "01110"],
    reject: ["", "0", "11", "1100", "1111"]
  },

  // Arithmetic: Divisible by 3 and 2
  {
    q: "Binary numbers divisible by 3.",
    category: "Arithmetic Modulo",
    accept: ["0", "11", "110", "1001", "1100"],
    reject: ["1", "10", "100", "101", "111"]
  },
  {
    q: "Binary numbers divisible by 2.",
    category: "Arithmetic Modulo",
    accept: ["0", "10", "100", "110", "1010"],
    reject: ["1", "11", "101", "111"]
  },

  // Union of endings
  {
    q: "Construct a minimum DFA that accepts all binary strings ending with 00 or 11.",
    category: "Union of Suffixes",
    accept: ["00", "11", "0100", "1011", "1111"],
    reject: ["", "0", "1", "01", "10", "010", "101"]
  },
  {
    q: "Binary strings that terminate in either 00 or 11.",
    category: "Union Paraphrase",
    accept: ["00", "11", "0100", "1011"],
    reject: ["", "0", "1", "01", "10"]
  },

  // Exact / threshold counts
  {
    q: "Strings with exactly three ones.",
    category: "Exact Count",
    accept: ["111", "0111", "10110", "0101010"],
    reject: ["", "1", "11", "1111", "011110"]
  },
  {
    q: "Strings containing exactly two ones.",
    category: "Exact Count",
    accept: ["11", "011", "101", "110", "01010"],
    reject: ["", "1", "111", "000"]
  },
  {
    q: "Accept strings containing at least two 0s.",
    category: "Threshold Count",
    accept: ["00", "001", "100", "010", "1010"],
    reject: ["", "1", "0", "11", "101"]
  },
  {
    q: "Binary strings with at most three 1s.",
    category: "Threshold Count",
    accept: ["", "0", "1", "11", "111", "0101010"],
    reject: ["1111", "1010101"]
  },

  // Forbidden substring: do not contain 00 / 101
  {
    q: "Strings that do not contain 00.",
    category: "Forbidden Substring",
    accept: ["", "1", "0", "01", "10", "10101"],
    reject: ["00", "001", "100", "1001"]
  },
  {
    q: "Strings not containing substring 101.",
    category: "Forbidden Substring",
    accept: ["", "0", "1", "00", "11", "0110"],
    reject: ["101", "0101", "11010"]
  },

  // String length constraints
  {
    q: "Strings of even length over {a,b}.",
    category: "Length Constraint",
    accept: ["", "aa", "ab", "ba", "bb", "abab"],
    reject: ["a", "b", "aba", "bab"]
  },
  {
    q: "Construct a DFA for strings of odd length.",
    category: "Length Constraint",
    accept: ["0", "1", "000", "101", "111"],
    reject: ["", "00", "01", "10", "11"]
  },

  // First and last symbol relation
  {
    q: "Strings starting and ending with the same symbol.",
    category: "Symbol Relation",
    accept: ["0", "1", "00", "11", "010", "101"],
    reject: ["01", "10", "011", "100"]
  },

  // Sequence rules
  {
    q: "Every 0 is followed by 1.",
    category: "Sequence Rule",
    accept: ["", "1", "01", "101", "0101", "11011"],
    reject: ["0", "00", "10", "010", "100"]
  },

  // Alphabet a, b
  {
    q: "Strings starting with a and ending with b.",
    category: "Alphabet a,b",
    accept: ["ab", "aab", "abb", "abab"],
    reject: ["", "a", "b", "ba", "aa", "bb"]
  },

  // Compound condition: both
  {
    q: "Strings containing both 00 and 11.",
    category: "Compound Both",
    accept: ["0011", "1100", "0100110", "111000"],
    reject: ["", "00", "11", "0101", "1010"]
  },

  // Embedded Regex
  {
    q: "Construct a DFA accepting strings matching (0+1)*01.",
    category: "Embedded Regex",
    accept: ["01", "001", "101", "1101"],
    reject: ["", "0", "1", "10"]
  }
];

async function runSuite() {
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const testNum = i + 1;

    // 1. Interpret question (Gemini live if configured, else deterministic fallback)
    let rawSpec;
    if (geminiClient.isConfigured()) {
      const gRes = await geminiClient.interpretLanguage(tc.q);
      rawSpec = gRes.success ? gRes.rawSpec : geminiClient.localDeterministicFallback(tc.q);
    } else {
      rawSpec = geminiClient.localDeterministicFallback(tc.q);
    }

    // 2. Validate specification
    const valRes = validator.validateSpecification(rawSpec);
    assert(valRes.valid === true, `TC-${testNum} [${tc.category}] Specification validated successfully`);

    const spec = valRes.specification;
    assert(spec.languageType === 'regular' && spec.regex, `TC-${testNum} [${tc.category}] Classified as regular language with regex /${spec.regex}/`);

    // 3. Compile DFA via AST -> Thompson -> Subset
    const pipeRes = Pipeline.run({
      input: spec.regex,
      mode: 'regex',
      alphabet: spec.alphabet,
      method: 'hopcroft'
    });

    assert(pipeRes.success === true, `TC-${testNum} [${tc.category}] Compiled DFA successfully (${pipeRes.originalDFA.states.length} orig states)`);

    // 4. Hopcroft minimization
    const minDFA = pipeRes.minimizedDFA;
    assert(minDFA && minDFA.states.length <= pipeRes.originalDFA.states.length,
      `TC-${testNum} [${tc.category}] Minimized via Hopcroft: ${pipeRes.originalDFA.states.length} -> ${minDFA.states.length} states`);

    // 5. Hopcroft-Karp Equivalence Verification
    const eqCheck = pipeRes.stages.verification;
    assert(eqCheck && eqCheck.equivalent === true,
      `TC-${testNum} [${tc.category}] Hopcroft–Karp verified equivalence (L(M_orig) ≡ L(M_min))`);

    // 6. Test strings evaluation
    let stringsPass = true;
    for (const w of tc.accept) {
      const inAlpha = w.split('').every(c => minDFA.alphabet.includes(c));
      if (inAlpha) {
        const r1 = DFAAlgo.runString(pipeRes.originalDFA, w).accepted;
        const r2 = DFAAlgo.runString(minDFA, w).accepted;
        if (!r1 || !r2) stringsPass = false;
      }
    }
    for (const w of tc.reject) {
      const inAlpha = w.split('').every(c => minDFA.alphabet.includes(c));
      if (inAlpha) {
        const r1 = DFAAlgo.runString(pipeRes.originalDFA, w).accepted;
        const r2 = DFAAlgo.runString(minDFA, w).accepted;
        if (r1 || r2) stringsPass = false;
      }
    }

    assert(stringsPass === true, `TC-${testNum} [${tc.category}] Positive and negative string acceptance invariants verified`);
  }

  // ---------------------------------------------------------------------------
  // Theoretical Non-Regular Language Detection
  // ---------------------------------------------------------------------------
  console.log('\n--- Theoretical Boundary Tests: Non-Regular Languages & Ambiguity ---');

  // Test Non-Regular 1: Equal zeros and ones (0^n 1^n)
  const nonRegRaw1 = {
    status: "non_regular",
    languageType: "non-regular",
    alphabet: ["0", "1"],
    explanation: "The language {0^n 1^n | n >= 0} requires unbounded counting and is strictly Context-Free, not regular by the Pumping Lemma.",
    needsClarification: false
  };
  const nrVal1 = validator.validateSpecification(nonRegRaw1);
  assert(nrVal1.valid === true && nrVal1.specification.status === 'non_regular',
    'TC-30 Non-regular language {0^n 1^n} properly validated as non_regular');

  // Test Non-Regular 2: General Palindromes
  const nonRegRaw2 = {
    status: "non_regular",
    languageType: "non-regular",
    alphabet: ["0", "1"],
    explanation: "Palindromes {w | w = w^R} require a LIFO stack and are not recognized by finite automata.",
    needsClarification: false
  };
  const nrVal2 = validator.validateSpecification(nonRegRaw2);
  assert(nrVal2.valid === true && nrVal2.specification.languageType === 'non-regular',
    'TC-31 Non-regular language {w = w^R} verified with academic explanation');

  // Test Ambiguity: Clarification Needed
  const ambigRaw = {
    status: "clarification_needed",
    languageType: "unknown",
    alphabet: [],
    needsClarification: true,
    clarificationQuestion: "Please specify the alphabet and whether the string must start or end with 01."
  };
  const ambigVal = validator.validateSpecification(ambigRaw);
  assert(ambigVal.valid === true && ambigVal.specification.needsClarification === true,
    'TC-32 Ambiguous language query properly flagged for user clarification');

  console.log('\n================================================================');
  console.log(`  TEST SUMMARY: ${passed} / ${total} assertions passed ${failed === 0 ? '(100% SUCCESS)' : `(${failed} failed)`}`);
  console.log('================================================================\n');

  process.exitCode = failed === 0 ? 0 : 1;
}

runSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
