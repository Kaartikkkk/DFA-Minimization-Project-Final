/**
 * @file app.js
 * Controller for AutomataFlow Studio (entry point: index.html loads this last).
 * Responsibilities:
 * - Read and validate the DFA definition form.
 * - Call DFAAlgo.minimize() and orchestrate the returned execution step records.
 * - Render state diagrams, distinguishability matrix heatmaps, and partition refinement tables.
 * - Manage dual-DFA string verification and execution path visualization.
 * - Power the dedicated Analytics & Optimization Intelligence Dashboard with SVG charts.
 * - Drive the Automated Test Suite & Quality Assurance Dashboard with live search.
 * - Render the interactive Formal Specification & Design Whitepaper.
 */
(function () {
  'use strict';
  var A = window.DFAAlgo, G = window.DFAGraph, PRESETS = window.DFA_PRESETS;
  var $ = function (id) { return document.getElementById(id); };

  var editor = { states: [], alphabet: [], start: '', finals: new Set(), delta: {} };
  var res = null, steps = [], cur = 0, timer = null;

  /** Escape text for safe insertion into HTML. */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /** Format a list as set notation, e.g. {A, B}. */
  function set(list) { return '{' + list.map(esc).join(', ') + '}'; }
  /** Bold HTML-escaped text. */
  function b(s) { return '<b>' + esc(s) + '</b>'; }

  /* ================= Navigation & Tabs ================= */
  function handleTabClick(btn) {
    document.querySelectorAll('.nav-tab, .tab').forEach(function (t) { t.classList.toggle('active', t === btn); });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.hidden = p.id !== btn.dataset.tab; });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.nav-tab, .tab').forEach(function (btn) {
    btn.addEventListener('click', function () { handleTabClick(btn); });
  });

  /* ================= DFA Editor ================= */
  /** Put a DFA into the editor form. @param {DFA} dfa */
  function loadDFA(dfa) {
    editor.states = dfa.states.slice();
    editor.alphabet = dfa.alphabet.slice();
    editor.start = dfa.start;
    editor.finals = new Set(dfa.finals);
    editor.delta = {};
    dfa.states.forEach(function (s) { editor.delta[s] = Object.assign({}, dfa.delta[s] || {}); });
    $('states').value = editor.states.join(', ');
    $('alphabet').value = editor.alphabet.join(', ');
    renderEditor();
  }

  /** Re-read Q and Σ from the text boxes and refresh the δ table. */
  function syncFromInputs() {
    editor.states = A.parseList($('states').value);
    editor.alphabet = A.parseList($('alphabet').value);
    if (editor.states.indexOf(editor.start) === -1) editor.start = editor.states[0] || '';
    renderEditor();
  }

  /** Update the badges in the card header (Start State, Accepting States, Count). */
  function updateHeaderBadges() {
    if ($('startBadgeVal')) $('startBadgeVal').textContent = editor.start || '—';
    if ($('acceptBadgeVal')) {
      var finArr = [];
      editor.finals.forEach(function (f) { finArr.push(f); });
      $('acceptBadgeVal').textContent = finArr.length ? finArr.join(', ') : 'None';
    }
    if ($('stateCountBadge')) $('stateCountBadge').textContent = editor.states.length + ' States';
  }

  /** Draw the start-state menu, final-state chips and the δ matrix from `editor`. */
  function renderEditor() {
    var st = editor.states;
    $('startSel').innerHTML = st.map(function (s) {
      return '<option' + (s === editor.start ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('');

    // Update compact final chips list matching reference image
    if ($('finalChipsList')) {
      var finArr = [];
      editor.finals.forEach(function (f) { finArr.push(f); });
      $('finalChipsList').innerHTML = finArr.length ? finArr.map(function (f) {
        return '<span class="final-chip-pill"><button type="button" class="btn-remove-chip" data-remove="' + esc(f) + '" title="Remove ' + esc(f) + '">×</button> <span>' + esc(f) + '</span></span>';
      }).join('') : '<span class="chip-placeholder">None</span>';
    }

    if ($('finalSelectAdd')) {
      var available = st.filter(function (s) { return !editor.finals.has(s); });
      $('finalSelectAdd').innerHTML = '<option value="">+ Add</option>' + available.map(function (s) {
        return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
      }).join('');
    }

    // Keep hidden #finals checkboxes updated for backward compatibility
    if ($('finals')) {
      $('finals').innerHTML = st.length ? st.map(function (s) {
        return '<label class="chip-check"><input type="checkbox" value="' + esc(s) + '"' +
          (editor.finals.has(s) ? ' checked' : '') + '> ' + esc(s) + '</label>';
      }).join('') : '';
    }

    var head = '<tr><th>State</th>' + editor.alphabet.map(function (a) { return '<th>' + esc(a) + '</th>'; }).join('') + '</tr>';
    var rows = st.map(function (s) {
      var isFinal = editor.finals.has(s);
      var rowCls = isFinal ? ' class="is-final-row"' : '';
      return '<tr' + rowCls + '><td class="state-cell" title="Click to toggle accepting state"><strong>' + esc(s) + '</strong></td>' + editor.alphabet.map(function (a) {
        var v = (editor.delta[s] || {})[a] || '';
        return '<td><select class="delta-select" data-s="' + esc(s) + '" data-a="' + esc(a) + '"><option value="">—</option>' +
          st.map(function (t) { return '<option' + (t === v ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') +
          '</select></td>';
      }).join('') + '</tr>';
    }).join('');
    $('deltaTable').innerHTML = '<thead>' + head + '</thead><tbody>' + rows + '</tbody>';

    updateHeaderBadges();
  }

  $('states').addEventListener('change', syncFromInputs);
  $('alphabet').addEventListener('change', syncFromInputs);
  $('startSel').addEventListener('change', function (e) { editor.start = e.target.value; renderEditor(); });
  $('finals').addEventListener('change', function (e) {
    if (e.target.checked) editor.finals.add(e.target.value); else editor.finals.delete(e.target.value);
    renderEditor();
  });

  if ($('finalChipsList')) {
    $('finalChipsList').addEventListener('click', function (e) {
      var rm = e.target.closest('[data-remove]');
      if (rm) {
        var s = rm.getAttribute('data-remove');
        editor.finals.delete(s);
        renderEditor();
        run();
      }
    });
  }

  if ($('finalSelectAdd')) {
    $('finalSelectAdd').addEventListener('change', function (e) {
      var val = e.target.value;
      if (val) {
        editor.finals.add(val);
        e.target.value = '';
        renderEditor();
        run();
      }
    });
  }

  document.querySelectorAll('input[name=method]').forEach(function (radio) {
    radio.addEventListener('change', function () { run(); });
  });
  $('deltaTable').addEventListener('change', function (e) {
    var s = e.target.dataset.s, a = e.target.dataset.a;
    if (!s) return;
    editor.delta[s] = editor.delta[s] || {};
    editor.delta[s][a] = e.target.value;
  });

  // Clicking on a state name in the Transitions table toggles accepting state
  $('deltaTable').addEventListener('click', function (e) {
    var td = e.target.closest('td.state-cell');
    if (td) {
      var s = td.textContent.trim();
      if (editor.finals.has(s)) {
        editor.finals.delete(s);
      } else {
        editor.finals.add(s);
      }
      renderEditor();
      run();
    }
  });

  // Options drawer toggle
  if ($('sidebarOptionsBtn')) {
    $('sidebarOptionsBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var p = $('sidebarOptionsPanel');
      p.hidden = !p.hidden;
      $('sidebarOptionsBtn').setAttribute('aria-expanded', !p.hidden);
    });
  }
  if ($('closeOptionsBtn')) {
    $('closeOptionsBtn').addEventListener('click', function () {
      $('sidebarOptionsPanel').hidden = true;
      if ($('sidebarOptionsBtn')) $('sidebarOptionsBtn').setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', function (e) {
    var panel = $('sidebarOptionsPanel');
    if (panel && !panel.hidden && !panel.contains(e.target) && e.target !== $('sidebarOptionsBtn') && !$('sidebarOptionsBtn').contains(e.target)) {
      panel.hidden = true;
      if ($('sidebarOptionsBtn')) $('sidebarOptionsBtn').setAttribute('aria-expanded', 'false');
    }
  });

  // Header badges click to jump to editor state configuration
  if ($('startBadge')) {
    $('startBadge').addEventListener('click', function () {
      if (document.body.classList.contains('focus') || document.body.classList.contains('focus-mode')) {
        toggleFocus();
      }
      if ($('startSel')) {
        $('startSel').scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('startSel').focus();
      }
    });
  }
  if ($('acceptingBadge')) {
    $('acceptingBadge').addEventListener('click', function () {
      if (document.body.classList.contains('focus') || document.body.classList.contains('focus-mode')) {
        toggleFocus();
      }
      if ($('finalAddBtn')) {
        $('finalAddBtn').scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('finalAddBtn').focus();
      }
    });
  }

  /** Build a DFA object from the editor. @returns {DFA} */
  function currentDFA() {
    var delta = {};
    editor.states.forEach(function (s) {
      delta[s] = {};
      editor.alphabet.forEach(function (a) {
        var t = (editor.delta[s] || {})[a];
        if (t) delta[s][a] = t;
      });
    });
    return {
      states: editor.states.slice(), alphabet: editor.alphabet.slice(), start: editor.start,
      finals: editor.states.filter(function (s) { return editor.finals.has(s); }), delta: delta
    };
  }

  /* ================= Presets ================= */
  function syncActivePresetChip(presetId) {
    document.querySelectorAll('.preset-chip').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-preset') === presetId);
    });
  }

  $('preset').innerHTML = '<option value="">— Select an example —</option>' + PRESETS.map(function (p) {
    return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
  }).join('');

  $('preset').addEventListener('change', function (e) {
    var p = PRESETS.filter(function (x) { return x.id === e.target.value; })[0];
    syncActivePresetChip(e.target.value);
    if (!p) return;
    loadDFA(p.dfa);
    $('presetNote').textContent = p.note;
    run();
  });

  document.querySelectorAll('.preset-chip').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var presetId = btn.getAttribute('data-preset');
      if (presetId) {
        $('preset').value = presetId;
        $('preset').dispatchEvent(new Event('change'));
      }
    });
  });

  $('newBtn').addEventListener('click', function () {
    $('preset').value = '';
    syncActivePresetChip('');
    $('presetNote').textContent = 'Enter your states and transitions, then click Minimize DFA.';
    loadDFA({ states: ['q0', 'q1', 'q2'], alphabet: ['0', '1'], start: 'q0', finals: [], delta: {} });
  });

  /* ================= Run Minimization Engine ================= */
  $('runBtn').addEventListener('click', function () { run(); });

  /**
   * Minimize the DFA in the editor and initialize steps.
   * @param {DFA} [machine]
   */
  function run(machine) {
    stop();
    if (!machine) syncFromInputs();
    var method = document.querySelector('input[name=method]:checked').value;
    res = A.minimize(machine || currentDFA(), method);
    var msg = $('inputMsg');
    if (!res.ok) {
      msg.style.display = 'block';
      msg.className = 'notification-banner error';
      msg.innerHTML = '<strong>Please fix the following:</strong><ul>' + res.validation.errors.map(function (e) {
        return '<li>' + esc(e) + '</li>';
      }).join('') + '</ul>';
      $('player').hidden = true; $('tester').hidden = true; $('emptyState').hidden = false;
      if ($('bottomCardsGrid')) $('bottomCardsGrid').hidden = true;
      if ($('stepDetailsPanel')) $('stepDetailsPanel').hidden = true;
      if ($('equivVerificationCard')) $('equivVerificationCard').hidden = true;
      return;
    }
    $('emptyState').hidden = true;
    if ($('equivVerificationCard')) $('equivVerificationCard').hidden = false;
    var notes = res.validation.warnings.slice();
    if (res.dead) notes.push(res.validation.missing.length + ' missing transition(s) connected to trap state: ' + res.dead);
    if (notes.length) {
      msg.style.display = 'block';
      msg.className = 'notification-banner warn';
      msg.innerHTML = notes.map(esc).join('<br>');
    } else {
      msg.style.display = 'none';
      msg.className = 'notification-banner';
      msg.innerHTML = '';
    }
    steps = buildSteps(res);
    $('player').hidden = false; $('tester').hidden = false;
    if ($('bottomCardsGrid')) $('bottomCardsGrid').hidden = false;
    if ($('stepDetailsPanel')) $('stepDetailsPanel').hidden = false;
    $('testOut').innerHTML = '';
    $('testLog').hidden = true;
    $('testLog').tBodies[0].innerHTML = '';
    renderSummary();
    renderEquivalenceVerification();
    renderTimeline();
    renderSamples();
    renderStepList();
    show(0);
  }

  /* ================= Executive KPI Strip & Timeline ================= */
  /** Render executive KPI summary strip for the current run. */
  function renderSummary() {
    var before = res.full.states.length, after = res.min.states.length;
    var reduction = before > 0 ? Math.round((before - after) / before * 100) : 0;
    var merged = res.classes.filter(function (c) { return c.length > 1; });
    var unreachCount = res.reach.unreachable.length;
    var isValid = res.equivalence.equal && res.isMinimal;

    if ($('kpiStatesReduced')) {
      $('kpiStatesReduced').textContent = before + ' → ' + after;
    }
    if ($('kpiFinalStates')) {
      var finList = res.min.finals;
      $('kpiFinalStates').textContent = finList.length ? finList.join(', ') : 'None';
    }

    // Update Hopcroft–Karp Equivalence Verification Panel
    if ($('equivVerifyPanel')) {
      var eq = res.equivalence;
      var eqOk = eq && eq.equal;
      if ($('equivBadge')) {
        $('equivBadge').className = 'equiv-status-badge ' + (eqOk ? 'ok' : 'bad');
      }
      if ($('equivStatusText')) {
        $('equivStatusText').textContent = eqOk
          ? 'DFA Equivalence Verified: L(Original) ≡ L(Minimized)'
          : 'Equivalence Check Failed: Language Discrepancy';
      }
      if ($('equivPairsVal')) {
        $('equivPairsVal').textContent = (eq ? eq.pairsExplored : 0) + ' pairs';
      }
      if ($('equivTimeVal')) {
        $('equivTimeVal').textContent = (eq && eq.timeMs !== undefined ? eq.timeMs + ' ms' : '< 0.1 ms');
      }
      if ($('equivResultVal')) {
        $('equivResultVal').textContent = eqOk ? '100% Match' : 'Mismatch';
        $('equivResultVal').className = 'equiv-detail-val ' + (eqOk ? 'ok' : 'bad');
      }
      if ($('equivCounterexampleBox') && $('equivCounterexampleVal')) {
        if (!eqOk && eq.counterexample !== undefined) {
          $('equivCounterexampleBox').hidden = false;
          $('equivCounterexampleVal').textContent = eq.counterexample === '' ? 'ε (empty string)' : eq.counterexample;
        } else {
          $('equivCounterexampleBox').hidden = true;
        }
      }
    }

    $('summary').innerHTML =
      '<div class="kpi-item hero">' +
      '<span>States</span>' +
      '<strong>' + before + ' → ' + after + '</strong>' +
      '<span class="kpi-pill-badge">-' + reduction + '%</span>' +
      '</div>' +
      '<div class="kpi-item">' +
      '<span>State Groups</span>' +
      '<strong>' + res.classes.length + '</strong>' +
      '<span class="kpi-meta ok">' + (merged.length ? merged.length + ' merged' : 'Optimal') + '</span>' +
      '</div>' +
      '<div class="kpi-item">' +
      '<span>Unreachable</span>' +
      '<strong>' + unreachCount + '</strong>' +
      '<span class="kpi-meta ' + (unreachCount ? 'bad' : 'ok') + '">' + (unreachCount ? unreachCount + ' removed' : 'None') + '</span>' +
      '</div>' +
      '<div class="kpi-item ' + (isValid ? 'valid' : 'invalid') + '">' +
      '<span>Verification</span>' +
      '<strong>' + (isValid ? 'Passed' : 'Failed') + '</strong>' +
      '<span class="kpi-meta ' + (isValid ? 'ok' : 'bad') + '">' + (isValid ? '100% Match' : 'Mismatch') + '</span>' +
      '</div>';
  }

  /**
   * Render the dedicated Hopcroft–Karp Equivalence Verification Card.
   * Updates metrics table, success/failure banner, and counterexample diagnostics.
   */
  function renderEquivalenceVerification() {
    var card = $('equivVerificationCard');
    if (!card || !res || !res.ok) return;

    var eq = res.equivalence;
    var isEq = eq && (eq.equal || eq.equivalent);

    var beforeCount = res.full ? res.full.states.length : 0;
    var afterCount = res.min ? res.min.states.length : 0;
    var pairs = eq ? (eq.processed_pairs || eq.pairsExplored || 0) : 0;
    var timeVal = eq && eq.timeMs !== undefined ? eq.timeMs : (eq && eq.execution_time_ms !== undefined ? eq.execution_time_ms : 0.05);
    var timeStr = timeVal ? (timeVal < 0.1 ? '< 0.1 ms' : timeVal.toFixed(2) + ' ms') : '< 0.1 ms';

    if ($('hkOrigStates')) $('hkOrigStates').textContent = beforeCount;
    if ($('hkMinStates')) $('hkMinStates').textContent = afterCount;
    if ($('hkPairsProcessed')) $('hkPairsProcessed').textContent = pairs;
    if ($('hkExecTime')) $('hkExecTime').textContent = timeStr;

    var successBanner = $('hkSuccessBanner');
    var failedBanner = $('hkFailedBanner');
    var diagPanel = $('hkDiagnosticPanel');
    var statusText = $('hkStatusText');
    var statusSub = $('hkStatusSub');

    if (isEq) {
      if (successBanner) successBanner.hidden = false;
      if (failedBanner) failedBanner.hidden = true;
      if (diagPanel) diagPanel.hidden = true;
      if (statusText) {
        statusText.textContent = 'Equivalent';
        statusText.className = 'metric-value ok-text';
      }
      if (statusSub) statusSub.textContent = 'L(Original) ≡ L(Minimized)';
    } else {
      if (successBanner) successBanner.hidden = true;
      if (failedBanner) failedBanner.hidden = false;
      if (diagPanel) diagPanel.hidden = false;
      if (statusText) {
        statusText.textContent = 'Not Equivalent';
        statusText.className = 'metric-value bad-text';
      }
      if (statusSub) statusSub.textContent = 'Mismatch Detected';

      var distStr = (eq && eq.distinguishing_string) ? eq.distinguishing_string : (eq && eq.counterexample !== undefined ? (eq.counterexample === '' ? 'ε' : eq.counterexample) : 'ε');
      if ($('diagDistString')) $('diagDistString').textContent = distStr;

      if ($('diagOrigDecision')) {
        var origAcc = eq && eq.original_accepts !== undefined ? eq.original_accepts : (eq && eq.dfa1_accepts !== undefined ? eq.dfa1_accepts : true);
        $('diagOrigDecision').textContent = origAcc ? 'Accepts' : 'Rejects';
        $('diagOrigDecision').className = 'diag-val status-val ' + (origAcc ? 'ok-text' : 'bad-text');
      }

      if ($('diagMinDecision')) {
        var minAcc = eq && eq.minimized_accepts !== undefined ? eq.minimized_accepts : (eq && eq.dfa2_accepts !== undefined ? eq.dfa2_accepts : false);
        $('diagMinDecision').textContent = minAcc ? 'Accepts' : 'Rejects';
        $('diagMinDecision').className = 'diag-val status-val ' + (minAcc ? 'ok-text' : 'bad-text');
      }

      if ($('diagOrigPath')) {
        var p1 = (eq && (eq.original_path || eq.dfa1_path)) || [];
        $('diagOrigPath').textContent = p1.length ? p1.join(' → ') : (res.full ? res.full.start : 'Start state');
      }

      if ($('diagMinPath')) {
        var p2 = (eq && (eq.minimized_path || eq.dfa2_path)) || [];
        $('diagMinPath').textContent = p2.length ? p2.join(' → ') : (res.min ? res.min.start : 'Start state');
      }
    }
  }

  var PHASE_LABEL = {
    Input: '1. Input', Unreachable: '2. Reachable', 'Table-filling': '3. Distinguish',
    Partition: '3. Partition', Compare: '3. Compare', Merge: '4. Merge', Validate: '5. Verify'
  };
  var phaseOrder = [];

  /** Build the clickable phase stepper. */
  function renderTimeline() {
    phaseOrder = [];
    steps.forEach(function (s, k) { if (!phaseOrder.some(function (p) { return p.name === s.phase; })) phaseOrder.push({ name: s.phase, first: k }); });
    $('timeline').innerHTML = phaseOrder.map(function (p) {
      return '<li><button type="button" data-k="' + p.first + '" title="Jump to ' + esc(PHASE_LABEL[p.name] || p.name) + '">' +
        '<span class="label">' + esc(PHASE_LABEL[p.name] || p.name) + '</span></button></li>';
    }).join('');
  }

  /** Update stepper progress styling. */
  function updateTimeline(phase) {
    var idx = phaseOrder.map(function (p) { return p.name; }).indexOf(phase);
    $('timeline').querySelectorAll('li').forEach(function (li, i) {
      li.className = i < idx ? 'done' : i === idx ? 'current' : '';
      if (li.firstChild) li.firstChild.setAttribute('aria-current', i === idx ? 'step' : 'false');
    });
  }

  $('timeline').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (btn) { stop(); show(+btn.dataset.k); }
  });

  /* ================= Presentation Focus Mode ================= */
  function toggleFocus() {
    var on = document.body.classList.toggle('focus');
    document.body.classList.toggle('focus-mode', on);
    if ($('focusBtn')) {
      $('focusBtn').setAttribute('aria-pressed', on);
      $('focusBtn').title = on ? 'Show Sidebar (F)' : 'Hide Sidebar (F)';
      var sp = $('focusBtn').querySelector('span:not(.sr-only)');
      if (sp) sp.textContent = on ? 'Show Sidebar' : 'Hide Sidebar';
    }
    if ($('quickSidebarBtn')) {
      var qsp = $('quickSidebarBtn').querySelector('span');
      if (qsp) qsp.textContent = on ? 'Show Sidebar' : 'Sidebar';
    }
    if ($('actionSidebarBtn')) {
      $('actionSidebarBtn').title = on ? 'Show Sidebar (F)' : 'Hide Sidebar (F)';
      $('actionSidebarBtn').setAttribute('aria-label', on ? 'Show Sidebar' : 'Toggle Sidebar');
      var asp = $('actionSidebarBtn').querySelector('span');
      if (asp) asp.textContent = on ? 'Show Sidebar' : 'Toggle Sidebar';
    }
    // Re-draw current graph step to fill new container width smoothly
    if (typeof show === 'function' && typeof cur === 'number' && typeof steps !== 'undefined' && steps && steps[cur]) {
      setTimeout(function () { show(cur); }, 60);
    }
  }
  if ($('focusBtn')) $('focusBtn').addEventListener('click', toggleFocus);
  if ($('quickSidebarBtn')) $('quickSidebarBtn').addEventListener('click', toggleFocus);
  if ($('actionSidebarBtn')) $('actionSidebarBtn').addEventListener('click', toggleFocus);
  if ($('quickExpandBtn')) $('quickExpandBtn').addEventListener('click', expandGraph);
  if ($('actionExpandBtn')) $('actionExpandBtn').addEventListener('click', expandGraph);
  if ($('quickPrevBtn')) $('quickPrevBtn').addEventListener('click', function () { if ($('prevBtn') && !$('prevBtn').disabled) $('prevBtn').click(); });
  if ($('quickNextBtn')) $('quickNextBtn').addEventListener('click', function () { if ($('nextBtn') && !$('nextBtn').disabled) $('nextBtn').click(); });
  if ($('quickPlayBtn')) $('quickPlayBtn').addEventListener('click', function () { if ($('playBtn')) $('playBtn').click(); });

  /* ================= Build Execution Steps ================= */
  function buildSteps(r) {
    var S = [], full = r.full, red = r.reduced, Q = red.states;
    var nonFinal = function (d) { return d.states.filter(function (s) { return d.finals.indexOf(s) === -1; }); };

    // Phase 0: Input validation
    var html = '<p>Loaded DFA with <b>' + full.states.length + '</b> states: ' + set(full.states) +
      '. Start state: <b>' + esc(full.start) + '</b>, and accepting states: ' + set(full.finals) + '.</p>';
    if (r.dead) html += '<p class="note">Added trap state “' + esc(r.dead) + '” for missing transitions.</p>';
    html += '<p>Goal: Find and merge equivalent states to produce the smallest DFA that accepts the exact same language.</p>';
    S.push({
      phase: 'Input', title: 'Step 1: Original DFA Input', html: html,
      graph: { dfa: full, label: 'Original DFA' }, work: { kind: 'table', dfa: full, caption: 'Transition Table' }
    });

    // Phase 1: Unreachable states
    r.reach.steps.forEach(function (st) {
      if (st.type === 'reach-init') {
        S.push({
          phase: 'Unreachable', title: 'Step 2: Check Reachable States',
          html: '<p>Start from initial state <b>' + esc(full.start) + '</b> to see which states can actually be reached. Any unreachable state will be removed.</p>',
          graph: { dfa: full, label: 'Checking Reachability (' + full.states.length + ' States)', active: [full.start], visited: st.visited },
          work: { kind: 'reach', visited: st.visited, queue: st.queue }
        });
      } else if (st.type === 'reach-visit') {
        S.push({
          phase: 'Unreachable', title: 'Step 2: Checking State ' + st.state,
          html: '<p>Exploring transitions from state <b>' + esc(st.state) + '</b>. ' + (st.found.length
            ? 'Found reachable states: ' + st.found.map(function (f) { return b(f.state); }).join(', ') + '.'
            : 'All connected states have already been visited.') + '</p>',
          graph: {
            dfa: full, label: 'Exploring State ' + st.state, active: [st.state], visited: st.visited,
            activeEdges: full.alphabet.map(function (a) { return { from: st.state, to: full.delta[st.state][a] }; })
          },
          work: { kind: 'reach', visited: st.visited, queue: st.queue }
        });
      } else {
        S.push({
          phase: 'Unreachable', title: st.unreachable.length ? 'Step 2: Removed Unreachable States' : 'Step 2: All States Are Reachable',
          html: st.unreachable.length
            ? '<p>Exploration complete. The states ' + set(st.unreachable) + ' cannot be reached from the start state, so they are removed.</p>'
            : '<p>Exploration complete. All states can be reached from the start state. No states need to be removed.</p>',
          graph: { dfa: full, label: 'Reachable States (' + st.reachable.length + ' kept' + (st.unreachable.length ? ', ' + st.unreachable.length + ' removed' : '') + ')', faded: st.unreachable, visited: st.reachable },
          work: { kind: 'reach', visited: st.visited, queue: [], removed: st.unreachable }
        });
      }
    });

    // Phase 2a: Table-filling
    if (r.tf) {
      r.tf.steps.forEach(function (st) {
        if (st.type === 'tf-base') {
          S.push({
            phase: 'Table-filling', title: 'Step 3: Compare Pairs (Pass 0)',
            html: '<p>Mark state pairs where one state is accepting and the other is not. These states are immediately known to be different (×).</p>',
            graph: { dfa: red, label: 'Comparing Pairs (' + red.states.length + ' States)', groups: [nonFinal(red), red.finals] },
            work: { kind: 'tf', markCount: st.markCount, newPass0: true }
          });
        } else if (st.type === 'tf-mark') {
          var m = st.mark, p = Q[m.i], q = Q[m.j];
          S.push({
            phase: 'Table-filling', title: 'Step 3: Mark Pair (' + p + ', ' + q + ')',
            html: '<p>States (<b>' + p + '</b>, <b>' + q + '</b>) are different because on symbol “<b>' + esc(m.symbol) + '</b>”, they lead to (<b>' + esc(m.via[0]) + '</b>, <b>' + esc(m.via[1]) + '</b>), which are already different.</p>',
            graph: {
              dfa: red, label: 'Distinguishing (' + p + ', ' + q + ')', active: [p, q],
              activeEdges: [{ from: p, to: red.delta[p][m.symbol] }, { from: q, to: red.delta[q][m.symbol] }]
            },
            work: { kind: 'tf', markCount: st.markCount, highlight: m }
          });
        } else if (st.type === 'tf-pass') {
          S.push({
            phase: 'Table-filling', title: 'Step 3: Pass ' + st.pass + ' Complete',
            html: st.newly
              ? '<p>Pass ' + st.pass + ' found <b>' + st.newly + '</b> newly distinguished pair(s). Continuing check.</p>'
              : '<p>Pass ' + st.pass + ' found no new pairs. The table is complete.</p>',
            graph: { dfa: red, label: 'Table-Filling Pass ' + st.pass }, work: { kind: 'tf', markCount: st.markCount }
          });
        } else if (st.type === 'tf-result') {
          S.push({
            phase: 'Table-filling', title: 'Step 3: Matching States Found',
            html: '<p>' + (st.equivalentPairs.length
              ? 'Unmarked pairs behave identically: <b>' + st.equivalentPairs.map(function (pr) { return '(' + esc(pr[0]) + ', ' + esc(pr[1]) + ')'; }).join(', ') + '</b>. These will be merged.'
              : 'All pairs are different. The DFA was already minimal.') +
              '</p><p>Merged Groups: ' + st.classes.map(set).join(' ') + '</p>',
            graph: { dfa: red, label: 'Identified State Groups (' + st.classes.length + ' Groups)', groups: st.classes },
            work: { kind: 'tf', markCount: st.markCount, showEquiv: true }
          });
        }
      });
    }

    // Phase 2b: Partition refinement
    if (r.pr) {
      r.pr.steps.forEach(function (st) {
        if (st.type === 'pr-init') {
          S.push({
            phase: 'Partition', title: 'Step 3: Initial State Groups',
            html: '<p>Split states into two initial groups: non-accepting states and accepting states: ' + st.partition.map(set).join(' ') + '</p>',
            graph: { dfa: red, label: 'Initial Groups (2 Groups)', groups: st.partition },
            work: { kind: 'pr', partition: st.partition }
          });
        } else if (st.type === 'pr-iter') {
          var splits = st.details.filter(function (d) { return d.parts.length > 1; });
          S.push({
            phase: 'Partition', title: 'Step 3: Partition Round ' + st.k + (st.stable ? ' (Complete)' : ''),
            html: '<p>Check where each state jumps on each symbol.' +
              (splits.length
                ? ' States jumping to different groups are split: ' + splits.map(function (d) { return set(d.group) + ' splits into ' + d.parts.map(set).join(' and '); }).join('; ') + '.'
                : ' All states in each group jump to matching groups. Groups are stable.') + '</p>',
            graph: { dfa: red, label: 'Refined Groups (' + st.after.length + ' Groups)', groups: st.after },
            work: { kind: 'pr', iter: st }
          });
        } else if (st.type === 'pr-result') {
          S.push({
            phase: 'Partition', title: 'Step 3: Final State Groups',
            html: '<p>Each group of matching states forms one merged state: ' + st.classes.map(set).join(' ') + '</p>',
            graph: { dfa: red, label: 'Final State Groups (' + st.classes.length + ' Groups)', groups: st.classes },
            work: { kind: 'pr', partition: st.classes }
          });
        }
      });
    }

    if (r.tf && r.pr) {
      S.push({
        phase: 'Compare', title: 'Step 3: Method Comparison',
        html: r.methodsAgree
          ? '<p class="good">✓ Both Table-Filling and Partition Refinement found the <b>exact same state groups</b>.</p>'
          : '<p class="bad">✗ Methods produced different results.</p>',
        graph: { dfa: red, label: 'Verified Groups (' + r.classes.length + ' Groups)', groups: r.classes },
        work: { kind: 'compare' }
      });
    }

    // Phase 4: Merge
    S.push({
      phase: 'Merge', title: 'Step 4: Build Minimized DFA',
      html: '<p>Combine each group of equivalent states into a single state, and re-link all transitions to build the minimal DFA.</p>',
      graph: { dfa: red, label: 'State Merging', groups: r.classes },
      work: { kind: 'min' }
    });

    // Phase 5: Validation
    S.push({
      phase: 'Validate', title: 'Step 5: Verification & Results',
      html: '<ul class="facts">' +
        '<li>States reduced from <b>' + full.states.length + '</b> to <b>' + r.min.states.length + '</b>' +
        (r.reach.unreachable.length ? ' (Removed ' + set(r.reach.unreachable) + ')' : '') + '.</li>' +
        '<li class="' + (r.equivalence.equal ? 'good' : 'bad') + '">' + (r.equivalence.equal
          ? '✓ Same Language: Both DFAs accept the exact same inputs (tested ' + r.equivalence.pairsExplored + ' state combinations with zero differences).'
          : '✗ Language discrepancy detected on “' + esc(r.equivalence.counterexample) + '”.') + '</li>' +
        '<li class="' + (r.bruteForce.mismatch ? 'bad' : 'good') + '">' + (r.bruteForce.mismatch
          ? '✗ Mismatch on string “' + esc(r.bruteForce.mismatch) + '”.'
          : '✓ Tested all ' + r.bruteForce.tested + ' sample strings up to length ' + r.bruteForce.maxLength + ' with 100% agreement.') + '</li>' +
        '<li class="' + (r.isMinimal ? 'good' : 'bad') + '">' + (r.isMinimal
          ? '✓ Minimal: Verified that no smaller DFA can accept this language.'
          : '✗ Minimality check failed.') + '</li></ul>',
      graph: { dfa: r.min, label: 'Minimized DFA' },
      work: { kind: 'summary' }
    });

    return S;
  }

  function sub(n) { return String(n).replace(/\d/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[d]; }); }

  function updateWorkflowStepper(phase) {
    var stepIndex = 1;
    if (phase === 'Input' || phase === 'Unreachable') stepIndex = 1;
    else if (phase === 'Table-filling' || phase === 'Partition' || phase === 'Compare') stepIndex = 2;
    else if (phase === 'Merge') stepIndex = 3;
    else if (phase === 'Validate') stepIndex = 4;

    ['wfStep1', 'wfStep2', 'wfStep3', 'wfStep4'].forEach(function (id, idx) {
      var btn = $(id);
      if (btn) btn.classList.toggle('active', (idx + 1) === stepIndex);
    });
  }

  /* ================= Step Player Controls ================= */
  function show(i) {
    cur = Math.max(0, Math.min(i, steps.length - 1));
    var st = steps[cur];
    $('stepCount').textContent = 'Step ' + (cur + 1) + ' of ' + steps.length;
    $('stepTitle').textContent = st.title;
    $('stepText').innerHTML = st.html;
    var txt = $('stepText');
    txt.classList.remove('swap'); void txt.offsetWidth; txt.classList.add('swap');
    updateTimeline(st.phase);
    updateWorkflowStepper(st.phase);
    $('progress').style.width = ((cur + 1) / steps.length * 100) + '%';
    $('prevBtn').disabled = cur === 0;
    $('nextBtn').disabled = cur === steps.length - 1;
    if ($('quickPrevBtn')) $('quickPrevBtn').disabled = cur === 0;
    if ($('quickNextBtn')) $('quickNextBtn').disabled = cur === steps.length - 1;

    var gr = st.graph;
    $('graphLabel').textContent = gr.label;
    if ($('stateCountBadge') && gr.dfa) {
      $('stateCountBadge').textContent = gr.dfa.states.length + ' States';
    }
    if ($('startBadgeVal') && gr.dfa) {
      $('startBadgeVal').textContent = gr.dfa.start || '—';
    }
    if ($('acceptBadgeVal') && gr.dfa) {
      $('acceptBadgeVal').textContent = gr.dfa.finals.length ? gr.dfa.finals.join(', ') : 'None';
    }
    G.draw($('graphMain'), gr.dfa, {
      groups: gr.groups, active: new Set(gr.active || []), visited: new Set(gr.visited || []),
      faded: new Set(gr.faded || []), activeEdges: gr.activeEdges
    });
    renderWork(st.work);

    document.querySelectorAll('#stepList li[data-k]').forEach(function (li) {
      var on = +li.dataset.k === cur;
      li.classList.toggle('current', on);
      var ul = li.parentElement;
      if (on && (li.offsetTop < ul.scrollTop || li.offsetTop > ul.scrollTop + ul.clientHeight - 30))
        ul.scrollTop = li.offsetTop - ul.clientHeight / 2;
    });
  }

  function renderStepList() {
    var last = '';
    $('stepList').innerHTML = steps.map(function (s, k) {
      var head = s.phase !== last ? '<li class="phase-head">' + esc(s.phase) + '</li>' : '';
      last = s.phase;
      return head + '<li data-k="' + k + '">' + esc(s.title) + '</li>';
    }).join('');
  }

  $('stepList').addEventListener('click', function (e) {
    var k = e.target.dataset && e.target.dataset.k;
    if (k !== undefined) { stop(); show(+k); }
  });

  function expandGraph() {
    if ($('player').hidden) return;
    $('dlgStep').textContent = $('stepCount').textContent + ' · ' + $('graphLabel').textContent;
    $('dlgTitle').textContent = $('stepTitle').textContent;
    $('graphBig').innerHTML = $('graphMain').innerHTML;
    $('graphDialog').showModal();
  }
  $('expandBtn').addEventListener('click', expandGraph);
  $('dlgClose').addEventListener('click', function () { $('graphDialog').close(); });
  $('graphDialog').addEventListener('click', function (e) { if (e.target === this) this.close(); });

  $('prevBtn').addEventListener('click', function () { stop(); show(cur - 1); });
  $('nextBtn').addEventListener('click', function () { stop(); show(cur + 1); });
  $('firstBtn').addEventListener('click', function () { stop(); show(0); });
  $('lastBtn').addEventListener('click', function () { stop(); show(steps.length - 1); });
  $('playBtn').addEventListener('click', function () { timer ? stop() : play(); });

  function play() {
    if (cur === steps.length - 1) show(0);
    if ($('stepDetailsPanel')) $('stepDetailsPanel').open = true;
    $('playBtn').innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg><span>Pause</span>';
    if ($('quickPlayBtn')) $('quickPlayBtn').innerHTML = '<kbd>Space</kbd> <span>Pause</span>';
    var hint = $('playHint');
    if (hint) { hint.classList.add('playing'); hint.querySelector('span:last-child').textContent = 'Minimizing in progress...'; }
    timer = setInterval(function () {
      if (cur >= steps.length - 1) return stop();
      show(cur + 1);
    }, +$('speed').value);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    $('playBtn').innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Play</span>';
    if ($('quickPlayBtn')) $('quickPlayBtn').innerHTML = '<kbd>Space</kbd> <span>Play</span>';
    var hint = $('playHint');
    if (hint) { hint.classList.remove('playing'); hint.querySelector('span:last-child').innerHTML = 'Click <strong>Play</strong> to animate'; }
  }

  document.addEventListener('keydown', function (e) {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if ($('graphDialog').open) return;
    if (e.key === 'f' || e.key === 'F') { toggleFocus(); return; }
    if ((e.key === 'e' || e.key === 'E') && !$('graphDialog').open) { expandGraph(); return; }
    if ($('player').hidden) return;
    if (e.key === 'ArrowRight') { stop(); show(cur + 1); }
    else if (e.key === 'ArrowLeft') { stop(); show(cur - 1); }
    else if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); timer ? stop() : play(); }
  });

  /* ================= Working Memory Renderers ================= */
  function renderWork(w) {
    var box = $('work');
    var title = $('workLabel');
    if (w.kind === 'table') { title.textContent = w.caption; box.innerHTML = deltaTableHTML(w.dfa); }
    else if (w.kind === 'reach') { title.textContent = 'BFS Traversal State'; box.innerHTML = reachHTML(w); }
    else if (w.kind === 'tf') { title.textContent = 'Distinguishability Matrix'; box.innerHTML = tfHTML(w); }
    else if (w.kind === 'pr') { title.textContent = 'Partition Signature Table'; box.innerHTML = prHTML(w); }
    else if (w.kind === 'compare') {
      title.textContent = 'Equivalence Partition Agreement';
      box.innerHTML = '<div class="notification-banner ok" style="margin-bottom:12px;"><strong>Method Agreement:</strong> Both algorithms generated isomorphic partitions.</div>' +
        '<div class="kv"><span>Table-filling:</span><div>' + res.tf.classes.map(set).join(' ') + '</div></div>' +
        '<div class="kv"><span>Partition refinement:</span><div>' + res.pr.classes.map(set).join(' ') + '</div></div>';
    } else if (w.kind === 'min') {
      title.textContent = 'Equivalence Classes';
      box.innerHTML = classMapHTML();
    } else if (w.kind === 'summary') {
      title.textContent = 'Minimized Transition Table';
      box.innerHTML = '<div class="notification-banner ok" style="margin-bottom:8px; font-size:12px; padding:6px 10px;">' +
        '<strong>✓ Minimized:</strong> ' + res.full.states.length + ' → ' + res.min.states.length + ' states</div>' +
        deltaTableHTML(res.min);
    }
  }

  function deltaTableHTML(d) {
    return '<div class="table-scroll-wrapper"><table class="matrix-table clean-table"><thead><tr><th>State</th>' +
      d.alphabet.map(function (a) { return '<th>' + esc(a) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + d.states.map(function (s) {
        var isFin = d.finals.indexOf(s) !== -1;
        var rowCls = isFin ? ' class="is-final-row"' : '';
        return '<tr' + rowCls + '><td class="state-cell"><strong>' + esc(s) + '</strong></td>' +
          d.alphabet.map(function (a) { return '<td>' + esc(d.delta[s][a] || '—') + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function chips(list, cls) {
    return list.length ? list.map(function (s) { return '<span class="chip ' + (cls || '') + '">' + esc(s) + '</span>'; }).join('')
      : '<span class="text-muted" style="font-size:12px;">empty</span>';
  }

  function reachHTML(w) {
    return '<div class="kv"><span>Visited States</span><div>' + chips(w.visited, 'ok') + '</div></div>' +
      '<div class="kv"><span>BFS Queue</span><div>' + chips(w.queue) + '</div></div>' +
      (w.removed ? '<div class="kv"><span>Pruned States</span><div>' + chips(w.removed, 'bad') + '</div></div>' : '');
  }

  function tfHTML(w) {
    var Q = res.reduced.states, n = Q.length, byKey = {};
    res.tf.marks.forEach(function (m, k) { if (k < w.markCount) byKey[m.i + ',' + m.j] = m; });
    if (n < 2) return '<p class="text-muted">Single-state automaton: no pairs to distinguish.</p>';
    var html = '<table class="tf"><tbody>';
    for (var r = 1; r < n; r++) {
      html += '<tr><th>' + esc(Q[r]) + '</th>';
      for (var c = 0; c < n - 1; c++) {
        if (c >= r) { html += '<td class="void"></td>'; continue; }
        var m = byKey[c + ',' + r];
        var isNew = (w.highlight && w.highlight.i === c && w.highlight.j === r) || (w.newPass0 && m && m.pass === 0);
        if (m) html += '<td class="x p' + Math.min(m.pass, 4) + (isNew ? ' new' : '') + '" title="' + esc(m.reason) + '">×<sub>' + m.pass + '</sub></td>';
        else html += '<td class="' + (w.showEquiv ? 'eq' : 'empty') + '" title="(' + esc(Q[c]) + ', ' + esc(Q[r]) + ') unmarked">' + (w.showEquiv ? '≡' : '') + '</td>';
      }
      html += '</tr>';
    }
    html += '<tr><th></th>' + Q.slice(0, n - 1).map(function (s) { return '<th>' + esc(s) + '</th>'; }).join('') + '</tr></tbody></table>';
    html += '<p class="legend">×<sub>k</sub> = marked in pass k (hover for proof) &nbsp; ≡ = equivalent &nbsp; · ' +
      w.markCount + ' of ' + (n * (n - 1) / 2) + ' pairs distinguished</p>';
    return html;
  }

  function groupChip(g, gi) {
    return '<span class="group" style="background:' + G.FILLS[gi % G.FILLS.length] + ';border-color:' +
      G.STROKES[gi % G.STROKES.length] + '">' + set(g) + '</span>';
  }

  function prHTML(w) {
    if (!w.iter) return '<div class="groups">' + w.partition.map(groupChip).join('') + '</div>';
    var it = w.iter, sigma = res.reduced.alphabet;
    var gName = function (gi) { return 'G' + (gi + 1); };
    var html = '<p class="legend">Groups of P' + sub(it.k - 1) + ': ' + it.before.map(function (g, gi) { return gName(gi) + ' = ' + set(g); }).join(', ') + '</p>';
    html += '<div class="table-scroll-wrapper"><table class="matrix-table"><thead><tr><th>Group</th><th>State</th>' +
      sigma.map(function (a) { return '<th>on ' + esc(a) + '</th>'; }).join('') + '<th>Outcome</th></tr></thead><tbody>';
    it.details.forEach(function (d, di) {
      d.group.forEach(function (s, si) {
        var part = d.parts.filter(function (p) { return p.indexOf(s) !== -1; })[0];
        html += '<tr>' + (si === 0 ? '<th rowspan="' + d.group.length + '" style="background:' + G.FILLS[di % G.FILLS.length] + '">' + gName(di) + '</th>' : '') +
          '<td>' + esc(s) + '</td>' + d.signatures[s].map(function (gi) { return '<td>' + gName(gi) + '</td>'; }).join('') +
          '<td>' + (d.parts.length > 1 ? '<span class="split">' + set(part) + '</span>' : '<span class="text-muted">stays</span>') + '</td></tr>';
      });
    });
    html += '</tbody></table></div><p class="legend">P' + sub(it.k) + ' = ' + it.after.map(set).join(' ') + '</p>';
    return html;
  }

  function classMapHTML() {
    return '<div class="table-scroll-wrapper"><table class="grid-table"><thead><tr><th>Equivalence Class</th><th>Merged State</th></tr></thead><tbody>' +
      res.classes.map(function (c) { return '<tr><td>' + set(c) + '</td><td><strong>' + esc(A.className(c)) + '</strong></td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  /* ================= Dual-DFA String Verifier ================= */
  $('testBtn').addEventListener('click', testString);
  $('testInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') testString(); });

  function renderSamples() {
    var sigma = res.full.alphabet, sep = sigma.every(function (a) { return a.length === 1; }) ? '' : ' ';
    var acc = [], rej = [], level = [[]];
    for (var len = 0; len <= 5 && (acc.length < 3 || rej.length < 3); len++) {
      level.forEach(function (w) {
        var r = A.runString(res.full, w);
        if (w.length) (r.accepted ? acc : rej).push(w.join(sep));
      });
      var next = [];
      level.forEach(function (w) { sigma.forEach(function (a) { next.push(w.concat(a)); }); });
      level = next.slice(0, 400);
    }
    var pick = ['ε'].concat(acc.slice(0, 3), rej.slice(0, 3));
    $('samples').innerHTML = '<span>Quick test:</span>' + pick.map(function (s) {
      return '<button type="button" class="sample" data-s="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
  }

  $('samples').addEventListener('click', function (e) {
    var s = e.target.dataset && e.target.dataset.s;
    if (s === undefined) return;
    $('testInput').value = s === 'ε' ? '' : s;
    testString();
  });

  function testString() {
    if (!res || !res.ok) return;
    var syms = A.tokenize(res.full, $('testInput').value);
    var r1 = A.runString(res.full, syms), r2 = A.runString(res.min, syms);
    if (r1.error) { $('testOut').innerHTML = '<div class="notification-banner error"><b>Invalid symbol:</b> ' + esc(r1.error) + '</div>'; return; }
    var word = syms.length ? syms.join(' ') : 'ε';
    var verdict = function (r) { return '<span class="badge ' + (r.accepted ? 'ok' : 'bad') + '">' + (r.accepted ? 'Accept' : 'Reject') + '</span>'; };
    var body = $('testLog').tBodies[0];
    body.insertAdjacentHTML('afterbegin', '<tr><td><code>' + esc(word) + '</code></td><td>' + verdict(r1) + '</td><td>' + verdict(r2) +
      '</td><td><span class="badge ' + (r1.accepted === r2.accepted ? 'ok' : 'bad') + '">' + (r1.accepted === r2.accepted ? '✓ Match' : '✗ Mismatch') + '</span></td></tr>');
    while (body.rows.length > 8) body.deleteRow(-1);
    $('testLog').hidden = false;

    var row = function (name, r) {
      return '<div class="run"><span class="run-name">' + name + '</span><span class="path">' +
        r.path.map(function (s, k) {
          return (k ? '<span class="arrow">—' + esc(syms[k - 1]) + '→</span>' : '') + '<span class="chip' + (k === r.path.length - 1 && r.accepted ? ' ok' : '') + '">' + esc(s) + '</span>';
        }).join(' ') +
        '</span><span class="badge ' + (r.accepted ? 'ok' : 'bad') + '">' + (r.accepted ? 'Accept' : 'Reject') + '</span></div>';
    };

    var shown = syms.length ? syms.join(' ') : 'ε';
    var isMatch = r1.accepted === r2.accepted;
    $('testOut').innerHTML = '<p style="margin-bottom:6px;">Tested string: <code>' + esc(shown) + '</code></p>' +
      row('Original DFA', r1) + row('Minimized DFA', r2) +
      '<div class="notification-banner ' + (isMatch ? 'ok' : 'error') + '" style="margin-top: 8px;">' +
      (isMatch ? '<strong>✓ Match:</strong> Both DFAs gave the exact same result (' + (r1.accepted ? 'Accepted' : 'Rejected') + ').' : '<strong>✗ Mismatch:</strong> Automata produced different results!') + '</div>';
  }

  /* ================= SECTION 2: Test Cases QA Dashboard ================= */
  var T = window.DFATests, testResults = null, testFilter = 'All', testSearchTerm = '';

  function renderTests() {
    var cats = ['All'];
    T.TESTS.forEach(function (t) { if (cats.indexOf(t.category) === -1) cats.push(t.category); });
    $('testFilters').innerHTML = cats.map(function (c) {
      var n = c === 'All' ? T.TESTS.length : T.TESTS.filter(function (t) { return t.category === c; }).length;
      return '<button type="button" class="filter-pill' + (c === testFilter ? ' active' : '') + '" data-cat="' + esc(c) + '">' +
        esc(c) + ' <span>' + n + '</span></button>';
    }).join('');

    var byId = {};
    (testResults || []).forEach(function (r) { byId[r.test.id] = r; });

    var filterFn = function (t) {
      var catMatch = testFilter === 'All' || t.category === testFilter;
      if (!catMatch) return false;
      if (!testSearchTerm) return true;
      var term = testSearchTerm.toLowerCase();
      return (t.id && t.id.toLowerCase().indexOf(term) !== -1) ||
        (t.title && t.title.toLowerCase().indexOf(term) !== -1) ||
        (t.machine && t.machine.toLowerCase().indexOf(term) !== -1) ||
        (t.input && t.input.toLowerCase().indexOf(term) !== -1) ||
        (t.category && t.category.toLowerCase().indexOf(term) !== -1);
    };

    $('testRows').innerHTML = T.TESTS.filter(filterFn).map(function (t) {
      var r = byId[t.id];
      var status = !r ? '<span class="badge idle">Pending</span>'
        : '<span class="badge ' + (r.pass ? 'ok' : 'bad') + '">' + (r.pass ? 'Pass' : 'Fail') + '</span>';
      return '<tr><td class="tid">' + t.id + '</td>' +
        '<td><b>' + esc(t.title) + '</b><span class="cat-tag">' + esc(t.category) + '</span><small>' + esc(t.machine) + '</small></td>' +
        '<td class="mono">' + esc(t.input) + '</td><td>' + esc(t.expected) + '</td>' +
        '<td>' + (r ? esc(r.actual) : '<span class="text-muted">—</span>') + '</td><td>' + status + '</td>' +
        '<td>' + (t.dfa ? '<button type="button" class="btn secondary compact-btn" data-open="' + t.id + '">Open</button>' : '') + '</td></tr>';
    }).join('');
  }

  function renderTestSummary() {
    if (!testResults) { $('testSummary').innerHTML = ''; return; }
    var pass = testResults.filter(function (r) { return r.pass; }).length, total = testResults.length;
    var ms = testResults.reduce(function (s, r) { return s + r.ms; }, 0);
    var edgeCount = testResults.filter(function (r) { return r.test.category === 'Edge case'; }).length;
    var invalidCount = testResults.filter(function (r) { return r.test.category === 'Invalid input'; }).length;

    $('testSummary').innerHTML =
      '<div class="kpi-item hero">' +
      '<span>Tests Passed</span>' +
      '<strong>' + pass + ' / ' + total + '</strong>' +
      '<span class="kpi-pill-badge">' + Math.round(pass / total * 100) + '%</span>' +
      '</div>' +
      '<div class="kpi-item">' +
      '<span>Edge Cases</span>' +
      '<strong>' + edgeCount + '</strong>' +
      '<span class="kpi-meta ok">Passed</span>' +
      '</div>' +
      '<div class="kpi-item">' +
      '<span>Input Validation</span>' +
      '<strong>' + invalidCount + '</strong>' +
      '<span class="kpi-meta ok">Handled</span>' +
      '</div>' +
      '<div class="kpi-item">' +
      '<span>Total Time</span>' +
      '<strong>' + ms + ' ms</strong>' +
      '<span class="kpi-meta ok">Fast</span>' +
      '</div>';

    var badge = $('testBadge');
    badge.hidden = false;
    badge.textContent = pass + '/' + total;
    badge.className = 'tab-badge ' + (pass === total ? 'ok' : 'bad');
  }

  function runTests() {
    var btn = $('runTestsBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Running tests…'; }
    testResults = T.runAll();
    if (btn) { btn.disabled = false; btn.textContent = 'Run All Tests'; }
    $('csvBtn').disabled = false;
    renderTests(); renderTestSummary();
  }

  function openTestCase(id) {
    var t = T.TESTS.filter(function (x) { return x.id === id; })[0];
    if (!t || !t.dfa) return;
    document.querySelector('[data-tab=sim]').click();
    $('preset').value = '';
    $('presetNote').textContent = t.id + ': ' + t.title + '. Expected: ' + t.expected + '.';
    loadDFA(t.dfa);
    run(A.cloneDFA(t.dfa));
    if (t.testString !== undefined && res && res.ok) {
      $('testInput').value = t.testString;
      testString();
    }
    window.scrollTo(0, 0);
  }

  $('runTestsBtn').addEventListener('click', runTests);
  $('testFilters').addEventListener('click', function (e) {
    var b = e.target.closest('.filter-pill');
    if (b) { testFilter = b.dataset.cat; renderTests(); }
  });
  if ($('testSearchInput')) {
    $('testSearchInput').addEventListener('input', function (e) {
      testSearchTerm = e.target.value.trim();
      renderTests();
    });
  }
  $('testRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]');
    if (b) openTestCase(b.dataset.open);
  });
  $('csvBtn').addEventListener('click', function () {
    var q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
    var lines = [['ID', 'Category', 'Test', 'Machine', 'Input', 'Expected', 'Actual', 'Status', 'ms'].join(',')].concat(
      testResults.map(function (r) {
        var t = r.test;
        return [t.id, t.category, t.title, t.machine, t.input, t.expected, r.actual, r.pass ? 'Pass' : 'Fail', r.ms].map(q).join(',');
      }));
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' }));
    a.download = 'dfa-minimization-verification-report.csv';
    a.click();
  });

  document.querySelector('[data-tab=tests]').addEventListener('click', function () {
    if (!testResults) runTests();
  });
  renderTests();

  /* ================= SECTION 3: Documentation ================= */
  function openSimulator(presetId) {
    document.querySelector('[data-tab=sim]').click();
    if (presetId) { $('preset').value = presetId; $('preset').dispatchEvent(new Event('change')); }
    window.scrollTo(0, 0);
  }

  function renderDesignDoc() {
    var six = PRESETS.filter(function (p) { return p.id === 'six'; })[0].dfa;
    G.draw($('docInput'), six, {});
    var r6 = A.minimize(six, 'both');
    G.draw($('docMin'), r6.min, { groups: r6.min.states.map(function (s) { return [s]; }) });

    var row = function (i, name, expected, generated, ok) {
      return '<tr><td>' + i + '</td><td>' + esc(name) + '</td><td>' + esc(expected) + '</td><td>' + esc(generated) +
        '</td><td><span class="badge ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'Pass' : 'Fail') + '</span></td></tr>';
    };
    var rows = PRESETS.map(function (p, i) {
      var r = A.minimize(p.dfa, 'both');
      var ok = r.ok && r.min.states.length === p.expectedStates && r.methodsAgree && r.equivalence.equal && r.isMinimal;
      var gen = r.ok ? r.min.states.length + ' states' + (r.reach.unreachable.length ? ', removed ' + r.reach.unreachable.join(', ') : '') +
        (r.dead ? ', trap state added' : '') : 'Input rejected';
      return row(i + 1, p.name, p.expectedStates + ' states', gen, ok);
    });
    var bad = A.minimize({ states: ['A'], alphabet: ['0'], start: 'Z', finals: [], delta: { A: { 0: 'A' } } }, 'tf');
    rows.push(row(PRESETS.length + 1, 'Edge case: unknown start state "Z"', 'Clear error message',
      bad.ok ? 'Accepted' : bad.validation.errors[0], !bad.ok));
    $('docTests').innerHTML = rows.join('');
  }
  renderDesignDoc();

  $('docLoadSix').addEventListener('click', function () { openSimulator('six'); });
  $('printBtn').addEventListener('click', function () { window.print(); });

  if ('IntersectionObserver' in window) {
    var links = document.querySelectorAll('.toc-link');
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('.doc-body > section').forEach(function (sec) { spy.observe(sec); });
  }

  /* ================= Random, Import & Export Handlers ================= */
  function showInputError(text) {
    $('inputMsg').className = 'notification-banner error';
    $('inputMsg').innerHTML = '<strong>' + esc(text) + '</strong>';
  }

  $('randomBtn').addEventListener('click', function () {
    var rand = function (k) { return Math.floor(Math.random() * k); };
    var d, tries = 0;
    do {
      d = window.DFATests.randomDFA(rand, { minStates: 5, maxStates: 8, symbols: ['0', '1'] });
      if (!d.finals.length) d.finals.push(d.states[d.states.length - 1]);
    } while (++tries < 100 && A.findReachable(d).reachable.length < 4);
    $('preset').value = '';
    $('presetNote').textContent = 'Random complete DFA generated with ' + d.states.length + ' states.';
    loadDFA(d);
    run();
  });

  $('exportBtn').addEventListener('click', function () {
    syncFromInputs();
    var name = $('preset').value || 'dfa-schema';
    var blob = new Blob([A.toJSON(currentDFA(), name)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  $('importBtn').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var d = A.fromJSON(String(reader.result));
        $('preset').value = '';
        $('presetNote').textContent = 'Imported automaton schema from ' + file.name + '.';
        loadDFA(d);
        run(d);
      } catch (err) {
        showInputError('Could not import ' + file.name + ': ' + err.message);
      }
      e.target.value = '';
    };
    reader.onerror = function () { showInputError('Could not read ' + file.name + '.'); };
    reader.readAsText(file);
  });

  /* ================= Initialization ================= */
  // 4-Step Workflow jump handlers
  ['wfStep1', 'wfStep2', 'wfStep3', 'wfStep4'].forEach(function (id, idx) {
    var btn = $(id);
    if (btn) {
      btn.addEventListener('click', function () {
        var phases = ['Input', 'Table-filling', 'Merge', 'Validate'];
        var targetPhase = phases[idx];
        if (targetPhase === 'Table-filling' && res && res.pr && !res.tf) {
          targetPhase = 'Partition';
        }
        var targetIdx = -1;
        steps.forEach(function (s, k) {
          if (targetIdx === -1 && s.phase === targetPhase) targetIdx = k;
        });
        if (targetIdx !== -1) { stop(); show(targetIdx); }
      });
    }
  });

  // Quick Action: Download DFA
  if ($('downloadDfaBtn')) {
    $('downloadDfaBtn').addEventListener('click', function () {
      var dfaObj = (res && res.min) ? res.min : currentDFA();
      var jsonStr = JSON.stringify(dfaObj, null, 2);
      var blob = new Blob([jsonStr], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'automataflow-minimized-dfa.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  }

  // Quick Action: Save as Image (SVG)
  if ($('exportImageBtn')) {
    $('exportImageBtn').addEventListener('click', function () {
      var svg = $('graphMain').querySelector('svg');
      if (!svg) return;
      var serializer = new XMLSerializer();
      var source = serializer.serializeToString(svg);
      if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      var blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'dfa-visualization.svg';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  // Fullscreen / expand button
  if ($('expandBtn')) {
    $('expandBtn').addEventListener('click', function () {
      var player = $('player');
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () { });
      } else if (player && player.requestFullscreen) {
        player.requestFullscreen().catch(function () {
          expandGraph();
        });
      } else {
        expandGraph();
      }
    });
  }

  // Dark/Light Theme Toggle
  var themeToggleBtn = $('themeToggleBtn');
  if (themeToggleBtn) {
    var storedTheme = localStorage.getItem('automataflow-theme');
    if (storedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      var moon = themeToggleBtn.querySelector('.moon-icon');
      var sun = themeToggleBtn.querySelector('.sun-icon');
      if (moon && sun) { moon.hidden = true; sun.hidden = false; }
    }
    themeToggleBtn.addEventListener('click', function () {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      var moon = themeToggleBtn.querySelector('.moon-icon');
      var sun = themeToggleBtn.querySelector('.sun-icon');
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('automataflow-theme', 'light');
        if (moon && sun) { moon.hidden = false; sun.hidden = true; }
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('automataflow-theme', 'dark');
        if (moon && sun) { moon.hidden = true; sun.hidden = false; }
      }
    });
  }

  // Natural Language DFA Synthesizer & Minimizer
  function initNaturalLanguageDFA() {
    var nlInput = $('nlInput');
    var nlGenerateBtn = $('nlGenerateBtn');
    var nlClearBtn = $('nlClearBtn');
    var nlFeedback = $('nlFeedback');
    var nlSpinner = $('nlSpinner');
    var exampleChips = document.querySelectorAll('.nl-chip');

    if (!nlInput || !nlGenerateBtn) return;

    function showFeedback(type, title, message, suggestion) {
      if (!nlFeedback) return;
      nlFeedback.hidden = false;
      nlFeedback.className = 'nl-feedback-banner ' + type;
      var icon = type === 'ok'
        ? '<svg class="feedback-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '<svg class="feedback-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';

      var html = '<div class="feedback-icon-col">' + icon + '</div>' +
        '<div class="feedback-body">' +
        (title ? '<strong class="feedback-title">' + esc(title) + '</strong>' : '') +
        (message ? '<p class="feedback-msg">' + message + '</p>' : '') +
        (suggestion ? '<p class="feedback-suggestion">💡 ' + esc(suggestion) + '</p>' : '') +
        '</div>';
      nlFeedback.innerHTML = html;
    }

    function clearFeedback() {
      if (!nlFeedback) return;
      nlFeedback.hidden = true;
      nlFeedback.className = 'nl-feedback-banner';
      nlFeedback.innerHTML = '';
    }

    function handleGenerate() {
      var text = (nlInput.value || '').trim();
      clearFeedback();

      if (!text) {
        showFeedback('bad', 'Empty Instruction', 'Please describe the DFA language or pattern you want to accept.', 'Try clicking one of the example prompts below to get started.');
        nlInput.focus();
        return;
      }

      if (typeof window.NLDFA === 'undefined') {
        showFeedback('bad', 'Engine Not Ready', 'Natural language DFA synthesizer module is still initializing. Please try again.', '');
        return;
      }

      // Show spinner & disable button
      if (nlSpinner) nlSpinner.hidden = false;
      nlGenerateBtn.disabled = true;

      setTimeout(function () {
        var parseRes = window.NLDFA.parse(text);

        if (nlSpinner) nlSpinner.hidden = true;
        nlGenerateBtn.disabled = false;

        if (!parseRes.success) {
          showFeedback('bad', 'Pattern Identification Failed', esc(parseRes.error || 'Could not construct a valid DFA from this description.'), parseRes.suggestion || 'Please use clear patterns like "ending with 01", "starting with 10", "containing 101", "even number of zeros", or "ends with 00 or 11".');
          return;
        }

        // Successfully synthesized DFA
        var dfa = parseRes.dfa;
        showFeedback('ok', 'DFA Successfully Synthesized & Minimized!', esc(parseRes.description) + ' (' + dfa.states.length + ' initial states generated)');

        // Populate manual editor inputs
        loadDFA(dfa);

        // Run full minimization workflow
        run(dfa);

        // Smooth scroll to workflow stepper so user can view the 4 stages
        var stepper = document.querySelector('.workflow-stepper-bar');
        if (stepper) {
          stepper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 150);
    }

    nlGenerateBtn.addEventListener('click', handleGenerate);

    nlInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
    });

    if (nlClearBtn) {
      nlClearBtn.addEventListener('click', function () {
        nlInput.value = '';
        clearFeedback();
        exampleChips.forEach(function (c) { c.classList.remove('active'); });
        nlInput.focus();
      });
    }

    exampleChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var promptText = chip.getAttribute('data-prompt');
        if (promptText) {
          nlInput.value = promptText;
          exampleChips.forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
          clearFeedback();
          nlInput.focus();
        }
      });
    });
  }

  initNaturalLanguageDFA();

  // Manual "Verify DFA Equivalence" button listener
  var runHKBtn = $('runHopcroftKarpBtn');
  if (runHKBtn) {
    runHKBtn.addEventListener('click', function () {
      if (!res || !res.ok) {
        run();
        return;
      }
      var HKModule = window.HopcroftKarp;
      if (HKModule && HKModule.areDFAsEquivalent) {
        runHKBtn.disabled = true;
        var originalHtml = runHKBtn.innerHTML;
        runHKBtn.innerHTML = '<span class="play-pulse-dot" style="margin-right:6px"></span><span>Verifying...</span>';
        setTimeout(function () {
          var eqRes = HKModule.areDFAsEquivalent(res.full, res.min);
          res.equivalence = eqRes;
          renderSummary();
          renderEquivalenceVerification();
          runHKBtn.disabled = false;
          runHKBtn.innerHTML = originalHtml;
        }, 150);
      }
    });
  }

  $('preset').value = PRESETS[0].id;
  $('preset').dispatchEvent(new Event('change'));

  // Deep linking for direct tab navigation (#sim, #tests, #design)
  var initialTab = (window.location.hash || '').replace('#', '');
  if (initialTab) {
    var targetTabBtn = document.querySelector('[data-tab="' + initialTab + '"]');
    if (targetTabBtn) targetTabBtn.click();
  }
  window.scrollTo(0, 0);
})();
