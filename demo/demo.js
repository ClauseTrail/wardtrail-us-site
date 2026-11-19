/* Read-only demo: serves the platform's API from a snapshot (data.json) so the real interface runs on a static site.
   Nothing here is used by the installed product. */
"use strict";
(() => {
  const real = window.fetch.bind(window);
  const ready = real("data.json").then((r) => r.json());
  const json = (data, status) => new Response(JSON.stringify(data), { status: status || 200, headers: { "content-type": "application/json" } });
  const READ_ONLY = "This is a read-only demo with fictional data. Install WardTrail to add or change records: see How to install at the bottom left.";

  function query(D, entity, q) {
    const e = D.meta.entities[entity];
    let rows = D.records[entity] || [];
    const field = (n) => e.fields.find((f) => f.name === n);
    for (const [key, val] of q) {
      if (["q", "sort", "page", "size"].includes(key)) continue;
      const [name, op] = key.split("__"), f = field(name);
      if (!f && !["id", "code"].includes(name)) continue;
      const same = (a) => (f && f.type === "bool" ? !!a === ["1", "true", "yes"].includes(val.toLowerCase()) : String(a === null || a === undefined ? "" : a) === val);
      rows = rows.filter((r) => {
        const v = r[name];
        if (f && f.type === "refs") return (v || []).map(String).includes(val);
        if (!op) return same(v);
        if (op === "ne") return !same(v);
        if (op === "in") return val.split(",").includes(String(v));
        if (op === "lt") return v !== null && v !== undefined && String(v) < val;
        if (op === "gt") return v !== null && v !== undefined && String(v) > val;
        if (op === "empty") return v === null || v === undefined || v === "";
        return true;
      });
    }
    const text = (q.get("q") || "").toLowerCase();
    if (text) rows = rows.filter((r) => (r.code || "").toLowerCase().includes(text) || e.fields.some((f) => ["text", "long", "enum"].includes(f.type) && !f.pii && String(r[f.name] || "").toLowerCase().includes(text)));
    const sort = q.get("sort") || "-id", desc = sort.startsWith("-"), col = sort.replace(/^-/, "");
    rows = [...rows].sort((a, b) => { const x = a[col], y = b[col]; const c = x === y ? 0 : x === null || x === undefined ? -1 : y === null || y === undefined ? 1 : x < y ? -1 : 1; return desc ? -c : c; });
    const size = Number(q.get("size") || 50), page = Math.max(1, Number(q.get("page") || 1));
    return { total: rows.length, page, size, rows: size ? rows.slice((page - 1) * size, page * size) : rows };
  }

  // Mirrors app/insights.py summary(): counts by status-like fields and records added per month.
  function summary(D, entity, q) {
    const e = D.meta.entities[entity], qq = new URLSearchParams(q); qq.set("size", "0");
    const rows = query(D, entity, qq).rows, hint = ["status", "severity", "rating", "result", "type", "category", "priority"];
    let picks = e.fields.filter((f) => f.type === "enum" && (e.list_fields.includes(f.name) || hint.some((k) => f.name.includes(k))));
    picks = picks.concat(e.fields.filter((f) => ["residual_rating", "risk_rating"].includes(f.name) && !picks.includes(f)));
    const groups = [];
    for (const f of picks.slice(0, 4)) {
      const counts = {};
      rows.forEach((r) => { const k = r[f.name] || "Not set"; counts[k] = (counts[k] || 0) + 1; });
      const order = (f.options || []).concat(["Critical", "High", "Medium", "Low", "Not set"]);
      const pos = (k) => (order.includes(k) ? order.indexOf(k) : 99);
      const items = Object.entries(counts).sort((a, b) => pos(a[0]) - pos(b[0]) || b[1] - a[1]).map(([label, value]) => ({ label, value }));
      if (items.length > 1) groups.push({ field: f.name, label: f.label, items });
    }
    const months = D.snap["/api/trends"].months, added = months.map((mo) => rows.filter((r) => String(r.created_at || "").slice(0, 7) === mo).length);
    return { total: rows.length, groups: groups.slice(0, 3), months, added };
  }

  async function handle(method, url, body) {
    const D = await ready, u = new URL(url, location.origin), p = u.pathname, q = u.searchParams, full = p + u.search;
    if (method === "POST" && p === "/api/auth/login") return json({ ok: true });
    if (method === "POST" && p === "/api/auth/logout") return json({ ok: true });
    if (method === "POST" && p.startsWith("/api/auth/mfa")) return json({ error: "Two-step sign-in can be set up in the installed product. This demo is read-only." }, 403);
    if (method === "POST" && p === "/api/notifications/read") return json({ marked: 0 });
    if (method === "POST" && p === "/api/ai/search") return json({ answer: "This demo has no server, so library search is switched off here. In the installed product it answers from your own framework library and shows its sources.", sources: [], mode: "rules" });
    if (method === "POST" && p.startsWith("/api/ai/run/")) return json({ error: "The assistant runs in the installed product. In this demo, open AI review records to see recommendations it has already produced." }, 403);
    if (method !== "GET") return json({ error: READ_ONLY }, 403);
    if (p === "/api/sampling/size") { const n = Number(q.get("population")), raw = Math.log(1 - Number(q.get("confidence") || 95) / 100) / Math.log(1 - Number(q.get("tolerable") || 5) / 100); return json({ size: n ? Math.min(n, Math.ceil(raw / (1 + (raw - 1) / n))) : 0 }); }
    if (D.snap[full] !== undefined) return json(D.snap[full]);
    if (p === "/api/audit-trail") { const t = (q.get("q") || "").toLowerCase(), rows = D.snap["/api/audit-trail"].rows.filter((r) => !t || `${r.summary} ${r.user_name}`.toLowerCase().includes(t)); return json({ total: rows.length, rows }); }
    if (D.snap[p] !== undefined && !["/api/trace", "/api/soa", "/api/applicability"].includes(p)) return json(D.snap[p]);
    let m;
    if ((m = p.match(/^\/api\/evidence\/(\d+)\/access$/))) return json([]);
    if ((m = p.match(/^\/api\/e\/(\w+)\/summary$/)) && D.meta.entities[m[1]]) return json(summary(D, m[1], q));
    if ((m = p.match(/^\/api\/e\/(\w+)\/options$/))) {
      const e = D.meta.entities[m[1]], rows = D.records[m[1]] || [];
      return json(m[1] === "user" ? rows.filter((r) => r.active).map((r) => ({ id: r.id, label: r.name, sub: r.role })) : rows.map((r) => ({ id: r.id, label: `${r.code} · ${r[e.label_field] || ""}` })).sort((a, b) => a.label.localeCompare(b.label)));
    }
    if ((m = p.match(/^\/api\/e\/(\w+)\/(\d+)\/history$/))) return json({ versions: [], activity: [{ action: "history", user_name: "the demo (change history is kept in the installed product)", ts: D.me.today, details: {} }] });
    if ((m = p.match(/^\/api\/e\/(\w+)\/(\d+)$/))) { const r = (D.records[m[1]] || []).find((x) => x.id === Number(m[2])); return r ? json(r) : json({ error: "Record not found." }, 404); }
    if ((m = p.match(/^\/api\/e\/(\w+)$/))) return D.meta.entities[m[1]] ? json(query(D, m[1], q)) : json({ error: "Unknown register." }, 404);
    return json({ error: "Not available in the demo." }, 404);
  }

  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    return url.startsWith("/api/") ? handle(((init && init.method) || "GET").toUpperCase(), url, init && init.body) : real(input, init);
  };
  // Server-side downloads (Excel, PDF, files) do not exist on a static site.
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href^="/api/"]');
    if (a) { ev.preventDefault(); ev.stopPropagation(); if (window.toast) toast("Downloads and exports are switched off in the demo. They work in the installed platform.", true); }
  }, true);
  window.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = 'Read-only demo with fictional data. <a href="../#install">How to install</a> · <a href="../">Back to the site</a>';
    document.body.append(bar);
  });
})();
