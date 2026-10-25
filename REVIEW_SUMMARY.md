# PR review summary — 2026-10-25 research stack

This file records the consolidated review of the eight research pull requests
(`#8`–`#15`) that Aadit Agrawal opened against `VariableThe/gait-biometrics`
on 25 October 2026. All eight were reviewed **post-merge** and are **APPROVED**.

## Scope & method

- The eight PRs form a stack on `main`; each targets the previous head. They
  were merged bottom-up on 2026-10-25 15:35–15:39 UTC, advancing `main` from
  `4014d85` to `0b8e61e`.
- Four parallel review subagents (`p8-agent/deepseek-v4-pro` on the `opencode`
  provider) each reviewed two PRs. Reviews were read from the public GitHub
  REST API and the committed artefacts (the `gh` shell binary is blocked for
  subagents in this environment).
- Each review checked four properties:
  1. **Correctness** — PR-body numbers reconcile against the committed
     `summary.json` / `README.md` / `audit.md` / `provenance.json`.
  2. **Baseline integrity** — the frozen `Canonical362` DEV nominee and the
     published **1.5% (3/200) TEST threshold** are unchanged.
  3. **Negative-result honesty** — failed candidates are retained, not dropped.
  4. **Reproducibility** — source freezes, hashes, and replay helpers exist.

## Verdict summary

| PR | Title | Outcome | Verdict |
| --- | --- | --- | --- |
| #8 | Add audited covariance baselines and causal robustness replay | Rejects full/log-covariance; retains control | APPROVE |
| #9 | Reduce constant-rotation sensitivity with audited canonical baseline | **Nominates Canonical362 (the clear win)** | APPROVE |
| #10 | Test paired nuisance covariance and retain canonical baseline | Fails 13/33 gates; retains Canonical362 | APPROVE |
| #11 | Retain failed claims in exact ROC and audit cycle extraction | Numerical evidence; retains Canonical362 | APPROVE |
| #12 | Rule out fixed768 gait windows with replayable DEV support inventory | Rules out fixed768; retains Canonical362 | APPROVE |
| #13 | Publish joint-repeat synthetic study and complete numeric replay | Synthetic study; retains Canonical362 | APPROVE |
| #14 | Preserve stopped N446 waveform candidate and complete negative replay | N446 STOP preserved; retains Canonical362 | APPROVE |
| #15 | Test full sensor support and retain frozen canonical baseline | Fails 14/33 gates; retains Canonical362 | APPROVE |

## Cross-cutting findings

**1. The entire stack is add-only.** Every PR records `deletions: 0`. This is
the strongest structural guarantee that the frozen `Canonical362` baseline and
the published **1.5% TEST threshold** were not altered by any exploratory PR:
no `engine/`, `models/`, or `scripts/` source was modified. (Where a PR edits an
existing file, it is limited to `README.md`, `docs/open_problems.md`, and the
`.github` quality-file list.)

**2. One clear win, seven negative-result records.** Only #9 changes the DEV
operating point — the IDNet-inspired gravity/PCA `Canonical362` descriptor:

- clean DEV FAR **0.8362% → 0.5000%** (97/11600 → 1/200)
- clean DEV FRR **15.1264% → 14.7874%** (329/2175 → 2573/17400)
- 10/15 people no worse; rejection stays 14.787% under 30°/90°
  constant-coordinate rotations (control: 85.190%/99.500%)

Every other PR is a *retained negative result*: the candidate is rejected and
the failure is preserved in full rather than hidden.

**3. Reproducibility is strong but bounded.** Each PR ships `provenance.json`
(source-commit + per-file SHA-256), `audit.md`, and replay helpers with
exact-count reconstruction. The portable replays are **cached-decision** (#15)
and **relocated-numeric** (#14/#13) — they replay saved scores/arrays, not a
full re-execution of the `engine/`/`models/`/`scripts/` code paths. The
"baseline unchanged" guarantee therefore rests on the *absence of edits to
those packages* plus hashes, not on re-running the model. This is disclosed in
each report and is not a blocker, but anyone re-deriving `Canonical362` from raw
sources must separately meet the 1e-6 score-tolerance obligation the reports
flag.

**4. One process gap to confirm.** The #11 evidence-only addendum's CI status
on its final head could not be independently re-verified (the GitHub
status/check-runs endpoints were rate-limited during review). Its merged state
and documented 1,047/1,043 test suites are consistent with CI passing, but a
fresh `gh pr checks 11` from a shell-permitted agent would close the gap.

## Per-PR findings

### #8 — covariance robustness (reject, retain control)
Adds `full_covariance` and `log_covariance` (both 494D) and compares them
against the unchanged 362D spectrum+fusion control. Neither passes: control
FAR/FRR 0.8362%/15.1264% vs full-covariance 1.2500%/18.2989% and log-covariance
1.0862%/17.1322%. `winner = "control"`. Both failed candidates retained with
exact per-person fractions. 300 fits / 660 score replays / 297 timed synthetic
policy replays reconcile; byte-identical replay hash recorded.

### #9 — canonical orientation (the win)
Introduces `canonical336`/`canonical362` and nominates `canonical362` as the
new DEV operating point. Numbers above. Rotation invariance is honest: the
canonical arms reproduce clean scores *exactly* under constant-coordinate
30°/90° rotation (≤2.06e-7, zero decision changes), while control collapses to
85.19%/99.5% rejection. Trade-offs retained: mean EER worsens (4.796%→5.876%),
five people worsen (person 14: 0%→25%), gain/noise weaknesses remain, and
person 9 stays 40/40 rejected. TEST threshold unchanged.

### #10 — nuisance covariance (fail 13/33 gates, retain Canonical362)
Reduces mean rejection across gain±10%/noise-1% from 45.607%→15.241% (a
30.366pp improvement) but fails 13 of 33 registered safety gates. Robustness
objective 23807/52200 → 221/1450. `eligible: []`. Canonical362 retained "without
nuisance loading"; "the earlier TEST operating point remains 3/200 false accepts
(1.5%)". One publication correction disclosed (33 distinct gates, not 34
assignments).

### #11 — cycle feasibility (numerical evidence, retain Canonical362)
Tests 1,280 fixed synthetic windows before any cycle-model fit: 848 yield
finite features, 432 fail, 96 represent half-strides. Extending 256→768 samples
reduces missing pairs 192→1; half-period aliases remain. Adds `engine/gated_roc.py`
using exact `fractions.Fraction` arithmetic and grouped tied-score counting, and
preserves the original length audit's *failed* combined-fingerprint assertion
with a verified JSON-key serialization erratum. `keep_model = "Canonical362"`.

### #12 — santos support inventory (rules out fixed768)
Proves the 768-sample protocol cannot retain the DEV cohort: only 1 complete
block across 300 trials, and 0/15 identities have both-day support. Documents a
22.4609375% coverage increase (115/512 = 33,810/150,528 rows) for complete
segments. Metadata-only inventory; frozen source `7e6aabe0`, SHA-256 binding,
exclusive attempt reservation, and replay/guard helpers. Retains Canonical362.

### #13 — joint-repeat synthetic study (retain Canonical362)
Recreates all 5,120 historical synthetic control rows before testing 8,640
extraction records. Joint accel+gyro selection resolves the prescribed
half-period lag in 96/96 cases per length; finite one-period extraction is
64/96 (N256) and 95/96 (N768); noise-only inputs still yield finite features in
22/24 cases. Missing pairs are failures, not corrected extractions. `full_verification.json`
records a saved-only replay pass with SHA-256 anchors; 31 failure probes refuse
correctly. Retains Canonical362 + automatic WCCN / raw `mean_multi` / policy C.

### #14 — native waveform (N446 STOP preserved)
Records a *stopped* candidate: 960 nondegenerate fixtures → 956 valid, 4 failed
keys (P200 phase02/18, alternating-step-harmonic, pure-periodic-balanced-peaks),
all at N446. `execution.log` = `STOP_NO_RETRY_NO_PARAMETER_CHANGE`; `native_feasibility_claim: false`.
Failed candidate retained in full (1,440 inputs, 21 arrays). Canonical362 and
TEST threshold untouched.

### #15 — full-support (fails 14/33 gates, retain Canonical362)
Full-support candidate **F** worsens clean equal-fold FRR vs matched control **H**
(+1.528736pp, 16.655% vs 15.126%) and fails 14/33 replacement gates against
frozen **R** (Canonical362). FAR 0.583%→0.750%. R retained; "change no TEST
threshold". Largest PR (~12k additions / 784 files), dominated by 660 score NPZs,
an extracted `authority/engine` kernel snapshot, and a full `uv.lock`. Bit-for-bit
cached-decision replay; raw segments/model-state omitted (disclosed).

## Review caveats

- Reviews ran against the public REST API; the `gh` CLI was unavailable to the
  subagents (hierarchy-guard) and the unauthenticated API rate-limited the
  status/check-runs endpoints, so CI is reported from merge-page markers and the
  PRs' own recorded evidence rather than a fresh `gh pr checks` run.
- Reviews are **medium-confidence** on re-execution: report text, gate source,
  and cross-file numeric reconciliation were all verified, but the replay
  helpers and CI checks were not independently re-run in the review environment.
