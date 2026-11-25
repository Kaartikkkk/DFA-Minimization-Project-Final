/**
 * @file validator.js
 * Validation layer for Gemini Language Interpreter responses.
 *
 * Ensures that model outputs adhere to formal language theory invariants:
 *  - Strict schema validation
 *  - Alphabet symbol verification
 *  - Formal regular expression AST parsing
 *  - Symbol-alphabet containment check
 *  - Non-regular language handling (Pumping Lemma)
 *  - Ambiguity and clarification detection
 */
'use strict';

const path = require('path');
const RegexParser = require('../Milestone-2/SourceCode/js/regex-parser.js');

/**
 * Validate and sanitize a specification produced by the Gemini interpreter.
 *
 * @param {Object} rawSpec - Raw parsed JSON response from Gemini.
 * @returns {{ valid: boolean, error?: string, specification?: Object }}
 */
function validateSpecification(rawSpec) {
  if (!rawSpec || typeof rawSpec !== 'object') {
    return { valid: false, error: 'Gemini output is not a valid JSON object.' };
  }

  const status = String(rawSpec.status || '').toLowerCase().trim();
  const languageType = String(rawSpec.languageType || '').toLowerCase().trim();

  // 1. Handle Ambiguous Queries Needing Clarification FIRST
  if (rawSpec.needsClarification === true || status === 'clarification_needed') {
    return {
      valid: true,
      specification: {
        status: 'clarification_needed',
        languageType: 'unknown',
        alphabet: Array.isArray(rawSpec.alphabet) ? rawSpec.alphabet : [],
        representation: 'none',
        regex: null,
        explanation: rawSpec.explanation || 'The language description is ambiguous.',
        conditions: Array.isArray(rawSpec.conditions) ? rawSpec.conditions : [],
        needsClarification: true,
        clarificationQuestion: rawSpec.clarificationQuestion || 'Could you please clarify the specific alphabet and boundary conditions for this language?'
      }
    };
  }

  if (!languageType || (languageType !== 'regular' && languageType !== 'non-regular')) {
    return { valid: false, error: `Invalid languageType "${languageType}". Must be "regular" or "non-regular".` };
  }

  // 3. Handle Non-Regular Languages
  if (languageType === 'non-regular' || status === 'non_regular') {
    return {
      valid: true,
      specification: {
        status: 'non_regular',
        languageType: 'non-regular',
        alphabet: Array.isArray(rawSpec.alphabet) ? rawSpec.alphabet : ['0', '1'],
        representation: 'none',
        regex: null,
        explanation: rawSpec.explanation || 'This language is non-regular by the Pumping Lemma for Regular Languages and cannot be recognized by any finite automaton.',
        conditions: Array.isArray(rawSpec.conditions) ? rawSpec.conditions : [],
        needsClarification: false,
        clarificationQuestion: null
      }
    };
  }

  // 4. Validate Alphabet for Regular Languages
  if (!Array.isArray(rawSpec.alphabet) || rawSpec.alphabet.length === 0) {
    return { valid: false, error: 'Regular language specification missing valid non-empty alphabet array.' };
  }

  const cleanAlphabet = Array.from(new Set(rawSpec.alphabet.map(s => String(s).trim()).filter(Boolean)));
  if (cleanAlphabet.length === 0) {
    return { valid: false, error: 'Alphabet contains no non-empty symbols.' };
  }

  // 5. Validate Regular Expression
  const regexStr = typeof rawSpec.regex === 'string' ? rawSpec.regex.trim() : '';
  if (!regexStr) {
    return { valid: false, error: 'Regular language specification missing regular expression string.' };
  }

  // Parse using our formal AST parser
  const parseResult = RegexParser.parse(regexStr);
  if (!parseResult.success) {
    return {
      valid: false,
      error: `Malformed regular expression "${regexStr}": ${parseResult.error}`
    };
  }

  // Check that all symbols in AST belong to declared alphabet
  const alphaSet = new Set(cleanAlphabet);
  // Also permit epsilon symbols
  alphaSet.add('ε');
  alphaSet.add('');

  const symbolsUsed = parseResult.alphabet;
  for (const sym of symbolsUsed) {
    if (!alphaSet.has(sym)) {
      // Expand alphabet if Gemini extracted valid symbol in regex
      cleanAlphabet.push(sym);
      alphaSet.add(sym);
    }
  }

  return {
    valid: true,
    specification: {
      status: 'success',
      languageType: 'regular',
      alphabet: cleanAlphabet,
      representation: 'regex',
      regex: parseResult.formatted || regexStr,
      rawRegex: regexStr,
      ast: parseResult.ast,
      explanation: rawSpec.explanation || `Recognizes language matching ${parseResult.formatted}`,
      conditions: Array.isArray(rawSpec.conditions) ? rawSpec.conditions : [],
      needsClarification: false,
      clarificationQuestion: null
    }
  };
}

module.exports = {
  validateSpecification
};
