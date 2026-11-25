/**
 * @file pipeline.js
 * AutomataFlow — Universal Automata Pipeline Orchestrator.
 *
 * Coordinates the full mathematical pipeline:
 *   [Natural Language / Regular Expression / Manual DFA]
 *                      │
 *                      ▼
 *          [Specification / Regex AST]
 *                      │
 *                      ▼
 *          [Thompson's Construction (NFA-ε)]
 *                      │
 *                      ▼
 *          [Subset Construction (Powerset DFA)]
 *                      │
 *                      ▼
 *             [DFA Validation Engine]
 *                      │
 *                      ▼
 *         [Hopcroft's Minimization O(n log n)]
 *                      │
 *                      ▼
 *     [Hopcroft-Karp / Product Equivalence Verification]
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./regex-parser.js'),
      require('./thompson.js'),
      require('./subset-construction.js'),
      require('./hopcroft.js'),
      require('./hopcroft-karp.js'),
      require('./algorithms.js'),
      require('./nl-dfa.js')
    );
  } else {
    root.AutomataPipeline = factory(
      root.RegexParser,
      root.ThompsonConstruction,
      root.SubsetConstruction,
      root.Hopcroft,
      root.HopcroftKarp,
      root.DFAAlgo,
      root.NLDFA
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  RegexParser, Thompson, Subset, Hopcroft, HK, DFAAlgo, NLDFA
) {
  'use strict';

  function resolveDeps() {
    var RP = RegexParser || (typeof globalThis !== 'undefined' ? globalThis.RegexParser : null);
    var TC = Thompson || (typeof globalThis !== 'undefined' ? globalThis.ThompsonConstruction : null);
    var SC = Subset || (typeof globalThis !== 'undefined' ? globalThis.SubsetConstruction : null);
    var HC = Hopcroft || (typeof globalThis !== 'undefined' ? globalThis.Hopcroft : null);
    var HKA = HK || (typeof globalThis !== 'undefined' ? globalThis.HopcroftKarp : null);
    var DA = DFAAlgo || (typeof globalThis !== 'undefined' ? globalThis.DFAAlgo : null);
    var NL = NLDFA || (typeof globalThis !== 'undefined' ? globalThis.NLDFA : null);
    return { RP: RP, TC: TC, SC: SC, HC: HC, HK: HKA, DA: DA, NL: NL };
  }

  /**
   * Process an input string or DFA through the universal automata pipeline.
   *
   * @param {Object} options
   * @param {string|Object} options.input - Text prompt, regex string, or DFA object
   * @param {('nl'|'regex'|'manual')} [options.mode='nl'] - Parsing pipeline mode
   * @param {string[]} [options.alphabet] - Optional explicit alphabet override
   * @param {('hopcroft'|'tf'|'pr'|'all')} [options.method='hopcroft'] - Minimization algorithm
   * @returns {Object} Complete pipeline result
   */
  function runPipeline(options) {
    options = options || {};
    var deps = resolveDeps();
    var mode = options.mode || 'nl';
    var input = options.input;
    var method = options.method || 'hopcroft';

    var report = {
      timestamp: Date.now(),
      mode: mode,
      success: false,
      stages: {},
      error: null,
      warning: null
    };

    var dfa = null;
    var specDescription = '';

    // =========================================================================
    // Stage 1: Input & Synthesis
    // =========================================================================
    if (mode === 'manual' || (typeof input === 'object' && input.states && input.delta)) {
      dfa = input;
      specDescription = 'Manual 5-Tuple DFA Specification';
      report.stages.synthesis = {
        type: 'manual',
        description: specDescription,
        stateCount: dfa.states.length,
        alphabet: dfa.alphabet
      };
    } else if (mode === 'regex') {
      if (!deps.RP || !deps.TC || !deps.SC) {
        report.error = 'Regex parsing engines (RegexParser, Thompson, Subset) are not loaded.';
        return report;
      }
      var regexText = String(input || '').trim();
      var parsedRegex = deps.RP.parse(regexText);
      if (!parsedRegex.success) {
        report.error = 'Malformed regular expression: ' + parsedRegex.error;
        return report;
      }

      var alpha = (options.alphabet && options.alphabet.length) ? options.alphabet : parsedRegex.alphabet;
      var nfa = deps.TC.regexToNFA(parsedRegex.ast, alpha);
      var subsetRes = deps.SC.nfaToDFA(nfa);

      dfa = (deps.NL && deps.NL.renameStatesCleanly)
        ? deps.NL.renameStatesCleanly(subsetRes.dfa)
        : subsetRes.dfa;

      specDescription = 'Regular Expression: ' + parsedRegex.formatted;
      report.stages.regex = {
        raw: regexText,
        formatted: parsedRegex.formatted,
        ast: parsedRegex.ast
      };
      report.stages.nfa = {
        states: nfa.states,
        start: nfa.start,
        accept: nfa.accept,
        transitions: nfa.transitions
      };
      report.stages.subset = {
        steps: subsetRes.steps,
        stateMap: subsetRes.nfaStateMap
      };
      report.stages.synthesis = {
        type: 'regex_pipeline',
        description: specDescription,
        stateCount: dfa.states.length,
        alphabet: alpha
      };
    } else {
      // Natural Language Mode
      if (!deps.NL) {
        report.error = 'Natural Language DFA Synthesizer (NLDFA) is not loaded.';
        return report;
      }
      var nlText = String(input || '').trim();
      var nlRes = deps.NL.parse(nlText);
      if (!nlRes.success) {
        report.error = nlRes.error || 'Could not understand the language specification.';
        report.suggestion = nlRes.suggestion || 'Please try rephrasing with patterns like "ending with 01" or "divisible by 3".';
        return report;
      }

      dfa = nlRes.dfa;
      specDescription = nlRes.description || nlText;

      report.stages.synthesis = {
        type: nlRes.ruleType || 'natural_language',
        description: specDescription,
        stateCount: dfa.states.length,
        alphabet: nlRes.alphabet || dfa.alphabet,
        regex: nlRes.formattedRegex,
        ast: nlRes.ast,
        nfa: nlRes.nfa,
        subsetSteps: nlRes.subsetSteps
      };
    }

    // =========================================================================
    // Stage 2: DFA Validation & Preprocessing
    // =========================================================================
    if (!deps.DA) {
      report.error = 'Automata algorithm engine (DFAAlgo) is not loaded.';
      return report;
    }

    var validation = deps.DA.validateDFA(dfa);
    if (validation.errors && validation.errors.length) {
      report.error = 'DFA Validation Failed: ' + validation.errors.join('; ');
      report.validation = validation;
      return report;
    }

    var completed = deps.DA.completeWithDeadState(dfa, validation.missing);
    var fullDFA = completed.dfa;
    var reachability = deps.DA.findReachable(fullDFA);
    var reachableDFA = deps.DA.restrictDFA(fullDFA, reachability.reachable);

    report.stages.validation = {
      originalStates: dfa.states.length,
      deadStateAdded: completed.dead || null,
      missingTransitionsCompleted: validation.missing.length,
      unreachableStatesRemoved: reachability.unreachable,
      reachableStatesKept: reachability.reachable.length
    };

    // =========================================================================
    // Stage 3: Hopcroft Minimization O(n log n)
    // =========================================================================
    var minResult = null;
    if (deps.HC) {
      minResult = deps.HC.minimize(reachableDFA);
    } else {
      // Fallback to DFAAlgo
      minResult = deps.DA.minimize(reachableDFA, method === 'all' ? 'both' : method);
    }

    var minimalDFA = minResult.min || minResult.dfa;
    report.stages.minimization = {
      algorithm: 'Hopcroft State Minimization (O(|Σ| · n log n))',
      initialPartitions: minResult.classes ? minResult.classes.length : null,
      classes: minResult.classes,
      steps: minResult.steps || [],
      iterations: minResult.iterations || 0,
      originalStateCount: fullDFA.states.length,
      reachableStateCount: reachableDFA.states.length,
      minimizedStateCount: minimalDFA.states.length,
      reductionPercent: fullDFA.states.length > 0
        ? Math.round((fullDFA.states.length - minimalDFA.states.length) / fullDFA.states.length * 100)
        : 0
    };

    // =========================================================================
    // Stage 4: Formal Equivalence Verification (Hopcroft-Karp Union-Find)
    // =========================================================================
    var equivReport = null;
    if (deps.HK && deps.HK.areDFAsEquivalent) {
      equivReport = deps.HK.areDFAsEquivalent(fullDFA, minimalDFA);
    } else if (deps.DA && deps.DA.checkEquivalence) {
      var prod = deps.DA.checkEquivalence(fullDFA, minimalDFA);
      equivReport = {
        equivalent: prod.equal,
        algorithm: 'Product Automaton BFS',
        processed_pairs: prod.visitedCount,
        distinguishing_string: prod.counterexample || null
      };
    }

    report.stages.verification = equivReport;

    // Minimality check: minimize the minimized machine must yield the exact same size
    var secondMin = deps.HC ? deps.HC.minimize(minimalDFA) : deps.DA.minimize(minimalDFA, 'tf');
    var secondMinDFA = secondMin.min || secondMin.dfa;
    var isStrictlyMinimal = secondMinDFA.states.length === minimalDFA.states.length;
    report.stages.minimality = {
      isMinimal: isStrictlyMinimal,
      verifiedSize: minimalDFA.states.length
    };

    report.success = (equivReport ? equivReport.equivalent : true) && isStrictlyMinimal;
    report.originalDFA = fullDFA;
    report.minimizedDFA = minimalDFA;
    report.description = specDescription;

    return report;
  }

  return {
    run: runPipeline,
    process: runPipeline,
    resolveDeps: resolveDeps
  };
});
