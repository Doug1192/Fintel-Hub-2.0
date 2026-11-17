"""Generate random LP / MILP test cases and solve them with SciPy (HiGHS).

The output (scripts/fixtures/lp-crosscheck.json) is committed; `npm run selftest`
checks that Fintel Hub's optimizer gets the same status and objective on every case.

    pip install scipy
    python scripts/make_lp_fixtures.py
"""
import json, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
from crosscheck import solve

random.seed(5567)
cases = []
while len(cases) < 160:
    n = random.randint(2, 6)
    m = random.randint(1, 6)
    kind = random.random()
    nonneg = random.random() > 0.15
    variables = []
    for j in range(n):
        lo = random.choice([0, 0, 0, None, random.randint(0, 20)])
        hi = random.choice([None, None, random.randint(25, 200)])
        if lo is not None and hi is not None and lo > hi:
            lo, hi = hi, lo
        variables.append({
            "name": f"x{j+1}", "label": f"x{j+1}",
            "objective": random.choice([round(random.uniform(-10, 30), 2), random.randint(1, 50)]),
            "min": lo, "max": hi,
            "integer": kind > 0.75 and random.random() > 0.4,
        })
    constraints = []
    for i in range(m):
        terms = {v["name"]: round(random.uniform(0, 12), 2) for v in variables if random.random() > 0.25}
        if not terms:
            terms = {variables[0]["name"]: 1.0}
        rel = random.choice(["<=", "<=", "<=", ">=", "="])
        rhs = round(random.uniform(10, 400), 1)
        constraints.append({"name": f"c{i+1}", "terms": terms, "relation": rel, "rhs": rhs})
    model = {"title": f"case{len(cases)+1}", "direction": random.choice(["max", "max", "min"]),
             "objectiveName": "z", "nonNegative": nonneg, "variables": variables, "constraints": constraints}
    r = solve(model)
    if r["status"] == "error":
        continue
    cases.append({"model": model, "expected": {"status": r["status"], "objective": r.get("objective")}})

out = os.path.join(os.path.dirname(__file__), "fixtures", "lp-crosscheck.json")
json.dump(cases, open(out, "w"), indent=0)
from collections import Counter
print("wrote", len(cases), "cases", Counter(c["expected"]["status"] for c in cases),
      "integer cases:", sum(any(v["integer"] for v in c["model"]["variables"]) for c in cases))
