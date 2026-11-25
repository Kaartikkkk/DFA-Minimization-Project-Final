/**
 * @file regex-parser.js
 * AutomataFlow — Regular Expression Lexer, Parser and Abstract Syntax Tree (AST).
 * Converts user-provided regular expressions into a typed Abstract Syntax Tree (AST).
 *
 * Supported Operators & Grammar:
 *   - Symbol literals (e.g. '0', '1', 'a', 'b')
 *   - Empty string (epsilon): 'ε', '\e', 'eps', 'epsilon', or empty subexpression
 *   - Empty language: '∅', '\0', 'empty', 'phi'
 *   - Grouping: '(' <expr> ')'
 *   - Postfix operators: '*' (Kleene star), '+' (one or more), '?' (optional)
 *   - Implicit concatenation (juxtaposition, e.g. '01', '(0|1)*01')
 *   - Union: '|' or infix '+' (e.g. '0|1', '(0+1)*01')
 *
 * Precedence (high to low):
 *   1. Star / Plus / Optional ('*', '+', '?')
 *   2. Concatenation (juxtaposition)
 *   3. Union ('|', '+')
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RegexParser = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // AST Node Types
  var NODE_TYPES = {
    EMPTY: 'EMPTY',       // ∅ (empty language, accepts nothing)
    EPSILON: 'EPSILON',   // ε (accepts empty string)
    SYMBOL: 'SYMBOL',     // a ∈ Σ
    CONCAT: 'CONCAT',     // A · B
    UNION: 'UNION',       // A | B
    STAR: 'STAR',         // A*
    PLUS: 'PLUS',         // A+ = A · A*
    OPTIONAL: 'OPTIONAL'  // A? = A | ε
  };

  /**
   * Tokenize regular expression string.
   * Inserts explicit concatenation tokens where juxtaposition occurs.
   * @param {string} input
   * @returns {Array<{type: string, value: string, pos: number}>}
   */
  function tokenize(input) {
    var str = (input || '').trim();
    var rawTokens = [];
    var i = 0;

    while (i < str.length) {
      var ch = str[i];

      // Skip whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      if (ch === '(') {
        rawTokens.push({ type: 'LPAREN', value: '(', pos: i });
        i++;
      } else if (ch === ')') {
        rawTokens.push({ type: 'RPAREN', value: ')', pos: i });
        i++;
      } else if (ch === '*') {
        rawTokens.push({ type: 'STAR', value: '*', pos: i });
        i++;
      } else if (ch === '?') {
        rawTokens.push({ type: 'OPTIONAL', value: '?', pos: i });
        i++;
      } else if (ch === '|') {
        rawTokens.push({ type: 'UNION', value: '|', pos: i });
        i++;
      } else if (ch === '+') {
        // Look at previous token to decide if '+' is postfix (one-or-more) or infix (union like 0+1)
        var prev = rawTokens[rawTokens.length - 1];
        if (prev && (prev.type === 'SYMBOL' || prev.type === 'RPAREN' || prev.type === 'STAR' || prev.type === 'EPSILON')) {
          // If followed immediately by an operand or '(', in textbook TOC "0+1" means union!
          // We look ahead to check if next non-space char is an operand or '('
          var nextI = i + 1;
          while (nextI < str.length && /\s/.test(str[nextI])) nextI++;
          var nextCh = str[nextI];
          if (nextCh && (nextCh === '(' || /[0-9a-zA-Zε∅\\]/.test(nextCh))) {
            rawTokens.push({ type: 'UNION', value: '|', pos: i });
          } else {
            rawTokens.push({ type: 'PLUS', value: '+', pos: i });
          }
        } else {
          // At start of expression or after '(', '+' cannot be postfix, treat as symbol or error
          rawTokens.push({ type: 'UNION', value: '|', pos: i });
        }
        i++;
      } else if (ch === 'ε' || ch === 'ϵ' || ch === 'λ') {
        rawTokens.push({ type: 'EPSILON', value: 'ε', pos: i });
        i++;
      } else if (ch === '∅' || ch === 'φ' || ch === 'Φ') {
        rawTokens.push({ type: 'EMPTY', value: '∅', pos: i });
        i++;
      } else if (ch === '\\') {
        // Escaped sequence
        if (i + 1 < str.length) {
          var escCh = str[i + 1];
          if (escCh === 'e' || escCh === 'E') {
            rawTokens.push({ type: 'EPSILON', value: 'ε', pos: i });
          } else if (escCh === '0') {
            rawTokens.push({ type: 'EMPTY', value: '∅', pos: i });
          } else {
            rawTokens.push({ type: 'SYMBOL', value: escCh, pos: i });
          }
          i += 2;
        } else {
          rawTokens.push({ type: 'SYMBOL', value: '\\', pos: i });
          i++;
        }
      } else {
        // Check for words like "eps", "epsilon", "empty"
        var remaining = str.slice(i);
        var matchEps = remaining.match(/^(?:eps(?:ilon)?)\b/i);
        var matchPhi = remaining.match(/^(?:empty|phi)\b/i);

        if (matchEps) {
          rawTokens.push({ type: 'EPSILON', value: 'ε', pos: i });
          i += matchEps[0].length;
        } else if (matchPhi) {
          rawTokens.push({ type: 'EMPTY', value: '∅', pos: i });
          i += matchPhi[0].length;
        } else {
          rawTokens.push({ type: 'SYMBOL', value: ch, pos: i });
          i++;
        }
      }
    }

    // Insert explicit CONCAT tokens where concatenation is implied
    // Concatenation occurs between:
    // (SYMBOL, EPSILON, EMPTY, RPAREN, STAR, PLUS, OPTIONAL) followed by (SYMBOL, EPSILON, EMPTY, LPAREN)
    var tokensWithConcat = [];
    for (var k = 0; k < rawTokens.length; k++) {
      var curr = rawTokens[k];
      tokensWithConcat.push(curr);

      if (k + 1 < rawTokens.length) {
        var next = rawTokens[k + 1];
        var isLeftTerm = (
          curr.type === 'SYMBOL' ||
          curr.type === 'EPSILON' ||
          curr.type === 'EMPTY' ||
          curr.type === 'RPAREN' ||
          curr.type === 'STAR' ||
          curr.type === 'PLUS' ||
          curr.type === 'OPTIONAL'
        );
        var isRightTerm = (
          next.type === 'SYMBOL' ||
          next.type === 'EPSILON' ||
          next.type === 'EMPTY' ||
          next.type === 'LPAREN'
        );

        if (isLeftTerm && isRightTerm) {
          tokensWithConcat.push({ type: 'CONCAT', value: '·', pos: curr.pos });
        }
      }
    }

    tokensWithConcat.push({ type: 'EOF', value: '', pos: str.length });
    return tokensWithConcat;
  }

  /**
   * Recursive descent parser producing an AST.
   * Grammar:
   *   Expr   := Concat ( UNION Concat )*
   *   Concat := Postfix ( CONCAT Postfix )*
   *   Postfix:= Atom ( STAR | PLUS | OPTIONAL )*
   *   Atom   := SYMBOL | EPSILON | EMPTY | LPAREN Expr RPAREN
   */
  function Parser(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  Parser.prototype.peek = function () {
    return this.tokens[this.pos] || { type: 'EOF', value: '' };
  };

  Parser.prototype.consume = function (expectedType) {
    var tok = this.peek();
    if (expectedType && tok.type !== expectedType) {
      throw new Error('Expected ' + expectedType + ' at position ' + tok.pos + ', got ' + tok.type + ' ("' + tok.value + '")');
    }
    this.pos++;
    return tok;
  };

  Parser.prototype.parse = function () {
    if (this.peek().type === 'EOF') {
      return { type: NODE_TYPES.EPSILON };
    }
    var ast = this.parseExpr();
    if (this.peek().type !== 'EOF') {
      var tok = this.peek();
      throw new Error('Unexpected token "' + tok.value + '" at position ' + tok.pos);
    }
    return ast;
  };

  Parser.prototype.parseExpr = function () {
    var node = this.parseConcat();
    while (this.peek().type === 'UNION') {
      this.consume('UNION');
      var right = this.parseConcat();
      node = { type: NODE_TYPES.UNION, left: node, right: right };
    }
    return node;
  };

  Parser.prototype.parseConcat = function () {
    var node = this.parsePostfix();
    while (this.peek().type === 'CONCAT') {
      this.consume('CONCAT');
      var right = this.parsePostfix();
      node = { type: NODE_TYPES.CONCAT, left: node, right: right };
    }
    return node;
  };

  Parser.prototype.parsePostfix = function () {
    var node = this.parseAtom();
    while (true) {
      var t = this.peek().type;
      if (t === 'STAR') {
        this.consume('STAR');
        node = { type: NODE_TYPES.STAR, expr: node };
      } else if (t === 'PLUS') {
        this.consume('PLUS');
        node = { type: NODE_TYPES.PLUS, expr: node };
      } else if (t === 'OPTIONAL') {
        this.consume('OPTIONAL');
        node = { type: NODE_TYPES.OPTIONAL, expr: node };
      } else {
        break;
      }
    }
    return node;
  };

  Parser.prototype.parseAtom = function () {
    var tok = this.peek();
    if (tok.type === 'SYMBOL') {
      this.consume('SYMBOL');
      return { type: NODE_TYPES.SYMBOL, symbol: tok.value };
    }
    if (tok.type === 'EPSILON') {
      this.consume('EPSILON');
      return { type: NODE_TYPES.EPSILON };
    }
    if (tok.type === 'EMPTY') {
      this.consume('EMPTY');
      return { type: NODE_TYPES.EMPTY };
    }
    if (tok.type === 'LPAREN') {
      this.consume('LPAREN');
      if (this.peek().type === 'RPAREN') {
        // Empty parentheses () represents epsilon
        this.consume('RPAREN');
        return { type: NODE_TYPES.EPSILON };
      }
      var expr = this.parseExpr();
      this.consume('RPAREN');
      return expr;
    }

    if (tok.type === 'EOF') {
      return { type: NODE_TYPES.EPSILON };
    }

    throw new Error('Unexpected token "' + tok.value + '" at position ' + tok.pos);
  };

  /**
   * Recursively extract all unique alphabet symbols from an AST.
   * @param {Object} ast
   * @returns {string[]}
   */
  function extractAlphabetFromAST(ast) {
    var set = new Set();
    function walk(node) {
      if (!node) return;
      if (node.type === NODE_TYPES.SYMBOL) {
        set.add(node.symbol);
      } else if (node.type === NODE_TYPES.CONCAT || node.type === NODE_TYPES.UNION) {
        walk(node.left);
        walk(node.right);
      } else if (node.type === NODE_TYPES.STAR || node.type === NODE_TYPES.PLUS || node.type === NODE_TYPES.OPTIONAL) {
        walk(node.expr);
      }
    }
    walk(ast);
    var list = Array.from(set).sort();
    return list.length ? list : ['0', '1'];
  }

  /**
   * Convert an AST back to a canonical formatted regular expression string.
   * @param {Object} node
   * @returns {string}
   */
  function stringifyAST(node) {
    if (!node) return '';
    switch (node.type) {
      case NODE_TYPES.EMPTY: return '∅';
      case NODE_TYPES.EPSILON: return 'ε';
      case NODE_TYPES.SYMBOL: return node.symbol;
      case NODE_TYPES.STAR:
        if (node.expr.type === NODE_TYPES.SYMBOL || node.expr.type === NODE_TYPES.EPSILON) {
          return stringifyAST(node.expr) + '*';
        }
        return '(' + stringifyAST(node.expr) + ')*';
      case NODE_TYPES.PLUS:
        if (node.expr.type === NODE_TYPES.SYMBOL || node.expr.type === NODE_TYPES.EPSILON) {
          return stringifyAST(node.expr) + '+';
        }
        return '(' + stringifyAST(node.expr) + ')+';
      case NODE_TYPES.OPTIONAL:
        return '(' + stringifyAST(node.expr) + ')?';
      case NODE_TYPES.CONCAT:
        return stringifyAST(node.left) + stringifyAST(node.right);
      case NODE_TYPES.UNION:
        return '(' + stringifyAST(node.left) + '|' + stringifyAST(node.right) + ')';
      default:
        return '';
    }
  }

  /**
   * Main entry point: parses regex string into AST and metadata.
   * @param {string} regexStr
   * @returns {{ success: boolean, ast?: Object, alphabet?: string[], error?: string, formatted?: string }}
   */
  function parseRegex(regexStr) {
    try {
      var tokens = tokenize(regexStr);
      var parser = new Parser(tokens);
      var ast = parser.parse();
      var alphabet = extractAlphabetFromAST(ast);
      var formatted = stringifyAST(ast);
      return {
        success: true,
        ast: ast,
        alphabet: alphabet,
        formatted: formatted
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  return {
    NODE_TYPES: NODE_TYPES,
    tokenize: tokenize,
    parse: parseRegex,
    extractAlphabetFromAST: extractAlphabetFromAST,
    stringifyAST: stringifyAST
  };
});
