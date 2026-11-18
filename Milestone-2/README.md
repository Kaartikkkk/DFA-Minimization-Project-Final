# DFA Minimization Simulator: Milestone-II submission (Group ID: ________)

CSET302 Automata Theory and Computability · Simulator topic 3 · Faculty: Dr. Dinesh Prasad Sahu

Team: Snehil (S24CSEU0551), Tanya Sinha (S24CSEU0583), Suhani (S24CSEU0567), Kartik Lamba (S24CSEU0642)

> Rename this folder to `<GroupID>_DFA-Minimization_Milestone2` once your group ID is known.

## Contents

| Folder | What is inside |
|---|---|
| `Report/` | `DFA-Minimization-Technical-Report.pdf` (submission copy) and `.docx` (editable copy: fill in the Group ID and date on the cover) |
| `SourceCode/` | The complete simulator. Entry point: `SourceCode/index.html`. See `SourceCode/README.md` for setup, features, structure and tests. |
| `TestCases/` | 23 test machines as JSON (load with *Import JSON* in the simulator), plus `test-log.csv` and `test-log.txt` with expected vs actual results for all 30 tests |
| `Screenshots/` | Full-resolution screenshots of every key feature (S01–S15) and the two report diagrams (D1, D2) |
| `Presentation/` | `DFA-Minimization-M2.pptx` (demo-day slides with speaker notes) and `DFA-Minimization-Viva-Guide.pdf` |

## Run it

Open `SourceCode/index.html` in Chrome, Edge or Firefox. It works offline, and nothing needs to be installed.

## Run the tests

In the browser, open the **Test cases** tab. From a terminal (needs Node.js 14+):

```
cd SourceCode
node tests/test.js
```

Expected output ends with `30 / 30 tests passed.`

## Submission checklist (Milestone-II guide, section 9)

- [x] Report has cover page, abstract, numbered sections, figure and table captions, and references
- [x] Source code runs on a clean setup using the README instructions (no dependencies)
- [x] Every planned feature has at least one documented test; edge cases are included
- [x] Screenshots and reported results match the actual simulator
- [ ] Each group member can explain their own contribution and the core automata logic (see the Viva Guide)
- [x] No copied material without attribution; no secrets in the code
- [ ] Group confirms the allotted faculty evaluation slot (23–27 November 2026)
