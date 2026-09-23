# Assigning plausible fault in TN CMV crashes

Prepared for the Thursday discussion. Measured against the real extract, not estimated.

## The problem, stated honestly

TDOT is not linked to insurance filings, and we have no digital police reports, no
crash narratives and no diagrams. We will never recover the adjudicated at-fault
party. So the goal is not to be right. The goal is a rule whose judgment is sound,
auditable and explicit about what it does not know.

The one thing we should refuse to do is infer fault from outcome. Who died, who was
injured, and whose vehicle was more damaged are consequences of mass and geometry,
not of culpability. A loaded tractor-trailer striking a sedan produces the same
casualty pattern whichever driver erred. Any rule that leans on severity will
systematically blame the lighter vehicle.

## What the database actually gives us

The officer already records a judgment. Two fields carry it:

**`vwPersonAction.ActionCde`** is a per-person code, and many of its values are
direct assertions of driver error: `07 Failure to Yield Right of Way`,
`12 Following Improperly`, `06 Failure to Keep in Proper Lane`,
`28 Exceeding Posted Speed Limit`, `25 Reckless Negligent Driving`. Because it
attaches to a person rather than to the crash, it already attributes.

**`vwPersonViolation.ViolationCategoryCde`** records an actual charging decision:
`01 Alcohol/Drugs`, `02 Reckless/Careless`, `03 Other Moving`, with statute text.
This is the closest thing to an adjudicated call in the data, and it carries a
higher evidentiary bar than a coded observation.

These are two partly independent readings of the same event by the same officer.
That matters for the method below.

## Three tables the structure document shows that the export does not contain

Worth raising early, because it changes what is buildable:

- **Unit Event Sequence** is absent. This is the ordered chain of harmful events per
  vehicle, and it is how you would normally establish who struck whom first.
  `vwUnit.FirstImpactCde` and `MostHarmfulEventCde` partially substitute, but they
  are a single code each rather than a sequence.
- **Unit Factors** (vehicle defects: brakes, tires, steering) is absent. This removes
  our only route to mechanical rather than driver causation, which matters
  disproportionately for heavy trucks.
- **Unit Road Factors** (roadway contributing conditions) is absent.
- `vwCollisionFactors.txt` is present but holds a header and zero rows.
- `vwUnit.CommercialVehicleInd` is blank on every row. The commercial unit must be
  identified by membership in `vwCommercialUnit`, which resolves for 42,284 of the
  45,650 crashes (92.6 percent).

## Measured coverage: the three numbers that bound any method

Computed across all 45,650 CMV crashes, restricted to the 40,349 that involve two or
more units, since fault between parties is only meaningful there.

| Outcome | Crashes | Share |
|---|---:|---:|
| Exactly one driver carries a fault signal | 30,061 | 74.5% |
| No driver carries any fault signal | 7,980 | 19.8% |
| Two or more drivers carry a signal | 2,234 | 5.5% |
| No driver record at all | 74 | 0.2% |

So roughly three quarters of multi-unit CMV crashes admit a clean single-party
attribution from officer-recorded fields alone. One in five is silent. One in
eighteen is genuinely contested. Those proportions, not our cleverness, set the
ceiling on coverage.

Per flagged driver, the signal mix is:

| Signal | Drivers |
|---|---:|
| Action code only | 21,592 |
| Both action code and violation | 12,150 |
| Violation only | 4,173 |

The action code is the workhorse. A citation alone is rare, which is expected:
officers code contributing actions far more often than they charge.

## Who gets flagged

Among multi-unit crashes with exactly one flagged party:

| Flagged party | Crashes | Share |
|---|---:|---:|
| Other (non-commercial) driver | 18,018 | 59.9% |
| Commercial driver | 12,043 | 40.1% |

The two parties also fail differently. Commercial drivers lead on
`Failure to Keep Proper Lane` (5,761) and `Improper Lane Change` (1,554), which is
consistent with vehicle length and blind spots. Other drivers lead on
`Failure to Yield` (3,626 against 1,927) and `Following Improperly` (4,072 against
2,877), consistent with misjudging a truck's stopping distance and turning radius.

This directionally matches the published finding that in two-vehicle
truck-car crashes the critical reason is assigned to the passenger vehicle more
often than to the truck. I have not verified the exact figure against the source,
so treat the agreement as encouraging rather than as evidence, and let us check the
citation before we lean on it.

## Proposed method

Graded output rather than a binary label. Every crash resolves to one of four
states, and each state is defensible on its face:

1. **Attributed** — exactly one driver carries a Tier 1 or Tier 2 signal.
2. **Contested** — two or more drivers carry one. Report both, assign neither.
3. **Unattributable** — no driver carries one. This is a recording gap, and we say so.
4. **Out of scope** — single-unit crashes, where inter-party fault is undefined.

Evidence tiers, strongest first:

- **Tier 1, citation.** `ViolationCategoryCde` in `01`, `02`, `03`. An officer's
  formal accusation, held to a charging standard.
- **Tier 2, coded contributing action.** A non-neutral `ActionCde`. Excludes `00`
  None, `98` Other, `99` Unknown, `97` Driverless, and importantly `23 Swerved or
  Avoided`, which describes evasive action by a driver who is usually the victim.
- **Tier 3, impairment.** Alcohol, drug and condition codes. Corroborating only. It
  establishes capacity, not causation, and should never attribute on its own.
- **Tier 4, geometry consistency.** Manner of collision with first impact point and
  maneuver. Used to test a Tier 1 or 2 call, never to make one.
- **Tier 5, flight.** `HitRunCde` other than `00`. Weak and suggestive. Flag, do not
  attribute.

Confidence rises with tier and with corroboration across independent signals. A
driver with both a citation and a consistent action code in a geometry that agrees
is our highest-confidence call. A driver with a lone Tier 2 code in an ambiguous
geometry is our lowest.

## Biases we must state whenever we publish a number

- **Survivor account bias.** The officer's coding rests on the accounts available at
  the scene. Where the non-commercial driver was killed or incapacitated, the
  surviving truck driver's account is the dominant input. Fault signals in fatal
  crashes are therefore least trustworthy exactly where the stakes are highest, and
  they likely tilt away from the survivor. This should be tested by comparing
  attribution splits across severity levels.
- **Absence is not innocence.** The 19.8 percent with no signal are unrecorded, not
  blameless. They must never be folded into a "no fault found" denominator.
- **Agency variation.** Citation practice differs between THP and local agencies.
  `AgencyOriTxt` lets us test whether Tier 1 availability varies by reporting agency,
  and it almost certainly does.
- **Selection.** This extract is CMV-involved crashes only. Nothing here generalizes
  to Tennessee crashes at large.

## Validating without ground truth

We cannot measure accuracy. We can measure coherence, four ways:

1. **Independent-signal agreement.** On the 12,150 drivers carrying both an action
   code and a violation, do the two agree on the nature of the error? Disagreement
   rate is a usable reliability bound.
2. **Geometry negative control.** In `01 Front to Rear` crashes, the struck vehicle
   should almost never be the flagged party. If our rule attributes fault to stopped
   or slowing lead vehicles at any material rate, the rule is broken. Attribution
   already resolves cleanly in 77.7 percent of these, so the test has power.
3. **Severity invariance.** Attribution split should not move sharply with crash
   severity. If it does, we are picking up survivor bias rather than fault.
4. **Tier ablation.** Recompute with Tier 3 dropped. Conclusions that move a lot
   under ablation were resting on impairment, which we agreed should not attribute
   alone.

The geometry rates are stable across collision types, between 63.5 and 80.7 percent
single-party attribution, so no geometry is systematically blind to us.

## Open questions for Thursday

1. Do we attribute at driver level or unit level? They diverge for multi-occupant
   units and for driverless code `97`.
2. Should Contested produce a split weight, for example 0.5 each, or stay categorical?
   A split is convenient for dashboard aggregation and is harder to defend.
3. Can Chris or TDOT supply Unit Event Sequence and Unit Factors? Both materially
   raise the ceiling, and Unit Factors is the only route to mechanical causation.
4. Do we surface confidence in the dashboard, or only show high-confidence calls?
   My preference is to surface it, because hiding it invites the reader to treat
   plausible fault as adjudicated fault.

## Reproducing these numbers

`fault_analysis2.py` in this folder streams the TITAN tables and recomputes
everything above. It joins on `MstrRecNbrTxt`, keeps each table at its native record
level, and identifies commercial units from `vwCommercialUnit` rather than the blank
`CommercialVehicleInd` column.
