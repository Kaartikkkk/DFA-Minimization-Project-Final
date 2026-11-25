/**
 * @file thompson.js
 * AutomataFlow — Thompson's Construction Algorithm (Regex AST to NFA-ε).
 * Implements Ken Thompson's formal inductive construction algorithm (1968)
 * for converting any Regular Expression Abstract Syntax Tree (AST) into an NFA
 * with epsilon-transitions.
 *
 * Guaranteed Properties:
 *   - Exactly one initial state (with no incoming transitions).
 *   - Exactly one accepting state (with no outgoing transitions).
 *   - Epsilon-transitions represented by empty string '' or 'ε'.
 *   - Linear number of states: O(|AST|).
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ThompsonConstruction = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EPSILON = '';

  /**
   * Helper class to manage NFA state allocation and transition table.
   */
  function NFABuilder() {
    this.stateCounter = 0;
    this.states = [];
    this.delta = {}; // { stateId: { symbol: [stateIds] } }
  }

  NFABuilder.prototype.newState = function () {
    var id = 'n' + (this.stateCounter++);
    this.states.push(id);
    this.delta[id] = {};
    return id;
  };

  NFABuilder.prototype.addTransition = function (from, symbol, to) {
    var sym = symbol === 'ε' ? EPSILON : symbol;
    if (!this.delta[from][sym]) {
      this.delta[from][sym] = [];
    }
    if (this.delta[from][sym].indexOf(to) === -1) {
      this.delta[from][sym].push(to);
    }
  };

  /**
   * Recursive Thompson construction step.
   * Returns a fragment { start: string, accept: string }.
   */
  function buildFragment(node, builder) {
    if (!node) {
      var s = builder.newState();
      var a = builder.newState();
      builder.addTransition(s, EPSILON, a);
      return { start: s, accept: a };
    }

    switch (node.type) {
      case 'EPSILON': {
        var s = builder.newState();
        var a = builder.newState();
        builder.addTransition(s, EPSILON, a);
        return { start: s, accept: a };
      }

      case 'EMPTY': {
        // Empty language ∅: start and accept exist, but no path connects them
        var s = builder.newState();
        var a = builder.newState();
        return { start: s, accept: a };
      }

      case 'SYMBOL': {
        var s = builder.newState();
        var a = builder.newState();
        builder.addTransition(s, node.symbol, a);
        return { start: s, accept: a };
      }

      case 'CONCAT': {
        var left = buildFragment(node.left, builder);
        var right = buildFragment(node.right, builder);
        // Connect left accept to right start via epsilon transition
        builder.addTransition(left.accept, EPSILON, right.start);
        return { start: left.start, accept: right.accept };
      }

      case 'UNION': {
        var left = buildFragment(node.left, builder);
        var right = buildFragment(node.right, builder);
        var s = builder.newState();
        var a = builder.newState();

        builder.addTransition(s, EPSILON, left.start);
        builder.addTransition(s, EPSILON, right.start);
        builder.addTransition(left.accept, EPSILON, a);
        builder.addTransition(right.accept, EPSILON, a);

        return { start: s, accept: a };
      }

      case 'STAR': {
        var inner = buildFragment(node.expr, builder);
        var s = builder.newState();
        var a = builder.newState();

        builder.addTransition(s, EPSILON, inner.start);
        builder.addTransition(s, EPSILON, a);
        builder.addTransition(inner.accept, EPSILON, inner.start);
        builder.addTransition(inner.accept, EPSILON, a);

        return { start: s, accept: a };
      }

      case 'PLUS': {
        var inner = buildFragment(node.expr, builder);
        var s = builder.newState();
        var a = builder.newState();

        builder.addTransition(s, EPSILON, inner.start);
        builder.addTransition(inner.accept, EPSILON, inner.start);
        builder.addTransition(inner.accept, EPSILON, a);

        return { start: s, accept: a };
      }

      case 'OPTIONAL': {
        var inner = buildFragment(node.expr, builder);
        var s = builder.newState();
        var a = builder.newState();

        builder.addTransition(s, EPSILON, inner.start);
        builder.addTransition(s, EPSILON, a);
        builder.addTransition(inner.accept, EPSILON, a);

        return { start: s, accept: a };
      }

      default:
        throw new Error('Unsupported AST node type in Thompson construction: ' + node.type);
    }
  }

  /**
   * Main entry point: converts a Regex AST to a complete NFA specification.
   * @param {Object} ast
   * @param {string[]} [alphabet]
   * @returns {{
   *   states: string[],
   *   alphabet: string[],
   *   start: string,
   *   finals: string[],
   *   delta: Object
   * }}
   */
  function regexToNFA(ast, alphabet) {
    var builder = new NFABuilder();
    var frag = buildFragment(ast, builder);

    // Collect all non-epsilon symbols used in transitions if alphabet not explicitly provided
    var alphaSet = new Set(alphabet || []);
    builder.states.forEach(function (st) {
      var syms = Object.keys(builder.delta[st]);
      syms.forEach(function (sym) {
        if (sym !== EPSILON && sym !== 'ε') {
          alphaSet.add(sym);
        }
      });
    });

    var finalAlphabet = Array.from(alphaSet).sort();
    if (!finalAlphabet.length) finalAlphabet = ['0', '1'];

    return {
      states: builder.states.slice(),
      alphabet: finalAlphabet,
      start: frag.start,
      finals: [frag.accept],
      delta: builder.delta
    };
  }

  return {
    EPSILON: EPSILON,
    regexToNFA: regexToNFA
  };
});
