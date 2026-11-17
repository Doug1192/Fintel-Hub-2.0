/**
 * Random (fictional) multi-period networks with fixed route costs, generated with the network builder.
 * Prints the models as JSON; pipe into `python scripts/crosscheck.py --pairs` to attach SciPy (HiGHS MILP)
 * answers, and save as scripts/fixtures/network-crosscheck.json:
 *
 *   npx tsx scripts/make_network_fixtures.ts | python scripts/crosscheck.py --pairs > scripts/fixtures/network-crosscheck.json
 */
import { networkModel, type NetworkArc, type NetworkNode } from "../src/lib/optBuilders";

let seed = 20251;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const ri = (a: number, b: number) => Math.round(a + rnd() * (b - a));
const models = [];
for (let k = 0; k < 30; k++) {
  const T = ri(2, 3), plants = ri(1, 2), hubs = ri(1, 3), shops = ri(2, 4);
  const nodes: NetworkNode[] = [];
  for (let i = 0; i < plants; i++) nodes.push({ name: `Plant ${i + 1}`, produceMax: ri(20, 60) * 100, produceCost: Array.from({ length: T }, () => ri(5, 15)), canStore: rnd() < 0.5, startingStock: 0, holdingCost: ri(0, 2) });
  for (let i = 0; i < hubs; i++) nodes.push({ name: `Hub ${i + 1}`, startingStock: ri(0, 20) * 100, holdingCost: ri(1, 6), maxStock: rnd() < 0.3 ? ri(20, 50) * 100 : null });
  for (let i = 0; i < shops; i++) nodes.push({ name: `Shop ${i + 1}`, demand: Array.from({ length: T }, () => ri(5, 25) * 100), startingStock: ri(0, 5) * 100, holdingCost: ri(3, 10) });
  const arcs: NetworkArc[] = [];
  for (let p = 0; p < plants; p++) for (let h = 0; h < hubs; h++) if (rnd() < 0.85) arcs.push({ from: `Plant ${p + 1}`, to: `Hub ${h + 1}`, unitCost: ri(2, 9), fixedCost: rnd() < 0.7 ? ri(5, 50) * 100 : null, capacity: rnd() < 0.3 ? ri(20, 60) * 100 : null });
  for (let h = 0; h < hubs; h++) for (let s = 0; s < shops; s++) if (rnd() < 0.7) arcs.push({ from: `Hub ${h + 1}`, to: `Shop ${s + 1}`, unitCost: ri(2, 9), fixedCost: rnd() < 0.6 ? ri(5, 40) * 100 : null });
  models.push(networkModel({ title: `net${k + 1}`, periods: T, periodLabel: "Month", nodes, arcs, holdingOn: rnd() < 0.5 ? "ending" : "average", integer: rnd() < 0.3 }));
}
console.log(JSON.stringify(models));
