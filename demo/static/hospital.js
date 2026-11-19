/* Hospital audit screens: applicability (UI-004), health information inventory (UI-005), data flow register (UI-006),
   Statement of Applicability (UI-011), control coverage, traceability and audit sampling. */
"use strict";
const needHospital = (root, title) => { const id = hospitalId(true); if (!id) put(root, pageHead(title), h("div", { class: "card" }, empty("No hospital yet", "Add a hospital under Administration, then come back.", can("org", 2) ? h("a", { class: "btn primary", href: "#/e/hospital" }, "Hospitals") : null))); return id; };
const refSort = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/* ── applicability assessment ── */
ROUTES.applicability = async (root, arg, q) => {
  const hid = needHospital(root, "Applicability assessment"); if (!hid) return;
  const d = await GET(`/api/applicability?hospital=${hid}`), w = can("compliance", 2), ap = can("compliance", 3);
  const fwSel = q.fw || "", show = d.rows.filter((r) => (!fwSel || r.framework === fwSel) && (!q.only || (q.only === "future" ? r.future_effective : q.only === "unapproved" ? r.approval !== "Approved" : r.applicability === q.only)));
  const go = (patch) => { const p = new URLSearchParams({ ...q, ...patch }); for (const [k, v] of [...p]) if (!v) p.delete(k); location.hash = `#/applicability?${p}`; };
  const save = async (r, vals) => { await PUT(`/api/e/assessment/${r.id}`, vals); toast("Saved"); render(); };
  const change = (r, value) => {
    const needWhy = value === "Not applicable", wasApproved = r.approval === "Approved";
    if (!needWhy && !wasApproved) return act(() => save(r, { applicability: value }))();
    const why = h("textarea", {}), re = h("textarea", {});
    why.value = r.rationale || "";
    modal(`${r.reference}: ${value.toLowerCase()}`, h("div", { class: "stack" },
      needWhy ? h("label", { class: "f" }, h("span", {}, "Justification. A requirement can only be marked not applicable with a documented reason."), why) : null,
      wasApproved ? h("label", { class: "f" }, h("span", {}, "This decision was approved. Why is it being reassessed? It will need approval again."), re) : null),
      [{ label: "Cancel", run: () => render() }, { label: "Save", cls: "primary", run: () => save(r, { applicability: value, ...(needWhy ? { applicability_rationale: why.value } : {}), ...(wasApproved ? { reassessment_reason: re.value } : {}) }) }], true);
  };
  const cell = (r) => (w ? h("select", { "aria-label": `Applicability of ${r.reference}`, onchange: (e) => change(r, e.target.value) }, ["Pending determination", "Applicable", "Not applicable"].map((o) => h("option", { selected: o === r.applicability }, o))) : chip(r.applicability));
  const decided = d.rows.filter((r) => r.approval !== "Approved" && r.applicability !== "Pending determination");
  put(root, pageHead("Applicability assessment", `${hospitalName(hid)}. Decide which requirements apply to this hospital. A not-applicable decision needs a justification, every decision needs approval, and requirements that are not yet in force are marked and scored separately.`,
      w ? h("button", { class: "btn", onclick: act(async () => { const r = await POST(`/api/applicability/${hid}/build`); toast(r.created ? `${r.created} requirement row(s) opened` : "The register already has every published requirement"); render(); }) }, "Build or refresh register") : null,
      ap && decided.length ? h("button", { class: "btn primary", onclick: () => confirmBox(`Approve ${decided.length} decision(s)?`, "You are approving every applicability decision that has been made and is not yet approved, including the justifications for not-applicable requirements. Review them in the table first.", "Approve all decided", async () => { for (const r of decided) await PUT(`/api/e/assessment/${r.id}`, { applicability_status: "Approved" }); toast(`${decided.length} decision(s) approved`); render(); }) }, `Approve all decided (${decided.length})`) : null),
    h("div", { class: "grid g3", style: "margin-bottom:14px" }, card("Decisions", segBar(d.summary, { Applicable: "good", "Not applicable": "", "Pending determination": "warn" })),
      card("Approval", stats([d.rows.length - d.unapproved, "Approved"], [d.unapproved, "Awaiting approval", "#/applicability?only=unapproved"])), card("Effective dates", stats([d.rows.length - d.future, "In force"], [d.future, "Future effective", "#/applicability?only=future"]),
        h("p", { class: "small muted", style: "margin:0" }, "A future-effective requirement can be assessed now, as readiness."))),
    h("div", { class: "row", style: "margin-bottom:12px" }, h("select", { style: "width:auto", "aria-label": "Framework", onchange: (e) => go({ fw: e.target.value }) }, h("option", { value: "" }, "All frameworks"), d.frameworks.map((f) => h("option", { selected: f === fwSel }, f))),
      h("select", { style: "width:auto", "aria-label": "Show", onchange: (e) => go({ only: e.target.value }) }, [["", "All decisions"], ["Applicable", "Applicable"], ["Not applicable", "Not applicable"], ["Pending determination", "Pending determination"], ["unapproved", "Awaiting approval"], ["future", "Future effective"]].map(([v, l]) => h("option", { value: v, selected: v === (q.only || "") }, l))),
      h("span", { class: "muted small" }, `${show.length} of ${d.rows.length} requirements`), h("span", { class: "grow" }), h("a", { class: "btn sm", href: `/api/reports/REP-01?fmt=xlsx&hospital=${hid}` }, "Export HIPAA applicability report")),
    d.rows.length ? h("div", { class: "table-wrap matrix" }, h("table", {}, h("thead", {}, h("tr", {}, ["Framework", "Reference", "Requirement", "Applicability", "Justification", "Takes effect", "Approval", "Assessment"].map((t) => h("th", {}, t)))),
      h("tbody", {}, show.map((r) => h("tr", { class: r.future_effective ? "future" : "" }, h("td", { class: "nowrap" }, r.framework), h("td", { class: "code" }, r.reference), h("td", { class: "wraptext" }, h("a", { href: `#/e/assessment/${r.id}` }, r.title), h("div", { class: "muted small" }, r.theme)),
        h("td", {}, cell(r)), h("td", { class: "wraptext small" }, r.rationale || ""), h("td", { class: "nowrap" }, r.future_effective ? [chip("Future effective"), h("div", { class: "muted small" }, fmt.date(r.effective_from))] : h("span", { class: "muted small" }, "In force")),
        h("td", { class: "nowrap" }, chip(r.approval), r.approved_by ? h("div", { class: "muted small" }, `${r.approved_by}, ${fmt.date(r.approved_on)}`) : ap && r.approval !== "Approved" && r.applicability !== "Pending determination" ? h("div", {}, h("button", { class: "btn sm", style: "margin-top:4px", onclick: act(() => save(r, { applicability_status: "Approved" })) }, "Approve")) : null),
        h("td", { class: "nowrap" }, chip(r.status))))))) : h("div", { class: "card" }, empty("No requirements in the register yet", "Build the register to open one row for every requirement in the published framework versions.")));
};

/* ── health information inventory ── */
ROUTES.inventory = async (root) => {
  const hid = hospitalId(), d = await GET("/api/inventory" + (hid ? `?hospital=${hid}` : ""));
  const tone = { "Protected health information": "crit", "Minors' records": "crit", "Biometric data": "bad", "Government identifier": "bad", "Financial data": "warn", "Demographic information": "good" };
  put(root, pageHead("Health information inventory", `${hospitalName(hid)}. What health information is held, about whom, where and with whom. It is built from the processing register, so it is always current.`,
      h("a", { class: "btn", href: `/api/reports/REP-02?fmt=xlsx${hid ? "&hospital=" + hid : ""}` }, "Export inventory"), can("privacy", 2) ? h("a", { class: "btn primary", href: "#/e/processing_activity" }, "Processing register") : null),
    h("div", { class: "grid g3", style: "margin-bottom:14px" }, card("Categories in use, by sensitivity", segBar(d.by_sensitivity, tone)), card("Coverage", stats([d.activities, "Processing activities"], [d.undocumented, "With no data category recorded"], [d.unused, "Categories not used"])),
      card("How to read this", h("p", { class: "small", style: "margin:0" }, "Each row is a category of health information. The activities, systems and vendors are the ones recorded against processing activities that use it. Add or correct them in the processing register."))),
    h("div", { class: "table-wrap matrix" }, h("table", {}, h("thead", {}, h("tr", {}, ["Data category", "Sensitivity", "Individuals", "Processing activities and basis for use", "Systems", "Vendors and business associates", "Retention", "Leaves the United States"].map((t) => h("th", {}, t)))),
      h("tbody", {}, d.categories.map((c) => h("tr", {}, h("td", {}, h("a", { href: `#/e/data_category/${c.id}` }, c.name)), h("td", {}, h("span", { class: "chip " + (tone[c.sensitivity] || "") }, c.sensitivity)), h("td", { class: "small" }, c.principals.join(", ")),
        h("td", { class: "wraptext small" }, c.activities.length ? c.activities.map((a) => h("div", {}, h("a", { href: `#/e/processing_activity/${a.id}` }, a.name), h("span", { class: "muted" }, ` · ${a.basis || "basis not recorded"}`))) : h("span", { class: "muted" }, "Not used by any processing activity")),
        h("td", { class: "wraptext small" }, c.systems.map((s) => h("div", {}, s))), h("td", { class: "wraptext small" }, c.vendors.map((s) => h("div", {}, s))), h("td", { class: "wraptext small" }, [...new Set(c.activities.map((a) => a.retention).filter(Boolean))].map((s) => h("div", {}, s))),
        h("td", {}, c.cross_border ? chip("Yes") : "")))))));
};

/* ── data flow register with a drawn map ── */
function flowMap(flows) {
  const COLS = ["Individual", "Department", "System", "Vendor"], LABEL = ["Individuals", "Departments", "Systems", "Vendors and authorities"], col = (t) => (t === "Authority" ? 3 : COLS.indexOf(t));
  const nodes = new Map(), key = (t, n) => `${col(t)}|${n}`;
  flows.forEach((f) => { [[f.from_type, f.from_name], [f.to_type, f.to_name]].forEach(([t, n]) => { if (!nodes.has(key(t, n))) nodes.set(key(t, n), { c: col(t), name: n, authority: t === "Authority" }); }); });
  const W = 1040, colW = 190, gapX = (W - 4 * colW) / 3, rowH = 46, top = 34, per = [0, 0, 0, 0];
  nodes.forEach((n) => { n.x = n.c * (colW + gapX); n.y = top + per[n.c]++ * rowH; });
  const H = top + Math.max(...per, 1) * rowH + 6, ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `Data flow map: ${flows.length} flows between ${nodes.size} points`);
  const add = (tag, a, text) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); if (text !== undefined) e.textContent = text; svg.append(e); return e; };
  LABEL.forEach((l, i) => add("text", { x: i * (colW + gapX), y: 14, class: "col" }, l));
  flows.forEach((f) => {
    const a = nodes.get(key(f.from_type, f.from_name)), b = nodes.get(key(f.to_type, f.to_name)), fwd = b.c > a.c, same = b.c === a.c;
    const x1 = fwd || same ? a.x + colW : a.x, x2 = fwd ? b.x : b.x + colW, y1 = a.y + 15, y2 = b.y + 15, bend = same ? 46 : Math.abs(x2 - x1) / 2;
    const path = add("path", { d: same ? `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 + bend} ${y2} ${x2} ${y2}` : `M${x1} ${y1} C${x1 + (fwd ? bend : -bend)} ${y1} ${x2 + (fwd ? -bend : bend)} ${y2} ${x2} ${y2}`, class: !f.encrypted_in_transit || f.cross_border ? "risk" : "",
      "data-tip": `${f.name}\n${f.from_name} → ${f.to_name}\n${f.transfer_method || "Method not recorded"}${f.encrypted_in_transit ? ", encrypted in transit" : ", NOT encrypted in transit"}${f.cross_border ? "\nLeaves the United States: " + (f.destination_country || "destination not recorded") : ""}` });
    path.style.cursor = "pointer"; path.addEventListener("click", () => (location.hash = `#/e/dataflow/${f.id}`));
  });
  nodes.forEach((n) => { add("rect", { x: n.x, y: n.y, width: colW, height: 30, rx: 5, class: "node" }); add("text", { x: n.x + 9, y: n.y + 19 }, n.name.length > 27 ? n.name.slice(0, 26) + "…" : n.name).setAttribute("data-tip", n.name + (n.authority ? " (authority)" : "")); });
  return h("div", { class: "dflow" }, svg, h("div", { class: "legend", style: "margin-top:8px" }, h("span", {}, h("i", { class: "sw", style: "background:#8fa0b3" }), "Encrypted, stays in the United States"), h("span", {}, h("i", { class: "sw t-crit" }), "Not encrypted in transit, or leaves the United States (dashed)"), h("span", { class: "muted" }, "Hover a line for detail; select it to open the record.")));
}
ROUTES.dataflows = async (root) => {
  const hid = needHospital(root, "Data flow register"); if (!hid) return;
  const d = await GET(`/api/e/dataflow?hospital=${hid}&size=500&sort=id`), flows = d.rows, w = can("privacy", 2);
  put(root, pageHead("Data flow register", `${hospitalName(hid)}. How health information moves between people, departments, systems, vendors and authorities.`,
      h("a", { class: "btn", href: `#/e/dataflow?hospital=${hid}` }, "Open as a list"), w ? h("button", { class: "btn primary", onclick: act(() => recordForm("dataflow", null, { hospital: hid }, () => render())) }, "New data flow") : null),
    flows.length ? [h("div", { class: "grid g4", style: "margin-bottom:14px" }, [[flows.length, "Data flows"], [flows.filter((f) => !f.encrypted_in_transit).length, "Not encrypted in transit"], [flows.filter((f) => f.cross_border).length, "Leaving the United States"], [flows.filter((f) => f.to_type === "Vendor").length, "To vendors"]].map(([v, l]) => h("div", { class: "card" }, stat(v, l)))),
      card("Data flow map", flowMap(flows)),
      h("div", { style: "margin-top:16px" }, simpleTable([{ label: "Ref", key: "code", cls: "code" }, { label: "Flow", render: (f) => h("a", { href: `#/e/dataflow/${f.id}` }, f.name) }, { label: "From", key: "from_name" }, { label: "To", key: "to_name" },
        { label: "Data", render: (f) => ((f._labels || {}).data_categories || []).map((x) => x.split(" · ")[1] || x).join(", "), cls: "wraptext small" }, { label: "Method", key: "transfer_method" }, { label: "Encrypted", render: (f) => (f.encrypted_in_transit ? "Yes" : chip("Not encrypted")) }, { label: "Leaves the United States", render: (f) => (f.cross_border ? chip("Yes") : "") }], flows))]
      : h("div", { class: "card" }, empty("No data flows recorded yet", "Record how data moves, starting from the processing activities.")));
};

/* ── Statement of Applicability ── */
ROUTES.soa = async (root, arg, q) => {
  const hid = needHospital(root, "Statement of Applicability"); if (!hid) return;
  const d = await GET(`/api/soa?hospital=${hid}`), w = can("security", 2), ap = can("security", 3), themes = [...new Set(d.rows.map((r) => r.theme))];
  const cls = (r) => (r.necessary === "No" ? "x" : r.necessary !== "Yes" ? "u" : { Implemented: "i", "Partially implemented": "p", Planned: "p" }[r.implementation_status] || "n");
  const save = async (r, vals) => { await PUT(`/api/e/soa_record/${r.id}`, vals); toast("Saved"); render(); };
  const decide = (r, value) => { if (value === "Not decided") return act(() => save(r, { necessary: value }))(); const t = h("textarea", {}); t.value = r.justification || "";
    modal(`${r.reference} ${r.title}`, h("label", { class: "f" }, h("span", {}, value === "Yes" ? "Why is this control necessary? For example, the risks it treats or the requirement it meets." : "Why is this control excluded?"), t), [{ label: "Cancel", run: () => render() }, { label: "Save", cls: "primary", run: () => save(r, { necessary: value, justification: t.value }) }], true); };
  const show = d.rows.filter((r) => (!q.theme || r.theme === q.theme) && (!q.only || (q.only === "changed" ? d.changed_since_approval.includes(r.reference) : r.necessary === q.only)));
  const go = (patch) => { const p = new URLSearchParams({ ...q, ...patch }); for (const [k, v] of [...p]) if (!v) p.delete(k); location.hash = `#/soa?${p}`; };
  put(root, pageHead("Statement of Applicability", `${hospitalName(hid)}. Every Annex A control of ISO/IEC 27001:2022 is listed with the decision to include or exclude it, the justification, and its implementation status, which is kept separately. Working version ${d.working_version}.`,
      w && d.accounted < d.annex_total ? h("button", { class: "btn primary", onclick: act(async () => { const r = await POST(`/api/soa/${hid}/import`); toast(`${r.created} Annex A control(s) added`); render(); }) }, `Import Annex A controls (${d.annex_total - d.accounted} missing)`) : null,
      h("a", { class: "btn", href: `/api/reports/REP-08?fmt=xlsx&hospital=${hid}` }, "Export"),
      ap ? h("button", { class: "btn" + (d.undecided || d.accounted < d.annex_total ? "" : " primary"), onclick: () => noteBox(`Approve as version ${d.working_version}`, "What changed in this version? (optional)", "Approve", async (note) => { const v = await POST(`/api/soa/${hid}/approve`, { note }); toast(`Statement of Applicability version ${v.version_number} approved`); render(); }) }, `Approve as version ${d.working_version}`) : null),
    d.rows.length ? [h("div", { class: "grid g3", style: "margin-bottom:14px" },
      card("Accounted for", stats([`${d.accounted}/${d.annex_total}`.length ? d.accounted : 0, `of ${d.annex_total} Annex A controls`], [d.included, "Included"], [d.excluded, "Excluded"], [d.undecided, "Not decided"]), d.undecided ? h("p", { class: "note", style: "margin:0" }, "Every control needs a decision before the statement can be approved.") : null),
      card("Implementation of included controls", segBar(d.implementation, { "Not started": "bad" })),
      card(["Approved versions", h("a", { href: `#/e/soa_version?hospital=${hid}` }, "All")], d.versions.length ? d.versions.slice(0, 3).map((v) => h("div", { class: "small", style: "margin-bottom:6px" }, h("a", { href: `#/e/soa_version/${v.id}` }, `Version ${v.number}`), ` · ${fmt.date(v.approved_on)}`, h("div", { class: "muted" }, v.summary))) : h("p", { class: "muted small", style: "margin:0" }, "No version has been approved yet."),
        d.changed_since_approval.length ? h("p", { class: "note", style: "margin:8px 0 0" }, `${d.changed_since_approval.length} control(s) changed since the last approved version. `, h("a", { href: "#/soa?only=changed" }, "Show")) : null)),
      card("All 93 controls at a glance", h("div", { class: "soa-grid" }, d.rows.map((r) => h("a", { class: cls(r), href: `#/e/soa_record/${r.id}`, "data-tip": `${r.reference} ${r.title}\n${r.necessary === "Yes" ? r.implementation_status : r.necessary === "No" ? "Excluded" : "Not decided"}` }, r.reference.replace("A.", "")))),
        h("div", { class: "legend", style: "margin-top:10px" }, [["#1f8a4c", "Implemented"], ["#d9940a", "Planned or partial"], ["#c2603c", "Included, not started"], ["#9aa5b1", "Excluded"]].map(([c, l]) => h("span", {}, h("i", { class: "sw", style: `background:${c}` }), l)), h("span", {}, h("i", { class: "sw", style: "background:#fff;border:1px dashed #b8c1cc" }), "Not decided"))),
      h("div", { class: "row", style: "margin:16px 0 12px" }, h("select", { style: "width:auto", "aria-label": "Theme", onchange: (e) => go({ theme: e.target.value }) }, h("option", { value: "" }, "All themes"), themes.map((t) => h("option", { selected: t === q.theme }, t))),
        h("select", { style: "width:auto", "aria-label": "Show", onchange: (e) => go({ only: e.target.value }) }, [["", "All controls"], ["Yes", "Included"], ["No", "Excluded"], ["Not decided", "Not decided"], ["changed", "Changed since approval"]].map(([v, l]) => h("option", { value: v, selected: v === (q.only || "") }, l))), h("span", { class: "muted small" }, `${show.length} control(s)`)),
      h("div", { class: "table-wrap matrix" }, h("table", {}, h("thead", {}, h("tr", {}, ["Control", "Title", "Necessary", "Justification", "Implementation status", "Linked", "Owner"].map((t) => h("th", {}, t)))),
        h("tbody", {}, show.map((r) => h("tr", {}, h("td", { class: "code" }, r.reference), h("td", { class: "wraptext" }, h("a", { href: `#/e/soa_record/${r.id}` }, r.title), h("div", { class: "muted small" }, r.theme)),
          h("td", {}, w ? h("select", { "aria-label": `Is ${r.reference} necessary`, onchange: (e) => decide(r, e.target.value) }, ["Not decided", "Yes", "No"].map((o) => h("option", { selected: o === (r.necessary || "Not decided") }, o))) : chip(r.necessary)),
          h("td", { class: "wraptext small" }, r.justification || ""),
          h("td", {}, r.necessary === "Yes" && w ? h("select", { "aria-label": `Implementation status of ${r.reference}`, onchange: act((e) => save(r, { implementation_status: e.target.value })) }, ["Not started", "Planned", "Partially implemented", "Implemented"].map((o) => h("option", { selected: o === r.implementation_status }, o))) : chip(r.implementation_status)),
          h("td", { class: "small nowrap" }, [r.risks ? `${r.risks} risk(s)` : null, r.controls ? `${r.controls} control(s)` : null, r.evidence ? `${r.evidence} evidence` : null].filter(Boolean).join(", ")), h("td", { class: "small" }, r.owner || ""))))))]
      : h("div", { class: "card" }, empty("The statement is empty", "Import the Annex A controls to start. Each one then needs a decision and a justification.")));
};

/* ── control coverage ── */
ROUTES.coverage = async (root) => {
  const d = await GET("/api/coverage");
  put(root, pageHead("Control coverage", "How far the control register covers each framework. One control can be mapped to many requirements, so the same control and its evidence serve the HIPAA and ISO audits together.",
      h("a", { class: "btn", href: "#/e/control_mapping?review_status=Pending review" }, "Mappings to review")),
    h("div", { class: "grid g4", style: "margin-bottom:14px" }, [[d.controls, "Active controls"], [d.shared, "Serving both HIPAA and ISO"], [d.mappings, "Requirement-to-control mappings"], [d.unmapped_controls, "Controls mapped to nothing"]].map(([v, l]) => h("div", { class: "card" }, stat(v, l)))),
    h("div", { class: "stack" }, d.frameworks.map((f) => card([f.framework, h("span", { class: "muted small" }, `${f.mapped} of ${f.requirements} requirements have a control (${fmt.pct(f.percent)}); ${f.approved} with an approved mapping`)],
      h("div", { class: "meter", style: "margin-bottom:12px" }, h("i", { style: `width:${f.percent || 0}%` })),
      f.unmapped.length ? h("details", { open: f.unmapped.length <= 12 }, h("summary", { style: "cursor:pointer" }, `${f.requirements - f.mapped} requirement(s) with no control`), h("div", { style: "margin-top:8px;columns:2 320px" }, f.unmapped.map((r) => h("div", { class: "small", style: "margin-bottom:4px;break-inside:avoid" }, h("a", { href: `#/e/requirement/${r.id}` }, `${r.reference} ${r.title}`)))))
        : h("p", { class: "muted small", style: "margin:0" }, "Every requirement has at least one control mapped.")))));
};

/* ── traceability: requirement > control > evidence > audit test > finding > CAPA ── */
ROUTES.trace = async (root, id) => {
  const hid = hospitalId(true);
  if (!id) {
    const d = await GET("/api/trace" + (hid ? `?hospital=${hid}` : ""));
    return put(root, pageHead("Traceability", `${hospitalName(hid)}. Choose a requirement to see its control, evidence, audit tests, findings and corrective actions.`),
      d.items.length ? simpleTable([{ label: "Ref", key: "code", cls: "code" }, { label: "Framework", key: "framework" }, { label: "Requirement", render: (a) => h("a", { href: `#/trace/${a.id}` }, a.title) }, { label: "Status", render: (a) => chip(a.bucket) }], d.items, (a) => (location.hash = `#/trace/${a.id}`))
        : h("div", { class: "card" }, empty("Nothing to trace yet", "Build the compliance register first, from Applicability assessment.")));
  }
  const d = await GET(`/api/trace?assessment=${id}`);
  put(root, h("div", { class: "crumb" }, h("a", { href: "#/trace" }, "Traceability"), " / ", d.assessment.code),
    pageHead(d.assessment.title, "Each column is one step from the requirement to its corrective action. A dashed column has nothing recorded yet.", h("a", { class: "btn", href: `#/e/assessment/${d.assessment.id}` }, "Open the assessment")),
    h("div", { class: "wtrace" }, d.stages.map((s) => h("div", { class: "st" + (s.items.length ? "" : " gap") }, h("h3", {}, `${s.stage} (${s.items.length})`), s.items.length ? s.items.map((i) => h("div", { class: "it" }, h("a", { href: `#/e/${i.entity}/${i.id}` }, i.code), " ", i.status ? chip(i.status) : null, h("div", {}, i.label)))
      : h("div", { class: "muted small" }, ["Finding", "CAPA"].includes(s.stage) ? "None raised." : "Nothing recorded yet.")))));
};

/* ── audit sampling ── */
ROUTES.sampling = async (root) => {
  const list = await GET("/api/e/audit_sample?size=30"), audits = await options("audit"), tests = can("audit", 1) ? await options("audit_test").catch(() => []) : [], out = h("div", {});
  const pops = ["evidence", "authorization_record", "rights_request", "info_asset", "processing_activity", "vendor", "incident", "user", "training_assignment", "finding", "capa", "risk"].filter((k) => ent(k) && can(ent(k).module, 1));
  const f = { ent: h("select", {}, pops.map((k) => h("option", { value: k }, ent(k).plural))), method: h("select", {}, ["Random", "Stratified", "Monetary unit"].map((m) => h("option", {}, m))), field: h("select", {}),
    size: h("input", { type: "number", min: 1, placeholder: "Suggested automatically" }), conf: h("input", { type: "number", value: 95, min: 50, max: 99 }), tol: h("input", { type: "number", value: 5, min: 1, max: 50 }),
    seed: h("input", { type: "number", placeholder: "Chosen for you and recorded" }), audit: h("select", {}, h("option", { value: "" }, ""), audits.map((a) => h("option", { value: a.id }, a.label))), why: h("input", { type: "text", placeholder: "What is being tested" }) };
  const fieldWrap = h("label", { class: "f" }, h("span", {}, "Field"), f.field), hint = h("p", { class: "small muted", style: "margin:8px 0 0" });
  const sync = async () => {
    const e = ent(f.ent.value), m = f.method.value;
    fieldWrap.hidden = m === "Random";
    fieldWrap.firstChild.textContent = m === "Stratified" ? "Stratify by (each group is sampled in proportion)" : "Amount field (larger amounts are more likely to be selected)";
    put(f.field, e.fields.filter((x) => !x.hidden && (m === "Stratified" ? x.type === "enum" : ["float", "int"].includes(x.type))).map((x) => h("option", { value: x.name }, x.label)));
    const total = (await GET(`/api/e/${f.ent.value}?size=1`)).total;
    const s = total ? (await GET(`/api/sampling/size?population=${total}&confidence=${f.conf.value || 95}&tolerable=${f.tol.value || 5}`)).size : 0;
    hint.textContent = `${fmt.num(total)} ${e.plural.toLowerCase()} in the population. For ${f.conf.value}% confidence that the true rate of exceptions is no more than ${f.tol.value}%, when none is expected, test ${s}.`;
  };
  [f.ent, f.method, f.conf, f.tol].forEach((x) => x.addEventListener("change", () => sync().catch(() => {})));
  const show = (s) => put(out, card([s.title, h("a", { href: `#/e/audit_sample/${s.id}` }, s.code)],
    h("div", { class: "row", style: "gap:30px;margin-bottom:12px" }, stat(s.sample_size, "Selected"), stat(s.population_count, "In the population"), h("div", { class: "stat" }, h("b", {}, String(s.seed)), h("span", {}, "Seed (re-creates this sample)"))),
    (s.breakdown || []).length ? h("div", { style: "max-width:560px;margin-bottom:12px" }, h("h3", { style: "margin-bottom:6px" }, s.method === "Monetary unit" ? "Value covered" : `By ${s.strata_field.replace(/_/g, " ")}: population and sample`),
      h("div", { class: "pair-bars" }, s.breakdown.map((b) => { const mx = Math.max(...s.breakdown.map((z) => z.population), 1); return [h("span", {}, b.label), h("div", {}, h("i", { class: "bar t-info", style: `width:${(100 * b.population) / mx}%`, "data-tip": `Population: ${fmt.num(b.population)}` }), h("i", { class: "bar t-s2", style: `width:${(100 * b.sampled) / mx}%`, "data-tip": `Sampled: ${fmt.num(b.sampled)}` })), h("span", { class: "v" }, `${fmt.num(b.sampled)} of ${fmt.num(b.population)}`)]; })),
      h("div", { class: "legend" }, h("span", {}, h("i", { class: "sw t-info" }), "Population"), h("span", {}, h("i", { class: "sw t-s2" }), "Sample"))) : null,
    simpleTable([{ label: "Ref", key: "code", cls: "code" }, { label: "Record", render: (i) => h("a", { href: `#/e/${s.population_entity}/${i.id}` }, i.label || i.code) }], s.selected),
    can("audit", 2) ? (() => { const t = h("select", { style: "width:auto;max-width:420px" }, h("option", { value: "" }, "Choose the audit test this sample was drawn for"), tests.map((x) => h("option", { value: x.id }, x.label)));
      return h("div", { class: "row", style: "margin-top:12px" }, t, h("button", { class: "btn", onclick: act(async () => { if (!t.value) return toast("Choose an audit test first.", true); await POST(`/api/sampling/${s.id}/attach/${t.value}`); toast("Sample recorded on the audit test"); }) }, "Record on the audit test")); })() : null));
  put(root, pageHead("Audit sampling", "Select records to test without bias, and keep a record of how they were chosen. The same seed and population always give the same sample, so a reviewer can re-create it."),
    can("audit", 2) ? card("Draw a sample", h("div", { class: "form-grid" }, h("label", { class: "f" }, h("span", {}, "Population (the register to sample from)"), f.ent), h("label", { class: "f" }, h("span", {}, "Method"), f.method), fieldWrap,
      h("label", { class: "f" }, h("span", {}, "Confidence (%)"), f.conf), h("label", { class: "f" }, h("span", {}, "Tolerable rate of exceptions (%)"), f.tol), h("label", { class: "f" }, h("span", {}, "Sample size (leave empty to use the suggestion)"), f.size),
      h("label", { class: "f" }, h("span", {}, "Seed (leave empty for a new sample)"), f.seed), h("label", { class: "f" }, h("span", {}, "Audit (optional)"), f.audit), h("label", { class: "f wide" }, h("span", {}, "Purpose"), f.why)), hint,
      h("button", { class: "btn primary", style: "margin-top:12px", onclick: act(async () => { const m = f.method.value;
        show(await POST("/api/sampling", { population_entity: f.ent.value, method: m, strata_field: m === "Stratified" ? f.field.value : null, amount_field: m === "Monetary unit" ? f.field.value : null, sample_size: f.size.value || null,
          confidence: f.conf.value, tolerable_rate: f.tol.value, seed: f.seed.value || null, audit: f.audit.value ? Number(f.audit.value) : null, rationale: f.why.value })); annotate(out); }) }, "Draw sample")) : null,
    h("div", { style: "margin-top:16px" }, out),
    h("h2", { class: "section" }, "Samples drawn"),
    list.rows.length ? simpleTable([{ label: "Ref", key: "code", cls: "code" }, { label: "Sample", render: (s) => h("a", { href: "#", onclick: (e) => { e.preventDefault(); show(s); out.scrollIntoView({ behavior: "smooth" }); } }, s.title) }, { label: "Method", key: "method" },
      { label: "Selected", render: (s) => `${s.sample_size} of ${s.population_count}`, num: true }, { label: "Seed", key: "seed", num: true }, { label: "Drawn by", render: (s) => (s._labels || {}).drawn_by || "" }, { label: "When", render: (s) => fmt.dt(s.drawn_at) }], list.rows)
      : h("div", { class: "card" }, empty("No samples yet", "Draw the first one above.")));
  if (can("audit", 2)) sync().catch(() => {});
};
