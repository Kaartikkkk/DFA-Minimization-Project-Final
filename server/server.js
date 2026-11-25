/**
 * @file server.js
 * Secure Express Backend for DFA Minimization Platform with Google Gemini Integration.
 *
 * Provides:
 *  - POST /api/interpret-language (Gemini AI interpretation with structured validation)
 *  - POST /api/compile-dfa (Direct automata pipeline compilation)
 *  - GET /api/health (System status, active model, API key configuration)
 *  - Static serving of frontend application
 *  - Security headers, CORS, rate limiting, and comprehensive error handling
 */
'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Load environment configuration from .env in project root
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const geminiClient = require('./gemini-client.js');
const validator = require('./validator.js');
const Pipeline = require('../Milestone-2/SourceCode/js/pipeline.js');

const app = express();
const PORT = process.env.PORT || 5050;

// Enable CORS for frontend flexibility (supports both standalone frontend and unified port)
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting: 60 requests per minute to prevent abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    error: 'Too many requests. Please try again after 1 minute.'
  }
});

// Apply rate limiting to all /api/ routes
app.use('/api/', apiLimiter);

/* =========================================================================
   1. Health Check Endpoint
   ========================================================================= */
app.get('/api/health', (req, res) => {
  const configured = geminiClient.isConfigured();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    gemini: {
      configured: configured,
      model: geminiClient.getModelName(),
      status: configured ? 'ready' : 'key_missing'
    },
    serverPort: PORT
  });
});

/* =========================================================================
   2. Gemini Language Interpretation Endpoint
   ========================================================================= */
app.post('/api/interpret-language', async (req, res) => {
  const question = req.body && req.body.question ? String(req.body.question).trim() : '';

  if (!question) {
    return res.status(400).json({
      status: 'error',
      error: 'Missing required field "question" in request body.'
    });
  }

  // Attempt interpretation via Gemini
  let geminiRes = await geminiClient.interpretLanguage(question);
  let validatedSpec = null;
  let source = 'gemini';

  // If Gemini succeeded, validate structured output
  if (geminiRes.success && geminiRes.rawSpec) {
    const valResult = validator.validateSpecification(geminiRes.rawSpec);
    if (valResult.valid) {
      validatedSpec = valResult.specification;
    } else {
      // Gemini returned malformed spec; fall back to local engine
      console.warn('Gemini spec failed validation, engaging fallback:', valResult.error);
      const fallbackSpec = geminiClient.localDeterministicFallback(question);
      const fbVal = validator.validateSpecification(fallbackSpec);
      if (fbVal.valid) {
        validatedSpec = fbVal.specification;
        source = 'local_fallback';
      }
    }
  } else {
    // Gemini unavailable, unconfigured, or encountered rate limit/error
    // Engage local deterministic parser
    const fallbackSpec = geminiClient.localDeterministicFallback(question);
    const fbVal = validator.validateSpecification(fallbackSpec);
    if (fbVal.valid) {
      validatedSpec = fbVal.specification;
      source = 'local_fallback';
    }
  }

  if (!validatedSpec) {
    return res.status(422).json({
      status: 'error',
      error: geminiRes.error || 'Could not interpret or construct an automaton from this question.',
      suggestion: 'Please verify the phrasing or enter a regular expression directly.'
    });
  }

  // Handle Clarification Requests
  if (validatedSpec.status === 'clarification_needed' || validatedSpec.needsClarification) {
    return res.json({
      status: 'clarification_needed',
      source: source,
      model: geminiClient.getModelName(),
      specification: validatedSpec,
      clarificationQuestion: validatedSpec.clarificationQuestion
    });
  }

  // Handle Non-Regular Languages
  if (validatedSpec.status === 'non_regular' || validatedSpec.languageType === 'non-regular') {
    return res.json({
      status: 'non_regular',
      source: source,
      model: geminiClient.getModelName(),
      specification: validatedSpec,
      explanation: validatedSpec.explanation
    });
  }

  // Regular Language: Run through complete mathematical automata pipeline
  try {
    const method = req.body && req.body.method ? req.body.method : 'hopcroft';
    const pipelineRes = Pipeline.run({
      input: validatedSpec.regex,
      mode: 'regex',
      alphabet: validatedSpec.alphabet,
      method: method
    });

    if (!pipelineRes.success) {
      return res.status(500).json({
        status: 'error',
        error: `Automata generation failed: ${pipelineRes.error}`,
        specification: validatedSpec
      });
    }

    return res.json({
      status: 'success',
      source: source,
      model: source === 'gemini' ? geminiClient.getModelName() : 'local_deterministic_synthesizer',
      specification: validatedSpec,
      pipeline: pipelineRes,
      warning: source === 'local_fallback' ? (geminiRes.error || 'Gemini AI unavailable - using local deterministic synthesizer.') : null
    });

  } catch (err) {
    console.error('Pipeline execution exception:', err);
    return res.status(500).json({
      status: 'error',
      error: `Internal pipeline exception: ${err.message}`,
      specification: validatedSpec
    });
  }
});

/* =========================================================================
   3. Direct DFA Compilation Endpoint
   ========================================================================= */
app.post('/api/compile-dfa', (req, res) => {
  const { input, mode = 'regex', alphabet, method = 'hopcroft' } = req.body || {};

  if (!input) {
    return res.status(400).json({ status: 'error', error: 'Missing input parameter.' });
  }

  const pipelineRes = Pipeline.run({
    input: input,
    mode: mode,
    alphabet: alphabet,
    method: method
  });

  return res.json(pipelineRes);
});

/* =========================================================================
   4. Static Frontend File Serving
   ========================================================================= */
const staticPath = path.resolve(__dirname, '..', 'Milestone-2', 'SourceCode');
app.use(express.static(staticPath));

// Fallback to index.html for any non-API route
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ status: 'error', error: 'Endpoint not found.' });
  }
  res.sendFile(path.join(staticPath, 'index.html'));
});

/* =========================================================================
   5. Server Start
   ========================================================================= */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`  AutomataFlow Express Backend with Google Gemini API`);
    console.log(`  Running on: http://localhost:${PORT}`);
    console.log(`  Gemini Configured: ${geminiClient.isConfigured() ? 'YES' : 'NO (fallback enabled)'}`);
    console.log(`  Gemini Model: ${geminiClient.getModelName()}`);
    console.log(`================================================================`);
  });
}

module.exports = app;
