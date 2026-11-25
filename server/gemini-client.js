/**
 * @file gemini-client.js
 * Google Gemini Official SDK Client for Natural Language Automata Interpretation.
 *
 * Implements:
 *  - Official @google/genai SDK integration
 *  - Environment-based model and key configuration
 *  - Structured JSON response schema enforcement
 *  - Academic formal language theory system prompt
 *  - Graceful fallback when API key is missing or offline
 */
'use strict';

const { GoogleGenAI, Type } = require('@google/genai');
const NLDFA = require('../Milestone-2/SourceCode/js/nl-dfa.js');

const SYSTEM_INSTRUCTION = `You are a world-class theoretical computer scientist and automata theory expert.
Your task is to analyze natural-language descriptions of formal languages and convert them into precise, structured language specifications.

CRITICAL RULES:
1. UNDERSTAND LANGUAGE CONSTRUCTS:
   - Suffix/Prefix tracking: "ends with 01", "starts with 10", "ends with 00 or 11"
   - Substring conditions: "contains 101", "does not contain 00", "no consecutive 1s"
   - Parity and counting: "even number of zeros", "odd count of 1s", "count of 0s mod 3 = 0"
   - Threshold counts: "at least two 0s", "at most three 1s", "exactly three ones"
   - Divisibility & arithmetic: "binary numbers divisible by 3", "multiple of 2"
   - String length rules: "even length", "length at least 3"
   - Combined compound conditions: "starts with 0 and ends with 1", "even zeros or odd ones"

2. FORMAL REGULAR EXPRESSION SYNTAX:
   - Use standard formal regular expression notation:
     * Union: | (or +) e.g. (0|1)*01
     * Concatenation: adjacent symbols e.g. 01
     * Kleene star: * e.g. (0|1)*
     * Epsilon: ε or eps
     * Parentheses: ()
   - When expressing "strings over {0,1} ending with 01", write: (0|1)*01
   - When expressing "contains 101", write: (0|1)*101(0|1)*
   - When expressing "no consecutive 1s", write: (0|10)*(1|ε) or (0|10)*1?
   - When expressing "even number of zeros", write: 1*(01*01*)*
   - When expressing "ends with 00 or 11", write: (0|1)*(00|11)
   - When expressing "binary numbers divisible by 3", write: (0|1(01*0)*1)*

3. REGULAR VS NON-REGULAR LANGUAGES:
   - Detect non-regular languages such as:
     * {0^n 1^n | n >= 0} (equal number of zeros and ones)
     * General palindromes {w | w = w^R}
     * Balanced parentheses
     * {a^p | p is prime}
   - For non-regular languages, set languageType: "non-regular", status: "non_regular", regex: null, and provide a clear explanation citing the Pumping Lemma for Regular Languages.

4. AMBIGUITY AND CLARIFICATION:
   - If the description is contradictory or genuinely ambiguous (e.g. "strings that are good", "dfa for language"), set needsClarification: true, status: "clarification_needed", and provide a helpful clarificationQuestion.
   - Infer standard binary alphabet {0,1} when binary, zeros, or ones are mentioned.
   - Infer {a,b} when a and b are mentioned.
   - Never invent arbitrary alphabets.

5. NEVER FABRICATE DFA TRANSITIONS:
   - Return ONLY the language specification and formal regular expression. Do not output transition tables or states. The downstream compiler handles deterministic construction.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    status: {
      type: Type.STRING,
      enum: ['success', 'clarification_needed', 'non_regular', 'unsupported']
    },
    languageType: {
      type: Type.STRING,
      enum: ['regular', 'non-regular', 'unknown']
    },
    alphabet: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    representation: {
      type: Type.STRING,
      enum: ['regex', 'conditions', 'none']
    },
    regex: { type: Type.STRING },
    explanation: { type: Type.STRING },
    conditions: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    needsClarification: { type: Type.BOOLEAN },
    clarificationQuestion: { type: Type.STRING }
  },
  required: ['status', 'languageType', 'alphabet', 'needsClarification']
};

/**
 * Get configured Gemini client instance or null if unconfigured.
 */
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

/**
 * Check if the Gemini API key is configured.
 */
function isConfigured() {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'your_key_here' && key.trim() !== '');
}

/**
 * Get active model name from environment.
 */
function getModelName() {
  return process.env.GEMINI_MODEL || 'gemini-3.5-flash';
}

/**
 * Interpret a natural language question using Gemini.
 *
 * @param {string} question - Natural language automata question.
 * @returns {Promise<{ success: boolean, source: 'gemini'|'fallback', rawSpec?: Object, error?: string, model?: string }>}
 */
async function interpretLanguage(question) {
  const text = String(question || '').trim();
  if (!text) {
    return {
      success: false,
      error: 'Question text is empty.',
      source: 'validation'
    };
  }

  const client = getClient();
  const modelName = getModelName();

  // If Gemini API is not configured, signal fallback availability
  if (!client) {
    return {
      success: false,
      error: 'GEMINI_API_KEY is not configured in backend environment (.env).',
      source: 'fallback',
      isKeyMissing: true,
      model: modelName
    };
  }

  try {
    const prompt = `User question / language description: "${text}"\nProvide the formal structured specification.`;

    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1
      }
    });

    const candidateText = response && response.text ? response.text.trim() : '';
    if (!candidateText) {
      return {
        success: false,
        error: 'Gemini returned an empty response.',
        source: 'gemini',
        model: modelName
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(candidateText);
    } catch (parseErr) {
      return {
        success: false,
        error: `Failed to parse Gemini response as JSON: ${parseErr.message}`,
        rawText: candidateText,
        source: 'gemini',
        model: modelName
      };
    }

    return {
      success: true,
      source: 'gemini',
      rawSpec: parsed,
      model: modelName
    };

  } catch (err) {
    const errMsg = err.message || String(err);

    // Rate limit detection
    const isRateLimit = errMsg.includes('429') || errMsg.toLowerCase().includes('resource_exhausted');
    // Auth error detection
    const isAuthError = errMsg.includes('401') || errMsg.includes('403') || errMsg.toLowerCase().includes('api_key_invalid');

    return {
      success: false,
      error: `Gemini API Error: ${errMsg}`,
      isRateLimit,
      isAuthError,
      source: 'gemini',
      model: modelName
    };
  }
}

/**
 * Local deterministic fallback when Gemini API is offline or unconfigured.
 *
 * @param {string} question
 * @returns {Object} Structured specification matching Gemini schema.
 */
function localDeterministicFallback(question) {
  const nlRes = NLDFA.parse(question);
  if (!nlRes.success) {
    return {
      status: 'unsupported',
      languageType: 'unknown',
      alphabet: nlRes.alphabet || ['0', '1'],
      representation: 'none',
      regex: null,
      explanation: nlRes.error,
      conditions: [],
      needsClarification: false,
      clarificationQuestion: null,
      fallbackSuggestion: nlRes.suggestion
    };
  }

  // Synthesize regular expression representation
  const alpha = nlRes.alphabet || ['0', '1'];
  let regex = null;

  if (nlRes.formattedRegex) {
    regex = nlRes.formattedRegex;
  } else if (nlRes.ruleType === 'ending') {
    const m = question.match(/(?:ending\s+(?:with|in)|ends?\s+(?:with|in)|terminates?\s+(?:with|in)|ending\s+in|ends\s+in)\s+['"`]?([01ab]+)['"`]?/i);
    const pat = m ? m[1] : (question.includes('00') ? '00' : '01');
    regex = `(${alpha.join('|')})*${pat}`;
  } else if (nlRes.ruleType === 'multiple_endings') {
    const m = question.match(/(?:ending\s+(?:with|in)|ends?\s+(?:with|in))\s+(?:either\s+)?['"`]?([01ab]+)['"`]?\s+or\s+['"`]?([01ab]+)['"`]?/i);
    const p1 = m ? m[1] : '00', p2 = m ? m[2] : '11';
    regex = `(${alpha.join('|')})*(${p1}|${p2})`;
  } else if (nlRes.ruleType === 'starting') {
    const m = question.match(/(?:starting\s+(?:with|in)|starts?\s+(?:with|in)|begins?\s+(?:with|in))\s+['"`]?([01ab]+)['"`]?/i);
    const pat = m ? m[1] : '10';
    regex = `${pat}(${alpha.join('|')})*`;
  } else if (nlRes.ruleType === 'substring') {
    const m = question.match(/(?:containing|contains|has\s+substring|with\s+substring)\s+['"`]?([01ab]+)['"`]?/i);
    const pat = m ? m[1] : '101';
    regex = `(${alpha.join('|')})*${pat}(${alpha.join('|')})*`;
  } else if (nlRes.ruleType === 'compound_and') {
    if (/starts?(?:ing)?\s+with\s+0/i.test(question) && /ends?(?:ing)?\s+with\s+1/i.test(question)) {
      regex = `0(${alpha.join('|')})*1`;
    } else if (/starts?(?:ing)?\s+with\s+a/i.test(question) && /ends?(?:ing)?\s+with\s+b/i.test(question)) {
      regex = `a(${alpha.join('|')})*b`;
    } else {
      regex = `(${alpha.join('|')})*`;
    }
  } else if (nlRes.ruleType === 'compound_substring_and') {
    regex = `(${alpha.join('|')})*00(${alpha.join('|')})*11(${alpha.join('|')})*|(${alpha.join('|')})*11(${alpha.join('|')})*00(${alpha.join('|')})*`;
  } else if (nlRes.ruleType === 'parity' || nlRes.ruleType === 'parity_even' || nlRes.ruleType === 'parity_odd') {
    if (/odd/i.test(question) || (nlRes.description && /odd/i.test(nlRes.description))) {
      if (/one/i.test(question) || /1/i.test(question)) {
        regex = `0*(10*10*)*10*`;
      } else {
        regex = `1*01*(01*01*)*`;
      }
    } else {
      if (/one/i.test(question) || /1/i.test(question)) {
        regex = `0*(10*10*)*`;
      } else {
        regex = `1*(01*01*)*`;
      }
    }
  } else if (nlRes.ruleType === 'forbidden_substring') {
    if (question.includes('11') || /consecutive\s+1/i.test(question) || /never\s+contain\s+11/i.test(question) || /consecutive\s+one/i.test(question)) {
      regex = `(0|10)*(1|ε)`;
    } else if (question.includes('00') || /consecutive\s+0/i.test(question) || /consecutive\s+zero/i.test(question)) {
      regex = `(1|01)*(0|ε)`;
    } else if (question.includes('101')) {
      regex = `(0|11*00)*(11*0|11*|ε)`;
    } else {
      regex = `(0|10)*(1|ε)`;
    }
  } else if (nlRes.ruleType === 'binary_divisible') {
    if (question.includes('3')) {
      regex = `(0|1(01*0)*1)*`;
    } else {
      regex = `(${alpha.join('|')})*0`;
    }
  } else if (nlRes.ruleType === 'symbol_threshold' || nlRes.ruleType === 'exact_count' || nlRes.ruleType === 'threshold_count_min' || nlRes.ruleType === 'threshold_count_max' || nlRes.ruleType === 'threshold_count') {
    if (/at\s+most/i.test(question) || /less\s+than/i.test(question)) {
      if (question.includes('three') || question.includes('3')) {
        regex = `0*(1|ε)0*(1|ε)0*(1|ε)0*`;
      } else if (question.includes('two') || question.includes('2')) {
        regex = `0*(1|ε)0*(1|ε)0*`;
      } else {
        regex = `0*(1|ε)0*`;
      }
    } else if (/at\s+least/i.test(question) || /more\s+than/i.test(question) || /greater\s+than/i.test(question)) {
      const sym = (/zero|0/i.test(question)) ? '0' : '1';
      if (question.includes('three') || question.includes('3')) {
        regex = `(${alpha.join('|')})*${sym}(${alpha.join('|')})*${sym}(${alpha.join('|')})*${sym}(${alpha.join('|')})*`;
      } else if (question.includes('two') || question.includes('2')) {
        regex = `(${alpha.join('|')})*${sym}(${alpha.join('|')})*${sym}(${alpha.join('|')})*`;
      } else {
        regex = `(${alpha.join('|')})*${sym}(${alpha.join('|')})*`;
      }
    } else {
      const sym = (/zero|0/i.test(question)) ? '0' : '1';
      const other = sym === '1' ? '0' : '1';
      if (question.includes('three') || question.includes('3')) {
        regex = `${other}*${sym}${other}*${sym}${other}*${sym}${other}*`;
      } else if (question.includes('two') || question.includes('2')) {
        regex = `${other}*${sym}${other}*${sym}${other}*`;
      } else {
        regex = `${other}*${sym}${other}*`;
      }
    }
  } else if (nlRes.ruleType === 'length' || nlRes.ruleType === 'length_modulo' || nlRes.ruleType === 'length_constraint' || nlRes.ruleType === 'even_length') {
    if (/odd/i.test(question) || (nlRes.description && /odd/i.test(nlRes.description))) {
      regex = `(${alpha.join('|')})((${alpha.join('|')})(${alpha.join('|')}))*`;
    } else {
      regex = `((${alpha.join('|')})(${alpha.join('|')}))*`;
    }
  } else if (nlRes.ruleType === 'same_start_end') {
    regex = `0(0|1)*0|1(0|1)*1|0|1`;
  } else if (nlRes.ruleType === 'followed_by') {
    regex = `(1|01)*`;
  } else {
    regex = `(${alpha.join('|')})*`;
  }

  return {
    status: 'success',
    languageType: 'regular',
    alphabet: alpha,
    representation: 'regex',
    regex: regex,
    explanation: nlRes.description,
    conditions: [nlRes.ruleType],
    needsClarification: false,
    clarificationQuestion: null,
    synthesizedDFA: nlRes.dfa
  };
}

module.exports = {
  getClient,
  isConfigured,
  getModelName,
  interpretLanguage,
  localDeterministicFallback
};
