/**
 * @file graph.js
 * Draws any DFA as an SVG state diagram, with no external libraries.
 * Used by app.js for the step player, the minimized DFA and the design document.
 *
 * Modernized for AutomataFlow Studio: clean vector aesthetic, drop shadows,
 * pill-badge edge labels, and refined enterprise typography.
 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var FILLS = [
    '#eff6ff', // blue-50
    '#f0fdf4', // emerald-50
    '#fefce8', // amber-50
    '#fdf2f8', // pink-50
    '#f5f3ff', // violet-50
    '#ecfeff', // cyan-50
    '#fff1f2', // rose-50
    '#eef2ff', // indigo-50
    '#f0fdfa', // teal-50
    '#faf5ff'  // fuchsia-50
  ];
  var STROKES = [
    '#2563eb', // blue-600
    '#059669', // emerald-600
    '#d97706', // amber-600
    '#db2777', // pink-600
    '#7c3aed', // violet-600
    '#0891b2', // cyan-600
    '#e11d48', // rose-600
    '#4f46e5', // indigo-600
    '#0d9488', // teal-600
    '#9333ea'  // fuchsia-600
  ];
  var COL_W = 145, ROW_H = 110, uid = 0;

  /** Create an SVG element with attributes and optionally append it. */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Circle radius that fits the state's name. */
  function radius(name) { return Math.max(26, 12 + name.length * 4.5); }

  /**
   * Layered layout: column = BFS distance from the start state; unreachable states
   * go in an extra last column; rows inside a column use barycenter ordering.
   */
  function layout(dfa) {
    var depth = {}, queue = [dfa.start];
    depth[dfa.start] = 0;
    while (queue.length) {
      var s = queue.shift();
      dfa.alphabet.forEach(function (a) {
        var t = dfa.delta[s] && dfa.delta[s][a];
        if (t !== undefined && depth[t] === undefined && dfa.states.indexOf(t) !== -1) {
          depth[t] = depth[s] + 1; queue.push(t);
        }
      });
    }
    var maxD = 0;
    dfa.states.forEach(function (s) { if (depth[s] !== undefined) maxD = Math.max(maxD, depth[s]); });
    var cols = [];
    dfa.states.forEach(function (s) {
      var d = depth[s] === undefined ? maxD + 1 : depth[s];
      (cols[d] = cols[d] || []).push(s);
    });
    cols = cols.filter(Boolean);
    // Barycenter ordering: place each state near the average row of the states in the
    // previous column that point to it. This reduces edge crossings.
    for (var c = 1; c < cols.length; c++) {
      var rowOf = {};
      cols[c - 1].forEach(function (s, i) { rowOf[s] = i; });
      var bary = {};
      cols[c].forEach(function (t, i) {
        var sum = 0, cnt = 0;
        cols[c - 1].forEach(function (s) {
          dfa.alphabet.forEach(function (a) { if (dfa.delta[s] && dfa.delta[s][a] === t) { sum += rowOf[s]; cnt++; } });
        });
        bary[t] = cnt ? sum / cnt : i;
      });
      cols[c] = cols[c].slice().sort(function (x, y) { return bary[x] - bary[y]; });
    }
    var maxRows = Math.max.apply(null, cols.map(function (c) { return c.length; }));
    var pos = {};
    cols.forEach(function (col, ci) {
      col.forEach(function (s, ri) {
        pos[s] = { x: 100 + ci * COL_W, y: 95 + (ri + (maxRows - col.length) / 2) * ROW_H, r: radius(s) };
      });
    });
    return pos;
  }

  /**
   * Choose the side for a state's self-loop away from its own edges and start arrow.
   */
  function loopAngle(s, edges, pos, isStart, obstacles) {
    var p = pos[s], used = [];
    for (var k in edges) {
      var e = edges[k];
      if (e.from === e.to) continue;
      var other = e.from === s ? e.to : e.to === s ? e.from : null;
      if (other) used.push(Math.atan2(pos[other].y - p.y, pos[other].x - p.x));
    }
    if (isStart) used.push(Math.PI);
    var best = -Math.PI / 2, bestScore = -Infinity;
    [-Math.PI / 2, Math.PI / 2, 0, Math.PI].forEach(function (c, ci) {
      var gap = Math.min.apply(null, used.map(function (u) {
        var d = Math.abs(c - u) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d;
      }).concat([Math.PI]));
      var lx = p.x + Math.cos(c) * (p.r + 40), ly = p.y + Math.sin(c) * (p.r + 40);
      var clear = Math.min.apply(null, obstacles.map(function (o) {
        return Math.sqrt((o.x - lx) * (o.x - lx) + (o.y - ly) * (o.y - ly)) - o.r;
      }).concat([80]));
      var score = Math.min(gap, 1.6) * 40 + Math.min(clear, 60) - ci * 3;
      if (score > bestScore) { best = c; bestScore = score; }
    });
    return best;
  }

  /**
   * Render a DFA into a container element (replaces its contents).
   */
  function draw(container, dfa, opts) {
    opts = opts || {};
    container.innerHTML = '';
    if (!dfa || !dfa.states.length) return;
    var id = 'g' + (uid++);
    var pos = layout(dfa);
    var colorOf = {};
    (opts.groups || []).forEach(function (g, gi) { g.forEach(function (s) { colorOf[s] = gi % FILLS.length; }); });
    var active = opts.active || new Set(), visited = opts.visited || new Set(), faded = opts.faded || new Set();
    var hotEdge = {};
    (opts.activeEdges || []).forEach(function (e) { hotEdge[e.from + '\u0000' + e.to] = true; });

    var svg = el('svg', { class: 'dfa-svg', role: 'img', 'aria-label': 'State diagram' });
    var defs = el('defs', {}, svg);

    // Node drop shadow filter
    var filter = el('filter', { id: id + 'shadow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
    el('feDropShadow', { dx: '0', dy: '3', stdDeviation: '3', 'flood-color': '#0f172a', 'flood-opacity': '0.08' }, filter);

    // Node glow filter for active states
    var glow = el('filter', { id: id + 'glow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    el('feDropShadow', { dx: '0', dy: '0', stdDeviation: '5', 'flood-color': '#f59e0b', 'flood-opacity': '0.5' }, glow);

    // Arrowhead markers
    [['n', '#64748b'], ['h', '#f59e0b']].forEach(function (m) {
      var mk = el('marker', { id: id + m[0], viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7,
                              markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,1.5 L8.5,5 L0,8.5 z', fill: m[1] }, mk);
    });

    // Merge parallel edges: one arrow per (from,to) labelled "a,b".
    var edges = {}, order = [];
    dfa.states.forEach(function (s) {
      dfa.alphabet.forEach(function (a) {
        var t = dfa.delta[s] && dfa.delta[s][a];
        if (t === undefined || !pos[t]) return;
        var k = s + '\u0000' + t;
        if (!edges[k]) { edges[k] = { from: s, to: t, syms: [] }; order.push(k); }
        edges[k].syms.push(a);
      });
    });

    var gEdges = el('g', { class: 'diagram-edges' }, svg);
    var gLabels = el('g', { class: 'diagram-edge-labels' }, svg);
    var gNodes = el('g', { class: 'diagram-nodes' }, svg);
    var labels = [];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function grow(x, y) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }

    var obstacles = [];
    order.sort(function (a, b) { return (edges[a].from === edges[a].to) - (edges[b].from === edges[b].to); });
    order.forEach(function (k) {
      var e = edges[k], p = pos[e.from], q = pos[e.to];
      var hot = hotEdge[k], dim = faded.has(e.from) || faded.has(e.to);
      var cls = 'edge' + (hot ? ' hot' : '') + (dim ? ' dim' : '');
      var d, lx, ly;
      if (e.from === e.to) {
        var th = loopAngle(e.from, edges, pos, e.from === dfa.start, obstacles.concat(dfa.states.filter(function (o) {
          return o !== e.from; }).map(function (o) { return pos[o]; })));
        var pt = function (ang, dist) { return [p.x + Math.cos(ang) * dist, p.y + Math.sin(ang) * dist]; };
        var s0 = pt(th - 0.42, p.r), e0 = pt(th + 0.42, p.r + 2), c1 = pt(th - 0.65, p.r + 62), c2 = pt(th + 0.65, p.r + 62);
        d = 'M' + s0 + ' C' + c1 + ' ' + c2 + ' ' + e0;
        var lp = pt(th, p.r + 60), far = pt(th, p.r + 52);
        lx = lp[0]; ly = lp[1];
        grow(far[0] - 28, far[1] - 28); grow(far[0] + 28, far[1] + 28);
      } else {
        var dx = q.x - p.x, dy = q.y - p.y, dist = Math.sqrt(dx * dx + dy * dy);
        var nx = -dy / dist, ny = dx / dist;
        var hasReverse = !!edges[e.to + '\u0000' + e.from];
        var bend = hasReverse ? 30 : 0;
        if (dist > COL_W * 1.3 || dx < 0) bend = Math.max(bend, 0.22 * dist);
        var cx = (p.x + q.x) / 2 + nx * bend, cy = (p.y + q.y) / 2 + ny * bend;
        var a1 = Math.atan2(cy - p.y, cx - p.x), a2 = Math.atan2(cy - q.y, cx - q.x);
        var sx = p.x + Math.cos(a1) * p.r, sy = p.y + Math.sin(a1) * p.r;
        var ex = q.x + Math.cos(a2) * (q.r + 3), ey = q.y + Math.sin(a2) * (q.r + 3);
        d = 'M' + sx + ',' + sy + ' Q' + cx + ',' + cy + ' ' + ex + ',' + ey;
        grow(0.25 * sx + 0.5 * cx + 0.25 * ex, 0.25 * sy + 0.5 * cy + 0.25 * ey);
        [0.25, 0.5, 0.75].forEach(function (t) {
          obstacles.push({ x: (1 - t) * (1 - t) * sx + 2 * t * (1 - t) * cx + t * t * ex, y: (1 - t) * (1 - t) * sy + 2 * t * (1 - t) * cy + t * t * ey, r: 6 });
        });
        lx = 0.36 * sx + 0.48 * cx + 0.16 * ex + nx * 10; ly = 0.36 * sy + 0.48 * cy + 0.16 * ey + ny * 10;
      }
      el('path', { d: d, class: cls, 'marker-end': 'url(#' + id + (hot ? 'h' : 'n') + ')' }, gEdges);
      var text = e.syms.join(', ');
      labels.push({ x: lx, y: ly, hw: text.length * 4.6 + 6, text: text, hot: hot, dim: dim });
    });

    // Nudge edge labels off state circles and off each other
    for (var round = 0; round < 6; round++) {
      labels.forEach(function (L, li) {
        dfa.states.forEach(function (s) {
          var c = pos[s], dx = L.x - c.x, dy = L.y - c.y, dd = Math.sqrt(dx * dx + dy * dy) || 1, need = c.r + 14;
          if (dd < need) { L.x += dx / dd * (need - dd); L.y += dy / dd * (need - dd); }
        });
        for (var lj = li + 1; lj < labels.length; lj++) {
          var M = labels[lj], ox = L.hw + M.hw - Math.abs(L.x - M.x), oy = 18 - Math.abs(L.y - M.y);
          if (ox > 0 && oy > 0) { var sgn = L.y <= M.y ? -1 : 1; L.y += sgn * oy / 2; M.y -= sgn * oy / 2; }
        }
      });
    }

    // Render modern pill badge labels for transitions
    labels.forEach(function (L) {
      var g = el('g', { class: 'edge-badge-group' + (L.hot ? ' hot' : '') + (L.dim ? ' dim' : '') }, gLabels);
      var w = (L.hw + 5) * 2;
      el('rect', {
        x: L.x - w / 2,
        y: L.y - 11,
        width: w,
        height: 20,
        rx: 5,
        ry: 5,
        class: 'edge-badge-bg' + (L.hot ? ' hot' : '')
      }, g);
      var t = el('text', { x: L.x, y: L.y + 3.5, class: 'edge-badge-text' + (L.hot ? ' hot' : '') }, g);
      t.textContent = L.text;
      grow(L.x - w / 2 - 4, L.y - 14); grow(L.x + w / 2 + 4, L.y + 14);
    });

    // Draw state nodes
    dfa.states.forEach(function (s) {
      var p = pos[s], ci = colorOf[s];
      var g = el('g', { class: 'node' + (faded.has(s) ? ' dim' : '') + (active.has(s) ? ' active' : '') }, gNodes);
      var isFinal = dfa.finals.indexOf(s) !== -1;
      var fill = ci !== undefined ? FILLS[ci] : (isFinal ? '#f0fdf4' : '#ffffff');
      var defaultStroke = isFinal ? '#10b981' : '#7c3aed';
      var stroke = active.has(s) ? '#f59e0b' : visited.has(s) ? '#10b981' : ci !== undefined ? STROKES[ci] : defaultStroke;
      var sw = isFinal ? 2.5 : (active.has(s) ? 3.5 : 2.2);

      // Outer circle
      el('circle', {
        cx: p.x, cy: p.y, r: p.r,
        fill: fill, stroke: stroke, 'stroke-width': sw,
        'stroke-dasharray': faded.has(s) ? '5 4' : 'none',
        filter: active.has(s) ? 'url(#' + id + 'glow)' : 'url(#' + id + 'shadow)'
      }, g);

      // Inner circle for final states (double ring)
      if (isFinal) {
        el('circle', {
          cx: p.x, cy: p.y, r: p.r - 5.5,
          fill: 'none', stroke: '#10b981', 'stroke-width': 1.8,
          'stroke-dasharray': faded.has(s) ? '5 4' : 'none'
        }, g);
      }

      // State label
      var label = el('text', { x: p.x, y: p.y + 4.5, class: 'node-label' }, g);
      label.textContent = s;

      // Start state arrow and badge
      if (s === dfa.start) {
        el('line', {
          x1: p.x - p.r - 48, y1: p.y,
          x2: p.x - p.r - 3, y2: p.y,
          class: 'edge start',
          'marker-end': 'url(#' + id + 'n)'
        }, g);
        var badgeG = el('g', { class: 'start-badge' }, g);
        el('rect', {
          x: p.x - p.r - 64, y: p.y - 11,
          width: 42, height: 22, rx: 11, ry: 11,
          fill: '#7c3aed'
        }, badgeG);
        var st = el('text', {
          x: p.x - p.r - 43, y: p.y + 4,
          class: 'start-badge-label'
        }, badgeG);
        st.textContent = 'Start';
      }

      grow(p.x - p.r - 10, p.y - p.r - 10); grow(p.x + p.r + 10, p.y + p.r + 10);
      if (s === dfa.start) grow(p.x - p.r - 74, p.y - 24);
    });

    var pad = 16;
    svg.setAttribute('viewBox', (minX - pad) + ' ' + (minY - pad) + ' ' + (maxX - minX + 2 * pad) + ' ' + (maxY - minY + 2 * pad));
    container.appendChild(svg);
  }

  root.DFAGraph = { draw: draw, FILLS: FILLS, STROKES: STROKES };
})(this);
