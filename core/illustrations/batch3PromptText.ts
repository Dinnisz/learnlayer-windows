// From LearnLayer/Illustrations/PremadeFigureBatch3.swift (`PremadeFigure.batch3PromptText`) @ ref 2026-11-04, copied by
// script: what the illustration prompt says about the batch 3 premade types, word for word.

export const batch3PromptText: string = [
  "Mathematics and sciences, built up step by step with pt-PT labels:",
  "modulus {f in x, xMin, xMax, k optional} — graph of f, |f| with the negative part reflected, and the points where |f(x)| = k;",
  "bolzano {f in x, a, b with f(a)·f(b) < 0, n halvings 1…6} — the intermediate value theorem with bisection of [a, b];",
  'sequenceTerms {kind "arithmetic" (u1, d) | "geometric" (u1, r) | "general" (u in n), count 4…16} — the terms one by one, with the limit when it converges;',
  'argandPlane {operation "polar" (re, im: modulus, argument, conjugate) | "add" | "multiply" (also re2, im2)} — complex numbers as vectors in the Argand plane;',
  'space3D {mode "vectors" (u [x, y, z], v [x, y, z], operation "sum"|"cross"|"dot") | "plane" (a, b, c, d for ax + by + cz = d)} — vectors and planes in space, cabinet projection;',
  'solids {kind "prism" (a, b, h) | "pyramid" (a the square base, h) | "cylinder" (r, h) | "cone" (r, h) | "sphere" (r)} — the solid, its measures, volume and total area;',
  'probabilityTree {events1 ["A", "B"] (2…3 names of at most 3 letters), p1 [0.3, 0.7], events2 ["R", "V"], p2 [[0.5, 0.5], [0.2, 0.8]] (probabilities of the second stage given each first outcome; one flat list if independent), highlight ["A,R", "B,R"] optional ends to add up} — a two-stage tree with the product on every end branch;',
  'vennDiagram {sets 2|3, A, B, AB (and C, AC, BC, ABC for three sets) are the sizes of each set and of the overlaps (not of the regions), U the universe size, measure "count"|"probability"} — a Venn diagram with the number in every region and the inclusion–exclusion count;',
  "freeBody {m kg, F N pulling at angle degrees above the floor, mu friction coefficient} — free-body diagram of a block on a floor: P, N, F, friction and the resultant;",
  "circularMotion {r in m, v in m/s (or T the period in s, or omega in rad/s), m optional in kg} — uniform circular motion: tangent velocity, centripetal acceleration, ω, T, aₙ = v²/r;",
  "energyBars {m kg, h m the starting height, v0 m/s upward speed (0 to drop it)} — kinetic, potential and mechanical energy as bars while a body falls or is thrown;",
  'collision {m1, m2 in kg, v1, v2 in m/s with v1 > v2 (block 1 on the left catches block 2), e restitution 0…1 or kind "elastic"|"inelastic"} — a one-dimensional collision before and after, with momentum and kinetic energy;',
  "springOscillator {m kg, k N/m, A m amplitude} — a mass on a spring released from x = A: simple harmonic motion with ω = √(k/m), T, f, vmax, amax and the x–t graph;",
  'resistorNetwork {kind "series"|"parallel", V the source in volts, R [10, 20, 30] (2 or 3 resistances in ohms)} — a circuit with moving current: equivalent resistance, current and voltage of each resistor;',
  'atwood {kind "atwood" (two masses over a pulley) | "table" (m1 on a smooth table pulled by the hanging m2), m1, m2 in kg} — pulley systems: forces on each mass, a and T from Newton\'s laws;',
  "lewisStructure {molecule: H2, F2, Cl2, O2, N2, HF, HCl, H2O, H2S, NH3, PH3, CH4, CCl4, CO2, HCN, CH2O, C2H4, C2H2 or BF3} — the Lewis structure built step by step: valence electrons, single bonds, lone pairs, multiple bonds and octets;",
  "reactionProfile {Ea activation energy and deltaH enthalpy change in kJ/mol (Ea above both levels), catalystEa optional lower activation energy} — the energy profile of a reaction: reactants, products, Ea, ΔH, exo- or endothermic, and the effect of a catalyst;",
  'titrationCurve {acid "strong"|"weak", Ca mol/L and Va mL of the acid, Cb mol/L of the strong base, pKa for a weak acid} — the pH of an acid titrated with a strong base: starting pH, equivalence point and, for a weak acid, the half-equivalence point where pH = pKa;',
  "iceTable {reactants [{name, coeff, c0}], products [{name, coeff, c0}] (1…2 species each, names of at most 6 characters, c0 initial mol/L), K the equilibrium constant Kc} — the Initial–Change–Equilibrium table solved for x, with Kc checked;",
  'periodicTrends {series "period2"|"period3"|"group1"|"group17", property "radius"|"ionization"|"electronegativity"} — measured values of one period or group as a chart with the overall trend and the elements that go against it;',
  "concentrationTime {order 0|1|2, k the rate constant, A0 the initial concentration in mol/L} — [A] against t for a reaction of order 0, 1 or 2 with its successive half-lives and the straight line that tells the order;",
  'punnettSquare {parent1, parent2 genotypes such as "Aa" or "AaBb" (one or two genes, the same genes in both, dominant allele in capitals)} — a Punnett square built cell by cell with the genotype and phenotype counts;',
  "heatingCurve {m in g, T0 initial temperature in °C (below 0 for ice), T1 final temperature in °C, optional cIce, cWater, cVapour in kJ/(kg·K) and Lf, Lv in kJ/kg} — the heating curve of water: temperature against the energy supplied, with the warming stages (Q = m·c·ΔT) and the plateaus where it melts at 0 °C and boils at 100 °C (Q = m·L);",
].join(" ");
