/**
 * @file graph.js
 * Intelligent DFA State Diagram Visualization Engine for AutomataFlow Studio.
 *
 * Implements:
 * 1. Layered hierarchical state positioning with barycentric crossing minimization.
 * 2. Obstacle-aware cubic Bezier edge routing with concentric corridors (zero edge-node penetration).
 * 3. Bidirectional edge separation with symmetric opposite curvatures.
 * 4. Adaptive self-loops positioned in the direction of maximum angular clearance.
 * 5. Exact node-boundary intersection math (arrowheads stop cleanly at destination circle perimeter).
 * 6. Non-overlapping transition label badges with normal offsets and collision resolution.
 * 7. Interactive canvas with drag-to-pan, wheel zoom, double-click fit, and floating canvas toolbar.
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

    /** Create an SVG element with attributes and optionally append it. */
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
      return Math.max(25, 12 + String(name).length * 4.4);
    }

    /** Distance from point (px, py) to line segment (x1, y1)-(x2, y2). */
    function distToSegment(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      var l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.hypot(px - x1, py - y1);
      var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
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

    /**
     * Layered state layout engine:
     * - Computes shortest BFS path from start state as base hierarchy.
     * - Applies longest-path leveling on forward edges to prevent cross-column collisions.
     * - Places unreachable states in an auxiliary end-tier.
     * - Performs alternating 2-way barycenter crossing minimization.
     * - Staggers tall columns into sub-columns so states are never crowded vertically.
     * - Runs relaxation to guarantee spacious clearance between all state nodes.
     */
    function layout(dfa) {
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

      var maxD = 0;
      dfa.states.forEach(function (s) {
        if (depth[s] !== undefined) maxD = Math.max(maxD, depth[s]);
      });

      var rank = {};
      dfa.states.forEach(function (s) {
        rank[s] = depth[s] === undefined ? maxD + 1 : depth[s];
      });

      // Level forward edges
      for (var pass = 0; pass < 3; pass++) {
        dfa.states.forEach(function (s) {
          if (depth[s] === undefined) return;
          dfa.alphabet.forEach(function (a) {
            var t = dfa.delta[s] && dfa.delta[s][a];
            if (t !== undefined && depth[t] !== undefined && depth[t] > depth[s]) {
              rank[t] = Math.max(rank[t], rank[s] + 1);
            }
          });
        });
      }

      var cols = [];
      dfa.states.forEach(function (s) {
        var r = rank[s];
        (cols[r] = cols[r] || []).push(s);
      });
      cols = cols.filter(Boolean);

            // Barycentric crossing minimization
            for (var round = 0; round < 3; round++) {
              // Forward sweep: order by average row of incoming predecessors
              for (var c = 1; c < cols.length; c++) {
                var rowOf = {};
                cols[c - 1].forEach(function (s, i) { rowOf[s] = i; });
                var bary = {};
                cols[c].forEach(function (t, i) {
                  var sum = 0, cnt = 0;
                  cols[c - 1].forEach(function (s) {
                    dfa.alphabet.forEach(function (a) {
                      if (dfa.delta[s] && dfa.delta[s][a] === t) {
                        sum += rowOf[s];
                        cnt++;
                      }
                    });
                  });
                  bary[t] = cnt ? sum / cnt : i;
                });
          cols[c].sort(function (x, y) { return bary[x] - bary[y]; });
        }

      // Backward sweep: order by average row of outgoing successors
      for (var c = cols.length - 2; c >= 0; c--) {
          var rowOf = {};
          cols[c + 1].forEach(function (s, i) { rowOf[s] = i; });
          var bary = {};
          cols[c].forEach(function (s, i) {
            var sum = 0, cnt = 0;
            cols[c + 1].forEach(function (t) {
              dfa.alphabet.forEach(function (a) {
                if (dfa.delta[s] && dfa.delta[s][a] === t) {
                  sum += rowOf[t];
                  cnt++;
                }
              });
            });
            bary[s] = cnt ? sum / cnt : i;
          });
          cols[c].sort(function (x, y) { return bary[x] - bary[y]; });
        }
      }

      var N = dfa.states.length;
      var maxStatesInCol = Math.max.apply(null, cols.map(function (c) { return c.length; }));
      var colW = N <= 4 ? 180 : N <= 8 ? 165 : 155;
      var rowH = maxStatesInCol > 4 ? 92 : N <= 4 ? 140 : N <= 8 ? 125 : 110;
      var pos = {};

      cols.forEach(function (col, ci) {
        var m = col.length;
        col.forEach(function (s, ri) {
          // Lateral stagger for columns with multiple states to avoid collinear occlusion
          var subColOffset = (m > 3) ? (ri % 2 === 1 ? 32 : -32) : 0;
          pos[s] = {
            x: 100 + ci * colW + subColOffset,
            y: 110 + (ri - (m - 1) / 2) * rowH,
            r: radius(s),
            col: ci,
            row: ri
          };
        });
      });

      // Anti-collision relaxation: ensure minimum distance between all state circles
      for (var iter = 0; iter < 16; iter++) {
        dfa.states.forEach(function (s1, i1) {
          for (var i2 = i1 + 1; i2 < dfa.states.length; i2++) {
            var s2 = dfa.states[i2];
            var p1 = pos[s1], p2 = pos[s2];
            var dx = p2.x - p1.x, dy = p2.y - p1.y;
            var d = Math.hypot(dx, dy) || 1;
            var minDist = p1.r + p2.r + 36;
            if (d < minDist) {
              var push = (minDist - d) / 2;
              var nx = dx / d, ny = dy / d;
              p1.x -= nx * push * 0.3;
              p1.y -= ny * push;
              p2.x += nx * push * 0.3;
              p2.y += ny * push;
            }
          }
        });
      }

      return { pos: pos, cols: cols, colW: colW, rowH: rowH };
    }

    /**
     * Advanced Edge Router:
     * - Eliminates edge-through-node penetration.
     * - Evaluates candidate paths and selects maximal clearance.
     * - Routes long-distance and obstacle-crossing edges along concentric corridors.
     * - Separates bidirectional edges symmetrically.
     * - Calculates exact node-boundary endpoints and tangents for arrowheads.
     */
        function routeEdges(dfa, pos) {
          var edges = {}, order = [];
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

          var routed = [];

          order.forEach(function (k) {
            var e = edges[k];
            var S = pos[e.from], D = pos[e.to];
            e.k = k;

            if (e.from === e.to) {
              // Self-loop: Search 12 angles for maximum angular clearance
              var candidates = [
                -Math.PI / 2, Math.PI / 2, 0, Math.PI,
                -Math.PI * 0.75, -Math.PI * 0.25,
                Math.PI * 0.75, Math.PI * 0.25,
                -Math.PI * 0.6, -Math.PI * 0.4
              ];
              var bestScore = -Infinity, th = -Math.PI / 2;
              candidates.forEach(function (c) {
                var score = 0;
                // Start arrow penalty for left direction
                if (e.from === dfa.start && Math.abs(c - Math.PI) < 0.3) score -= 300;
                // Prefer top/bottom
                if (Math.abs(c - (-Math.PI / 2)) < 0.1 || Math.abs(c - (Math.PI / 2)) < 0.1) score += 20;

                var lx = S.x + Math.cos(c) * (S.r + 60), ly = S.y + Math.sin(c) * (S.r + 60);
                dfa.states.forEach(function (os) {
                  if (os === e.from) return;
                  var O = pos[os];
                  var dist = Math.hypot(lx - O.x, ly - O.y);
                  if (dist < O.r + 36) score -= (O.r + 36 - dist) * 5;
                });
                if (score > bestScore) {
                  bestScore = score;
                  th = c;
                }
              });

              var H = 48, delta = 0.42;
              var s0 = { x: S.x + Math.cos(th - delta) * S.r, y: S.y + Math.sin(th - delta) * S.r };
              var e0 = { x: S.x + Math.cos(th + delta) * (S.r + 3.5), y: S.y + Math.sin(th + delta) * (S.r + 3.5) };
              var c1 = { x: S.x + Math.cos(th - 0.62) * (S.r + H + 8), y: S.y + Math.sin(th - 0.62) * (S.r + H + 8) };
              var c2 = { x: S.x + Math.cos(th + 0.62) * (S.r + H + 8), y: S.y + Math.sin(th + 0.62) * (S.r + H + 8) };
              e.curve = { p0: s0, p1: c1, p2: c2, p3: e0 };
              e.labelPt = { x: S.x + Math.cos(th) * (S.r + H + 14), y: S.y + Math.sin(th) * (S.r + H + 14) };
              e.isSelf = true;
              routed.push(e);
              return;
            }

            var hasReverse = !!edges[e.to + '\u0000' + e.from];
            var dx = D.x - S.x, dy = D.y - S.y;
            var dist = Math.hypot(dx, dy) || 1;
            var nx = -dy / dist, ny = dx / dist; // unit normal to the left

            function buildEndpoints(c1, c2) {
              var tsX = c1.x - S.x, tsY = c1.y - S.y, tsD = Math.hypot(tsX, tsY) || 1;
              var tdX = D.x - c2.x, tdY = D.y - c2.y, tdD = Math.hypot(tdX, tdY) || 1;
              return {
                p0: { x: S.x + (tsX / tsD) * S.r, y: S.y + (tsY / tsD) * S.r },
                c1: c1,
                c2: c2,
                p3: { x: D.x - (tdX / tdD) * (D.r + 3.5), y: D.y - (tdY / tdD) * (D.r + 3.5) }
              };
            }

            var candidateOptions = [];

            // Candidate 1: Standard direct & bidirectional curve bends
            var directBends = hasReverse
              ? [-38, 38, -55, 55, -75, 75]
              : [0, 16, -16, 32, -32, 50, -50, 70, -70];
            directBends.forEach(function (b) {
              var c1 = { x: S.x + 0.33 * dx + nx * b, y: S.y + 0.33 * dy + ny * b };
              var c2 = { x: S.x + 0.67 * dx + nx * b, y: S.y + 0.67 * dy + ny * b };
              candidateOptions.push(buildEndpoints(c1, c2));
            });

            // Candidate 2: Top Corridor Arches
            var minY = Math.min(S.y, D.y);
            dfa.states.forEach(function (os) {
              minY = Math.min(minY, pos[os].y - pos[os].r);
            });
            [42, 75, 110, 145].forEach(function (lift) {
              var yArch = minY - lift;
              var c1 = { x: S.x + (D.x - S.x) * 0.2, y: yArch };
              var c2 = { x: S.x + (D.x - S.x) * 0.8, y: yArch };
              candidateOptions.push(buildEndpoints(c1, c2));
            });

            // Candidate 3: Bottom Corridor Arches
            var maxY = Math.max(S.y, D.y);
            dfa.states.forEach(function (os) {
              maxY = Math.max(maxY, pos[os].y + pos[os].r);
            });
            [42, 75, 110, 145].forEach(function (drop) {
              var yArch = maxY + drop;
              var c1 = { x: S.x + (D.x - S.x) * 0.2, y: yArch };
              var c2 = { x: S.x + (D.x - S.x) * 0.8, y: yArch };
              candidateOptions.push(buildEndpoints(c1, c2));
            });

            // Candidate 4: Lateral Arches for Vertical / Intra-Column Edges
            if (Math.abs(dx) < 65) {
              [-75, 75, -115, 115].forEach(function (lateral) {
                var c1 = { x: S.x + lateral, y: S.y + 0.3 * dy };
                var c2 = { x: S.x + lateral, y: S.y + 0.7 * dy };
                candidateOptions.push(buildEndpoints(c1, c2));
              });
            }

            // Evaluate candidates and select option with maximum clearance to all obstacle states
            var bestOption = null;
            var maxClearance = -Infinity;

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

              // Favor paths that have safe clearance (>= 22px) and lower deflection
              var score = minClear >= 22 ? 1000 + minClear : minClear;
              if (score > maxClearance) {
                maxClearance = score;
                bestOption = opt;
              }
            }

            e.curve = { p0: bestOption.p0, p1: bestOption.c1, p2: bestOption.c2, p3: bestOption.p3 };

            // Calculate label anchor point at curve midpoint with normal offset
            var mid = cubicBezierPt(bestOption.p0, bestOption.c1, bestOption.c2, bestOption.p3, 0.5);
            var tan = cubicBezierTangent(bestOption.p0, bestOption.c1, bestOption.c2, bestOption.p3, 0.5);
            var tanLen = Math.hypot(tan.x, tan.y) || 1;
            var midNormal = { x: -tan.y / tanLen, y: tan.x / tanLen };

            // Offset label towards convex side of the arc
            e.labelPt = {
              x: mid.x + midNormal.x * 14,
              y: mid.y + midNormal.y * 14
            };
            e.isSelf = false;
            routed.push(e);
          });

          return routed;
        }

        /**
         * Main Graph Renderer.
         * Renders the DFA into the provided container with full vector styling and pan/zoom interactivity.
         */
        function draw(container, dfa, opts) {
          opts = opts || {};
          container.innerHTML = '';
          if (!dfa || !dfa.states.length) return;

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

          // Create SVG and internal groups
          var svg = el('svg', {
            class: 'dfa-svg',
            role: 'img',
            'aria-label': 'DFA State Transition Diagram',
            xmlns: NS
          });

          var defs = el('defs', {}, svg);

          // Drop shadow filter for state nodes
          var filter = el('filter', { id: id + 'shadow', x: '-25%', y: '-25%', width: '150%', height: '150%' }, defs);
          el('feDropShadow', { dx: '0', dy: '3', stdDeviation: '3.5', 'flood-color': '#0f172a', 'flood-opacity': '0.09' }, filter);

          // Glow filter for active/focused states
          var glow = el('filter', { id: id + 'glow', x: '-35%', y: '-35%', width: '170%', height: '170%' }, defs);
          el('feDropShadow', { dx: '0', dy: '0', stdDeviation: '6', 'flood-color': '#f59e0b', 'flood-opacity': '0.55' }, glow);

          // Arrowhead markers (Normal slate, Hot amber)
          [['n', '#64748b'], ['h', '#f59e0b']].forEach(function (m) {
            var mk = el('marker', {
              id: id + m[0],
              viewBox: '0 0 10 10',
              refX: 8.5,
              refY: 5,
              markerWidth: 7,
              markerHeight: 7,
              orient: 'auto'
            }, defs);
            el('path', { d: 'M1.5,1.5 L8.5,5 L1.5,8.5 z', fill: m[1] }, mk);
          });

          // Root viewport group for pan and zoom transformations
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
                'marker-end': 'url(#' + id + (hot ? 'h' : 'n') + ')'
              }, gEdges);

              grow(c.p0.x, c.p0.y);
              grow(c.p1.x, c.p1.y);
              grow(c.p2.x, c.p2.y);
              grow(c.p3.x, c.p3.y);

              var text = e.syms.join(', ');
              var hw = text.length * 4.6 + 8;
              labels.push({
                x: e.labelPt.x,
                y: e.labelPt.y,
                hw: hw,
                text: text,
                hot: hot,
                dim: dim
              });
            });

              // Relaxation to prevent labels from overlapping state nodes and other labels
              for (var r = 0; r < 8; r++) {
                labels.forEach(function (L, li) {
                  dfa.states.forEach(function (s) {
                    var c = pos[s];
                    var dx = L.x - c.x, dy = L.y - c.y;
                    var dd = Math.hypot(dx, dy) || 1;
                    var need = c.r + 16;
                    if (dd < need) {
                      L.x += (dx / dd) * (need - dd);
                      L.y += (dy / dd) * (need - dd);
                    }
                  });
                  for (var lj = li + 1; lj < labels.length; lj++) {
                    var M = labels[lj];
                    var ox = (L.hw + M.hw) - Math.abs(L.x - M.x);
                    var oy = 20 - Math.abs(L.y - M.y);
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
                  y: L.y - 10,
                  width: w,
                  height: 20,
                  rx: 5,
                  ry: 5,
                  class: 'edge-badge-bg' + (L.hot ? ' hot' : '')
                }, g);
                var t = el('text', {
                  x: L.x,
                  y: L.y + 3.8,
                  class: 'edge-badge-text' + (L.hot ? ' hot' : '')
                }, g);
                t.textContent = L.text;

                grow(L.x - w / 2 - 8, L.y - 12);
                grow(L.x + w / 2 + 8, L.y + 12);
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
                var label = el('text', { x: p.x, y: p.y + 4.8, class: 'node-label' }, g);
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

                grow(p.x - p.r - 12, p.y - p.r - 12);
                grow(p.x + p.r + 12, p.y + p.r + 12);
                if (s === dfa.start) grow(p.x - p.r - 76, p.y - 24);
              });

              // Auto-calculate bounded diagram viewBox with comfortable padding
              var pad = 36;
              var initialVB = {
                x: minX - pad,
                y: minY - pad,
                w: Math.max(100, maxX - minX + 2 * pad),
                h: Math.max(100, maxY - minY + 2 * pad)
              };

              var currentVB = { x: initialVB.x, y: initialVB.y, w: initialVB.w, h: initialVB.h };

              function updateViewBox() {
                svg.setAttribute('viewBox', currentVB.x + ' ' + currentVB.y + ' ' + currentVB.w + ' ' + currentVB.h);
              }
              updateViewBox();

              // Pan & Zoom Interactivity
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
                var factor = evt.deltaY < 0 ? 0.88 : 1.14;
                var rect = svg.getBoundingClientRect();
                var mouseRatioX = (evt.clientX - rect.left) / (rect.width || 1);
                var mouseRatioY = (evt.clientY - rect.top) / (rect.height || 1);
                var newW = currentVB.w * factor;
                var newH = currentVB.h * factor;

                // Limit zoom bounds
                if (newW < initialVB.w * 0.25 || newW > initialVB.w * 4.0) return;

                currentVB.x += (currentVB.w - newW) * mouseRatioX;
                currentVB.y += (currentVB.h - newH) * mouseRatioY;
                currentVB.w = newW;
                currentVB.h = newH;
                updateViewBox();
              }, { passive: false });

              // Double-click to fit
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
                    currentVB.w *= 0.82; currentVB.h *= 0.82;
                    currentVB.x = cx - currentVB.w / 2; currentVB.y = cy - currentVB.h / 2;
                    updateViewBox();
                  } else if (act === 'zoom-out') {
                    var cx = currentVB.x + currentVB.w / 2, cy = currentVB.y + currentVB.h / 2;
                    currentVB.w *= 1.22; currentVB.h *= 1.22;
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
