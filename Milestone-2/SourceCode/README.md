# DFA Minimization Simulator (Group ID: ________)

CSET302 Automata Theory and Computability, simulator topic 3 · Bennett University, SCSET · Faculty: Dr. Dinesh Prasad Sahu

## Overview: What does the simulator do?

The simulator takes any user-defined deterministic finite automaton (DFA) and produces the equivalent DFA with the fewest states. It shows every intermediate step:

1. it validates the input and completes δ with an explicit dead state;
2. it removes unreachable states with breadth-first search;
3. it finds equivalent states by **table-filling** (Myhill–Nerode) and/or **partition refinement** (Moore);
4. it merges each equivalence class into one state;
5. it proves the result accepts the same language and is minimal.

## Supported features

| Feature | Where |
|---|---|
| User-defined DFA: states Q, alphabet Σ (single or multi-character symbols), start state, final states, δ table | Simulator tab, left panel |
| Input validation with clear error messages (unknown start/final state, duplicate names, ε as a symbol, invalid targets, empty Q or Σ) | Simulator tab |
| Incomplete δ allowed: missing moves go to an **explicit** non-final dead state, shown in the steps (never silent) | Simulator tab |
| Unreachable-state removal by BFS, animated | Phase "Unreachable" |
| Table-filling with the reason for every mark and pass numbers | Phase "Table-filling" |
| Partition refinement with each state's signature per round | Phase "Partitions" |
| Run both methods and compare their classes | Method "Both, and compare" |
| Minimized DFA diagram and before/after transition tables | Phases "Merge" and "Validate" |
| Automatic validation: product-automaton equivalence check, all strings up to length 8, minimality re-check | Phase "Validate" |
| String tester on both DFAs (paths, accept/reject, ε, unknown-symbol errors) and a test log | Below the player |
| 7 example DFAs, random DFA generator, import/export DFA as JSON | Left panel |
| 30 test cases with expected vs actual results, run live; CSV test log | Test cases tab |
| Milestone 1 design document (rubric order, printable to PDF) | Design document tab |
| Step controls: Prev/Next, Play/Pause, speed, phase timeline, keyboard (← → Space F E) | Simulator tab |
| Full-size diagram view (Expand button or E) and a legend for colours and shapes | Diagram panel |

## Technology stack and dependencies

| Item | Version | Needed for |
|---|---|---|
| HTML5, CSS3, JavaScript (ES5 syntax plus `Set`/`Map`) | — | The simulator itself |
| Any modern browser: Chrome/Edge 90+, Firefox 90+ | tested on Chrome 13x | Running the simulator |
| Node.js | 14 or newer (tested on 22.23) | Running the command-line tests only |

There are no third-party libraries, frameworks, CDNs or build steps. The app works completely offline. Fonts are the operating system's (Cambria, Segoe UI, Cascadia Code on Windows), with generic fallbacks.

## Installation

1. Unzip the project anywhere (for example `Documents\DFA-Minimization-Simulator`).
2. Optional, only for the command-line tests: install Node.js from nodejs.org. No `npm install` is needed.

## How to run

- **Entry point:** `index.html`. Double-click it, or right-click it and choose *Open with → Google Chrome*.
- From VS Code: right-click `index.html` → *Reveal in File Explorer* → double-click it.
- Quick start: the textbook example loads automatically. Press **Next** or **Play** to step through it. Press **F** to hide the editor while presenting.

## Example

Input (also in `TestCases/T08-worked-example-hand-solution.json`):

```json
{ "states": ["q0","q1","q2","q3","q4","q5"], "alphabet": ["0","1"], "start": "q0",
  "finals": ["q2","q3","q4"],
  "delta": { "q0": {"0":"q1","1":"q2"}, "q1": {"0":"q0","1":"q3"}, "q2": {"0":"q4","1":"q5"},
             "q3": {"0":"q4","1":"q5"}, "q4": {"0":"q4","1":"q5"}, "q5": {"0":"q5","1":"q5"} } }
```

Output:
- All 6 states are reachable.
- Table-filling marks 9 pairs in pass 0 and (q0,q5), (q1,q5) in pass 1; pass 2 marks nothing.
- Classes: {q0,q1}, {q2,q3,q4}, {q5}, giving **6 → 3 states** for the language 0*10*.
- Test string `0100` is accepted by both DFAs; `101` is rejected by both.

## Project structure

| Path | Responsibility |
|---|---|
| `index.html` | **Entry point.** Page structure: Simulator, Test cases and Design document tabs |
| `css/style.css` | Visual design, responsive layout, print layout |
| `js/algorithms.js` | All Automata Theory logic: validation, dead state, BFS, table-filling, partition refinement, merge, equivalence check, JSON import/export. No UI code. |
| `js/app.js` | Controller: editor, step player, tables, string tester, test tab, design tab |
| `js/graph.js` | SVG state-diagram drawing (layered layout, highlights) |
| `js/presets.js` | Example DFAs for the menu |
| `js/testcases.js` | The 30 test cases (shared by the Test cases tab and the Node runner) |
| `tests/test.js` | Command-line test runner |
| `tests/export-testcases.js` | Regenerates `TestCases/` (machine files and test logs) |
| `TestCases/` | Every test machine as JSON (import with *Import JSON*), plus `test-log.csv` and `test-log.txt` |

Every module-level function is documented in the source with its purpose, parameters, return value and error conditions; short inner helpers are named for what they do.

## Testing

- **In the browser:** open the *Test cases* tab. All 30 tests run automatically, showing expected vs actual results. *Open* loads a case into the simulator, and *Download test log* saves a CSV.
- **Command line:** `node tests/test.js` prints every test with expected and actual results and exits with code 1 if any test fails. `node tests/test.js --csv` prints CSV.
- **Regenerate test files:** `node tests/export-testcases.js`

The categories are:
- string tests (accept, reject, ε);
- minimization of normal machines;
- edge cases: incomplete δ, already minimal, Σ*, ∅, a single state, unreachable cycles, multi-character symbols, a 5-pass chain;
- invalid input: 7 cases;
- correctness: 300 random DFAs checked against a brute-force oracle, pass number equal to the shortest distinguishing string, idempotence;
- the JSON round trip, the step records for every phase and the random-DFA generator.

Expected result: **30 / 30 tests passed**.

## Known limitations and troubleshooting

- Input must be a DFA. NFAs and ε-NFAs are not converted (that is a separate topic).
- The interface is designed for classroom-sized DFAs (about 30 states). Larger machines work, but the table and diagram get crowded.
- On dense DFAs the automatic layout can still overlap a few edge labels.
- Table-filling is the textbook O(n³·|Σ|) version, not Hopcroft's O(n·|Σ|·log n) algorithm.
- Multi-character symbols must be separated by spaces in the string tester (for example `go stop go`).
- If **Import JSON** reports an error, check the file has `states`, `alphabet`, `start`, `finals` and `delta`. See any file in `TestCases/`.
- If the page looks unstyled, keep the `css/` and `js/` folders next to `index.html`.

## Team contributions and acknowledgements

| Member | Enrollment no. | Module led |
|---|---|---|
| Snehil | S24CSEU0551 | Input validation, dead-state completion, unreachable-state removal |
| Tanya Sinha | S24CSEU0583 | Table-filling algorithm |
| Suhani | S24CSEU0567 | Partition refinement and state merging |
| Kartik Lamba | S24CSEU0642 | Visualization, user interface and testing |

**License and attribution:** all code was written for this course project by the team; no third-party components are reused.

**Acknowledgements:** algorithms follow Hopcroft, Motwani and Ullman, *Introduction to Automata Theory, Languages, and Computation*. No third-party code or libraries are used. An AI assistant (Claude, by Anthropic) was used during development and documentation; all members reviewed, tested and can explain the logic.
