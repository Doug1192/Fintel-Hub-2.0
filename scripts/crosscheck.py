"""Independent check of Fintel Hub optimizer models with SciPy (HiGHS).

Reads a JSON list of models on stdin (the OptModel shape), solves each one with
scipy.optimize.linprog / milp and prints JSON results. Used to generate the
fixtures in scripts/fixtures/ that `npm run selftest` compares against.

    pip install scipy
    python scripts/crosscheck.py < models.json
"""
import json, math, sys
from scipy.optimize import linprog


def bounds_for(model, v):
    nonneg = model.get("nonNegative", True) is not False
    if v.get("binary"):
        return (0, 1 if v.get("max") is None else min(1, v["max"]))
    lo = v.get("min")
    if lo is None:
        lo = None if not nonneg else 0
    elif nonneg:
        lo = max(0, lo)
    return (lo, v.get("max"))


def solve(model):
    vs = model["variables"]
    names = [v["name"] for v in vs]
    sign = 1 if model["direction"] == "min" else -1
    c = [0.0] * len(vs) if model["direction"] == "target" else [sign * v["objective"] for v in vs]
    A_ub, b_ub, A_eq, b_eq = [], [], [], []
    for con in model["constraints"]:
        row = [con["terms"].get(n, 0) for n in names]
        if con["relation"] == "<=":
            A_ub.append(row); b_ub.append(con["rhs"])
        elif con["relation"] == ">=":
            A_ub.append([-a for a in row]); b_ub.append(-con["rhs"])
        else:
            A_eq.append(row); b_eq.append(con["rhs"])
    if model["direction"] == "target":
        A_eq.append([v["objective"] for v in vs]); b_eq.append(model.get("target", 0))
    integrality = [1 if (v.get("integer") or v.get("binary")) else 0 for v in vs]
    res = linprog(c, A_ub=A_ub or None, b_ub=b_ub or None, A_eq=A_eq or None, b_eq=b_eq or None,
                  bounds=[bounds_for(model, v) for v in vs], integrality=integrality, method="highs")
    status = {0: "optimal", 2: "infeasible", 3: "unbounded"}.get(res.status, "error")
    out = {"status": status}
    if status == "optimal":
        x = list(res.x)
        out["objective"] = round(sum(v["objective"] * xi for v, xi in zip(vs, x)), 9)
        out["values"] = {n: round(xi, 9) for n, xi in zip(names, x)}
    return out


if __name__ == "__main__":
    models = json.load(sys.stdin)
    json.dump([solve(m) for m in models], sys.stdout, indent=1)
