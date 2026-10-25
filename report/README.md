# Final results review — report

This directory holds the **final consolidated results review** for the
gait-based continuous-authentication project, built from the committed
experiment artefacts at source commit `4014d85` (24 October 2026).

| File | Purpose |
| --- | --- |
| `gait-biometrics-results-review.html` | Self-contained interactive dashboard (single file, no external assets). Open in any browser. |
| `gait-biometrics-results-review.pdf` | Print/export of the same report (20 pages, A4, light theme). |
| `build.py` | Rebuilds the HTML from `src/index.template.html` + `src/app.js` + `src/styles.css`, injecting the measured numbers and chart data. |
| `print.mjs` | Renders the HTML to PDF via Playwright/Chromium; runs a render-check gate (commit hash, chart count, threshold) before writing the PDF. |
| `src/` | Report source: template, application logic, and styles. |

## What it covers

The report has eight sections:

1. **Overview** — scope, roles (Student A preprocessing, Student B models,
   Student C evaluation), and headline results.
2. **Method** — datasets, pipelines, and the validation/evaluation protocol.
3. **Development results** — WISDM / HAR verification, activity
   classification, and preprocessing speedup.
4. **Cross-day & multisensor** — the Santos hillclimb, six-axis sensor
   fusion, rotation invariants, lagged covariance, and the calibrated
   enrollment-score blend (descriptive 0% EER on five reused test users).
5. **Calibration** — the DEV-only pooled-threshold + twelve-person-refit
   policy comparison (FAR 0.917%→0.836%, FRR 19.276%→15.126%) and the
   normalization-gate diagnostic.
6. **Subject generalisation** — rotation-invariant vs axis-aligned transfer
   on HAR and WISDM development folds.
7. **Cost & limitations** — runtime trade-offs (the multisensor winner is
   ~5.2× slower at batch-1), the failed HAR neural result, and the
   compression/quantization failure.
8. **Conclusions & next steps** — what is established and what remains
   (fresh phone cohort, takeover delay, battery cost).

Negative and exploratory results are first-class: the exploratory reuse of
five inspected test users, the still-1.5% frozen false-accept rate, the
per-user calibration failures, and the failed neural/compression results are
all retained and labelled.

The report covers results through commit `4014d85`. The 25-October research
studies (PRs #8–#15) landed afterwards and are documented in their own report
bundles under `reports/2026-10-25-*/` and in [`REVIEW_SUMMARY.md`](../REVIEW_SUMMARY.md).

## Reproduce

The HTML is generated from the committed artefacts, so no raw dataset is
needed to rebuild it:

```bash
python3 report/build.py            # → report/gait-biometrics-results-review.html
node report/print.mjs              # → report/gait-biometrics-results-review.pdf (needs Playwright)
```
