#!/usr/bin/env python3
"""
dfa_equivalence.py
AutomataFlow — Hopcroft–Karp DFA Equivalence Algorithm in Python.

Implements the standard Hopcroft–Karp (1971) DFA equivalence algorithm using
Disjoint Set Union (Union-Find) with path compression and union-by-rank.
"""

from typing import Dict, List, Set, Tuple, Optional, Any
import time


class UnionFind:
    """Disjoint Set Union (Union-Find) with path compression and union-by-rank."""

    def __init__(self, elements: Optional[List[str]] = None):
        self.parent: Dict[str, str] = {}
        self.rank: Dict[str, int] = {}
        if elements:
            for e in elements:
                self.parent[e] = e
                self.rank[e] = 0

    def add(self, x: str) -> None:
        """Add an element if not already present."""
        if x not in self.parent:
            self.parent[x] = x
            self.rank[x] = 0

    def find(self, x: str) -> str:
        """Find the representative root with path compression."""
        if x not in self.parent:
            self.add(x)
            return x

        root = x
        while self.parent[root] != root:
            root = self.parent[root]

        curr = x
        while curr != root:
            nxt = self.parent[curr]
            self.parent[curr] = root
            curr = nxt

        return root

    def union(self, x: str, y: str) -> bool:
        """Merge sets containing x and y using union-by-rank."""
        root_x = self.find(x)
        root_y = self.find(y)
        if root_x == root_y:
            return False

        if self.rank[root_x] < self.rank[root_y]:
            self.parent[root_x] = root_y
        elif self.rank[root_x] > self.rank[root_y]:
            self.parent[root_y] = root_x
        else:
            self.parent[root_y] = root_x
            self.rank[root_x] += 1

        return True

    def connected(self, x: str, y: str) -> bool:
        """Check if x and y belong to the same set."""
        return self.find(x) == self.find(y)


def normalize_dfa(dfa: Dict[str, Any], unified_alphabet: List[str], trap_name: str = "__TRAP__") -> Dict[str, Any]:
    """
    Ensure total transitions by adding an explicit dead/trap state for missing transitions.
    """
    states = list(dfa.get("states", []))
    delta = {s: dict(dfa.get("delta", {}).get(s, {})) for s in states}

    needs_trap = False
    for s in states:
        for a in unified_alphabet:
            if a not in delta[s] or delta[s][a] is None or delta[s][a] == "":
                needs_trap = True
                break

    if needs_trap:
        trap = trap_name
        counter = 1
        while trap in states:
            trap = f"{trap_name}_{counter}"
            counter += 1

        states.append(trap)
        delta[trap] = {a: trap for a in unified_alphabet}

        for s in states:
            for a in unified_alphabet:
                if a not in delta[s] or delta[s][a] is None or delta[s][a] == "":
                    delta[s][a] = trap

    return {
        "states": states,
        "alphabet": list(unified_alphabet),
        "start": dfa["start"],
        "finals": list(dfa.get("finals", [])),
        "delta": delta
    }


def trace_string(dfa: Dict[str, Any], symbols: List[str]) -> Tuple[bool, List[str]]:
    """Trace an input string and return (is_accepted, state_path)."""
    cur = dfa["start"]
    path = [cur]
    finals = set(dfa.get("finals", []))
    for sym in symbols:
        if sym not in dfa["delta"].get(cur, {}):
            return False, path
        cur = dfa["delta"][cur][sym]
        path.append(cur)
    return cur in finals, path


def are_dfas_equivalent(dfa1: Dict[str, Any], dfa2: Dict[str, Any], allow_alphabet_superset: bool = True) -> Dict[str, Any]:
    """
    Determine if two DFAs recognize the same language using the Hopcroft–Karp algorithm.
    """
    t0 = time.perf_counter()

    a1 = sorted(list(dfa1.get("alphabet", [])))
    a2 = sorted(list(dfa2.get("alphabet", [])))

    if a1 == a2:
        unified_alphabet = a1
    elif allow_alphabet_superset:
        unified_alphabet = sorted(list(set(a1 + a2)))
    else:
        return {
            "equivalent": False,
            "algorithm": "Hopcroft–Karp",
            "processed_pairs": 0,
            "execution_time_ms": 0.0,
            "distinguishing_string": None,
            "error": f"Incompatible alphabets: {a1} vs {a2}"
        }

    m1 = normalize_dfa(dfa1, unified_alphabet, "__TRAP1__")
    m2 = normalize_dfa(dfa2, unified_alphabet, "__TRAP2__")

    f1 = set(m1["finals"])
    f2 = set(m2["finals"])

    all_prefixed = [f"1:{s}" for s in m1["states"]] + [f"2:{s}" for s in m2["states"]]
    uf = UnionFind(all_prefixed)

    start1 = f"1:{m1['start']}"
    start2 = f"2:{m2['start']}"

    # Check base acceptance at initial states on empty string ε
    acc1 = m1["start"] in f1
    acc2 = m2["start"] in f2
    if acc1 != acc2:
        t1 = time.perf_counter()
        t1_trace = trace_string(m1, [])
        t2_trace = trace_string(m2, [])
        return {
            "equivalent": False,
            "algorithm": "Hopcroft–Karp",
            "processed_pairs": 1,
            "execution_time_ms": round((t1 - t0) * 1000, 3),
            "dfa1_states": len(m1["states"]),
            "dfa2_states": len(m2["states"]),
            "distinguishing_string": "ε",
            "original_accepts": t1_trace[0],
            "minimized_accepts": t2_trace[0],
            "original_path": t1_trace[1],
            "minimized_path": t2_trace[1]
        }

    uf.union(start1, start2)
    queue = [(start1, start2, [])]
    processed_pairs = 0

    while queue:
        u_pref, v_pref, path_to_pair = queue.pop(0)
        processed_pairs += 1

        raw_u = u_pref[2:]
        raw_v = v_pref[2:]

        for a in unified_alphabet:
            next_u = m1["delta"][raw_u][a]
            next_v = m2["delta"][raw_v][a]

            pref_u = f"1:{next_u}"
            pref_v = f"2:{next_v}"

            r_u = uf.find(pref_u)
            r_v = uf.find(pref_v)

            if r_u != r_v:
                nacc1 = next_u in f1
                nacc2 = next_v in f2

                if nacc1 != nacc2:
                    counter_symbols = path_to_pair + [a]
                    counter_str = "".join(counter_symbols) or "ε"
                    t_fail = time.perf_counter()
                    t1_trace = trace_string(m1, counter_symbols)
                    t2_trace = trace_string(m2, counter_symbols)

                    return {
                        "equivalent": False,
                        "algorithm": "Hopcroft–Karp",
                        "processed_pairs": processed_pairs,
                        "execution_time_ms": round((t_fail - t0) * 1000, 3),
                        "dfa1_states": len(m1["states"]),
                        "dfa2_states": len(m2["states"]),
                        "distinguishing_string": counter_str,
                        "original_accepts": t1_trace[0],
                        "minimized_accepts": t2_trace[0],
                        "original_path": t1_trace[1],
                        "minimized_path": t2_trace[1]
                    }

                uf.union(r_u, r_v)
                queue.append((pref_u, pref_v, path_to_pair + [a]))

    t_end = time.perf_counter()
    return {
        "equivalent": True,
        "algorithm": "Hopcroft–Karp",
        "processed_pairs": processed_pairs,
        "execution_time_ms": max(0.01, round((t_end - t0) * 1000, 3)),
        "dfa1_states": len(m1["states"]),
        "dfa2_states": len(m2["states"]),
        "distinguishing_string": None,
        "original_accepts": None,
        "minimized_accepts": None,
        "original_path": None,
        "minimized_path": None
    }


if __name__ == "__main__":
    # Self-test on textbook DFA vs minimized
    d1 = {
        "states": ["A", "B", "C", "D", "E", "F", "G", "H"],
        "alphabet": ["0", "1"],
        "start": "A",
        "finals": ["C"],
        "delta": {
            "A": {"0": "B", "1": "F"},
            "B": {"0": "G", "1": "C"},
            "C": {"0": "A", "1": "C"},
            "D": {"0": "C", "1": "G"},
            "E": {"0": "H", "1": "F"},
            "F": {"0": "C", "1": "G"},
            "G": {"0": "G", "1": "E"},
            "H": {"0": "G", "1": "C"}
        }
    }
    d2 = {
        "states": ["AE", "BH", "C", "F", "G"],
        "alphabet": ["0", "1"],
        "start": "AE",
        "finals": ["C"],
        "delta": {
            "AE": {"0": "BH", "1": "F"},
            "BH": {"0": "G", "1": "C"},
            "C":  {"0": "AE", "1": "C"},
            "F":  {"0": "C", "1": "G"},
            "G":  {"0": "G", "1": "AE"}
        }
    }
    res = are_dfas_equivalent(d1, d2)
    print("Hopcroft–Karp Python Test Result:")
    for k, v in res.items():
        print(f"  {k}: {v}")
    assert res["equivalent"] is True
    print("\nPython self-test PASSED successfully!")
