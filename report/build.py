#!/usr/bin/env python3
"""Build the single-file gait-biometrics report from committed report artefacts."""
import json, os, re, glob, hashlib

REPO = "/tmp/gb"
OUT = "/tmp/gb-report"
SRC = os.path.join(OUT, "src")

R = lambda *p: os.path.join(REPO, *p)
J = lambda p: json.load(open(p))


def read_text(p):
    with open(p, encoding="utf-8") as fh:
        return fh.read()


# ---------------------------------------------------------------- sources
summary = J(R("reports/2026-10-23/summary.json"))
quality = R("reports/2026-10-23-quality")
scaling = R("reports/2026-10-23-scaling")
cross = R("reports/2026-10-23-cross-day")
calibration = J(R("reports/2026-10-24-calibration/summary.json"))
hillclimb = J(R("reports/2026-10-24-hillclimb/summary.json"))

# ---------------------------------------------------------------- KPI cards
kpi = {
    "wisdm_eer": {
        "label": "WISDM verification EER",
        "value": "9.58%",
        "delta": "▼ 52.3% vs 20.10% baseline",
        "deltaClass": "d-good",
        "foot": "locked test · ROC AUC 0.9622 · 10,000 comparisons",
    },
    "crossday": {
        "label": "Cross-day EER (Santos v7)",
        "value": "0.0%",
        "delta": "▲ from 7.0% — the 8/10 user is fixed",
        "deltaClass": "d-good",
        "foot": "exploratory · 5 reused test users · AUC 1.0 · FAR 1.5%",
    },
    "calibration": {
        "label": "Pooled calibration FAR",
        "value": "0.836%",
        "delta": "▼ from 0.917% · FRR 19.3→15.1%",
        "deltaClass": "d-good",
        "foot": "policy C · 12-person refit · DEV-only",
    },
    "preproc": {
        "label": "Preprocessing speed-up",
        "value": "15.72",
        "unit": "×",
        "delta": "bit-identical output",
        "deltaClass": "d-good",
        "foot": "100,000 rows → 1,561 windows",
    },
    "multisensor": {
        "label": "Multisensor dev EER",
        "value": "6.68%",
        "delta": "▼ from 11.74% accel-only control",
        "deltaClass": "d-good",
        "foot": "accel+gyro+invariant fusion · 5 folds",
    },
    "har_activity": {
        "label": "HAR activity accuracy",
        "value": "90.53%",
        "delta": "93.69% under the older selection rule",
        "deltaClass": "d-flat",
        "foot": "multitask track · 2,947 test windows",
    },
}

# ---------------------------------------------------------------- verification rows
verification = [
    {
        "name": "UCI HAR · frozen baseline (20 epochs)",
        "short": "Baseline", "dataset": "UCI HAR", "color": "var(--c-base)",
        "eer": 0.1764, "auc": 0.9252, "far": 0.0358, "frr": 0.3728,
        "status": "prior baseline",
        "note": "20-epoch walking model, re-evaluated under the current harness.",
    },
    {
        "name": "UCI HAR · multiscale hybrid ensemble",
        "short": "Multiscale hybrid", "dataset": "UCI HAR", "color": "var(--c-bad)",
        "eer": 0.2146, "auc": 0.8900, "far": 0.0686, "frr": 0.2738,
        "status": "negative result",
        "note": "Won validation at 3.04% EER, then failed to generalise to test.",
    },
    {
        "name": "UCI HAR · descriptors + WCCN (0.2)",
        "short": "Descriptors + WCCN", "dataset": "UCI HAR", "color": "var(--c-warn)",
        "eer": 0.1044, "auc": 0.9608, "far": 0.0054, "frr": 0.3046,
        "status": "exploratory · test reused",
        "note": "Secondary subject-CV selection; the test cohort had already been inspected.",
    },
    {
        "name": "WISDM v1 · frozen baseline (20 epochs)",
        "short": "Baseline", "dataset": "WISDM v1", "color": "var(--c-base)",
        "eer": 0.2010, "auc": 0.8686, "far": 0.1520, "frr": 0.2468,
        "status": "prior baseline",
        "note": "20-epoch walking model, re-evaluated under the current harness.",
    },
    {
        "name": "WISDM v1 · multiscale batch-hard ensemble",
        "short": "Multiscale batch-hard", "dataset": "WISDM v1", "color": "var(--c-accent)",
        "eer": 0.0958, "auc": 0.9622, "far": 0.0826, "frr": 0.1072,
        "status": "validation-locked",
        "note": "Selected on validation at 1.98% EER; the test split was read once.",
    },
    {
        "name": "Santos v7 · cross-day lagcov + blend",
        "short": "Cross-day", "dataset": "Santos v7", "color": "var(--c-cross)",
        "eer": 0.0, "auc": 1.0, "far": 0.015, "frr": 0.0,
        "status": "exploratory · test reused",
        "note": "Different cohort: 5 reused test users, day-1 enrollment, day-2 probing.",
    },
]

# ---------------------------------------------------------------- training curves
def curve(path, name, color, test_eer, short):
    m = J(path)
    pts = []
    for p in m["per_epoch"]:
        pts.append({
            "epoch": p["epoch"],
            "val_eer": p["val_eer"],
            "val_roc_auc": p["val_roc_auc"],
            "loss": p["loss"],
        })
    best = min(pts, key=lambda p: p["val_eer"])
    return {"name": name, "short": short, "color": color, "best_epoch": best["epoch"], "test_eer": test_eer, "points": pts}


curves = [
    curve(os.path.join(quality, "wisdm_v1/multiscale_hard/seed_42/metrics.json"),
          "WISDM v1 · multiscale batch-hard", "var(--c-accent)", 0.0958, "WISDM"),
    curve(os.path.join(quality, "har/multiscale_hybrid/seed_42/metrics.json"),
          "UCI HAR · multiscale hybrid", "var(--c-bad)", 0.2146, "HAR"),
]

# ---------------------------------------------------------------- candidate landscape
FAMILY = {
    "legacy_hard": ("legacy batch-hard", "neural"),
    "multiscale_hard": ("multiscale batch-hard", "neural"),
    "multiscale_supcon": ("multiscale sup-con", "neural"),
    "multiscale_hybrid": ("multiscale hybrid", "neural"),
    "multiscale_stats_hybrid": ("multiscale hybrid+stats", "neural"),
    "temporal_hybrid": ("temporal hybrid", "neural"),
    "features": ("descriptors", "features"),
}
POST = {"none": "no post-processing", "wccn_auto": "+ WCCN(auto)", "wccn_0.2": "+ WCCN(0.2)"}
POST_FEATURES = {"none": "centred cosine", "wccn_auto": "WCCN(auto)", "wccn_0.2": "WCCN(0.2)"}


def landscape(source, winner_name):
    reg = J(os.path.join(quality, source, "validation_registry.json"))
    rows = []
    for c in reg["candidates"]:
        fam, kind = FAMILY.get(c["method"], (c["method"], c["method"]))
        post = c.get("postprocess", "none")
        sub = POST_FEATURES.get(post, POST.get(post, post)) if kind == "features" else POST.get(post, post)
        rows.append({
            "label": fam,
            "sub": sub,
            "eer": c["validation"]["eer"],
            "kind": kind,
            "winner": c["name"] == winner_name,
        })
    rows.sort(key=lambda r: r["eer"])
    return rows


land = {
    "wisdm": landscape("wisdm_v1", "multiscale_hard_none"),
    "har": landscape("har", "multiscale_hybrid_none"),
}

# ---------------------------------------------------------------- activity classification
cls = summary["classification"]
HIST = {
    "cnn_baseline": 0.895487,
    "multitask": 0.908381,
    "cnn_lstm": 0.930098,
    "se_attention": 0.929420,
    "vit": 0.923651,
}
LABEL = {
    "cnn_baseline": ("CNN baseline", "1-D conv stack"),
    "multitask": ("Multitask CNN", "identity + activity heads"),
    "cnn_lstm": ("CNN + LSTM", "DeepConvLSTM"),
    "se_attention": ("SE attention CNN", "squeeze-excite"),
    "vit": ("Vision transformer", "patch transformer"),
}
tracks = []
for k in ["cnn_baseline", "multitask", "cnn_lstm", "se_attention", "vit"]:
    e = cls[k]
    lab, sub = LABEL[k]
    tracks.append({
        "label": lab, "sub": sub,
        "new_acc": e["evaluation"]["accuracy"],
        "new_epoch": e["training"]["best_epoch"],
        "new_time": round(e["end_to_end_seconds"], 2),
        "hist_acc": HIST[k],
    })

best_key = max(tracks, key=lambda t: t["new_acc"])["label"]
cm = cls["multitask"]["evaluation"]
SHORT = ["WALK", "UP", "DOWN", "SIT", "STAND", "LAY"]
ROWLAB = ["Walking", "Upstairs", "Downstairs", "Sitting", "Standing", "Laying"]
classification = {
    "tracks": tracks,
    "wiker_acc": 0.936885,
    "confusion": {
        "matrix": cm["confusion_matrix"],
        "rows": ROWLAB,
        "cols": SHORT,
    },
}

# ---------------------------------------------------------------- cross-day (updated)
cd = J(os.path.join(cross, "summary.json"))
per = cd["per_subject_errors"]["by_claim_subject"]["per_subject"]

# Cross-day method progression (from hillclimb cross_day_comparisons + operating_test)
xcd = hillclimb["cross_day_comparisons"]
op_test = hillclimb["operating_test"]["auto/mean_multi"]

crossday_methods = [
    {
        "name": "Historical accel + mean template",
        "short": "Accel baseline",
        "color": "var(--c-base)",
        "eer": xcd["oldbaseline"]["eer"], "auc": xcd["oldbaseline"]["roc_auc"],
        "fa": xcd["oldbaseline"]["fixed_threshold"]["false_accepts"],
        "fa_n": xcd["oldbaseline"]["fixed_threshold"]["n_impostor"],
        "fr": xcd["oldbaseline"]["fixed_threshold"]["false_rejects"],
        "fr_n": xcd["oldbaseline"]["fixed_threshold"]["n_genuine"],
    },
    {
        "name": "Multisensor + two templates",
        "short": "Multisensor",
        "color": "var(--c-warn)",
        "eer": xcd["control"]["eer"], "auc": xcd["control"]["roc_auc"],
        "fa": xcd["control"]["fixed_threshold"]["false_accepts"],
        "fa_n": xcd["control"]["fixed_threshold"]["n_impostor"],
        "fr": xcd["control"]["fixed_threshold"]["false_rejects"],
        "fr_n": xcd["control"]["fixed_threshold"]["n_genuine"],
    },
    {
        "name": "+ lagged covariance",
        "short": "+ lagcov",
        "color": "var(--c-explore)",
        "eer": xcd["lagcov"]["eer"], "auc": xcd["lagcov"]["roc_auc"],
        "fa": xcd["lagcov"]["fixed_threshold"]["false_accepts"],
        "fa_n": xcd["lagcov"]["fixed_threshold"]["n_impostor"],
        "fr": xcd["lagcov"]["fixed_threshold"]["false_rejects"],
        "fr_n": xcd["lagcov"]["fixed_threshold"]["n_genuine"],
    },
    {
        "name": "lagcov + mean/two-template blend",
        "short": "+ blend",
        "color": "var(--c-cross)",
        "eer": op_test["eer"], "auc": op_test["roc_auc"],
        "fa": op_test["fixed_threshold"]["false_accepts"],
        "fa_n": op_test["fixed_threshold"]["n_impostor"],
        "fr": op_test["fixed_threshold"]["false_rejects"],
        "fr_n": op_test["fixed_threshold"]["n_genuine"],
    },
]

# per-user before/after (old baseline vs best)
old_per = xcd["oldbaseline"]["per_subject_errors"]
new_per = op_test["per_subject_errors"]
user_ids = sorted(old_per, key=lambda s: int(s))
users = []
for sid in user_ids:
    o = old_per[sid]
    n = new_per[sid]
    users.append({
        "id": int(sid),
        "genuine": o["n_genuine"],
        "old_frr": o["frr"], "old_fr": o["false_rejects"],
        "new_frr": n["frr"], "new_fr": n["false_rejects"],
    })

crossday = {
    "methods": crossday_methods,
    "users": users,
    "fa": op_test["fixed_threshold"]["false_accepts"],
    "fr": op_test["fixed_threshold"]["false_rejects"],
    "eer": op_test["eer"],
    "auc": op_test["roc_auc"],
    "old_eer": xcd["oldbaseline"]["eer"],
    "old_fr": xcd["oldbaseline"]["fixed_threshold"]["false_rejects"],
}

# ---------------------------------------------------------------- calibration study
CAL_POLICY = {
    "A": ("mean_multi/A", "prior FAR≤1% threshold, 9-person fit"),
    "B": ("mean_multi/B", "pooled threshold, 9-person fit"),
    "C": ("mean_multi/C", "pooled threshold, 12-person refit"),
    "D": ("mean_multi/D", "order-statistic cutoff, 12-person refit"),
}
cal_policies = []
for key in ["A", "B", "C", "D"]:
    name, desc = CAL_POLICY[key]
    p = calibration["policies"][name]
    cal_policies.append({
        "label": "Blend " + key,
        "sub": desc,
        "far": p["far"], "frr": p["frr"],
        "far_exact": p["far_exact"], "frr_exact": p["frr_exact"],
        "splits": p["splits_far_above_2pct"],
        "winner": key == "C",
    })

calibration_data = {
    "policies": cal_policies,
    "far_before": 0.917, "far_after": 0.836,
    "frr_before": 19.276, "frr_after": 15.126,
    "triggered": calibration["normalization_gate"]["triggered"],
    "top_two_fa": calibration["normalization_gate"]["top_two_pairs_false_accepts"],
    "total_fa": calibration["normalization_gate"]["false_accepts"],
    "winner": calibration["winner"],
    "people_no_worse": 12,
}

# ---------------------------------------------------------------- multisensor study
ms = hillclimb["multisensor_development"]
MS_LABEL = {
    "descriptor_accel_axes_auto/mean": ("accel axes", "control"),
    "descriptor_accel_gyro_fusion_auto/multi": ("accel+gyro fusion", "winner"),
    "descriptor_accel_gyro_axes_auto/multi": ("accel+gyro axes", ""),
    "descriptor_accel_gyro_invariant_auto/multi": ("accel+gyro invariant", ""),
    "descriptor_accel_invariant_auto/multi": ("accel invariant", ""),
    "descriptor_accel_gyro_fusion_auto/mean": ("accel+gyro fusion (mean)", ""),
}
ms_rows = []
for c in ms:
    key = c["name"]
    if key not in MS_LABEL:
        continue
    label, tag = MS_LABEL[key]
    ms_rows.append({
        "label": label,
        "tag": tag,
        "eer": c["mean_eer"],
        "winner": key == "multisensor_winner",
    })
ms_rows.sort(key=lambda r: r["eer"])

multisensor = {
    "rows": ms_rows,
    "winner": "accel+gyro fusion",
    "winner_eer": 0.06678,
    "control_eer": 0.11736,
}

# ---------------------------------------------------------------- backend study
be = hillclimb["backend_selection"]["mean_eer"]
BACKEND_LABEL = {
    "oldbaseline": ("historical accel baseline", "comparison"),
    "control": ("multisensor control", "control"),
    "nuisance": ("paired-day nuisance proj.", ""),
    "snorm": ("cohort score norm.", ""),
    "snorm_lagcov": ("snorm + lagcov", ""),
    "snorm_nuisance": ("snorm + nuisance", ""),
    "lagcov": ("lagged covariance", "winner"),
}
backend_rows = []
for key in ["oldbaseline", "control", "nuisance", "snorm", "snorm_lagcov", "snorm_nuisance", "lagcov"]:
    label, tag = BACKEND_LABEL[key]
    backend_rows.append({
        "label": label,
        "tag": tag,
        "eer": be[key],
        "winner": key == "lagcov",
    })
backend_rows.sort(key=lambda r: r["eer"])

backend = {
    "rows": backend_rows,
    "winner": "lagged covariance",
    "winner_eer": be["lagcov"],
    "control_eer": be["control"],
    "oldbaseline_eer": be["oldbaseline"],
    "n_splits": hillclimb["backend_selection"]["n_splits"],
}

# ---------------------------------------------------------------- transfer invariance
tr = {c["source"]: {} for c in hillclimb["transfer_development_only"]}
for c in hillclimb["transfer_development_only"]:
    tr[c["source"]][c["candidate"]] = c["summary"]["mean"]["eer"]

transfer = {
    "har": {"axis": tr["har"]["axis"], "invariant": tr["har"]["invariant"], "fusion": tr["har"]["fusion"]},
    "wisdm": {"axis": tr["wisdm_v1"]["axis"], "invariant": tr["wisdm_v1"]["invariant"], "fusion": tr["wisdm_v1"]["fusion"]},
}

# ---------------------------------------------------------------- runtime trade-off
rt = hillclimb["runtime_ms"]
runtime = {
    "baseline_b1": rt["baseline"][0]["batch_latency_ms_median"],
    "winner_b1": rt["winner"][0]["batch_latency_ms_median"],
    "baseline_b32": rt["baseline"][1]["batch_latency_ms_median"],
    "winner_b32": rt["winner"][1]["batch_latency_ms_median"],
    "slowdown_b1": rt["winner"][0]["batch_latency_ms_median"] / rt["baseline"][0]["batch_latency_ms_median"],
}

# ---------------------------------------------------------------- scaling study
SCALE_META = {
    "linear_w32": ("linear w32", "30,252 params"),
    "linear_w96": ("linear w96", "207,236 params"),
    "arcface_w32": ("arcface w32", "30,252 params"),
    "arcface_w96": ("arcface w96", "207,236 params"),
    "features_standard": ("descriptors", "centred cosine"),
    "features_wccn_auto": ("descriptors + WCCN auto", "whitened"),
    "features_wccn_0.2": ("descriptors + WCCN 0.2", "whitened"),
}
ORDER = list(SCALE_META.keys())


def scale_rows(source):
    d = J(os.path.join(scaling, source, "development_results.json"))
    by = {c["name"]: c for c in d["candidates"]}
    out = []
    for name in ORDER:
        c = by.get(name)
        if not c:
            continue
        s = c["summary"]
        out.append({
            "eer": s["mean"]["eer"],
            "auc": s["mean"]["roc_auc"],
            "sd": round(s.get("fold_sample_sd", {}).get("eer", 0.0) * 100, 2),
        })
    return out


scaling_data = {
    "candidates": [{"label": SCALE_META[n][0], "sub": SCALE_META[n][1]} for n in ORDER],
    "har": scale_rows("har"),
    "wisdm": scale_rows("wisdm_v1"),
}

# ---------------------------------------------------------------- performance
bench = summary["benchmarks"]
pre = bench["preprocessing"]
wk = bench["wiker"]
dk = bench["darkstar"]

perf = {
    "preproc": {
        "baseline_s": pre["baseline"]["median_seconds"],
        "candidate_s": pre["candidate"]["median_seconds"],
        "speedup": pre["speedup"],
    },
    "throughput": [
        {"cpu": dk["cpu"]["training"]["items_per_second"], "gpu": dk["cuda"]["training"]["items_per_second"]},
        {"cpu": dk["cpu"]["inference"]["items_per_second"], "gpu": dk["cuda"]["inference"]["items_per_second"]},
        {"cpu": wk["cpu"]["training"]["items_per_second"], "gpu": wk["cuda"]["training"]["items_per_second"]},
        {"cpu": wk["cpu"]["inference"]["items_per_second"], "gpu": wk["cuda"]["inference"]["items_per_second"]},
    ],
    "latency": [
        {"label": "Frozen baseline", "params": "174,720", "cpu": 0.253, "cuda": 0.525},
        {"label": "New member 1", "params": "28,972", "cpu": 0.897, "cuda": 1.658},
        {"label": "New ensemble ×3", "params": "86,916", "cpu": 2.624, "cuda": 4.507},
    ],
    "compression": [
        {"label": "Activity accuracy", "sub": "95.3% → 66.4%", "before": "95.31%", "after": "66.41%", "delta": -30.3},
        {"label": "Parameters", "sub": "350k → 172k", "before": "350,406", "after": "172,467", "delta": -50.8},
        {"label": "FLOPs", "sub": "7.05M → 3.54M", "before": "7,045,888", "after": "3,543,616", "delta": -49.7},
        {"label": "ONNX size", "sub": "694 kB → 312 kB", "before": "694,388 B", "after": "312,168 B", "delta": -55.0},
    ],
}

# ---------------------------------------------------------------- assemble
data = {
    "series": {
        "kpi": kpi,
        "verification": verification,
        "curves": curves,
        "landscape": land,
        "classification": classification,
        "crossday": crossday,
        "calibration": calibration_data,
        "multisensor": multisensor,
        "backend": backend,
        "transfer": transfer,
        "runtime": runtime,
        "scaling": scaling_data,
        "perf": perf,
    }
}

css = read_text(os.path.join(SRC, "styles.css"))
js = read_text(os.path.join(SRC, "app.js"))
tpl = read_text(os.path.join(SRC, "index.template.html"))

out = tpl.replace("/*__CSS__*/", css)
out = out.replace("/*__JS__*/", js)
out = out.replace("/*__DATA__*/", json.dumps(data, separators=(",", ":")))

name = "gait-biometrics-results-review.html"
path = os.path.join(OUT, name)
with open(path, "w", encoding="utf-8") as fh:
    fh.write(out)

print("wrote", path, os.path.getsize(path), "bytes")
print("sha256", hashlib.sha256(out.encode()).hexdigest())
