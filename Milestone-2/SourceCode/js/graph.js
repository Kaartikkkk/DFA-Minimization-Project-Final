/**
 * @file graph.js
 * Intelligent DFA State Diagram Visualization & Layout Engine for AutomataFlow Studio.
 *
 * Implements:
 * 1. Intelligent Layered Hierarchy Layout (Sugiyama-style) with longest-path leveling.
 * 2. Multi-pass alternating barycenter crossing minimization (reduces edge intersections).
 * 3. Proportional, dynamic column and row spacing scaled to graph complexity.
 * 4. Dedicated Concentric Top & Bottom Arch Corridors for multi-column and back transitions.
 * 5. Strictly separated bidirectional edges (symmetrical opposite curvatures with zero overlap).
 * 6. Non-intersecting self-loops oriented in the direction of maximum angular clearance.
 * 7. Multi-edge destination port distribution (prevents arrowhead and path overlapping).
 * 8. High-contrast pill badge labels with multi-pass collision relaxation and offset positioning.
 * 9. Responsive SVG canvas with dynamic viewBox, mouse wheel zoom, drag-to-pan, and toolbar.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DFAGraph = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

  var uid = 0;

  /** Create an SVG element with attributes and optional parent. */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) {
      if (attrs[k] !== undefined && attrs[k] !== null) {
        e.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Calculate circle radius that comfortably fits the state label. */
  function radius(name) {
    var len = String(name).length;
    if (len <= 2) return 26;
    if (len <= 4) return 29;
    return Math.max(26, 14 + len * 4.6);
  }

  /** Point at parameter t on a cubic Bezier curve. */
  function cubicBezierPt(p0, p1, p2, p3, t) {
    var mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
    };
  }

  /** Tangent vector at parameter t on a cubic Bezier curve. */
  function cubicBezierTangent(p0, p1, p2, p3, t) {
    var mt = 1 - t;
    return {
      x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
      y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
    };
  }

  /** Minimum distance from obstacle point (ox, oy) to cubic Bezier curve. */
  function minDistanceToCurve(p0, p1, p2, p3, ox, oy) {
    var minD = Infinity;
    for (var i = 1; i < 20; i++) {
      var pt = cubicBezierPt(p0, p1, p2, p3, i / 20);
      var d = Math.hypot(pt.x - ox, pt.y - oy);
      if (d < minD) minD = d;
    }
    return minD;
  }

  /* =========================================================================
     1. Intelligent Layered Hierarchy Layout Engine
     ========================================================================= */

  /**
   * Layout DFA states in a hierarchical layered structure:
   * - BFS rank from start state establishes primary horizontal layers.
   * - Longest-path leveling guarantees forward progress.
   * - Alternating 8-pass barycentric crossing minimization reduces line clutter.
   * - Dynamic horizontal/vertical spacing ensures generous room for states and labels.
   */
  function layout(dfa) {
    // 1. Compute BFS distance from start state
    var depth = {}, queue = [dfa.start];
    depth[dfa.start] = 0;

    while (queue.length) {
      var s = queue.shift();
      dfa.alphabet.forEach(function (a) {
        var t = dfa.delta[s] && dfa.delta[s][a];
        if (t !== undefined && depth[t] === undefined && dfa.states.indexOf(t) !== -1) {
          depth[t] = depth[s] + 1;
          queue.push(t);
        }
      });
    }

    var maxDepth = 0;
    dfa.states.forEach(function (s) {
      if (depth[s] !== undefined) maxDepth = Math.max(maxDepth, depth[s]);
    });

    // 2. Identify Dead/Trap states
    var isDead = {};
    dfa.states.forEach(function (s) {
      if (s === dfa.start || dfa.finals.indexOf(s) !== -1) {
        isDead[s] = false;
        return;
      }
      var allSelf = true;
      dfa.alphabet.forEach(function (a) {
        var t = dfa.delta[s] && dfa.delta[s][a];
        if (t !== s) allSelf = false;
      });
      isDead[s] = allSelf;
    });

    // 3. Initial layer assignment
    var rank = {};
    dfa.states.forEach(function (s) {
      if (depth[s] === undefined) {
        rank[s] = maxDepth + 1; // unreachable
      } else {
        rank[s] = depth[s];
      }
    });

    // 4. Level forward edges
    for (var pass = 0; pass < 4; pass++) {
      dfa.states.forEach(function (s) {
        if (depth[s] === undefined || isDead[s]) return;
        dfa.alphabet.forEach(function (a) {
          var t = dfa.delta[s] && dfa.delta[s][a];
          if (t !== undefined && !isDead[t] && depth[t] !== undefined && depth[t] > depth[s]) {
            rank[t] = Math.max(rank[t], rank[s] + 1);
          }
        });
      });
    }

    // 5. Group states by column
    var cols = [];
    dfa.states.forEach(function (s) {
      var r = rank[s];
      (cols[r] = cols[r] || []).push(s);
    });
    cols = cols.filter(Boolean);

    // Ensure start state is alone or prominent at (col 0, row 0)
    if (cols[0]) {
      var startIdx = cols[0].indexOf(dfa.start);
      if (startIdx > 0) {
        cols[0].splice(startIdx, 1);
        cols[0].unshift(dfa.start);
      }
    }

    // 6. Multi-pass alternating barycenter crossing minimization (8 rounds)
    for (var round = 0; round < 8; round++) {
      // Forward sweep: order each column by average row index of incoming predecessors
      for (var c = 1; c < cols.length; c++) {
        var prevRowOf = {};
        cols[c - 1].forEach(function (s, i) { prevRowOf[s] = i; });
        var baryFwd = {};
        cols[c].forEach(function (t, i) {
          var sum = 0, cnt = 0;
          cols[c - 1].forEach(function (s) {
            dfa.alphabet.forEach(function (a) {
              if (dfa.delta[s] && dfa.delta[s][a] === t) {
                sum += prevRowOf[s];
                cnt++;
              }
            });
          });
          baryFwd[t] = cnt ? sum / cnt : i;
        });
        cols[c].sort(function (x, y) { return baryFwd[x] - baryFwd[y]; });
      }

      // Backward sweep: order each column by average row index of outgoing successors
      for (var c = cols.length - 2; c >= 1; c--) {
        var nextRowOf = {};
        cols[c + 1].forEach(function (s, i) { nextRowOf[s] = i; });
        var baryBwd = {};
        cols[c].forEach(function (s, i) {
          var sum = 0, cnt = 0;
          cols[c + 1].forEach(function (t) {
            dfa.alphabet.forEach(function (a) {
              if (dfa.delta[s] && dfa.delta[s][a] === t) {
                sum += nextRowOf[t];
                cnt++;
              }
            });
          });
          baryBwd[s] = cnt ? sum / cnt : i;
        });
        cols[c].sort(function (x, y) { return baryBwd[x] - baryBwd[y]; });
      }
    }

    // 7. Dynamic dimensions scaled generously to graph complexity
    var N = dfa.states.length;
    var maxInCol = Math.max.apply(null, cols.map(function (c) { return c.length; }));

    // Spacious column width and row height
    var colW = Math.max(220, Math.min(280, 200 + Math.min(N, 12) * 5));
    var rowH = Math.max(135, Math.min(180, 120 + Math.min(maxInCol, 6) * 8));

    var pos = {};
    var baseY = 210;

    cols.forEach(function (col, ci) {
      var m = col.length;
      col.forEach(function (s, ri) {
        var yPos = baseY + (ri - (m - 1) / 2) * rowH;
        pos[s] = {
          x: 130 + ci * colW,
          y: yPos,
          r: radius(s),
          col: ci,
          row: ri
        };
      });
    });

    // 8. Physical relaxation to prevent any state circles from touching
    for (var iter = 0; iter < 20; iter++) {
      dfa.states.forEach(function (s1, i1) {
        for (var i2 = i1 + 1; i2 < dfa.states.length; i2++) {
          var s2 = dfa.states[i2];
          var p1 = pos[s1], p2 = pos[s2];
          var dx = p2.x - p1.x, dy = p2.y - p1.y;
          var d = Math.hypot(dx, dy) || 1;
          var minDist = p1.r + p2.r + 48; // minimum 48px clearance
          if (d < minDist) {
            var push = (minDist - d) / 2;
            var nx = dx / d, ny = dy / d;
            p1.x -= nx * push * 0.2;
            p1.y -= ny * push * 0.9;
            p2.x += nx * push * 0.2;
            p2.y += ny * push * 0.9;
          }
        }
      });
    }

    return { pos: pos, cols: cols, colW: colW, rowH: rowH };
  }

  /* =========================================================================
     2. Intelligent Edge Router with Obstacle Clearance & Corridors
     ========================================================================= */

  /**
   * Routes all transitions with:
   * - Zero edge-through-circle intersections.
   * - Strict symmetrical separation for bidirectional pairs.
   * - Multi-column and back transitions routed along concentric top & bottom arch corridors.
   * - Multi-edge destination port distribution (prevents arrowhead overlapping).
   * - Self-loops oriented toward maximum free angular clearance.
   * - Arrowheads terminating cleanly on destination perimeters.
   */
  function routeEdges(dfa, pos) {
    var edges = {}, order = [];

    // Group multiple symbols between the same pair of states (e.g. 0, 1)
    dfa.states.forEach(function (s) {
      dfa.alphabet.forEach(function (a) {
        var t = dfa.delta[s] && dfa.delta[s][a];
        if (t === undefined || !pos[t]) return;
        var k = s + '\u0000' + t;
        if (!edges[k]) {
          edges[k] = { from: s, to: t, syms: [] };
          order.push(k);
        }
        edges[k].syms.push(a);
      });
    });

    // Global diagram bounds for corridor routing
    var minGlobalY = Infinity, maxGlobalY = -Infinity;
    dfa.states.forEach(function (s) {
      var p = pos[s];
      minGlobalY = Math.min(minGlobalY, p.y - p.r);
      maxGlobalY = Math.max(maxGlobalY, p.y + p.r);
    });

    var midGlobalY = (minGlobalY + maxGlobalY) / 2;

    // -------------------------------------------------------------------------
    // Phase 1: Classify multi-column corridor edges (colSpan >= 2)
    // -------------------------------------------------------------------------
    var topArches = [];
    var botArches = [];

    order.forEach(function (k) {
      var e = edges[k];
      if (e.from === e.to) return; // self-loop
      var S = pos[e.from], D = pos[e.to];
      var colSpan = Math.abs((S.col || 0) - (D.col || 0));

      // ONLY multi-column jumps spanning across 1 or more intermediate columns (colSpan >= 2)
      // take an outer arch corridor.
      // Edges with colSpan <= 1 use direct, obstacle-avoiding curves between adjacent columns.
      if (colSpan >= 2) {
        var isBack = S.x > D.x || S.col > D.col;
        var useTop;
        if (D.y < midGlobalY - 10) useTop = true;
        else if (D.y > midGlobalY + 10) useTop = false;
        else if (S.y < midGlobalY - 10) useTop = true;
        else if (S.y > midGlobalY + 10) useTop = false;
        else useTop = (Math.min(S.y, D.y) <= midGlobalY);

        if (useTop) {
          topArches.push({ k: k, span: Math.abs(S.x - D.x), from: e.from, to: e.to, isBack: isBack });
        } else {
          botArches.push({ k: k, span: Math.abs(S.x - D.x), from: e.from, to: e.to, isBack: isBack });
        }
      }
    });

    // Group arches by destination state so multiple arches arriving at the same state
    // nest concentrically (shorter span inside, longer span outside) and receive distinct
    // non-overlapping arrival ports!
    var topArchesByDest = {}, botArchesByDest = {};
    topArches.forEach(function (item) {
      topArchesByDest[item.to] = topArchesByDest[item.to] || [];
      topArchesByDest[item.to].push(item);
    });
    botArches.forEach(function (item) {
      botArchesByDest[item.to] = botArchesByDest[item.to] || [];
      botArchesByDest[item.to].push(item);
    });

    // Sort by span ascending: shorter span = lower lift, longer span = higher lift
    Object.keys(topArchesByDest).forEach(function (to) {
      topArchesByDest[to].sort(function (a, b) { return a.span - b.span; });
    });
    Object.keys(botArchesByDest).forEach(function (to) {
      botArchesByDest[to].sort(function (a, b) { return a.span - b.span; });
    });

    topArches.sort(function (a, b) { return a.span - b.span; });
    botArches.sort(function (a, b) { return a.span - b.span; });

    var globalTopMap = {}, globalBotMap = {};
    topArches.forEach(function (item, idx) { globalTopMap[item.k] = idx; });
    botArches.forEach(function (item, idx) { globalBotMap[item.k] = idx; });

    var topArchConfig = {}, botArchConfig = {};
    Object.keys(topArchesByDest).forEach(function (to) {
      var list = topArchesByDest[to];
      list.forEach(function (item, destIdx) {
        topArchConfig[item.k] = {
          destIdx: destIdx,
          destTotal: list.length,
          globalTier: globalTopMap[item.k]
        };
      });
    });

    Object.keys(botArchesByDest).forEach(function (to) {
      var list = botArchesByDest[to];
      list.forEach(function (item, destIdx) {
        botArchConfig[item.k] = {
          destIdx: destIdx,
          destTotal: list.length,
          globalTier: globalBotMap[item.k]
        };
      });
    });

    // -------------------------------------------------------------------------
    // Phase 2: Compute incoming edge counts per node to distribute arrival ports
    // -------------------------------------------------------------------------
    var incomingByDest = {};
    order.forEach(function (k) {
      var e = edges[k];
      if (e.from === e.to) return;
      incomingByDest[e.to] = incomingByDest[e.to] || [];
      incomingByDest[e.to].push(e);
    });

    var routed = [];

    order.forEach(function (k) {
      var e = edges[k];
      var S = pos[e.from], D = pos[e.to];
      e.k = k;

      // -----------------------------------------------------------------------
      // A. Self-Loop Edge Routing
      // -----------------------------------------------------------------------
      if (e.from === e.to) {
        // Evaluate 16 angular directions around the circle
        var angles = [
          -Math.PI / 2, -Math.PI * 0.62, -Math.PI * 0.38, // top sectors
          Math.PI / 2, Math.PI * 0.62, Math.PI * 0.38,    // bottom sectors
          0, Math.PI * 0.25, -Math.PI * 0.25,             // right sectors
          Math.PI, Math.PI * 0.75, -Math.PI * 0.75        // left sectors
        ];

        var bestAngle = -Math.PI / 2;
        var bestScore = -Infinity;

        angles.forEach(function (ang) {
          var score = 0;
          // Heavy penalty if pointing into start arrow on left
          if (e.from === dfa.start && (Math.abs(ang - Math.PI) < 0.45 || Math.abs(ang - (-Math.PI)) < 0.45 || Math.abs(ang - (-Math.PI * 0.75)) < 0.2)) {
            score -= 1000;
          }

          // Prefer top and bottom orientations
          if (Math.abs(ang - (-Math.PI / 2)) < 0.1 || Math.abs(ang - (Math.PI / 2)) < 0.1) {
            score += 40;
          }

          var testX = S.x + Math.cos(ang) * (S.r + 65);
          var testY = S.y + Math.sin(ang) * (S.r + 65);

          // Penalize proximity to other state circles
          dfa.states.forEach(function (os) {
            if (os === e.from) return;
            var O = pos[os];
            var dist = Math.hypot(testX - O.x, testY - O.y);
            if (dist < O.r + 48) {
              score -= (O.r + 48 - dist) * 12;
            }
          });

          if (score > bestScore) {
            bestScore = score;
            bestAngle = ang;
          }
        });

        var H = 46, delta = 0.44;
        var s0 = { x: S.x + Math.cos(bestAngle - delta) * S.r, y: S.y + Math.sin(bestAngle - delta) * S.r };
        var e0 = { x: S.x + Math.cos(bestAngle + delta) * (S.r + 3.5), y: S.y + Math.sin(bestAngle + delta) * (S.r + 3.5) };
        var c1 = { x: S.x + Math.cos(bestAngle - 0.60) * (S.r + H + 8), y: S.y + Math.sin(bestAngle - 0.60) * (S.r + H + 8) };
        var c2 = { x: S.x + Math.cos(bestAngle + 0.60) * (S.r + H + 8), y: S.y + Math.sin(bestAngle + 0.60) * (S.r + H + 8) };

        e.curve = { p0: s0, p1: c1, p2: c2, p3: e0 };
        e.labelPt = {
          x: S.x + Math.cos(bestAngle) * (S.r + H + 15),
          y: S.y + Math.sin(bestAngle) * (S.r + H + 15)
        };
        e.isSelf = true;
        routed.push(e);
        return;
      }

      // -----------------------------------------------------------------------
      // B. Inter-State Edge Routing
      // -----------------------------------------------------------------------
      var hasReverse = !!edges[e.to + '\u0000' + e.from];
      var isBack = S.x > D.x || S.col > D.col;
      var colSpan = Math.abs((S.col || 0) - (D.col || 0));
      var dx = D.x - S.x, dy = D.y - S.y;
      var dist = Math.hypot(dx, dy) || 1;
      var nx = -dy / dist, ny = dx / dist; // Unit normal vector pointing to the left of the path

      function buildEndpoints(c1, c2, customStartAngle, customDestAngle) {
        var p0;
        if (customStartAngle !== undefined) {
          p0 = {
            x: S.x + Math.cos(customStartAngle) * S.r,
            y: S.y + Math.sin(customStartAngle) * S.r
          };
        } else {
          var tsX = c1.x - S.x, tsY = c1.y - S.y, tsD = Math.hypot(tsX, tsY) || 1;
          p0 = { x: S.x + (tsX / tsD) * S.r, y: S.y + (tsY / tsD) * S.r };
        }

        var p3;
        if (customDestAngle !== undefined) {
          p3 = {
            x: D.x + Math.cos(customDestAngle) * (D.r + 3.5),
            y: D.y + Math.sin(customDestAngle) * (D.r + 3.5)
          };
        } else {
          var tdX = D.x - c2.x, tdY = D.y - c2.y, tdD = Math.hypot(tdX, tdY) || 1;
          p3 = { x: D.x - (tdX / tdD) * (D.r + 3.5), y: D.y - (tdY / tdD) * (D.r + 3.5) };
        }

        return { p0: p0, p1: c1, p2: c2, c1: c1, c2: c2, p3: p3 };
      }

      var chosenCurve = null;

      // -----------------------------------------------------------------------
      // Special Mode: Top Arch Corridor (Concentric multi-column routing)
      // -----------------------------------------------------------------------
      if (topArchConfig[k] !== undefined) {
        var cfg = topArchConfig[k];
        var tier = cfg.globalTier;
        var lift = 58 + tier * 38;
        var yArch = minGlobalY - lift;

        var startAngle, destAngle;
        if (isBack) {
          // Arriving from the right into D: distribute arrival angles in upper-right quadrant
          if (cfg.destTotal === 1) {
            destAngle = -Math.PI * 0.16; // -28 deg
          } else {
            var step = 0.50 / Math.max(1, cfg.destTotal - 1);
            destAngle = -0.22 - cfg.destIdx * step;
          }
          startAngle = -Math.PI + 0.65 - cfg.destIdx * 0.18; // departing S towards top-left
        } else {
          // Forward leap from left to right: distribute in upper-left quadrant
          destAngle = -Math.PI + 0.44 + cfg.destIdx * 0.22;
          startAngle = -0.44 - cfg.destIdx * 0.22;
        }

        var c1 = { x: S.x + Math.cos(startAngle) * (60 + tier * 15), y: yArch };
        var c2 = { x: D.x + Math.cos(destAngle) * (60 + tier * 15), y: yArch };

        chosenCurve = buildEndpoints(c1, c2, startAngle, destAngle);
        e.isArch = true;
      }
      // -----------------------------------------------------------------------
      // Special Mode: Bottom Arch Corridor (Concentric multi-column routing)
      // -----------------------------------------------------------------------
      else if (botArchConfig[k] !== undefined) {
        var cfg = botArchConfig[k];
        var tier = cfg.globalTier;
        var drop = 58 + tier * 38;
        var yArch = maxGlobalY + drop;

        var startAngle, destAngle;
        if (isBack) {
          // Arriving from the right into D: distribute arrival angles in lower-right quadrant
          if (cfg.destTotal === 1) {
            destAngle = Math.PI * 0.16; // +28 deg
          } else {
            var step = 0.50 / Math.max(1, cfg.destTotal - 1);
            destAngle = 0.22 + cfg.destIdx * step;
          }
          startAngle = Math.PI - 0.65 + cfg.destIdx * 0.18; // departing S towards bottom-left
        } else {
          destAngle = Math.PI - 0.44 - cfg.destIdx * 0.22;
          startAngle = 0.44 + cfg.destIdx * 0.22;
        }

        var c1 = { x: S.x + Math.cos(startAngle) * (60 + tier * 15), y: yArch };
        var c2 = { x: D.x + Math.cos(destAngle) * (60 + tier * 15), y: yArch };

        chosenCurve = buildEndpoints(c1, c2, startAngle, destAngle);
        e.isArch = true;
      }
      // -----------------------------------------------------------------------
      // Special Mode: Bidirectional Pair
      // -----------------------------------------------------------------------
      else if (hasReverse) {
        // Guarantee opposite symmetrical bowing
        var b = 46;
        var c1 = { x: S.x + 0.33 * dx + nx * b, y: S.y + 0.33 * dy + ny * b };
        var c2 = { x: S.x + 0.67 * dx + nx * b, y: S.y + 0.67 * dy + ny * b };
        chosenCurve = buildEndpoints(c1, c2);
      }
      // -----------------------------------------------------------------------
      // General Mode: Crossing-aware Forward & Vertical transitions
      // -----------------------------------------------------------------------
      else {
        var candidateOptions = [];

        // Check if this is a diagonal cross-edge between adjacent columns
        var isDownwardDiagonal = (S.col + 1 === D.col && dy > 40);
        var isUpwardDiagonal = (S.col + 1 === D.col && dy < -40);

        if (isDownwardDiagonal) {
          // Bow downward-right
          [28, 42].forEach(function (b) {
            var c1 = { x: S.x + 0.33 * dx + 22, y: S.y + 0.33 * dy + ny * b };
            var c2 = { x: S.x + 0.67 * dx + 22, y: S.y + 0.67 * dy + ny * b };
            candidateOptions.push(buildEndpoints(c1, c2));
          });
        } else if (isUpwardDiagonal) {
          // Bow upward-left
          [-28, -42].forEach(function (b) {
            var c1 = { x: S.x + 0.33 * dx - 22, y: S.y + 0.33 * dy + ny * b };
            var c2 = { x: S.x + 0.67 * dx - 22, y: S.y + 0.67 * dy + ny * b };
            candidateOptions.push(buildEndpoints(c1, c2));
          });
        } else if (Math.abs(dx) < 65) {
          // Vertical intra-column
          [-54, 54, -78, 78].forEach(function (lateral) {
            var c1 = { x: S.x + lateral, y: S.y + 0.30 * dy };
            var c2 = { x: S.x + lateral, y: S.y + 0.70 * dy };
            candidateOptions.push(buildEndpoints(c1, c2));
          });
        } else {
          // Standard forward transition
          [0, 18, -18, 36, -36].forEach(function (b) {
            var c1 = { x: S.x + 0.33 * dx + nx * b, y: S.y + 0.33 * dy + ny * b };
            var c2 = { x: S.x + 0.67 * dx + nx * b, y: S.y + 0.67 * dy + ny * b };
            candidateOptions.push(buildEndpoints(c1, c2));
          });
        }

        // Evaluate candidate curves against obstacle nodes
        var bestOption = null;
        var maxClearanceScore = -Infinity;

        for (var oi = 0; oi < candidateOptions.length; oi++) {
          var opt = candidateOptions[oi];
          var minClear = Infinity;

          for (var si = 0; si < dfa.states.length; si++) {
            var os = dfa.states[si];
            if (os === e.from || os === e.to) continue;
            var O = pos[os];
            var d = minDistanceToCurve(opt.p0, opt.c1, opt.c2, opt.p3, O.x, O.y) - O.r;
            if (d < minClear) minClear = d;
          }

          if (minClear < 16) continue;

          var score = minClear >= 28 ? 1000 + Math.min(minClear, 50) : minClear * 10;
          if (score > maxClearanceScore) {
            maxClearanceScore = score;
            bestOption = opt;
          }
        }

        var defC1 = { x: S.x + 0.33 * dx, y: S.y + 0.33 * dy };
        var defC2 = { x: S.x + 0.67 * dx, y: S.y + 0.67 * dy };
        chosenCurve = bestOption || candidateOptions[0] || buildEndpoints(defC1, defC2);
      }

      e.curve = chosenCurve;

      // Label Positioning:
      var midT = 0.5;
      if (e.isArch) {
        // For arches spanning across intermediate columns, evaluate clearance at candidate t values
        // to ensure the label does not sit on top of an intermediate node or self-loop
        var bestT = 0.5, bestArchClear = -Infinity;
        [0.28, 0.40, 0.50, 0.60, 0.72].forEach(function (candT) {
          var pt = cubicBezierPt(chosenCurve.p0, chosenCurve.c1, chosenCurve.c2, chosenCurve.p3, candT);
          var minD = Infinity;
          dfa.states.forEach(function (s) {
            var O = pos[s];
            var d = Math.hypot(pt.x - O.x, pt.y - O.y);
            if (d < minD) minD = d;
          });
          if (minD > bestArchClear) {
            bestArchClear = minD;
            bestT = candT;
          }
        });
        midT = bestT;
      } else if (S.col + 1 === D.col && dy > 40) {
        midT = 0.70; // downward diagonal: place near destination
      } else if (S.col + 1 === D.col && dy < -40) {
        midT = 0.30; // upward diagonal: place near source
      }

      var mid = cubicBezierPt(chosenCurve.p0, chosenCurve.c1, chosenCurve.c2, chosenCurve.p3, midT);
      var tan = cubicBezierTangent(chosenCurve.p0, chosenCurve.c1, chosenCurve.c2, chosenCurve.p3, midT);
      var tanLen = Math.hypot(tan.x, tan.y) || 1;
      var midNormal = { x: -tan.y / tanLen, y: tan.x / tanLen };

      var labelOffset = e.isArch ? 18 : 15;
      e.labelPt = {
        x: mid.x + midNormal.x * labelOffset,
        y: mid.y + midNormal.y * labelOffset
      };
      e.isSelf = false;
      routed.push(e);
    });

    return routed;
  }

  /* =========================================================================
     3. High-Quality SVG Renderer with Vector Badges & Pan/Zoom Controls
     ========================================================================= */

  /**
   * Main Diagram Drawing Function.
   * Renders the complete DFA into container with vector badges, drop-shadows, and pan/zoom toolbar.
   */
  function draw(container, dfa, opts) {
    opts = opts || {};
    container.innerHTML = '';
    if (!dfa || !dfa.states || !dfa.states.length) return;

    var id = 'dfa_' + (++uid) + '_';
    var layoutResult = layout(dfa);
    var pos = layoutResult.pos;
    var routedEdges = routeEdges(dfa, pos);

    var colorOf = {};
    (opts.groups || []).forEach(function (g, gi) {
      g.forEach(function (s) { colorOf[s] = gi % FILLS.length; });
    });

    var active = opts.active ? new Set(opts.active) : new Set();
    var visited = opts.visited ? new Set(opts.visited) : new Set();
    var faded = opts.faded ? new Set(opts.faded) : new Set();
    var hotEdge = {};
    (opts.activeEdges || []).forEach(function (e) {
      hotEdge[e.from + '\u0000' + e.to] = true;
    });

    // Root SVG element
    var svg = el('svg', {
      class: 'dfa-svg graph-svg dfa-diagram-svg',
      role: 'img',
      'aria-label': 'DFA State Transition Diagram',
      xmlns: NS,
      preserveAspectRatio: 'xMidYMid meet'
    });

    var defs = el('defs', {}, svg);

    // Embedded standalone styles to guarantee 100% fidelity when exported or saved as SVG/PNG
    var styleEl = el('style', { type: 'text/css' }, defs);
    styleEl.textContent = [
      '.edge { fill: none !important; stroke: #475569; stroke-width: 2.2px; stroke-linecap: round; stroke-linejoin: round; }',
      '.edge.hot { stroke: #f59e0b !important; stroke-width: 3px !important; }',
      '.edge.dim { opacity: 0.25; }',
      '.edge.start { fill: none !important; stroke: #7c3aed !important; stroke-width: 2.4px !important; }',
      '.edge-badge-bg { fill: #ffffff !important; stroke: #cbd5e1 !important; stroke-width: 1.2px !important; }',
      '.edge-badge-bg.hot { fill: #fef3c7 !important; stroke: #f59e0b !important; }',
      '.edge-badge-text { fill: #0f172a !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; font-size: 11.5px !important; font-weight: 700 !important; text-anchor: middle !important; dominant-baseline: central !important; }',
      '.edge-badge-text.hot { fill: #b45309 !important; }',
      '.node-label { fill: #0f172a !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; font-size: 14.5px !important; font-weight: 700 !important; text-anchor: middle !important; dominant-baseline: central !important; }',
      '.start-badge-label { fill: #ffffff !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; font-size: 11px !important; font-weight: 700 !important; text-anchor: middle !important; dominant-baseline: central !important; }'
    ].join('\n');

    // Drop shadow filter for states
    var shadowFilter = el('filter', { id: id + 'shadow', x: '-25%', y: '-25%', width: '150%', height: '150%' }, defs);
    el('feDropShadow', { dx: '0', dy: '3', stdDeviation: '3.5', 'flood-color': '#0f172a', 'flood-opacity': '0.08' }, shadowFilter);

    // Glow filter for active/current state
    var glowFilter = el('filter', { id: id + 'glow', x: '-35%', y: '-35%', width: '170%', height: '170%' }, defs);
    el('feDropShadow', { dx: '0', dy: '0', stdDeviation: '6', 'flood-color': '#f59e0b', 'flood-opacity': '0.55' }, glowFilter);

    // Badge shadow filter
    var badgeShadow = el('filter', { id: id + 'bshadow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
    el('feDropShadow', { dx: '0', dy: '1.5', stdDeviation: '2', 'flood-color': '#0f172a', 'flood-opacity': '0.09' }, badgeShadow);

    // Crisp Arrowhead Markers
    [['n', '#475569'], ['h', '#f59e0b']].forEach(function (m) {
      var mk = el('marker', {
        id: id + m[0],
        viewBox: '0 0 10 10',
        refX: 8.5,
        refY: 5,
        markerWidth: 7.5,
        markerHeight: 7.5,
        orient: 'auto'
      }, defs);
      el('path', { d: 'M1.5,1.5 L8.5,5 L1.5,8.5 z', fill: m[1] }, mk);
    });

    // Viewport root group
    var viewportRoot = el('g', { class: 'viewport-root' }, svg);
    var gEdges = el('g', { class: 'diagram-edges' }, viewportRoot);
    var gLabels = el('g', { class: 'diagram-edge-labels' }, viewportRoot);
    var gNodes = el('g', { class: 'diagram-nodes' }, viewportRoot);

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function grow(x, y) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    var labels = [];

    // Render Transitions
    routedEdges.forEach(function (e) {
      var hot = hotEdge[e.k];
      var dim = faded.has(e.from) || faded.has(e.to);
      var cls = 'edge' + (hot ? ' hot' : '') + (dim ? ' dim' : '');
      var c = e.curve;

      var d = 'M ' + c.p0.x + ',' + c.p0.y +
        ' C ' + c.p1.x + ',' + c.p1.y +
        ' ' + c.p2.x + ',' + c.p2.y +
        ' ' + c.p3.x + ',' + c.p3.y;

      el('path', {
        d: d,
        class: cls,
        fill: 'none',
        stroke: hot ? '#f59e0b' : '#475569',
        'stroke-width': hot ? '3' : '2.2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        opacity: dim ? '0.25' : '1',
        'marker-end': 'url(#' + id + (hot ? 'h' : 'n') + ')'
      }, gEdges);

      grow(c.p0.x, c.p0.y);
      grow(c.p1.x, c.p1.y);
      grow(c.p2.x, c.p2.y);
      grow(c.p3.x, c.p3.y);

      var text = e.syms.join(', ');
      var hw = Math.max(14, text.length * 4.6 + 8);
      labels.push({
        x: e.labelPt.x,
        y: e.labelPt.y,
        hw: hw,
        text: text,
        hot: hot,
        dim: dim
      });
    });

    // Anti-collision relaxation for transition labels
    for (var r = 0; r < 12; r++) {
      labels.forEach(function (L, li) {
        // Push label away from state circles
        dfa.states.forEach(function (s) {
          var c = pos[s];
          var dx = L.x - c.x, dy = L.y - c.y;
          var dd = Math.hypot(dx, dy) || 1;
          var need = c.r + 20;
          if (dd < need) {
            L.x += (dx / dd) * (need - dd);
            L.y += (dy / dd) * (need - dd);
          }
        });

        // Push labels away from each other
        for (var lj = li + 1; lj < labels.length; lj++) {
          var M = labels[lj];
          var ox = (L.hw + M.hw + 8) - Math.abs(L.x - M.x);
          var oy = 26 - Math.abs(L.y - M.y);
          if (ox > 0 && oy > 0) {
            var sgn = L.y <= M.y ? -1 : 1;
            L.y += sgn * (oy / 2);
            M.y -= sgn * (oy / 2);
          }
        }
      });
    }

    // Render modern pill badge labels for transitions
    labels.forEach(function (L) {
      var g = el('g', { class: 'edge-badge-group' + (L.hot ? ' hot' : '') + (L.dim ? ' dim' : '') }, gLabels);
      var w = L.hw * 2;
      el('rect', {
        x: L.x - w / 2,
        y: L.y - 11,
        width: w,
        height: 22,
        rx: 6,
        ry: 6,
        fill: L.hot ? '#fef3c7' : '#ffffff',
        stroke: L.hot ? '#f59e0b' : '#cbd5e1',
        'stroke-width': '1.2',
        class: 'edge-badge-bg' + (L.hot ? ' hot' : ''),
        filter: 'url(#' + id + 'bshadow)'
      }, g);

      var t = el('text', {
        x: L.x,
        y: L.y + 4.2,
        fill: L.hot ? '#b45309' : '#0f172a',
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        'font-size': '11.5px',
        'font-weight': '700',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        class: 'edge-badge-text' + (L.hot ? ' hot' : '')
      }, g);
      t.textContent = L.text;

      grow(L.x - w / 2 - 8, L.y - 14);
      grow(L.x + w / 2 + 8, L.y + 14);
    });

    // Render State Nodes
    dfa.states.forEach(function (s) {
      var p = pos[s], ci = colorOf[s];
      var g = el('g', {
        class: 'node' + (faded.has(s) ? ' dim' : '') + (active.has(s) ? ' active' : '')
      }, gNodes);

      var isFinal = dfa.finals.indexOf(s) !== -1;
      var fill = ci !== undefined ? FILLS[ci] : (isFinal ? '#f0fdf4' : '#ffffff');
      var defaultStroke = isFinal ? '#10b981' : '#7c3aed';
      var stroke = active.has(s)
        ? '#f59e0b'
        : visited.has(s)
          ? '#10b981'
          : ci !== undefined
            ? STROKES[ci]
            : defaultStroke;
      var sw = isFinal ? 2.6 : (active.has(s) ? 3.5 : 2.2);

      // Outer state circle
      el('circle', {
        cx: p.x, cy: p.y, r: p.r,
        fill: fill, stroke: stroke, 'stroke-width': sw,
        'stroke-dasharray': faded.has(s) ? '5 4' : 'none',
        filter: active.has(s) ? 'url(#' + id + 'glow)' : 'url(#' + id + 'shadow)'
      }, g);

      // Inner circle for final accepting states (double ring)
      if (isFinal) {
        el('circle', {
          cx: p.x, cy: p.y, r: p.r - 5.5,
          fill: 'none', stroke: '#10b981', 'stroke-width': 1.8,
          'stroke-dasharray': faded.has(s) ? '5 4' : 'none'
        }, g);
      }

      // State label
      var label = el('text', {
        x: p.x,
        y: p.y + 4.8,
        fill: '#0f172a',
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        'font-size': '14.5px',
        'font-weight': '700',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        class: 'node-label'
      }, g);
      label.textContent = s;

      // Start state incoming arrow and badge
      if (s === dfa.start) {
        el('line', {
          x1: p.x - p.r - 52, y1: p.y,
          x2: p.x - p.r - 3, y2: p.y,
          stroke: '#7c3aed',
          'stroke-width': '2.4',
          fill: 'none',
          class: 'edge start',
          'marker-end': 'url(#' + id + 'n)'
        }, g);

        var badgeG = el('g', { class: 'start-badge' }, g);
        el('rect', {
          x: p.x - p.r - 68, y: p.y - 11,
          width: 44, height: 22, rx: 11, ry: 11,
          fill: '#7c3aed'
        }, badgeG);

        var st = el('text', {
          x: p.x - p.r - 46, y: p.y + 4,
          fill: '#ffffff',
          'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          'font-size': '11px',
          'font-weight': '700',
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          class: 'start-badge-label'
        }, badgeG);
        st.textContent = 'Start';
      }

      grow(p.x - p.r - 12, p.y - p.r - 12);
      grow(p.x + p.r + 12, p.y + p.r + 12);
      if (s === dfa.start) grow(p.x - p.r - 80, p.y - 24);
    });

    // Auto-calculate bounded diagram viewBox with comfortable padding
    var pad = 65;
    var initialVB = {
      x: minX - pad,
      y: minY - pad,
      w: Math.max(120, maxX - minX + 2 * pad),
      h: Math.max(120, maxY - minY + 2 * pad)
    };

    var currentVB = { x: initialVB.x, y: initialVB.y, w: initialVB.w, h: initialVB.h };

    function updateViewBox() {
      svg.setAttribute('viewBox', currentVB.x + ' ' + currentVB.y + ' ' + currentVB.w + ' ' + currentVB.h);
    }
    updateViewBox();

    // -------------------------------------------------------------------------
    // Pan & Zoom Interactivity
    // -------------------------------------------------------------------------
    var isPanning = false, startPointer = { x: 0, y: 0 }, startVB = { x: 0, y: 0 };
    svg.style.cursor = 'grab';

    svg.addEventListener('pointerdown', function (evt) {
      if (evt.button !== 0) return;
      isPanning = true;
      svg.style.cursor = 'grabbing';
      startPointer = { x: evt.clientX, y: evt.clientY };
      startVB = { x: currentVB.x, y: currentVB.y };
      svg.setPointerCapture(evt.pointerId);
    });

    svg.addEventListener('pointermove', function (evt) {
      if (!isPanning) return;
      var rect = svg.getBoundingClientRect();
      var scaleX = currentVB.w / (rect.width || 1);
      var scaleY = currentVB.h / (rect.height || 1);
      var dx = (evt.clientX - startPointer.x) * scaleX;
      var dy = (evt.clientY - startPointer.y) * scaleY;
      currentVB.x = startVB.x - dx;
      currentVB.y = startVB.y - dy;
      updateViewBox();
    });

    function stopPan(evt) {
      if (!isPanning) return;
      isPanning = false;
      svg.style.cursor = 'grab';
      try { svg.releasePointerCapture(evt.pointerId); } catch (err) { }
    }
    svg.addEventListener('pointerup', stopPan);
    svg.addEventListener('pointercancel', stopPan);

    // Mouse wheel zoom centered on cursor
    svg.addEventListener('wheel', function (evt) {
      evt.preventDefault();
      var factor = evt.deltaY < 0 ? 0.86 : 1.16;
      var rect = svg.getBoundingClientRect();
      var mouseRatioX = (evt.clientX - rect.left) / (rect.width || 1);
      var mouseRatioY = (evt.clientY - rect.top) / (rect.height || 1);
      var newW = currentVB.w * factor;
      var newH = currentVB.h * factor;

      // Limit zoom bounds
      if (newW < initialVB.w * 0.15 || newW > initialVB.w * 5.0) return;

      currentVB.x += (currentVB.w - newW) * mouseRatioX;
      currentVB.y += (currentVB.h - newH) * mouseRatioY;
      currentVB.w = newW;
      currentVB.h = newH;
      updateViewBox();
    }, { passive: false });

    // Double-click to fit diagram
    svg.addEventListener('dblclick', function () {
      currentVB = { x: initialVB.x, y: initialVB.y, w: initialVB.w, h: initialVB.h };
      updateViewBox();
    });

    // Floating Canvas Toolbar (+ / - / Fit / Reset)
    var parent = container.parentElement;
    if (parent && parent.classList.contains('viewport-canvas-box')) {
      var existingToolbar = parent.querySelector('.canvas-toolbar');
      if (existingToolbar) existingToolbar.remove();

      var toolbar = document.createElement('div');
      toolbar.className = 'canvas-toolbar';
      toolbar.innerHTML =
        '<button type="button" class="canvas-toolbar-btn" data-action="zoom-in" title="Zoom In (+)">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
        '</button>' +
        '<button type="button" class="canvas-toolbar-btn" data-action="zoom-out" title="Zoom Out (-)">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
        '</button>' +
        '<button type="button" class="canvas-toolbar-btn text-btn" data-action="fit" title="Fit Diagram to Viewport">' +
        'Fit' +
        '</button>' +
        '<button type="button" class="canvas-toolbar-btn text-btn" data-action="reset" title="Reset View (100%)">' +
        'Reset' +
        '</button>';

      toolbar.addEventListener('click', function (e) {
        var btn = e.target.closest('.canvas-toolbar-btn');
        if (!btn) return;
        var act = btn.dataset.action;
        if (act === 'zoom-in') {
          var cx = currentVB.x + currentVB.w / 2, cy = currentVB.y + currentVB.h / 2;
          currentVB.w *= 0.80; currentVB.h *= 0.80;
          currentVB.x = cx - currentVB.w / 2; currentVB.y = cy - currentVB.h / 2;
          updateViewBox();
        } else if (act === 'zoom-out') {
          var cx = currentVB.x + currentVB.w / 2, cy = currentVB.y + currentVB.h / 2;
          currentVB.w *= 1.25; currentVB.h *= 1.25;
          currentVB.x = cx - currentVB.w / 2; currentVB.y = cy - currentVB.h / 2;
          updateViewBox();
        } else if (act === 'fit' || act === 'reset') {
          currentVB = { x: initialVB.x, y: initialVB.y, w: initialVB.w, h: initialVB.h };
          updateViewBox();
        }
      });
      parent.appendChild(toolbar);
    }

    container.appendChild(svg);
  }

  return {
    draw: draw,
    layout: layout,
    routeEdges: routeEdges,
    FILLS: FILLS,
    STROKES: STROKES
  };
});
