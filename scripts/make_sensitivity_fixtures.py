"""Random LPs with HiGHS sensitivity reports (shadow prices, reduced costs, allowable ranges).

Only non-degenerate cases are kept (a unique optimal vertex and unique duals), because that is
when a sensitivity report has a single correct answer. Ranges are converted to Excel's conventions.
Output: scripts/fixtures/sensitivity-crosscheck.json, checked by `npm run selftest`.

    pip install highspy numpy
    python scripts/make_sensitivity_fixtures.py
"""
import json, os, random
import highspy, numpy as np

INF = 1e30
random.seed(3567)


def solve(c, A, rel, b, ub, maximize):
    n, m = len(c), len(A)
    h = highspy.Highs(); h.setOptionValue("output_flag", False)
    lp = highspy.HighsLp(); lp.num_col_ = n; lp.num_row_ = m
    lp.col_cost_ = np.array([(-x if maximize else x) for x in c], float)
    lp.col_lower_ = np.zeros(n); lp.col_upper_ = np.array([u if u is not None else INF for u in ub], float)
    lp.row_lower_ = np.array([b[i] if rel[i] == ">=" else -INF for i in range(m)], float)
    lp.row_upper_ = np.array([b[i] if rel[i] == "<=" else INF for i in range(m)], float)
    M = lp.a_matrix_; M.format_ = highspy.MatrixFormat.kColwise
    start, idx, val = [0], [], []
    for j in range(n):
        for i in range(m):
            if A[i][j] != 0: idx.append(i); val.append(A[i][j])
        start.append(len(idx))
    M.start_ = np.array(start); M.index_ = np.array(idx); M.value_ = np.array(val); M.num_col_ = n; M.num_row_ = m
    h.passModel(lp); h.run()
    if h.getModelStatus() != highspy.HighsModelStatus.kOptimal: return None
    sol = h.getSolution(); st, rg = h.getRanging()
    if st != highspy.HighsStatus.kOk: return None
    sgn = -1 if maximize else 1
    x = list(sol.col_value); act = [sum(A[i][j] * x[j] for j in range(n)) for i in range(m)]
    tol = 1e-7
    active_rows = [abs(act[i] - b[i]) <= tol * max(1, abs(b[i])) for i in range(m)]
    at_bound = [abs(x[j]) <= tol or (ub[j] is not None and abs(x[j] - ub[j]) <= tol) for j in range(n)]
    # Non-degenerate: exactly n active rows/bounds, active rows have non-zero duals, bound vars non-zero reduced costs
    if sum(active_rows) + sum(at_bound) != n: return None
    duals = [sgn * d for d in sol.row_dual]; rcs = [sgn * d for d in sol.col_dual]
    if any(active_rows[i] and abs(duals[i]) < 1e-6 for i in range(m)): return None
    if any(at_bound[j] and abs(rcs[j]) < 1e-6 for j in range(n)): return None
    rows = []
    for i in range(m):
        if active_rows[i]:
            up, dn = rg.row_bound_up.value_[i], rg.row_bound_dn.value_[i]
            inc = up - b[i] if abs(up) < INF else None
            dec = b[i] - dn if abs(dn) < INF else None
        else:  # Excel convention for a non-binding row: unlimited one way, the slack the other
            slack = abs(b[i] - act[i])
            inc, dec = (None, slack) if rel[i] == "<=" else (slack, None)
        rows.append({"shadow": duals[i], "inc": inc, "dec": dec})
    cols = []
    for j in range(n):
        up, dn = rg.col_cost_up.value_[j], rg.col_cost_dn.value_[j]
        cc = sgn * c[j]  # HiGHS works on the minimised cost
        if maximize:
            inc = cc - dn if abs(dn) < INF else None
            dec = up - cc if abs(up) < INF else None
        else:
            inc = up - cc if abs(up) < INF else None
            dec = cc - dn if abs(dn) < INF else None
        cols.append({"value": x[j], "reducedCost": rcs[j], "inc": inc, "dec": dec})
    return {"objective": sgn * h.getInfo().objective_function_value, "rows": rows, "cols": cols}


cases = []
tries = 0
while len(cases) < 80 and tries < 20000:
    tries += 1
    n, m = random.randint(2, 5), random.randint(2, 5)
    maximize = random.random() < 0.7
    c = [random.randint(1, 40) for _ in range(n)]
    A = [[random.randint(0, 12) for _ in range(n)] for _ in range(m)]
    rel = [("<=" if maximize else ">=") if random.random() < 0.8 else (">=" if maximize else "<=") for _ in range(m)]
    b = [random.randint(20, 300) for _ in range(m)]
    ub = [random.choice([None, None, random.randint(5, 60)]) for _ in range(n)]
    r = solve(c, A, rel, b, ub, maximize)
    if r is None: continue
    model = {"title": f"s{len(cases)+1}", "direction": "max" if maximize else "min", "objectiveName": "z", "nonNegative": True,
             "variables": [{"name": f"x{j+1}", "label": f"x{j+1}", "objective": c[j], "min": 0, "max": ub[j], "integer": False} for j in range(n)],
             "constraints": [{"name": f"c{i+1}", "terms": {f"x{j+1}": A[i][j] for j in range(n) if A[i][j]}, "relation": rel[i], "rhs": b[i]} for i in range(m)]}
    cases.append({"model": model, "expected": r})
out = os.path.join(os.path.dirname(__file__), "fixtures", "sensitivity-crosscheck.json")
json.dump(cases, open(out, "w"), indent=0)
print("wrote", len(cases), "non-degenerate cases from", tries, "random models")
