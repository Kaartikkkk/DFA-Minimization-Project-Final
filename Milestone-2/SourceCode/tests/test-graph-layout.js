/**
 * Test Suite: DFA Diagram Layout Engine & Edge Routing Optimization
 * Verifies that:
 * 1. Zero edges pass through obstacle states.
 * 2. Arrowheads terminate cleanly at state boundaries.
 * 3. Start state is positioned at Column 0.
 * 4. Self-loops are positioned away from obstacles.
 * 5. All 7 presets and all 8 natural language DFAs pass validation.
 */
const G = require('../js/graph.js');
const presets = require('../js/presets.js');
const NLDFA = require('../js/nl-dfa.js');

function cubicBezierPt(p0, p1, p2, p3, t) {
  var mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
  };
}

function minDistanceToCurve(p0, p1, p2, p3, ox, oy) {
  var minD = Infinity;
  for (var i = 1; i < 20; i++) {
    var pt = cubicBezierPt(p0, p1, p2, p3, i / 20);
    var d = Math.hypot(pt.x - ox, pt.y - oy);
    if (d < minD) minD = d;
  }
  return minD;
}

function testDFAVisualization(name, dfa) {
  var lres = G.layout(dfa);
  var pos = lres.pos;
  var edges = G.routeEdges(dfa, pos);

  var failures = [];

  // 1. Validate coordinates
  dfa.states.forEach(function (s) {
    var p = pos[s];
    if (!p || isNaN(p.x) || isNaN(p.y) || isNaN(p.r)) {
      failures.push(`State ${s} has invalid coordinates: x=${p?.x}, y=${p?.y}`);
    }
  });

  // 2. Validate start state is at col 0
  if (pos[dfa.start].col !== 0) {
    failures.push(`Start state ${dfa.start} is at col ${pos[dfa.start].col}, expected 0`);
  }

  // 3. Validate zero edge-through-circle collisions
  edges.forEach(function (e) {
    var c = e.curve;
    if (!c || !c.p0 || !c.p1 || !c.p2 || !c.p3) {
      failures.push(`Edge ${e.from}->${e.to} has incomplete curve`);
      return;
    }
    dfa.states.forEach(function (os) {
      if (os === e.from || os === e.to) return;
      var O = pos[os];
      var d = minDistanceToCurve(c.p0, c.p1, c.p2, c.p3, O.x, O.y);
      if (d < O.r) {
        failures.push(`Edge ${e.from}->${e.to} penetrates state ${os} (dist: ${d.toFixed(1)}, radius: ${O.r})`);
      }
    });

    // 4. Validate arrowhead endpoint reaches state boundary
    var dest = pos[e.to];
    var endDist = Math.hypot(c.p3.x - dest.x, c.p3.y - dest.y);
    if (Math.abs(endDist - dest.r) > 6.0) {
      failures.push(`Edge ${e.from}->${e.to} endpoint dist ${endDist.toFixed(1)} differs from radius ${dest.r}`);
    }
  });

  return { name: name, passed: failures.length === 0, failures: failures, edgeCount: edges.length, stateCount: dfa.states.length };
}

console.log('AutomataFlow: DFA Diagram Layout & Edge Routing Test Suite\n');

var allPassed = true;

// A. Test Presets
console.log('--- A. Verifying Preset Automata ---');
presets.forEach(function (p) {
  var res = testDFAVisualization('Preset: ' + p.name, p.dfa);
  if (res.passed) {
    console.log(`  PASS: ${res.name} (${res.stateCount} states, ${res.edgeCount} edges)`);
  } else {
    allPassed = false;
    console.error(`  FAIL: ${res.name}`);
    res.failures.forEach(f => console.error(`        - ${f}`));
  }
});

// B. Test Natural Language Examples
console.log('\n--- B. Verifying 8 Natural Language Example Automata ---');
const NL_EXAMPLES = [
  'Construct a minimum DFA over the alphabet {0,1} that accepts all strings ending with 01.',
  'Construct a minimum DFA that accepts all strings containing an even number of zeros.',
  'Construct a minimum DFA that accepts all binary strings starting with 10.',
  'Construct a minimum DFA that accepts all binary strings containing the substring 101.',
  'Construct a minimum DFA that accepts all strings having an odd number of ones.',
  'Construct a minimum DFA that accepts all binary strings that do not contain consecutive ones.',
  'Construct a minimum DFA that accepts all binary strings ending with 00 or 11.',
  'Construct a minimum DFA that accepts all binary strings having an even number of zeros and an odd number of ones.'
];

NL_EXAMPLES.forEach(function (prompt, idx) {
  var parseRes = NLDFA.parse(prompt);
  var res = testDFAVisualization(`NL Example ${idx + 1}`, parseRes.dfa);
  if (res.passed) {
    console.log(`  PASS: ${res.name} (${res.stateCount} states, ${res.edgeCount} edges)`);
  } else {
    allPassed = false;
    console.error(`  FAIL: ${res.name}`);
    res.failures.forEach(f => console.error(`        - ${f}`));
  }
});

console.log('\n=======================================');
if (allPassed) {
  console.log('ALL DIAGRAM LAYOUT & ROUTING TESTS PASSED!');
  process.exit(0);
} else {
  console.error('TESTS FAILED!');
  process.exit(1);
}
