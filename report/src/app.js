/* ------------------------------------------------------------------ *
 *  Gait Biometrics — measured-results report
 *  Dependency-free SVG charts + small interaction layer.
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  const D = window.REPORT_DATA || {};
  const SVGNS = "http://www.w3.org/2000/svg";

  /* ---------- helpers ---------- */
  const el = (tag, attrs, kids) => {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach((c) => {
      if (c === null || c === undefined) return;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return e;
  };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const pct = (x, d = 2) => (x * 100).toFixed(d) + "%";
  const num = (x, d = 2) => Number(x).toFixed(d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SERIES = {
    base: css("--c-base"), good: css("--c-good"), warn: css("--c-warn"),
    bad: css("--c-bad"), explore: css("--c-explore"), cross: css("--c-cross"), accent: css("--c-accent")
  };

  /* ---------- tooltip ---------- */
  let tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "tip";
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function showTip(html, ev) {
    const t = tip();
    t.innerHTML = html;
    t.classList.add("show");
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY - h - 10;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y < 8) y = ev.clientY + pad;
    t.style.left = x + "px";
    t.style.top = y + "px";
  }
  function hideTip() { if (tipEl) tipEl.classList.remove("show"); }
  function tipRows(title, rows) {
    let h = '<div class="t-title">' + title + "</div>";
    rows.forEach((r) => {
      h += '<div class="t-row"><span>' + (r[2] ? '<span class="sw" style="background:' + r[2] + '"></span>' : "") + r[0] + "</span><b>" + r[1] + "</b></div>";
    });
    return h;
  }

  /* ---------- responsive mount ---------- */
  const registry = [];
  function mount(host, draw) {
    if (!host) return;
    const item = { host, draw, w: 0 };
    registry.push(item);
    const render = () => {
      const w = host.clientWidth;
      if (!w) return;
      item.w = w;
      host.innerHTML = "";
      draw(host, w);
    };
    render();
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      if (Math.abs(w - item.w) > 6) render();
    });
    ro.observe(host);
  }
  let rt = null;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (document.documentElement.dataset.theme !== "light") { } registry.forEach((i) => i.draw(i.host, i.host.clientWidth)); }, 180);
  });

  /* ---------- axis scaffolding ---------- */
  function frame(svg, W, H, pad) {
    const g = el("g", { transform: "translate(" + pad.l + "," + pad.t + ")" });
    svg.appendChild(g);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    return { g, iw, ih };
  }
  function yAxis(g, iw, ih, scale, ticks, fmt, opts) {
    opts = opts || {};
    ticks.forEach((t) => {
      const y = scale(t);
      g.appendChild(el("line", { x1: 0, x2: iw, y1: y, y2: y, stroke: css("--border-soft"), "stroke-width": 1, "stroke-dasharray": opts.dash || "none" }));
      g.appendChild(el("text", { x: -8, y: y + 3.5, "text-anchor": "end", "font-size": 10.5, fill: css("--text-faint"), "font-family": "var(--mono)" }, fmt(t)));
    });
    g.appendChild(el("line", { x1: 0, x2: 0, y1: 0, y2: ih, stroke: css("--border"), "stroke-width": 1 }));
    if (opts.baseline !== undefined) {
      const y = scale(opts.baseline);
      g.appendChild(el("line", { x1: 0, x2: iw, y1: y, y2: y, stroke: opts.baselineColor || css("--c-bad"), "stroke-width": 1.5, "stroke-dasharray": "5 4" }));
    }
  }
  function niceTicks(max, count) {
    const raw = max / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const out = [];
    for (let v = 0; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
    return out;
  }

  /* ---------- vertical grouped bars ---------- */
  function groupedBars(host, cfg) {
    mount(host, (h, W) => {
      const H = cfg.height || 300;
      const pad = { l: 52, r: 14, t: 24, b: cfg.bottomPad || 54 };
      const svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H });
      h.appendChild(svg);
      const { g, iw, ih } = frame(svg, W, H, pad);
      const cats = cfg.categories, series = cfg.series;
      const maxV = cfg.max !== undefined ? cfg.max : Math.max.apply(null, series.flatMap((s) => s.values.map((v) => v.v + (v.err || 0))));
      const scale = (v) => ih - (v / maxV) * ih;
      yAxis(g, iw, ih, scale, niceTicks(maxV, 5), cfg.yFmt || ((v) => v), { baseline: cfg.baseline, baselineColor: cfg.baselineColor });

      const bandW = iw / cats.length;
      const groupW = bandW * 0.72;
      const barW = groupW / series.length;
      const rotate = bandW < 78;
      const bottom = rotate ? Math.max(cfg.bottomPad || 54, 86) : (cfg.bottomPad || 54);
      cats.forEach((cat, ci) => {
        const x0 = ci * bandW + (bandW - groupW) / 2;
        series.forEach((s, si) => {
          const d = s.values[ci];
          if (!d) return;
          const x = x0 + si * barW;
          const y = scale(d.v);
          const bh = Math.max(1, ih - y);
          const rect = el("rect", { x: x + 1, y: y, width: barW - 3, height: bh, rx: Math.min(4, barW / 4), fill: d.color || s.color, opacity: d.opacity || 0.95 });
          rect.style.transition = "opacity .12s";
          rect.addEventListener("mouseenter", (e) => { rect.setAttribute("opacity", 1); showTip(tipRows(cat.title || cat.label, (d.rows || [[cfg.valueLabel || "value", cfg.valueFmt ? cfg.valueFmt(d.v) : num(d.v), d.color || s.color]])), e); });
          rect.addEventListener("mousemove", (e) => showTip(tipRows(cat.title || cat.label, d.rows || [[cfg.valueLabel || "value", cfg.valueFmt ? cfg.valueFmt(d.v) : num(d.v), d.color || s.color]]), e));
          rect.addEventListener("mouseleave", () => { rect.setAttribute("opacity", d.opacity || 0.95); hideTip(); });
          g.appendChild(rect);
          if (d.err) {
            const yTop = scale(d.v + d.err), yBot = scale(d.v - d.err);
            g.appendChild(el("line", { x1: x + barW / 2 - 1, x2: x + barW / 2 - 1, y1: yTop, y2: yBot, stroke: css("--text-faint"), "stroke-width": 1 }));
          }
          if (cfg.showValues !== false && barW > 26) {
            g.appendChild(el("text", { x: x + barW / 2 - 1, y: y - 5, "text-anchor": "middle", "font-size": 10.5, "font-weight": 650, fill: css("--text"), "font-family": "var(--mono)" }, cfg.valueFmt ? cfg.valueFmt(d.v) : num(d.v)));
          }
        });
        const cx = ci * bandW + bandW / 2;
        if (rotate) {
          g.appendChild(el("text", { x: cx, y: ih + 14, "text-anchor": "end", "font-size": 10.5, fill: css("--text-dim"), "font-weight": 600, transform: "rotate(-38 " + cx + "," + (ih + 14) + ")" }, cat.label));
        } else {
          g.appendChild(el("text", { x: cx, y: ih + 16, "text-anchor": "middle", "font-size": 11, fill: css("--text-dim"), "font-weight": 600 }, cat.label));
          if (cat.sub) g.appendChild(el("text", { x: cx, y: ih + 30, "text-anchor": "middle", "font-size": 9.5, fill: css("--text-faint"), "font-family": "var(--mono)" }, cat.sub));
        }
      });
      if (cfg.axisLabel) g.appendChild(el("text", { x: -pad.l + 12, y: -12, "font-size": 10.5, fill: css("--text-faint") }, cfg.axisLabel));
    });
  }

  /* ---------- horizontal bars ---------- */
  function hBars(host, cfg) {
    mount(host, (h, W) => {
      const H = cfg.height || 300;
      const pad = { l: cfg.left || 150, r: 60, t: 8, b: 34 };
      const svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H });
      h.appendChild(svg);
      const { g, iw, ih } = frame(svg, W, H, pad);
      const cats = cfg.categories, series = cfg.series;
      const maxV = cfg.max !== undefined ? cfg.max : Math.max.apply(null, series.flatMap((s) => s.values.map((v) => (v && v.v) || 0)));
      const scale = (v) => (v / maxV) * iw;
      const bandH = ih / cats.length;
      const groupH = bandH * 0.66;
      const barH = groupH / series.length;
      cats.forEach((cat, ci) => {
        const y0 = ci * bandH + (bandH - groupH) / 2;
        series.forEach((s, si) => {
          const d = s.values[ci];
          if (!d) return;
          const y = y0 + si * barH;
          const w = Math.max(1, scale(d.v));
          const rect = el("rect", { x: 0, y: y + 1, width: w, height: barH - 3, rx: Math.min(4, barH / 3), fill: d.color || s.color, opacity: d.opacity !== undefined ? d.opacity : 0.95 });
          rect.addEventListener("mouseenter", (e) => showTip(tipRows(cat.title || cat.label, d.rows || [[cfg.valueLabel || "value", cfg.valueFmt ? cfg.valueFmt(d.v) : num(d.v), d.color || s.color]]), e));
          rect.addEventListener("mousemove", (e) => showTip(tipRows(cat.title || cat.label, d.rows || [[cfg.valueLabel || "value", cfg.valueFmt ? cfg.valueFmt(d.v) : num(d.v), d.color || s.color]]), e));
          rect.addEventListener("mouseleave", hideTip);
          g.appendChild(rect);
          g.appendChild(el("text", { x: w + 6, y: y + barH / 2 + 3.5, "font-size": 10.5, "font-weight": 650, fill: css("--text"), "font-family": "var(--mono)" }, cfg.valueFmt ? cfg.valueFmt(d.v) : num(d.v)));
        });
        g.appendChild(el("text", { x: -10, y: ci * bandH + bandH / 2 + 4, "text-anchor": "end", "font-size": 11.5, fill: css("--text-dim"), "font-weight": 600 }, cat.label));
        if (cat.sub && bandH >= 23) g.appendChild(el("text", { x: -10, y: ci * bandH + bandH / 2 + 17, "text-anchor": "end", "font-size": 9.5, fill: css("--text-faint") }, cat.sub));
      });
      const ticks = niceTicks(maxV, 5);
      ticks.forEach((t) => {
        const x = scale(t);
        g.appendChild(el("line", { x1: x, x2: x, y1: 0, y2: ih, stroke: css("--border-soft"), "stroke-width": 1 }));
        g.appendChild(el("text", { x: x, y: ih + 16, "text-anchor": "middle", "font-size": 10, fill: css("--text-faint"), "font-family": "var(--mono)" }, cfg.xFmt ? cfg.xFmt(t) : num(t)));
      });
      if (cfg.ref !== undefined) {
        const x = scale(cfg.ref);
        g.appendChild(el("line", { x1: x, x2: x, y1: -4, y2: ih, stroke: cfg.refColor || css("--c-warn"), "stroke-width": 1.5, "stroke-dasharray": "5 4" }));
        if (cfg.refLabel) g.appendChild(el("text", { x: x - 6, y: 9, "text-anchor": "end", "font-size": 9.5, fill: cfg.refColor || css("--c-warn"), "font-weight": 650 }, cfg.refLabel));
      }
    });
  }

  /* ---------- line chart ---------- */
  function lineChart(host, cfg) {
    mount(host, (h, W) => {
      const H = cfg.height || 320;
      const pad = { l: 52, r: 16, t: 14, b: 40 };
      const svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H });
      h.appendChild(svg);
      const { g, iw, ih } = frame(svg, W, H, pad);
      const all = cfg.series.flatMap((s) => s.points.map((p) => p.y));
      let min = cfg.min !== undefined ? cfg.min : Math.min.apply(null, all);
      let max = cfg.max !== undefined ? cfg.max : Math.max.apply(null, all);
      const padY = (max - min) * 0.12 || 0.02;
      min = Math.max(0, min - padY); max = max + padY;
      const xs = cfg.series[0].points.map((p) => p.x);
      const xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
      const sx = (x) => ((x - xMin) / (xMax - xMin || 1)) * iw;
      const sy = (y) => ih - ((y - min) / (max - min || 1)) * ih;
      const ticks = cfg.ticks || 4;
      for (let i = 0; i <= ticks; i++) {
        const v = min + ((max - min) * i) / ticks;
        const y = sy(v);
        g.appendChild(el("line", { x1: 0, x2: iw, y1: y, y2: y, stroke: css("--border-soft"), "stroke-width": 1 }));
        g.appendChild(el("text", { x: -8, y: y + 3.5, "text-anchor": "end", "font-size": 10.5, fill: css("--text-faint"), "font-family": "var(--mono)" }, cfg.yFmt ? cfg.yFmt(v) : num(v, 3)));
      }
      g.appendChild(el("line", { x1: 0, x2: 0, y1: 0, y2: ih, stroke: css("--border"), "stroke-width": 1 }));
      g.appendChild(el("line", { x1: 0, x2: iw, y1: ih, y2: ih, stroke: css("--border"), "stroke-width": 1 }));
      (cfg.xTicks || [1, 10, 20, 30, 40]).forEach((t) => {
        if (t < xMin || t > xMax) return;
        g.appendChild(el("text", { x: sx(t), y: ih + 16, "text-anchor": "middle", "font-size": 10, fill: css("--text-faint"), "font-family": "var(--mono)" }, t));
      });
      if (cfg.refs) cfg.refs.forEach((r) => {
        const y = sy(r.value);
        g.appendChild(el("line", { x1: 0, x2: iw, y1: y, y2: y, stroke: r.color, "stroke-width": 1.4, "stroke-dasharray": "5 4" }));
        g.appendChild(el("text", { x: 4, y: y - 6, "font-size": 10, fill: r.color, "font-weight": 650 }, r.label));
      });
      cfg.series.forEach((s) => {
        const d = s.points.map((p, i) => (i ? "L" : "M") + sx(p.x) + " " + sy(p.y)).join(" ");
        g.appendChild(el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": s.width || 2.2, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: s.opacity || 1 }));
        if (s.points.length <= 60) {
          s.points.forEach((p) => {
            const c = el("circle", { cx: sx(p.x), cy: sy(p.y), r: s.dotR || 2.6, fill: css("--bg"), stroke: s.color, "stroke-width": 1.8 });
            c.addEventListener("mouseenter", (e) => showTip(tipRows((s.name || "") + " — " + (p.label || "epoch " + p.x), (p.rows || [["value", cfg.yFmt ? cfg.yFmt(p.y) : num(p.y, 4)]])), e));
            c.addEventListener("mousemove", (e) => showTip(tipRows((s.name || "") + " — " + (p.label || "epoch " + p.x), (p.rows || [["value", cfg.yFmt ? cfg.yFmt(p.y) : num(p.y, 4)]])), e));
            c.addEventListener("mouseleave", hideTip);
            g.appendChild(c);
          });
        }
        if (s.mark !== undefined) {
          const p = s.points.find((q) => q.x === s.mark) || s.points[s.mark];
          if (p) {
            g.appendChild(el("circle", { cx: sx(p.x), cy: sy(p.y), r: 6.5, fill: "none", stroke: s.color, "stroke-width": 2 }));
            g.appendChild(el("text", { x: sx(p.x), y: sy(p.y) - 12, "text-anchor": "middle", "font-size": 10, fill: s.color, "font-weight": 700 }, s.markLabel || ("best e" + p.x)));
          }
        }
      });
    });
  }

  /* ---------- heatmap ---------- */
  function heatmap(host, cfg) {
    mount(host, (h, W) => {
      const m = cfg.matrix, rows = cfg.rowLabels, cols = cfg.colLabels;
      const pad = { l: Math.min(132, Math.max(78, Math.round(W * 0.4))), r: 10, t: 8, b: 26 };
      const cell = Math.max(16, Math.min(58, (W - pad.l - pad.r - 4) / cols.length));
      const H = cell * rows.length + pad.t + pad.b + 16;
      const svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H });
      h.appendChild(svg);
      const g = el("g", { transform: "translate(" + pad.l + "," + pad.t + ")" });
      svg.appendChild(g);
      const maxV = Math.max.apply(null, m.flat());
      rows.forEach((r, i) => {
        g.appendChild(el("text", { x: -10, y: i * cell + cell / 2 + 4, "text-anchor": "end", "font-size": 10.5, fill: css("--text-dim"), "font-weight": 600 }, r));
        cols.forEach((c, j) => {
          const v = m[i][j];
          const t = maxV ? v / maxV : 0;
          const rect = el("rect", { x: j * cell + 1, y: i * cell + 1, width: cell - 2, height: cell - 2, rx: 4, fill: css("--accent"), opacity: 0.08 + 0.72 * Math.pow(t, 0.8) });
          rect.addEventListener("mouseenter", (e) => showTip(tipRows(r + " → " + c, [["samples", String(v)], ["share of row", pct(v / Math.max(1, m[i].reduce((a, b) => a + b, 0)), 1)]]), e));
          rect.addEventListener("mousemove", (e) => showTip(tipRows(r + " → " + c, [["samples", String(v)], ["share of row", pct(v / Math.max(1, m[i].reduce((a, b) => a + b, 0)), 1)]]), e));
          rect.addEventListener("mouseleave", hideTip);
          g.appendChild(rect);
          g.appendChild(el("text", { x: j * cell + cell / 2, y: i * cell + cell / 2 + 3.5, "text-anchor": "middle", "font-size": 10.5, "font-weight": 600, fill: t > 0.55 ? "#06231f" : css("--text") }, String(v)));
        });
      });
      cols.forEach((c, j) => g.appendChild(el("text", { x: j * cell + cell / 2, y: rows.length * cell + 14, "text-anchor": "middle", "font-size": 9.5, fill: css("--text-faint") }, c)));
    });
  }

  /* ---------- segmented bar (error budget) ---------- */
  function segmented(host, cfg) {
    mount(host, (h, W) => {
      // wrap the caption across lines that fit the width
      let capLines = [];
      if (cfg.footer) {
        const words = cfg.footer.split(" ");
        let line = "";
        const maxChars = Math.max(30, Math.floor(W / 5.6));
        words.forEach((w) => {
          const test = line ? line + " " + w : w;
          if (test.length > maxChars) { capLines.push(line); line = w; } else { line = test; }
        });
        if (line) capLines.push(line);
        capLines = capLines.slice(0, 3);
      }
      const barY = 26, barH = 34;
      const H = cfg.height || (barY + barH + 26 + capLines.length * 15);
      const svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H });
      h.appendChild(svg);
      const total = cfg.parts.reduce((a, p) => a + p.v, 0) || 1;
      const gap = 3;
      let x = 0;
      const avail = W - gap * (cfg.parts.length - 1);
      cfg.parts.forEach((p) => {
        const w = (p.v / total) * avail;
        const rect = el("rect", { x: x, y: barY, width: Math.max(2, w), height: barH, rx: 6, fill: p.color });
        const tTitle = p.desc ? p.label + " — " + p.desc : p.label;
        rect.addEventListener("mouseenter", (e) => showTip(tipRows(tTitle, [["count", String(p.v)], ["share", pct(p.v / total, 1)]]), e));
        rect.addEventListener("mousemove", (e) => showTip(tipRows(tTitle, [["count", String(p.v)], ["share", pct(p.v / total, 1)]]), e));
        rect.addEventListener("mouseleave", hideTip);
        svg.appendChild(rect);
        if (w > 22) svg.appendChild(el("text", { x: x + Math.max(2, w) / 2, y: barY + barH / 2 + 4, "text-anchor": "middle", "font-size": 11.5, "font-weight": 700, fill: "#06231f" }, String(p.v)));
        if (w > 74) svg.appendChild(el("text", { x: x + Math.max(2, w) / 2, y: barY - 9, "text-anchor": "middle", "font-size": 10.5, fill: css("--text-dim"), "font-weight": 600 }, p.label));
        x += w + gap;
      });
      // wrap the caption across lines that fit the width
      capLines.forEach((ln, i) => {
        svg.appendChild(el("text", { x: 0, y: barY + barH + 20 + i * 15, "font-size": 11, fill: css("--text-faint") }, ln));
      });
    });
  }

  /* ---------- log-scale grouped bars (throughput) ---------- */
  function logBars(host, cfg) {
    mount(host, (h, W) => {
      const H = cfg.height || 260;
      const pad = { l: 58, r: 14, t: 12, b: 46 };
      const svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H });
      h.appendChild(svg);
      const { g, iw, ih } = frame(svg, W, H, pad);
      const cats = cfg.categories, series = cfg.series;
      const maxV = Math.max.apply(null, series.flatMap((s) => s.values.map((v) => v.v)));
      const lmin = Math.log10(cfg.min || 10), lmax = Math.log10(maxV * 1.35);
      const scale = (v) => ih - ((Math.log10(Math.max(v, 1)) - lmin) / (lmax - lmin)) * ih;
      [cfg.min || 10, 100, 1000, 10000, 100000].filter((t) => t <= maxV * 1.35).forEach((t) => {
        const y = scale(t);
        g.appendChild(el("line", { x1: 0, x2: iw, y1: y, y2: y, stroke: css("--border-soft"), "stroke-width": 1 }));
        g.appendChild(el("text", { x: -8, y: y + 3.5, "text-anchor": "end", "font-size": 10, fill: css("--text-faint"), "font-family": "var(--mono)" }, t >= 1000 ? (t / 1000) + "k" : t));
      });
      g.appendChild(el("line", { x1: 0, x2: 0, y1: 0, y2: ih, stroke: css("--border"), "stroke-width": 1 }));
      const bandW = iw / cats.length, groupW = bandW * 0.68, barW = groupW / series.length;
      const rotate = bandW < 96;
      const bottom = rotate ? Math.max(pad.b, 78) : pad.b;
      cats.forEach((cat, ci) => {
        const x0 = ci * bandW + (bandW - groupW) / 2;
        series.forEach((s, si) => {
          const d = s.values[ci];
          if (!d) return;
          const x = x0 + si * barW;
          const y = scale(d.v);
          const rect = el("rect", { x: x + 1, y: y, width: barW - 4, height: Math.max(2, ih - y), rx: 4, fill: d.color || s.color });
          rect.addEventListener("mouseenter", (e) => showTip(tipRows(cat.title || cat.label, d.rows || [["value", cfg.valueFmt ? cfg.valueFmt(d.v) : num(d.v)]]), e));
          rect.addEventListener("mousemove", (e) => showTip(tipRows(cat.title || cat.label, d.rows || [["value", cfg.valueFmt ? cfg.valueFmt(d.v) : num(d.v)]]), e));
          rect.addEventListener("mouseleave", hideTip);
          g.appendChild(rect);
          if (barW > 34) g.appendChild(el("text", { x: x + barW / 2 - 1, y: y - 5, "text-anchor": "middle", "font-size": 10, "font-weight": 650, fill: css("--text"), "font-family": "var(--mono)" }, cfg.valueFmt ? cfg.valueFmt(d.v) : num(d.v)));
        });
        const cx = ci * bandW + bandW / 2;
        if (rotate) {
          g.appendChild(el("text", { x: cx, y: ih + 12, "text-anchor": "end", "font-size": 10, fill: css("--text-dim"), "font-weight": 600, transform: "rotate(-38 " + cx + "," + (ih + 12) + ")" }, cat.label));
        } else {
          g.appendChild(el("text", { x: cx, y: ih + 16, "text-anchor": "middle", "font-size": 11, fill: css("--text-dim"), "font-weight": 600 }, cat.label));
          if (cat.sub) g.appendChild(el("text", { x: cx, y: ih + 30, "text-anchor": "middle", "font-size": 9.5, fill: css("--text-faint"), "font-family": "var(--mono)" }, cat.sub));
        }
      });
    });
  }

  /* ================================================================== *
   *  Report wiring
   * ================================================================== */
  function build() {
    const S = D.series;

    /* ---- KPI values ---- */
    document.querySelectorAll("[data-kpi]").forEach((node) => {
      const k = node.getAttribute("data-kpi");
      const spec = S.kpi[k];
      if (!spec) return;
      node.innerHTML =
        '<div class="label">' + spec.label + "</div>" +
        '<div class="value">' + spec.value + (spec.unit ? '<span class="unit">' + spec.unit + "</span>" : "") + "</div>" +
        (spec.delta ? '<div class="delta ' + (spec.deltaClass || "d-flat") + '">' + spec.delta + "</div>" : "") +
        '<div class="foot">' + spec.foot + "</div>";
    });

    /* ---- Chart 1: verification ---- */
    const vHost = document.getElementById("chart-verification");
    const vMetrics = {
      eer: { label: "EER (lower is better)", fmt: (v) => pct(v, 2), max: 0.25, axis: "EER" },
      auc: { label: "ROC AUC (higher is better)", fmt: (v) => num(v, 4), max: 1.0, axis: "ROC AUC" },
      far: { label: "Fixed FAR (lower is better)", fmt: (v) => pct(v, 2), max: 0.2, axis: "FAR" },
      frr: { label: "Fixed FRR (lower is better)", fmt: (v) => pct(v, 2), max: 0.5, axis: "FRR" }
    };
    function drawVerification(metric) {
      const m = vMetrics[metric];
      const cats = S.verification.map((r) => ({ label: r.short, sub: r.dataset, title: r.name }));
      const series = [{
        color: SERIES.accent,
        values: S.verification.map((r) => ({
          v: r[metric], color: r.color, rows: [
            [m.label.split(" (")[0], m.fmt(r[metric]), r.color],
            ["status", r.status, null],
            ["notes", r.note, null]
          ]
        }))
      }];
      groupedBars(vHost, {
        height: 330, categories: cats, series: series, max: m.max, bottomPad: 60,
        yFmt: (v) => (metric === "auc" ? num(v, 1) : pct(v, 0)),
        valueFmt: m.fmt, axisLabel: m.axis
      });
    }
    drawVerification("eer");
    const vSeg = document.getElementById("seg-verification");
    if (vSeg) vSeg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      vSeg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      drawVerification(b.getAttribute("data-metric"));
    });

    /* ---- Chart 2: training curves ---- */
    const cHost = document.getElementById("chart-curves");
    const cMetrics = {
      val_eer: { label: "validation EER", fmt: (v) => pct(v, 2), max: 0.32, min: 0 },
      val_roc_auc: { label: "validation ROC AUC", fmt: (v) => num(v, 3), max: 1.0, min: 0.7 },
      loss: { label: "training loss", fmt: (v) => num(v, 3), max: null, min: null }
    };
    function drawCurves(metric) {
      const m = cMetrics[metric];
      const series = S.curves.map((c) => ({
        name: c.name, color: c.color, mark: c.best_epoch, markLabel: "best e" + c.best_epoch,
        points: c.points.map((p) => ({ x: p.epoch, y: p[metric], rows: [["epoch", String(p.epoch)], [m.label, m.fmt(p[metric])]] }))
      }));
      lineChart(cHost, {
        height: 330, series: series, min: m.min, max: m.max, yFmt: (v) => (metric === "val_roc_auc" ? num(v, 2) : pct(v, 0)),
        xTicks: [1, 10, 20, 30, 40],
        refs: metric === "val_eer" ? S.curves.map((c) => ({ value: c.test_eer, label: c.short + " locked test EER " + pct(c.test_eer, 2), color: c.color })) : null
      });
    }
    drawCurves("val_eer");
    const cSeg = document.getElementById("seg-curves");
    if (cSeg) cSeg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      cSeg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      drawCurves(b.getAttribute("data-metric"));
    });

    /* ---- Chart 2b: validation candidate landscape ---- */
    const lHost = document.getElementById("chart-landscape");
    function drawLandscape(ds) {
      const rows = S.landscape[ds];
      hBars(lHost, {
        height: 420, left: 168, max: Math.max(0.16, Math.max.apply(null, rows.map((r) => r.eer)) * 1.15),
        xFmt: (v) => (v * 100).toFixed(0) + "%",
        categories: rows.map((r) => ({ label: r.label, sub: r.sub })),
        series: [{
          color: SERIES.accent,
          values: rows.map((r) => ({
            v: r.eer,
            color: r.winner ? SERIES.accent : (r.kind === "features" ? SERIES.explore : SERIES.base),
            rows: [["validation EER", pct(r.eer, 2), r.winner ? SERIES.accent : SERIES.base], ["family", r.kind], ["selected", r.winner ? "yes — locked for test" : "no"]]
          }))
        }],
        valueFmt: (v) => pct(v, 2)
      });
    }
    if (lHost) {
      drawLandscape("wisdm");
      const lSeg = document.getElementById("seg-landscape");
      if (lSeg) lSeg.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        lSeg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        drawLandscape(b.getAttribute("data-ds"));
      });
    }

    /* ---- Chart 3: activity classification ---- */
    const aHost = document.getElementById("chart-activity");
    const tracks = S.classification.tracks;
    hBars(aHost, {
      height: 300, left: 172, max: 1.0, xFmt: (v) => (v * 100).toFixed(0) + "%",
      categories: tracks.map((t) => ({ label: t.label, sub: t.sub })),
      series: [
        { color: SERIES.accent, values: tracks.map((t) => ({ v: t.new_acc, color: SERIES.accent, rows: [["validation-selected sweep", pct(t.new_acc, 2), SERIES.accent], ["selected epoch", "e" + t.new_epoch], ["train time", t.new_time + " s"], ["status", "current protocol"]] })) },
        { color: SERIES.base, values: tracks.map((t) => ({ v: t.hist_acc, color: SERIES.base, opacity: 0.75, rows: [["historical (train-loss selected)", pct(t.hist_acc, 2), SERIES.base], ["status", "different selection rule"]] })) }
      ],
      valueFmt: (v) => pct(v, 2),
      ref: S.classification.wiker_acc, refColor: SERIES.warn,
      refLabel: "best historical run 0.9369"
    });

    /* ---- Chart 4: confusion matrix ---- */
    const cm = S.classification.confusion;
    heatmap(document.getElementById("chart-confusion"), {
      matrix: cm.matrix, rowLabels: cm.rows, colLabels: cm.cols
    });

    /* ---- Chart 5a: cross-day progression ---- */
    const cdHost = document.getElementById("chart-crossday-progress");
    const methods = S.crossday.methods;
    hBars(cdHost, {
      height: 220, left: 180, max: 0.08, xFmt: (v) => (v * 100).toFixed(1) + "%",
      categories: methods.map((m) => ({ label: m.short, sub: m.name })),
      series: [{ color: SERIES.cross, values: methods.map((m) => ({ v: m.eer, color: m.color, rows: [["EER", pct(m.eer, 2), m.color], ["ROC AUC", num(m.auc, 4)], ["false accepts", m.fa + "/" + m.fa_n + " (" + pct(m.fa / m.fa_n, 1) + ")"], ["genuine rejections", m.fr + "/" + m.fr_n + " (" + pct(m.fr / m.fr_n, 1) + ")"]] })) }],
      valueFmt: (v) => pct(v, 1)
    });

    /* ---- Chart 5b: cross-day per user, before/after ---- */
    const uHost = document.getElementById("chart-crossday-users");
    const users = S.crossday.users;
    groupedBars(uHost, {
      height: 250, bottomPad: 50, max: 1.0, yFmt: (v) => pct(v, 0), valueFmt: (v) => pct(v, 0),
      categories: users.map((u) => ({ label: "user " + u.id, sub: u.genuine + " genuine claims" })),
      series: [
        { color: SERIES.base, values: users.map((u) => ({ v: u.old_frr, color: u.old_frr > 0.3 ? SERIES.bad : SERIES.base, opacity: 0.72, rows: [["old false rejects", u.old_fr + "/" + u.genuine], ["old FRR", pct(u.old_frr, 1)]] })) },
        { color: SERIES.cross, values: users.map((u) => ({ v: u.new_frr, color: u.new_frr > 0.3 ? SERIES.bad : SERIES.cross, rows: [["new false rejects", u.new_fr + "/" + u.genuine], ["new FRR", pct(u.new_frr, 1)]] })) }
      ]
    });

    /* ---- Chart 5c: cross-day error budget ---- */
    segmented(document.getElementById("chart-crossday-budget"), {
      parts: [
        { label: "false accepts", desc: "impostor accepted", v: S.crossday.fa, color: SERIES.warn },
        { label: "false rejects", desc: "genuine refused", v: S.crossday.fr, color: SERIES.bad }
      ],
      footer: "250 decisions: 50 genuine claims, 200 directed impostor claims. Decisions reuse people, templates and trials, so they are not independent observations."
    });

    /* ---- Chart 6: scaling study ---- */
    const sHost = document.getElementById("chart-scaling");
    const sc = S.scaling;
    groupedBars(sHost, {
      height: 320, bottomPad: 62,
      categories: sc.candidates.map((c) => ({ label: c.label, sub: c.sub })),
      series: [
        { color: SERIES.base, values: sc.har.map((v, i) => ({ v: v.eer, err: v.sd, color: SERIES.base, rows: [["HAR mean fold EER", pct(v.eer, 2), SERIES.base], ["fold SD", num(v.sd, 2) + " pp"], ["AUC", num(v.auc, 4)]] })) },
        { color: SERIES.explore, values: sc.wisdm.map((v) => ({ v: v.eer, err: v.sd, color: SERIES.explore, rows: [["WISDM mean fold EER", pct(v.eer, 2), SERIES.explore], ["fold SD", num(v.sd, 2) + " pp"], ["AUC", num(v.auc, 4)]] })) }
      ],
      max: 0.22, yFmt: (v) => pct(v, 0), valueFmt: (v) => pct(v, 2), axisLabel: "mean development-fold EER"
    });

    /* ---- Chart 6b: transfer invariance ---- */
    const tHost = document.getElementById("chart-transfer");
    if (tHost) {
      const tr = S.transfer;
      groupedBars(tHost, {
        height: 240, bottomPad: 50, max: 0.15, yFmt: (v) => pct(v, 0), valueFmt: (v) => pct(v, 2),
        categories: [
          { label: "axis-aligned", sub: "raw axes" },
          { label: "rotation-invariant", sub: "orientation-free" },
          { label: "fusion", sub: "axis + invariant" }
        ],
        series: [
          { color: SERIES.base, values: [
            { v: tr.har.axis, color: SERIES.base, rows: [["HAR axis EER", pct(tr.har.axis, 2), SERIES.base], ["WISDM axis EER", pct(tr.wisdm.axis, 2), SERIES.explore]] },
            { v: tr.har.invariant, color: SERIES.explore, rows: [["HAR invariant EER", pct(tr.har.invariant, 2), SERIES.explore], ["WISDM invariant EER", pct(tr.wisdm.invariant, 2), SERIES.explore]] },
            { v: tr.har.fusion, color: SERIES.warn, rows: [["HAR fusion EER", pct(tr.har.fusion, 2), SERIES.warn], ["WISDM fusion EER", pct(tr.wisdm.fusion, 2), SERIES.warn]] }
          ] },
          { color: SERIES.explore, values: [
            { v: tr.wisdm.axis, color: SERIES.base, rows: [["WISDM axis EER", pct(tr.wisdm.axis, 2), SERIES.explore]] },
            { v: tr.wisdm.invariant, color: SERIES.explore, rows: [["WISDM invariant EER", pct(tr.wisdm.invariant, 2), SERIES.explore]] },
            { v: tr.wisdm.fusion, color: SERIES.warn, rows: [["WISDM fusion EER", pct(tr.wisdm.fusion, 2), SERIES.warn]] }
          ] }
        ]
      });
    }

    /* ---- Chart 7: multisensor ---- */
    const msHost = document.getElementById("chart-multisensor");
    if (msHost) {
      const ms = S.multisensor.rows;
      hBars(msHost, {
        height: 240, left: 176, max: 0.13, xFmt: (v) => (v * 100).toFixed(1) + "%",
        categories: ms.map((r) => ({ label: r.label, sub: r.tag })),
        series: [{ color: SERIES.accent, values: ms.map((r) => ({ v: r.eer, color: r.winner ? SERIES.accent : (r.label === "accel axes" ? SERIES.base : SERIES.explore), rows: [["mean dev EER", pct(r.eer, 2), r.winner ? SERIES.accent : SERIES.base], ["role", r.winner ? "winner" : (r.label === "accel axes" ? "control" : "candidate")]] })) }],
        valueFmt: (v) => pct(v, 2)
      });
    }

    /* ---- Chart 7b: backend ---- */
    const beHost = document.getElementById("chart-backend");
    if (beHost) {
      const be = S.backend.rows;
      hBars(beHost, {
        height: 260, left: 176, max: 0.1, xFmt: (v) => (v * 100).toFixed(1) + "%",
        categories: be.map((r) => ({ label: r.label, sub: r.tag })),
        series: [{ color: SERIES.accent, values: be.map((r) => ({ v: r.eer, color: r.winner ? SERIES.accent : (r.label === "multisensor control" ? SERIES.explore : SERIES.base), rows: [["mean EER", pct(r.eer, 2), r.winner ? SERIES.accent : SERIES.base], ["role", r.winner ? "winner" : (r.tag || "candidate")]] })) }],
        valueFmt: (v) => pct(v, 2)
      });
    }

    /* ---- Chart 8: calibration ---- */
    const calHost = document.getElementById("chart-calibration");
    if (calHost) {
      const pols = S.calibration.policies;
      hBars(calHost, {
        height: 200, left: 140, max: 0.02, xFmt: (v) => (v * 100).toFixed(2) + "%",
        categories: pols.map((p) => ({ label: p.label, sub: p.splits + "/20 splits >2% FAR" })),
        series: [{ color: SERIES.accent, values: pols.map((p) => ({ v: p.far, color: p.winner ? SERIES.accent : SERIES.base, rows: [["mean FAR", pct(p.far, 3), p.winner ? SERIES.accent : SERIES.base], ["exact", p.far_exact], ["mean FRR", pct(p.frr, 2)], ["exact FRR", p.frr_exact], ["splits >2% FAR", p.splits + "/20"]] })) }],
        valueFmt: (v) => pct(v, 3),
        ref: 0.009166666666666667, refColor: SERIES.warn, refLabel: "prior policy A 0.917%"
      });
    }

    /* ---- Chart 9: runtime trade-off ---- */
    const rtHost = document.getElementById("chart-runtime");
    if (rtHost) {
      const rt = S.runtime;
      groupedBars(rtHost, {
        height: 210, bottomPad: 48, max: 15, showValues: true,
        categories: [{ label: "batch 1", sub: "single window" }, { label: "batch 32", sub: "amortised" }],
        series: [
          { color: SERIES.base, values: [
            { v: rt.baseline_b1, color: SERIES.base, rows: [["accel baseline", num(rt.baseline_b1, 3) + " ms", SERIES.base], ["batch 32", num(rt.baseline_b32, 3) + " ms"]] },
            { v: rt.baseline_b32, color: SERIES.base, rows: [["accel baseline", num(rt.baseline_b32, 3) + " ms", SERIES.base]] }
          ] },
          { color: SERIES.cross, values: [
            { v: rt.winner_b1, color: SERIES.cross, rows: [["multisensor winner", num(rt.winner_b1, 3) + " ms", SERIES.cross], ["slowdown", num(rt.slowdown_b1, 1) + "x"]] },
            { v: rt.winner_b32, color: SERIES.cross, rows: [["multisensor winner", num(rt.winner_b32, 3) + " ms", SERIES.cross]] }
          ] }
        ],
        yFmt: (v) => num(v, 1), valueFmt: (v) => num(v, 2) + " ms", axisLabel: "median batch latency (ms)"
      });
    }

    /* ---- Chart 7: performance ---- */
    const pHost = document.getElementById("chart-preproc");
    groupedBars(pHost, {
      height: 210, bottomPad: 48, max: 0.9, showValues: true,
      categories: [{ label: "pandas baseline", sub: "3 runs, median" }, { label: "vectorised rewrite", sub: "identical output" }],
      series: [{ color: SERIES.accent, values: [
        { v: S.perf.preproc.baseline_s, color: SERIES.base, rows: [["median seconds", num(S.perf.preproc.baseline_s, 4) + " s", SERIES.base], ["windows", "1,561"], ["outputs identical", "yes"]] },
        { v: S.perf.preproc.candidate_s, color: SERIES.good, rows: [["median seconds", num(S.perf.preproc.candidate_s, 4) + " s", SERIES.good], ["speed-up", "15.72x"], ["outputs identical", "yes"]] }
      ] }],
      yFmt: (v) => num(v, 2) + "s", valueFmt: (v) => num(v, 3) + " s", axisLabel: "seconds for 100k rows"
    });

    logBars(document.getElementById("chart-throughput"), {
      height: 250, min: 10,
      categories: [
        { label: "HAR training", sub: "triplets/s" }, { label: "HAR inference", sub: "windows/s" },
        { label: "WISDM training", sub: "triplets/s" }, { label: "WISDM inference", sub: "windows/s" }
      ],
      series: [
        { color: SERIES.base, values: S.perf.throughput.map((r) => ({ v: r.cpu, color: SERIES.base, rows: [["CPU", Math.round(r.cpu).toLocaleString() + " /s", SERIES.base], ["GPU", Math.round(r.gpu).toLocaleString() + " /s", SERIES.accent], ["speed-up", num(r.gpu / r.cpu, 1) + "x"]] })) },
        { color: SERIES.accent, values: S.perf.throughput.map((r) => ({ v: r.gpu, color: SERIES.accent, rows: [["GPU", Math.round(r.gpu).toLocaleString() + " /s", SERIES.accent], ["CPU", Math.round(r.cpu).toLocaleString() + " /s", SERIES.base], ["speed-up", num(r.gpu / r.cpu, 1) + "x"]] })) }
      ],
      valueFmt: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v))
    });

    groupedBars(document.getElementById("chart-latency"), {
      height: 250, bottomPad: 58, max: 5.2,
      categories: S.perf.latency.map((r) => ({ label: r.label, sub: r.params + " params" })),
      series: [
        { color: SERIES.base, values: S.perf.latency.map((r) => ({ v: r.cpu, color: SERIES.base, rows: [["CPU batch-1", num(r.cpu, 3) + " ms", SERIES.base], ["CUDA batch-1", num(r.cuda, 3) + " ms", SERIES.accent]] })) },
        { color: SERIES.accent, values: S.perf.latency.map((r) => ({ v: r.cuda, color: SERIES.accent, rows: [["CUDA batch-1", num(r.cuda, 3) + " ms", SERIES.accent], ["CPU batch-1", num(r.cpu, 3) + " ms", SERIES.base]] })) }
      ],
      yFmt: (v) => num(v, 1), valueFmt: (v) => num(v, 2) + " ms", axisLabel: "median batch-1 latency (ms)"
    });

    groupedBars(document.getElementById("chart-compression"), {
      height: 230, bottomPad: 50, max: 60,
      categories: S.perf.compression.map((r) => ({ label: r.label, sub: r.sub })),
      series: [{ color: SERIES.bad, values: S.perf.compression.map((r) => ({ v: r.delta, color: r.delta < -45 ? SERIES.good : SERIES.bad, rows: [["change", (r.delta > 0 ? "+" : "") + num(r.delta, 1) + "%", r.delta < -45 ? SERIES.good : SERIES.bad], ["before", r.before], ["after", r.after]] })) }],
      yFmt: (v) => v.toFixed(0) + "%", valueFmt: (v) => (v > 0 ? "+" : "") + num(v, 1) + "%", axisLabel: "change vs original (%)"
    });

    /* ---- nav scrollspy ---- */
    const links = Array.from(document.querySelectorAll("nav.sections a"));
    const secs = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id));
        }
      });
    }, { rootMargin: "-70px 0px -70% 0px" });
    secs.forEach((s) => io.observe(s));

    /* ---- theme ---- */
    const themeBtn = document.getElementById("theme-toggle");
    const stored = localStorage.getItem("gb-theme");
    if (stored) document.documentElement.dataset.theme = stored;
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) document.documentElement.dataset.theme = "light";
    const syncTheme = () => {
      const t = document.documentElement.dataset.theme === "light" ? "Light" : "Dark";
      if (themeBtn) themeBtn.innerHTML = '<span class="glyph">◐</span>' + t;
    };
    syncTheme();
    if (themeBtn) themeBtn.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("gb-theme", next);
      syncTheme();
      registry.forEach((i) => i.draw(i.host, i.host.clientWidth));
    });
    const printBtn = document.getElementById("print-btn");
    if (printBtn) printBtn.addEventListener("click", () => window.print());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
