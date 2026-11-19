/* Screens: shell, dashboards, registers, and the administration pages. Hospital-specific screens are in hospital.js. */
"use strict";
const P = {};
const LIFECYCLE = ["Hospital onboarding", "Framework selection", "Applicability and data discovery", "Risk and control mapping", "Evidence and audit testing", "Findings and CAPA", "Management review"];
const FLOWS = { audit: ["Draft", "Planned", "Approved", "In Progress", "Evidence Review", "Audit Review", "Completed", "Closed"],
  capa: ["Open", "Containment", "Root Cause Analysis", "Action Planned", "Approved", "Implemented", "Verification", "Closed"],
  incident: ["Reported", "Classified", "Investigating", "Contained", "Impact Assessed", "Response Approved", "Resolved", "Closed"],
  framework_version: ["Draft", "In review", "Approved", "Published", "Superseded"], evidence: ["Requested", "Submitted", "Under review", "Accepted"] };
const LIST_NOTES = { assessment: ". One row per requirement. Only verified, applicable requirements count as compliant.", requirement: ". Starter content: plain-word summaries, to be validated by a qualified person.",
  evidence: ". Evidence counts only after a reviewer who did not submit it has accepted it.", ai_recommendation: ". Every AI output is a recommendation until a person reviews it.",
  authorization_record: ". Authorization history is append-only: a withdrawal is a new event.", audit_test: ". You see the working papers of audits you are assigned to." };
const CLS_TONE = { "Major nonconformity": "crit", "Minor nonconformity": "warn", Observation: "", "Opportunity for improvement": "good" };

/* ── shell ── */
function shell() {
  const cur = location.hash.split("?")[0];
  const openGroups = JSON.parse(sessionStorage.getItem("nav") || "{}");
  const side = h("nav", { class: "side", "aria-label": "Main" },
    h("div", { class: "brand" }, h("img", { src: "/static/favicon.svg", alt: "" }), h("div", {}, h("b", {}, "WardTrail"), h("span", {}, G.me.tenant.name))),
    G.me.menu.map((g) => {
      const active = g.items.some((i) => i.href.split("?")[0] === cur || cur.startsWith(i.href.split("?")[0] + "/"));
      const grp = h("div", { class: "nav-group" + (active || openGroups[g.label] ? " open" : "") },
        h("button", { "aria-expanded": active ? "true" : "false", onclick: () => { grp.classList.toggle("open"); openGroups[g.label] = grp.classList.contains("open"); sessionStorage.setItem("nav", JSON.stringify(openGroups)); } }, h("span", {}, g.label), h("span", { class: "chev" }, "›")),
        h("div", { class: "nav-items" }, g.items.map((i) => h("a", { href: i.href, class: location.hash === i.href || (cur === i.href.split("?")[0] && !location.hash.includes("?")) ? "on" : "" }, i.label))));
      return grp;
    }));
  const tenantSel = G.me.tenants.length > 1 ? h("select", { style: "width:auto", "aria-label": "Organization", onchange: act(async (e) => { await POST("/api/tenants/switch", { id: Number(e.target.value) }); G.optCache = {}; G.hospital = 0; await boot(); }) },
    G.me.tenants.map((t) => h("option", { value: t.id, selected: t.id === G.me.tenant.id }, t.name))) : null;
  const hs = G.me.hospitals || [];
  const hospSel = hs.length > 1 ? h("select", { class: "hosp", "aria-label": "Hospital", "data-tip": "Dashboards, registers and reports show the hospital chosen here.", onchange: (e) => { G.hospital = Number(e.target.value); try { localStorage.setItem("hospital", G.hospital); } catch (x) { /* storage unavailable */ } render(); } },
    h("option", { value: 0 }, "All hospitals"), hs.map((x) => h("option", { value: x.id, selected: x.id === hospitalId() }, x.name))) : h("span", { class: "org" }, hs.length ? hs[0].name : G.me.tenant.name);
  const top = h("header", { class: "top" },
    h("button", { class: "btn sm menu-btn", onclick: () => side.classList.toggle("show") }, "Menu"), tenantSel, hospSel,
    G.me.ai_mode === "rules" ? h("span", { class: "pill", "data-tip": "The AI audit assistant is running on built-in rules and nothing leaves this server. Add a model key in the .env file to enable language-model drafting." }, "AI: rules mode") : h("span", { class: "pill" }, "AI: " + G.me.ai_mode),
    h("span", { class: "grow" }),
    can("work", 1) ? h("a", { href: "#/approvals" }, "Approvals", G.me.pending_approvals ? h("span", { class: "count" }, G.me.pending_approvals) : null) : null,
    can("work", 1) ? h("a", { href: "#/e/notification" }, "Notifications", G.me.unread ? h("span", { class: "count" }, G.me.unread) : null) : null,
    h("span", { class: "muted small" }, `${G.me.user.name} · ${G.me.user.role}`),
    h("button", { class: "btn sm", onclick: () => P.account() }, "Account"),
    h("button", { class: "btn sm", onclick: act(async () => { await POST("/api/auth/logout"); G.me = null; showGate(); }) }, "Sign out"));
  const content = h("main", { class: "content", id: "content" });
  put(document.getElementById("app"), h("div", { class: "shell" }, side, h("div", { class: "main" }, top, content)));
  return content;
}

/* ── dashboards (UI-001 and FR-19) ── */
const DASH = [["executive", "Executive"], ["hipaa", "HIPAA"], ["iso", "ISO 27001"], ["controls", "Integrated controls"], ["operations", "Operations"]];
const dashTabs = (name) => h("div", { class: "tabs" }, DASH.map(([k, l]) => h("button", { class: k === name ? "on" : "", onclick: () => (location.hash = `#/dashboard/${k}`) }, l)));
const railOf = (stages) => h("div", { class: "rail" }, stages.map((s) => h("a", { href: s.link, class: s.count ? "" : "gap" }, h("b", {}, fmt.num(s.count)), h("span", {}, s.stage))));
const stats = (...items) => h("div", { class: "row", style: "gap:26px;margin-bottom:12px" }, items.filter(Boolean).map(([v, l, href]) => stat(v, l, href)));
const meterCell = (v, tip) => h("div", { class: "meter", style: "width:110px;display:inline-block;vertical-align:middle;margin-right:8px", "data-tip": tip || "" }, h("i", { style: `width:${v || 0}%` }));
const auditTable = (rows) => rows.length ? simpleTable([{ label: "Audit", render: (a) => h("div", {}, h("a", { href: `#/e/audit/${a.id}` }, a.title), h("div", { class: "muted small" }, `${a.number || a.code} · ${a.type}${a.planned_end ? " · planned end " + fmt.date(a.planned_end) : ""}`)), cls: "clip" },
  { label: "Stage", render: (a) => [chip(a.status), a.overdue ? [" ", chip("Overdue")] : null] }, { label: "Tests done", render: (a) => [meterCell(a.progress, `${a.tested} of ${a.tests} tests have a result`), `${a.tested}/${a.tests}`] },
  { label: "Reviewed", key: "reviewed", num: true }, { label: "Failed", key: "failed", num: true }], rows) : h("p", { class: "muted small" }, "No audit projects yet.");
const themeTable = (rows) => simpleTable([{ label: "Theme", key: "theme" }, { label: "Requirements", key: "total", num: true }, { label: "Compliant", key: "Compliant", num: true }, { label: "Partial", key: "Partially compliant", num: true },
  { label: "Non-compliant", key: "Non-compliant", num: true }, { label: "Not assessed", key: "Not assessed", num: true }, { label: "Not applicable", key: "Not applicable", num: true },
  { label: "", render: (r) => h("div", { style: "width:150px" }, h("div", { class: "seg", style: "height:10px" }, [["Compliant", "t-good"], ["Partially compliant", "t-warn"], ["Non-compliant", "t-bad"], ["Not assessed", "t-neutral"]].filter(([k]) => r[k]).map(([k, c]) => h("i", { class: c, style: `flex:${r[k]}`, "data-tip": `${k}: ${r[k]}` })))) }], rows);

P.dashboard = async (root, name) => {
  const hid = hospitalId(), d = await GET(`/api/dashboard/${name}${hid ? "?hospital=" + hid : ""}`), q = hid ? `?hospital=${hid}` : "";
  const title = { executive: "Executive dashboard", hipaa: "HIPAA compliance dashboard", iso: "ISO 27001 compliance dashboard", controls: "Integrated control dashboard", operations: "Operations dashboard" }[name];
  const out = [pageHead(title, `${hospitalName(hid)}. Hover 'How this is calculated' under any figure to see its scoring rule.`), dashTabs(name)];
  const sev = { Critical: "crit", High: "bad", Medium: "warn", Low: "good" };
  if (name === "executive") {
    out.push(railOf(d.lifecycle));
    if (d.scores[0].value === null && d.scores[1].denominator) out.push(h("div", { class: "note info", style: "margin-top:14px" }, "No HIPAA requirement has been assessed as in force yet. Progress towards them is shown as readiness and is kept apart from the in-force score."));
    out.push(h("div", { class: "grid g4", style: "margin-top:16px" }, d.scores.map(kpiTile), kpiTile(d.combined)));
    out.push(h("p", { class: "small muted", style: "margin:8px 0 0" }, "HIPAA and ISO 27001 are scored separately. The combined operational view is for day-to-day tracking only: it is not a legal compliance determination and not an ISO certification result."));
    out.push(h("div", { class: "grid g3", style: "margin-top:16px" },
      card(["HIPAA requirements", h("a", { href: "#/dashboard/hipaa" }, "HIPAA dashboard")], d.hipaa_status.length ? [h("h3", { style: "margin-bottom:6px" }, "In force"), segBar(d.hipaa_status, d.tones)] : null,
        d.hipaa_future.length ? [h("h3", { style: "margin:12px 0 6px" }, "Not yet in force (readiness)"), segBar(d.hipaa_future, d.tones)] : null, d.coverage[0].denominator ? h("p", { class: "small muted", style: "margin:10px 0 0" }, `${d.coverage[0].numerator} of ${d.coverage[0].denominator} applicable requirements have a recorded conclusion.`) : null),
      card(["ISO 27001 requirements", h("a", { href: "#/dashboard/iso" }, "ISO dashboard")], segBar(d.iso_status, d.tones), d.coverage[1].denominator ? h("p", { class: "small muted", style: "margin:10px 0 0" }, `${d.coverage[1].numerator} of ${d.coverage[1].denominator} applicable requirements have a recorded conclusion. Not assessed and not applicable requirements are outside the score.`) : null),
      card(["Outstanding risks", h("a", { href: "#/heatmap" }, "Heat map")], stats([d.risks.critical, "Critical", "#/e/risk?residual_rating=Critical"], [d.risks.high, "High", "#/e/risk?residual_rating=High"], [d.risks.above_threshold, "Above threshold", "#/e/risk?above_threshold=true"]),
        h("div", { class: "toplist" }, d.risks.top.slice(0, 4).map((r) => h("div", {}, h("a", { href: `#/e/risk/${r.id}` }, r.title), chip(r.rating), h("b", {}, r.score))))),
      h("div", { class: "span2" }, card(["Audit progress", h("a", { href: "#/e/audit" + q }, "All audits")], auditTable(d.audits))),
      card(["Findings by classification", h("a", { href: "#/e/finding?status__ne=Closed" }, "Open findings")], stats([d.findings.open, "Open"], [d.findings.overdue, "Overdue"], [d.findings.unowned, "No owner"]), segBar(d.findings.by_classification, CLS_TONE)),
      card(["CAPA aging", h("a", { href: "#/e/capa" }, "CAPA tracker")], stats([d.capa.open, "Open"], [d.capa.overdue, "Overdue"], [d.capa.awaiting_verification, "Awaiting verification", "#/e/capa?status=Verification"], [d.capa.reopened, "Reopened"]),
        segBar(d.capa.aging, { "Not yet due": "good", "1 to 30 days overdue": "warn", "31 to 60 days overdue": "bad", "More than 60 days overdue": "crit" })),
      card(["Rights requests and incidents"], stats([d.rights.open, "Open requests", "#/e/rights_request"], [d.rights.overdue, "Past resolution date"], [d.incidents.open, "Open incidents", "#/e/incident"], [d.incidents.awaiting_decision, "Awaiting notification decision"])),
      card(["Vendors and evidence"], stats([d.vendors.enhanced, "Vendors needing enhanced assessment", "#/e/vendor?enhanced_assessment_required=true"], [d.vendors.reassessment_overdue, "Reassessment overdue"], [d.evidence.awaiting_review, "Evidence awaiting review", "#/e/evidence?status=Submitted"], [d.evidence.expired, "Evidence past validity"])),
      d.hospitals.length > 1 ? h("div", { class: "span3" }, card("Hospitals in this organization", simpleTable([{ label: "Hospital", render: (x) => h("a", { href: "#", onclick: (e) => { e.preventDefault(); G.hospital = x.id; try { localStorage.setItem("hospital", x.id); } catch (z) { /* storage unavailable */ } render(); } }, x.name) }, { label: "City", key: "city" },
        { label: "HIPAA in force", render: (x) => fmt.pct(x.hipaa), num: true }, { label: "HIPAA readiness", render: (x) => [meterCell(x.readiness), fmt.pct(x.readiness)] }, { label: "ISO 27001", render: (x) => [meterCell(x.iso), fmt.pct(x.iso)] },
        { label: "Open findings", key: "open_findings", num: true }, { label: "CAPA overdue", key: "overdue_capa", num: true }], d.hospitals))) : null));
    out.push(trendsBlock());
  } else if (name === "hipaa") {
    out.push(h("div", { class: "grid g3" }, d.kpis.map(kpiTile)));
    if (d.upcoming.length) out.push(h("div", { class: "note", style: "margin-top:14px" }, d.upcoming.map((u) => `${u.count} ${u.framework} requirement(s) take effect on ${fmt.date(u.date)} (${u.days} days from today)`).join(". ") + ". They are assessed as readiness and shown separately until then. A date for the November 2026 Privacy Rule changes is a placeholder until the rule is published: check it under Framework library."));
    out.push(h("div", { class: "grid g3", style: "margin-top:16px" },
      h("div", { class: "span2" }, card(["Requirements by theme", h("a", { href: "#/applicability" }, "Applicability")], themeTable(d.themes))),
      h("div", { class: "stack" }, d.status.length ? card("In force", segBar(d.status, d.tones)) : null, card("Not yet in force (readiness)", segBar(d.future_status, d.tones))),
      card(["Processing activities", h("a", { href: "#/e/processing_activity" + q }, "Register")], stats([d.processing.total, "Activities"], [d.processing.no_notice, "Active with no notice"], [d.processing.cross_border, "Leaving the United States"], [d.processing.children, "Involving children"]),
        h("h3", { style: "margin-bottom:6px" }, "By basis for use"), barList(d.processing.by_basis, (i) => `#/e/processing_activity?lawful_basis=${encodeURIComponent(i.label)}`)),
      card(["Privacy notices and authorization", h("a", { href: "#/e/privacy_notice" + q }, "Notices")], h("h3", { style: "margin-bottom:6px" }, "Notice review outcome"), segBar(d.notices, { Adequate: "good", "Gaps found": "bad", "Not reviewed": "" }),
        h("h3", { style: "margin:12px 0 6px" }, "Authorization events"), segBar(d.authorization.events, { "Authorization signed": "good", "Authorization revoked": "warn", "Authorization renewed": "good" }),
        d.authorization.pending_withdrawals ? h("p", { class: "note", style: "margin:10px 0 0" }, `${d.authorization.pending_withdrawals} withdrawal(s) waiting to be acted on. `, h("a", { href: "#/e/authorization_record?withdrawal_action_status=Pending action" }, "Open")) : null),
      card(["Rights requests and complaints", h("a", { href: "#/e/rights_request" + q }, "Register")], stats([d.rights.open, "Open"], [d.rights.overdue, "Past resolution date"]), h("div", { style: "margin-bottom:10px" }, h("b", {}, fmt.pct(d.rights.on_time.value)), h("span", { class: "muted small" }, " closed within the resolution date")),
        segBar(d.rights.by_status), h("h3", { style: "margin:12px 0 6px" }, "By category"), barList(d.rights.by_category)),
      card(["Breach of unsecured PHIes", h("a", { href: "#/e/incident?personal_data_involved=true" }, "Incidents")], stats([d.incidents.breaches, "Involving health information"], [d.incidents.awaiting_decision, "Awaiting notification decision"]), segBar(d.incidents.by_status),
        h("p", { class: "small muted", style: "margin:10px 0 0" }, "A notification decision is made and approved by an authorized person. The system never notifies anyone outside the hospital.")),
      card(["Business associates", h("a", { href: "#/e/vendor?is_business_associate=true" }, "Vendor register")], stats([d.vendors.associates, "Business associates"], [d.vendors.enhanced, "Enhanced assessment"], [d.vendors.never_assessed, "Never assessed"]), segBar(d.vendors.by_rating, { ...sev, "Not assessed": "" }))));
  } else if (name === "iso") {
    out.push(h("div", { class: "grid g4" }, d.kpis.map(kpiTile)));
    out.push(h("div", { class: "grid g3", style: "margin-top:16px" },
      h("div", { class: "span2" }, card(["Clauses and Annex A controls by theme", h("a", { href: "#/e/assessment?current=true" }, "Compliance register")], themeTable(d.themes))),
      h("div", { class: "stack" }, card("Requirement status", segBar(d.status, d.tones)), card(["Statement of Applicability", h("a", { href: "#/soa" }, "Open")], h("h3", { style: "margin-bottom:6px" }, "Implementation of included controls"), segBar(d.soa.implementation, { "Not started": "bad" }),
        h("p", { class: "small muted", style: "margin:10px 0 0" }, `${d.soa.versions} approved version(s) on file.`))),
      h("div", { class: "span2" }, card("Annex A by theme", simpleTable([{ label: "Theme", key: "theme" }, { label: "Controls", key: "total", num: true }, { label: "Included", key: "included", num: true }, { label: "Excluded", key: "excluded", num: true },
        { label: "Implemented", key: "implemented", num: true }, { label: "", render: (t) => [meterCell(t.included ? Math.round((100 * (t.implemented || 0)) / t.included) : 0, `${t.implemented || 0} of ${t.included || 0} included controls implemented`)] }], d.soa.themes))),
      card(["Risk before and after controls", h("a", { href: "#/heatmap" }, "Heat map")], stats([d.risks.total, "Open risks"], [d.risks.above_threshold, "Above threshold"], [d.risks.untreated, "No treatment decided"]),
        h("h3", { style: "margin-bottom:6px" }, "Inherent"), segBar(d.risks.inherent, sev), h("h3", { style: "margin:12px 0 6px" }, "Residual"), segBar(d.risks.residual, sev)),
      card(["Risk treatment", h("a", { href: "#/e/risk_treatment" }, "Plan")], stats([d.treatments.open, "Open actions"], [d.treatments.overdue, "Overdue"])),
      card(["Technical assessments", h("a", { href: "#/e/technical_test" + q }, "Open")], segBar(d.technical, { "Not tested": "" }), h("h3", { style: "margin:12px 0 6px" }, "By type"), barList(d.technical_by_type)),
      card(["Information assets", h("a", { href: "#/e/info_asset" + q }, "Register")], stats([d.assets.total, "Assets"], [d.assets.health, "Holding health data"], [d.assets.no_owner, "No owner"]), h("h3", { style: "margin-bottom:6px" }, "By classification"),
        segBar(d.assets.by_classification, { Restricted: "crit", Confidential: "bad", Internal: "warn", Public: "good" }))));
  } else if (name === "controls") {
    out.push(h("div", { class: "grid g3" }, d.kpis.map(kpiTile)));
    out.push(h("div", { class: "grid g3", style: "margin-top:16px" },
      h("div", { class: "span2" }, card(["Requirements covered by a control", h("a", { href: "#/coverage" }, "Coverage and gaps")], simpleTable([{ label: "Framework", key: "framework" }, { label: "Requirements", key: "requirements", num: true }, { label: "With a control", key: "mapped", num: true },
        { label: "Mapping approved", key: "approved", num: true }, { label: "", render: (f) => [meterCell(f.percent, `${f.mapped} of ${f.requirements} requirements have a mapped control`), fmt.pct(f.percent)] }], d.coverage))),
      card(["Mapping review", h("a", { href: "#/e/control_mapping?review_status=Pending review" }, "To review")], segBar(d.mapping_review), h("p", { class: "small muted", style: "margin:10px 0 0" }, "Each mapping is reviewed on its own. One control can serve many requirements, so its evidence is collected once.")),
      card("Design effectiveness", segBar(d.design, { "Not assessed": "" })), card("Operating effectiveness", segBar(d.operating, { "Not assessed": "" }), h("p", { class: "small muted", style: "margin:10px 0 0" }, "Operating effectiveness needs a passed, reviewed test. Uploaded evidence is not enough.")),
      card(["Evidence verification status", h("a", { href: "#/e/evidence" + q }, "Repository")], stats([d.evidence.total, "Records"], [d.evidence.awaiting_review, "Awaiting review"], [d.evidence.expired, "Past validity"], [d.evidence.reused, "Serving several controls"]), segBar(d.evidence.by_status, { Requested: "" })),
      h("div", { class: "span2" }, card("Controls serving the most requirements", simpleTable([{ label: "Control", render: (c) => h("a", { href: `#/e/control/${c.id}` }, c.title) }, { label: "Requirements", key: "requirements", num: true }], d.most_reused))),
      card("Controls by domain", barList(d.by_domain, (i) => `#/e/control?domain=${encodeURIComponent(i.label)}`))));
  } else {
    out.push(card(["Audit progress", h("a", { href: "#/e/audit" + q }, "All audits")], auditTable(d.audits)));
    out.push(h("div", { class: "grid g3", style: "margin-top:16px" },
      card(["Findings by classification", h("a", { href: "#/e/finding" + q }, "Register")], stats([d.findings.open, "Open"], [d.findings.overdue, "Overdue"]), segBar(d.findings.by_classification, CLS_TONE), h("h3", { style: "margin:12px 0 6px" }, "By status"), segBar(d.findings.by_status)),
      card(["CAPA aging", h("a", { href: "#/e/capa" }, "Tracker")], stats([d.capa.open, "Open"], [d.capa.overdue, "Overdue"], [d.capa.awaiting_verification, "Awaiting verification"]),
        segBar(d.capa.aging, { "Not yet due": "good", "1 to 30 days overdue": "warn", "31 to 60 days overdue": "bad", "More than 60 days overdue": "crit" }), h("h3", { style: "margin:12px 0 6px" }, "By stage"), barList(d.capa.by_status)),
      card(["Vendor risk", h("a", { href: "#/e/vendor" }, "Register")], stats([d.vendors.total, "Vendors"], [d.vendors.enhanced, "Enhanced assessment"], [d.vendors.reassessment_overdue, "Reassessment overdue"]), segBar(d.vendors.by_rating, { ...sev, "Not assessed": "" }),
        d.vendors.high.map((v) => h("div", { class: "small", style: "margin-top:8px" }, h("a", { href: `#/e/vendor/${v.id}` }, v.name), " ", chip(v.rating), v.overdue ? [" ", chip("Overdue")] : null))),
      card(["Evidence verification status", h("a", { href: "#/e/evidence" + q }, "Repository")], stats([d.evidence.requested, "Requested"], [d.evidence.awaiting_review, "Awaiting review"], [d.evidence.expired, "Past validity"]), segBar(d.evidence.by_status, { Requested: "" })),
      card(["Rights request status", h("a", { href: "#/e/rights_request" + q }, "Register")], stats([d.rights.open, "Open"], [d.rights.overdue, "Past resolution date"]), segBar(d.rights.by_status)),
      card(["Incident status", h("a", { href: "#/e/incident" + q }, "Register")], stats([d.incidents.open, "Open"], [d.incidents.awaiting_decision, "Awaiting notification decision"]), segBar(d.incidents.by_status), h("h3", { style: "margin:12px 0 6px" }, "Open, by severity"), segBar(d.incidents.by_severity, sev))));
    out.push(trendsBlock());
  }
  put(root, ...out);
};

function heatGrid(cells, onPick) {
  const band = (s) => (s >= 16 ? "b-crit" : s >= 10 ? "b-high" : s >= 5 ? "b-med" : "b-low");
  const g = h("div", { class: "heat", role: "table", "aria-label": "Risk heatmap: likelihood by impact" });
  for (let l = 5; l >= 1; l--) {
    g.append(h("div", { class: "ax" }, l));
    for (let i = 1; i <= 5; i++) {
      const items = cells[`${l}-${i}`] || [];
      g.append(h("button", { class: `cell ${band(l * i)}` + (items.length ? " has" : ""), "data-tip": items.length ? `Likelihood ${l}, impact ${i}\n` + items.map((x) => `${x.code} ${x.title}`).join("\n") : `Likelihood ${l}, impact ${i}: no risks`,
        onclick: () => (items.length && onPick ? onPick(items, l, i) : items.length === 1 ? (location.hash = `#/e/risk/${items[0].id}`) : null) }, items.length || ""));
    }
  }
  g.append(h("div", {}), ...[1, 2, 3, 4, 5].map((i) => h("div", { class: "ax" }, i)));
  return h("div", {}, h("div", { class: "row", style: "align-items:stretch" }, h("div", { class: "muted small", style: "writing-mode:vertical-rl;transform:rotate(180deg);text-align:center" }, "Likelihood"), h("div", { class: "grow" }, g)), h("div", { class: "muted small", style: "margin:4px 0 8px 44px" }, "Impact"),
    h("div", { class: "legend" }, [["b-low", "Low (1 to 4)"], ["b-med", "Medium (5 to 9)"], ["b-high", "High (10 to 15)"], ["b-crit", "Critical (16 to 25)"]].map(([c, l]) => h("span", {}, h("i", { class: "sw heat-sw " + c, style: `background:${{ "b-low": "#dff0df", "b-med": "#fdecc2", "b-high": "#f8d2c2", "b-crit": "#eeb5b5" }[c]}` }), l))));
}
P.heatmap = async (root) => {
  const d = await GET("/api/heatmap" + hq()), list = h("div", {});
  const pick = (items, l, i) => put(list, card(`Likelihood ${l}, impact ${i}`, items.map((x) => h("div", {}, h("a", { href: `#/e/risk/${x.id}` }, `${x.code} · ${x.title}`)))));
  put(root, pageHead("Risk heat map", `${hospitalName(hospitalId())}. Open risks before controls (inherent) and after controls (residual). Select a cell to list its risks. Scores above ${d.threshold} are above the acceptance threshold; accepting a risk always needs an authorized approver.`),
    h("div", { class: "grid g2" }, card("Inherent risk", heatGrid(d.inherent, pick)), card("Residual risk", heatGrid(d.residual, pick))), h("div", { style: "margin-top:16px" }, list));
};

/* ── registers: list ── */
P.list = async (root, entity, q) => {
  const e = ent(entity);
  if (!e) return put(root, empty("Page not found", ""));
  const state = { q: q.q || "", sort: q.sort || "-id", page: Number(q.page || 1) };
  const filters = Object.fromEntries(Object.entries(q).filter(([k]) => !["q", "sort", "page"].includes(k)));
  const writable = can(e.module, 2) && !G.meta.locked.includes(entity);
  const go = (patch) => { const p = new URLSearchParams({ ...filters, ...(state.q ? { q: state.q } : {}), sort: state.sort, page: state.page, ...patch }); for (const [k, v] of [...p]) if (v === "" || v === "undefined") p.delete(k); location.hash = `#/e/${entity}?${p}`; };
  const enumFs = e.fields.filter((f) => f.type === "enum" && (e.list_fields.includes(f.name) || /status|severity|type|category/.test(f.name))).slice(0, 4);
  const search = h("input", { type: "search", placeholder: `Search ${e.plural.toLowerCase()}`, value: state.q, style: "max-width:260px", onkeydown: (ev) => { if (ev.key === "Enter") go({ q: ev.target.value, page: 1 }); } });
  const importInput = h("input", { type: "file", accept: ".csv,.xlsx", hidden: true, onchange: act(async () => {
    const fd = new FormData(); fd.append("file", importInput.files[0]);
    const r = await api("POST", `/api/e/${entity}/import`, fd);
    modal("Import finished", h("div", { class: "stack" }, h("p", {}, `${r.created} created, ${r.updated} updated, ${r.errors.length} rejected.`),
      r.unmatched_columns.length ? h("p", { class: "note" }, "Columns not recognized and skipped: " + r.unmatched_columns.join(", ")) : null,
      r.errors.length ? simpleTable([{ label: "Row", key: "row" }, { label: "Problem", key: "error" }], r.errors.slice(0, 50)) : null), [{ label: "Done", cls: "primary", run: () => render() }]);
  }) });
  const hosp = field(entity, "hospital") && entity !== "user" && !("hospital" in filters) ? hospitalId() : 0;
  const scope = hosp ? { hospital: hosp } : {};
  const params = new URLSearchParams({ ...filters, ...scope, q: state.q, sort: state.sort, page: state.page, size: 50 });
  const data = await GET(`/api/e/${entity}?${params}`);
  const cols = e.list_fields.map((n) => field(entity, n)).filter(Boolean);
  const th = (f) => h("th", { class: "sort" + (["int", "float"].includes(f.type) ? " num" : ""), onclick: f.type === "refs" ? null : () => go({ sort: state.sort === f.name ? "-" + f.name : f.name, page: 1 }) }, f.label, state.sort === f.name ? " ↑" : state.sort === "-" + f.name ? " ↓" : "");
  const exportQ = new URLSearchParams({ ...filters, ...scope, q: state.q });
  const activeFilters = Object.entries(filters).filter(([k]) => !enumFs.some((f) => f.name === k));
  put(root, 
    pageHead(e.plural, `${fmt.num(data.total)} record${data.total === 1 ? "" : "s"}` + (hosp ? ` for ${hospitalName(hosp)}` : "") + (LIST_NOTES[entity] || ""),
      writable ? h("button", { class: "btn primary", onclick: act(() => (entity === "workflow" ? (location.hash = "#/workflows/new") : recordForm(entity, null, { ...scope, ...filters }))) }, `New ${e.label.toLowerCase()}`) : null),
    h("div", { class: "row", style: "margin-bottom:12px" }, search,
      enumFs.map((f) => h("select", { style: "width:auto;max-width:190px", "aria-label": f.label, onchange: (ev) => { filters[f.name] = ev.target.value; go({ [f.name]: ev.target.value, page: 1 }); } }, h("option", { value: "" }, `${f.label}: all`), f.options.map((o) => h("option", { value: o, selected: filters[f.name] === o }, o)))),
      activeFilters.map(([k, v]) => h("span", { class: "tag" }, `${k.replace("__ne", " is not").replace(/_/g, " ")}: ${v} `, h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); delete filters[k]; go({ page: 1 }); } }, "clear"))),
      h("span", { class: "grow" }),
      writable ? [importInput, h("button", { class: "btn sm", onclick: () => importInput.click(), "data-tip": "Upload a CSV or Excel file. Column headings should match the template." }, "Import"), h("a", { class: "btn sm", href: `/api/e/${entity}/template` }, "Template")] : null,
      h("a", { class: "btn sm", href: `/api/e/${entity}/export?fmt=xlsx&${exportQ}` }, "Export Excel"), h("a", { class: "btn sm", href: `/api/e/${entity}/export?fmt=csv&${exportQ}` }, "CSV")),
    data.total > 1 ? summaryStrip(entity, new URLSearchParams({ ...filters, ...scope, q: state.q })) : null,
    data.rows.length ? h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { class: "sort", onclick: () => go({ sort: state.sort === "id" ? "-id" : "id" }) }, "Ref"), cols.map(th))),
      h("tbody", {}, data.rows.map((r) => h("tr", { class: "click", onclick: () => (location.hash = entity === "workflow" ? `#/workflows/${r.id}` : `#/e/${entity}/${r.id}`) },
        h("td", { class: "code" }, r.code), cols.map((f, i) => h("td", { class: (["int", "float"].includes(f.type) ? "num " : "") + (i === 0 ? "clip" : "") }, showValue(entity, f, r)))))))) :
      h("div", { class: "card" }, empty(state.q || Object.keys(filters).length ? "No records match" : `No ${e.plural.toLowerCase()} yet`, state.q || Object.keys(filters).length ? "Clear the search or filters to see everything." : writable ? "Create the first one, or import a spreadsheet." : "")),
    data.total > 50 ? h("div", { class: "pager" }, `${(state.page - 1) * 50 + 1} to ${Math.min(state.page * 50, data.total)} of ${fmt.num(data.total)}`,
      h("button", { class: "btn sm", disabled: state.page <= 1, onclick: () => go({ page: state.page - 1 }) }, "Previous"), h("button", { class: "btn sm", disabled: state.page * 50 >= data.total, onclick: () => go({ page: state.page + 1 }) }, "Next")) : null);
};

/* ── registers: one record ── */
const ADD_RELATED = { finding: [["capa", "finding", "Add corrective action"]], control: [["control_mapping", "control", "Map to a requirement"]], risk: [["risk_treatment", "risk", "Add treatment action"]],
  vendor: [["vendor_assessment", "vendor", "New assessment"]], audit: [["audit_checklist", "audit", "Schedule interview or inspection"], ["audit_test", "audit", "Add audit test"], ["technical_test", "audit", "Record technical assessment"]],
  framework_version: [["requirement", "version", "Add requirement"]], hospital: [["facility", "hospital", "Add facility"], ["audit", "hospital", "New audit project"]], processing_activity: [["dataflow", "processing_activity", "Add data flow"], ["authorization_record", "processing_activity", "Record authorization event"]],
  training_program: [["training_assignment", "program", "Assign to someone"]], incident: [], requirement: [["control_mapping", "requirement", "Map a control"]] };
const AGENT_BTN = { evidence: ["document_analysis", "Analyze document (AI)"], hospital: ["gap_identification", "Identify gaps (AI)"], audit_test: ["observation_draft", "Draft observation (AI)"], finding: ["corrective_actions", "Suggest actions (AI)"],
  audit: ["audit_report", "Draft report (AI)"], requirement: ["control_mapping", "Suggest controls (AI)"] };
const stageRail = (flow, cur, off) => h("ol", { class: "stages", "aria-label": "Lifecycle" }, flow.map((s, i) => h("li", { class: s === cur ? "now" : flow.indexOf(cur) > i ? "done" : "" }, s)), off ? h("li", { class: "off" }, off) : null);

P.detail = async (root, entity, id) => {
  const e = ent(entity), rec = await GET(`/api/e/${entity}/${id}`);
  const writable = can(e.module, 2) && !G.meta.locked.includes(entity);
  const title = rec[e.label_field] || rec.code;
  const set = (vals, msg) => act(async () => { await PUT(`/api/e/${entity}/${rec.id}`, vals); toast(msg || "Saved"); G.me = await GET("/api/me"); render(); });
  const btn = (label, fn, cls) => h("button", { class: "btn " + (cls || ""), onclick: fn }, label);
  const withNote = (label, title_, hint, key, vals, required) => btn(label, () => noteBox(title_, hint, label, async (note) => { await PUT(`/api/e/${entity}/${rec.id}`, { ...vals, ...(note ? { [key]: note } : {}) }); toast("Saved"); render(); }, required));
  const runAgent = (agent, body) => act(async () => { toast("Working on it…"); const r = await POST(`/api/ai/run/${agent}`, body); location.hash = `#/e/ai_recommendation/${r.id}`; });
  const actions = [], flow = FLOWS[entity];
  const next = flow && flow.indexOf(rec.status) >= 0 ? flow[flow.indexOf(rec.status) + 1] : null;
  if (AGENT_BTN[entity] && can("ai", 2)) actions.push(btn(AGENT_BTN[entity][1], runAgent(AGENT_BTN[entity][0], { id: rec.id, entity })));
  if (entity === "hospital") {
    if (can("compliance", 2)) actions.push(btn("Build compliance register", act(async () => { const r = await POST(`/api/applicability/${rec.id}/build`); toast(r.created ? `${r.created} requirement row(s) opened` : "The register already has every published requirement"); render(); })));
    if (can("security", 1)) actions.push(h("a", { class: "btn", href: "#/soa", onclick: () => { G.hospital = rec.id; } }, "Statement of Applicability"));
  }
  if (entity === "framework_version" && can("library", 2)) {
    if (rec.status === "Draft") actions.push(btn("Send for review", set({ status: "In review" }, "Sent for review"), "primary"));
    if (rec.status === "In review" && can("library", 3)) actions.push(btn("Approve", set({ status: "Approved" }, "Version approved"), "primary"), btn("Return to draft", set({ status: "Draft" })));
    if (rec.status === "Approved" && can("library", 3)) actions.push(btn("Publish", () => confirmBox("Publish this version?", "Its requirements are frozen from now on, the earlier published version is superseded, and compliance register rows are opened for reassessment. Completed audits stay linked to the version they used.", "Publish", async () => { await PUT(`/api/e/framework_version/${rec.id}`, { status: "Published" }); toast("Version published"); render(); }), "primary"));
    if (["Published", "Superseded"].includes(rec.status)) actions.push(btn("Create new draft version", () => { const i = h("input", { type: "text", placeholder: "For example: 2027 amendment" });
      modal("New draft version", h("label", { class: "f" }, h("span", {}, "Version label. The requirements of this version are copied into the draft so they can be amended."), i), [{ label: "Cancel", run: () => {} }, { label: "Create draft", cls: "primary", run: async () => { const v = await POST(`/api/library/versions/${rec.id}/draft`, { version_label: i.value }); toast(`Draft ${v.code} created`); location.hash = `#/e/framework_version/${v.id}`; } }], true); }));
    if (rec.content_status !== "Validated by a qualified reviewer" && can("library", 3)) actions.push(btn("Mark content validated", () => confirmBox("Confirm the content has been validated?", "Do this only after a qualified person has checked every requirement in this version against the official source.", "Confirm", async () => { await PUT(`/api/e/framework_version/${rec.id}`, { content_status: "Validated by a qualified reviewer" }); render(); })));
  }
  if (entity === "assessment") {
    actions.push(h("a", { class: "btn", href: `#/trace/${rec.id}` }, "Trace"));
    if (rec.applicability_status !== "Approved" && rec.applicability !== "Pending determination" && can("compliance", 3)) actions.push(btn("Approve applicability", set({ applicability_status: "Approved" }, "Applicability approved"), "primary"));
  }
  if (entity === "audit") {
    if (can("audit", 2) && !["Completed", "Closed"].includes(rec.status)) actions.push(btn("Generate checklist", act(async () => { const r = await POST(`/api/audits/${rec.id}/checklist`); toast(r.created ? `${r.created} audit test(s) created; ${r.not_applicable} requirement(s) left out as not applicable` : "Every requirement in the criteria already has a test"); render(); })));
    if (next && can("audit", next === "Approved" || next === "Completed" ? 3 : 2)) actions.push(btn(next === "Approved" ? "Approve audit project" : `Move to ${next}`, set({ status: next }, `Audit is now at ${next}`), "primary"));
  }
  if (entity === "audit_test" || entity === "technical_test") {
    if (["Fail", "Pass with exceptions"].includes(rec.result) && !rec.finding && can("capa", 2)) actions.push(btn("Raise finding", () => { const c = h("select", {}, G.me.classifications.map((x, i) => h("option", { selected: i === 1 }, x)));
      modal("Raise a finding from this test", h("label", { class: "f" }, h("span", {}, "Classification. The finding keeps its link to this test, its criterion and its evidence."), c), [{ label: "Cancel", run: () => {} }, { label: "Raise finding", cls: "primary", run: async () => { const f = await POST(`/api/tests/${entity}/${rec.id}/finding`, { classification: c.value }); toast(`Finding ${f.code} raised`); location.hash = `#/e/finding/${f.id}`; } }], true); }, "primary"));
  }
  if (entity === "audit_test" && can("audit", 2)) {
    if (rec.review_status === "Draft" && rec.result !== "Not tested") actions.push(btn("Submit for review", set({ review_status: "Submitted" }, "Submitted for review")));
    if (rec.review_status === "Submitted" && can("audit", 3)) actions.push(btn("Review and approve", set({ review_status: "Approved" }, "Result approved"), "primary"));
    if (rec.review_status === "Approved" && can("audit", 3)) actions.push(withNote("Reopen", "Reopen an approved result", "Why is it being reopened? The reason is kept in the history.", "reviewer_comment", { review_status: "Draft" }, true));
  }
  if (entity === "evidence" && can("controls", 2)) {
    if (["Submitted", "Under review"].includes(rec.status)) actions.push(btn("Accept", set({ status: "Accepted" }, "Evidence accepted"), "primary"), withNote("Reject", "Reject this evidence", "Reason for rejection", "review_reason", { status: "Rejected" }, true));
    if (rec.file) actions.push(btn("Upload new version", act(() => recordForm("evidence", null, { supersedes: rec.id, hospital: rec.hospital, title: rec.title, controls: rec.controls, requirements: rec.requirements, document_type: rec.document_type, owner: rec.owner }))));
  }
  if (entity === "control_mapping" && rec.review_status === "Pending review" && can("controls", 3)) actions.push(btn("Approve mapping", set({ review_status: "Approved" }, "Mapping approved"), "primary"), withNote("Reject", "Reject this mapping", "Reason", "review_note", { review_status: "Rejected" }, true));
  if (entity === "finding" && can("capa", 3) && rec.review_status !== "Approved") actions.push(btn("Approve finding", set({ review_status: "Approved" }, "Finding approved"), "primary"));
  if (entity === "finding" && can("capa", 3) && rec.status === "Pending verification") actions.push(withNote("Close finding", "Close this finding", "How was it resolved?", "closure_note", { status: "Closed" }, true));
  if (entity === "capa" && can("capa", 2)) {
    if (rec.status === "Reopened") actions.push(btn("Restart at root cause analysis", set({ status: "Root Cause Analysis" }), "primary"));
    else if (rec.status === "Verification") actions.push(withNote("Verify effective and close", "Effectiveness verification", "What was checked, and what showed the action worked?", "verification_note", { status: "Closed", effective: "Effective" }, true),
      withNote("Not effective: reopen", "Effectiveness verification", "What showed the action did not work?", "verification_note", { effective: "Not effective" }, true));
    else if (next && next !== "Closed" && (next !== "Approved" || can("capa", 3))) actions.push(btn(next === "Approved" ? "Approve plan" : `Move to ${next}`, set({ status: next }, `Action is now at ${next}`), "primary"));
  }
  if (entity === "incident" && can("incident", 2)) {
    if (can("incident", 3) && (rec.notification_decision || "Not decided") === "Not decided") actions.push(btn("Record notification decision", () => { const f = field("incident", "notification_decision"), sel = h("select", {}, f.options.slice(1).map((o) => h("option", {}, o))), why = h("textarea", {});
      modal("Notification decision", h("div", { class: "stack" }, h("p", { class: "note" }, "This decision is yours. It is recorded with your name and the time. The system does not send anything to HHS, the state attorney general or Individuals."), h("label", { class: "f" }, h("span", {}, "Decision"), sel), h("label", { class: "f" }, h("span", {}, "Reasoning"), why)),
        [{ label: "Cancel", run: () => {} }, { label: "Record decision", cls: "primary", run: async () => { await PUT(`/api/e/incident/${rec.id}`, { notification_decision: sel.value, notification_rationale: why.value }); toast("Decision recorded"); render(); } }], true); }));
    if (next) actions.push(btn(`Move to ${next}`, set({ status: next }, `Incident is now at ${next}`), "primary"));
  }
  if (entity === "risk" && can("security", 3) && !["Accepted", "Closed"].includes(rec.status)) actions.push(withNote("Accept risk", "Accept this risk", "Rationale for acceptance", "acceptance_rationale", { status: "Accepted" }, true));
  if (entity === "authorization_record" && rec.withdrawal_action_status === "Pending action" && can("privacy", 2)) actions.push(withNote("Record action taken", "Authorization revocation", "What was done to stop the processing?", "action_note", {}, true));
  if (entity === "vendor_assessment" && rec.status !== "Approved" && can("vendor", 3)) actions.push(btn("Approve assessment", set({ status: "Approved" }, "Assessment approved"), "primary"));
  if (entity === "management_review" && rec.status !== "Approved" && can("review", 3)) actions.push(btn("Approve review", set({ status: "Approved" }, "Management review approved"), "primary"));
  if (entity === "user" && can("admin", 4)) actions.push(h("button", { class: "btn", onclick: () => {
    const p = h("input", { type: "password", autocomplete: "new-password" });
    modal(`Set password for ${rec.name}`, h("label", { class: "f" }, h("span", {}, "New password (10+ characters, letters and numbers). Share it with the user securely."), p),
      [{ label: "Cancel", run: () => {} }, { label: "Set password", cls: "primary", run: async () => { await POST(`/api/users/${rec.id}/password`, { password: p.value }); toast(`${rec.name} can now sign in`); render(); } }], true);
  } }, rec.can_sign_in ? "Reset password" : "Set password so they can sign in"));
  if (entity === "user" && can("admin", 4) && rec.mfa_enabled) actions.push(btn("Reset two-step sign-in", () => confirmBox(`Reset two-step sign-in for ${rec.name}?`, "Use this when someone has lost or replaced their phone. Their authenticator and recovery codes stop working, they are signed out, and they set it up again at next sign-in.", "Reset", async () => { await POST(`/api/users/${rec.id}/mfa/reset`); toast("Two-step sign-in reset"); render(); }, true)));
  if (entity === "training_assignment" && rec.status !== "Completed" && (rec.trainee === G.me.user.id || can("training", 3))) actions.push(h("a", { class: "btn primary", href: `#/training/${rec.id}` }, "Take assessment"));
  if (entity === "workflow_run" && can("workflow", 2)) {
    if (rec.status === "Failed") actions.push(btn("Retry", act(async () => { await POST(`/api/runs/${rec.id}/retry`); toast("Retry started"); setTimeout(render, 900); }), "primary"));
    if (!["Completed", "Canceled", "Rejected", "Failed"].includes(rec.status)) actions.push(btn("Cancel run", act(async () => { await POST(`/api/runs/${rec.id}/cancel`); render(); })));
  }
  if (entity === "approval" && rec.status === "Pending") actions.push(...approvalButtons(rec));
  if (entity === "notification" && !rec.read) POST("/api/notifications/read", { id: rec.id }).then(() => { G.me.unread = Math.max(0, G.me.unread - 1); });
  for (const [child, fk, label] of ADD_RELATED[entity] || []) if (can(ent(child).module, 2)) actions.push(btn(label, act(() => recordForm(child, null, { [fk]: rec.id, ...(rec.hospital && field(child, "hospital") ? { hospital: rec.hospital } : {}) }, () => render()))));
  if (writable) actions.push(btn("Edit", act(() => recordForm(entity, rec)), "primary"));
  if (can(e.module, 4) && !["workflow_run", "ai_recommendation", "approval", "authorization_record", "soa_version", "framework_version", "requirement"].includes(entity)) actions.push(btn("Delete", () => confirmBox(`Delete ${rec.code}?`, "This removes the record. The deletion is written to the audit trail.", "Delete", async () => { await api("DELETE", `/api/e/${entity}/${rec.id}`); toast("Deleted"); location.hash = `#/e/${entity}`; }, true), "danger"));

  const body = h("div", {});
  const tabs = [["Details", () => detailsTab(entity, rec)], ["Linked records", () => relatedTab(entity, rec)], ["History", () => historyTab(entity, rec)]];
  const tabBar = h("div", { class: "tabs" }, tabs.map(([label, fn], i) => h("button", { class: i === 0 ? "on" : "", onclick: act(async (ev) => { [...tabBar.children].forEach((b) => b.classList.remove("on")); ev.currentTarget.classList.add("on"); put(body, h("p", { class: "muted" }, "Loading…")); put(body, await fn()); annotate(body); }) }, label)));
  put(body, await detailsTab(entity, rec));
  const status = ["status", "review_status", "applicability", "classification", "severity", "residual_rating", "result", "necessary"].filter((n) => rec[n] && field(entity, n)).map((n) => chip(rec[n]));
  if (rec.future_effective) status.push(chip("Future effective"));
  put(root, h("div", { class: "crumb" }, h("a", { href: `#/e/${entity}` }, e.plural), " / ", rec.code),
    h("div", { class: "page-head" }, h("div", { class: "grow" }, h("h1", {}, title), h("div", { class: "row", style: "margin-top:8px;gap:16px" }, status)), h("div", { class: "row" }, actions)),
    flow && entity !== "evidence" ? stageRail(flow, rec.status, entity === "capa" && rec.status === "Reopened" ? "Reopened" : null) : null, tabBar, body);
};

async function detailsTab(entity, rec) {
  const e = ent(entity), extra = [], L = rec._labels || {};
  if (entity === "workflow_run") extra.push(card("Steps", h("ul", { class: "timeline" }, (rec.log || []).map((l) => h("li", { class: l.status }, h("b", {}, l.name), ` (${l.type}) `, chip({ done: "Done", failed: "Failed", waiting: "Waiting for approval", rejected: "Rejected" }[l.status] || l.status), h("div", {}, l.message), h("div", { class: "muted small" }, fmt.dt(l.ts)))), !(rec.log || []).length ? h("li", {}, "No steps have run yet.") : null),
    rec.error ? h("p", { class: "note bad" }, rec.error) : null));
  if (entity === "ai_recommendation") return S.recommendation(rec);
  if (entity === "framework_version" && rec.content_status !== "Validated by a qualified reviewer") extra.push(h("div", { class: "note" }, "Unvalidated starter content. The requirement titles and summaries are plain-word descriptions written for this product, not the text of the law or standard. Have a qualified person check them against the official source before relying on them."));
  if (entity === "requirement") extra.push(h("div", { class: "note info" }, rec.status === "Published" ? "Published and frozen. To amend it, create a new draft version of the framework; audits already completed stay linked to this version." : rec.status === "Superseded" ? "Superseded by a later version. It is kept because completed audits were assessed against it." : "Draft. It can be edited until its version is published."));
  if (entity === "assessment") {
    if (rec.future_effective) extra.push(h("div", { class: "note" }, `This requirement takes effect on ${fmt.date(rec.effective_from)}. It is assessed as readiness and is not counted in the in-force score until then.`));
    if (!rec.current) extra.push(h("div", { class: "note info" }, "This row belongs to a superseded framework version and is kept as history."));
    extra.push(h("div", { class: "note info" }, "Compliant can only be recorded by an authorized person, after applicability is approved and with evidence a reviewer has accepted. Partially compliant, non-compliant and not assessed never count as compliant."));
  }
  if (entity === "risk" && rec.inherent_score) extra.push(h("div", { class: "note" + (rec.above_threshold && rec.status !== "Accepted" ? "" : " info") }, `Inherent score ${rec.inherent_score} (likelihood ${rec.likelihood} x impact ${rec.impact}). ` +
    (rec.residual_score ? `Residual score ${rec.residual_score} (likelihood ${rec.residual_likelihood} x impact ${rec.residual_impact}). ` : "Residual risk has not been scored yet. ") + `Acceptance threshold ${rec.acceptance_threshold}. ` +
    (rec.status === "Accepted" ? `Accepted by ${L.accepted_by || "an approver"} on ${fmt.date(rec.accepted_on)}.` : "A score at or below the threshold does not accept the risk: acceptance is a recorded decision by an authorized approver.")));
  if (entity === "evidence") {
    if (rec.status === "Requested") extra.push(h("div", { class: "note" }, "Requested. Use Edit to attach the document; it then goes to a reviewer."));
    if (rec.supersedes) extra.push(h("div", { class: "note info" }, `Version ${rec.version_number}. It supersedes `, h("a", { href: `#/e/evidence/${rec.supersedes}` }, L.supersedes || "an earlier version"), ", which stays on file."));
    const box = h("div", {}, h("p", { class: "muted small" }, "Loading…"));
    extra.push(card("Access log", box));
    GET(`/api/evidence/${rec.id}/access`).then((rows) => put(box, rows.length ? simpleTable([{ label: "When", render: (a) => fmt.dt(a.ts), cls: "nowrap" }, { label: "Who", key: "user_name" }, { label: "Action", key: "action" }, { label: "Detail", key: "summary" }], rows.slice(0, 15)) : h("p", { class: "muted small" }, "No access recorded yet."))).catch(() => put(box, ""));
  }
  if (entity === "audit_test" && rec.review_status === "Approved") extra.push(h("div", { class: "note info" }, `Reviewed and approved by ${L.reviewed_by || "the reviewer"} on ${fmt.dt(rec.reviewed_at)}. The result is locked; the reviewer can reopen it with a recorded reason.`));
  if (entity === "technical_test") extra.push(h("div", { class: "note info" }, "This records the result of an approved test. WardTrail does not run penetration or other intrusive tests." + (rec.restricted ? " Restricted: visible to the tester, the audit team and security approvers." : "")));
  if (entity === "incident") {
    const due = [rec.individuals_due ? `If this is a breach, notices to affected individuals are due ${fmt.date(rec.individuals_due)}` : null, rec.hhs_due ? `Notice to HHS is due ${fmt.date(rec.hhs_due)}` : null, rec.state_due ? `A state notice may be due ${fmt.date(rec.state_due)}: check your state's law` : null].filter(Boolean);
    if (due.length) extra.push(h("div", { class: "note" }, due.join(". ") + ". These dates are worked out from the detection time and the periods in Settings. Check which duties are in force on that date; the decision to notify is made and approved by an authorized person."));
    if ((rec.timeline || []).length) extra.push(card("Timeline", h("ul", { class: "timeline" }, rec.timeline.map((t) => h("li", {}, h("b", {}, t.to), t.from ? ` (from ${t.from})` : "", ` by ${t.by}`, h("div", { class: "muted small" }, fmt.dt(t.at)))))));
  }
  if (entity === "audit") {
    const sn = rec.snapshot;
    if (sn) extra.push(card("Position recorded when the audit was completed", h("p", { class: "small muted", style: "margin-top:0" }, `Taken ${fmt.dt(sn.taken_at)}. Criteria: ${sn.criteria.map((c) => c.title).join("; ")}.`),
      stats([sn.tests.total, "Tests"], [sn.tests.pass, "Passed"], [sn.tests.fail, "Failed"], [sn.tests.not_applicable, "Not applicable"]), segBar(sn.findings, CLS_TONE)));
    extra.push(h("div", { class: "note info" }, "The framework versions in 'Frameworks' are this audit's criteria. They are fixed once the audit is approved, so results stay traceable to the version used."));
  }
  if (entity === "soa_version") extra.push(card(`Statement of Applicability as approved (version ${rec.version_number})`, simpleTable([{ label: "Control", key: "reference", cls: "code" }, { label: "Title", key: "title" }, { label: "Necessary", render: (s) => chip(s.necessary) },
    { label: "Justification", key: "justification", cls: "wraptext" }, { label: "Implementation", render: (s) => chip(s.implementation_status) }], rec.snapshot || [])));
  if (entity === "management_review" && rec.inputs && rec.inputs.scores) { const s = rec.inputs.scores, v = (k) => (s[k] && s[k].value !== null && s[k].value !== undefined ? s[k].value + "%" : "not assessed");
    extra.push(card("Figures put before the review", h("p", { class: "small muted", style: "margin-top:0" }, `Recorded ${fmt.dt(rec.inputs.taken_at)}.`), h("div", { class: "row", style: "gap:26px" }, [["HIPAA in force", v("hipaa")], ["HIPAA readiness", v("hipaa_readiness")], ["ISO 27001", v("iso")]].map(([l, x]) => h("div", { class: "stat" }, h("b", {}, x), h("span", {}, l))),
      rec.inputs.findings ? stat(rec.inputs.findings.open, "Open findings") : null, rec.inputs.capa ? stat(rec.inputs.capa.overdue, "CAPA overdue") : null, rec.inputs.risks ? stat(rec.inputs.risks.above_threshold, "Risks above threshold") : null))); }
  if (entity === "capa" && rec.independent_verification_required) extra.push(h("div", { class: "note info" }, "Independent verification is required: closure needs implementation evidence and an effectiveness check by someone other than the owner or implementer."));
  if (entity === "integration") extra.push(h("div", { class: "note info" }, "Read-only discovery is the default. Write-back to a hospital system needs explicit authorization by an administrator, which is recorded here."));
  const skip = { workflow_run: ["log", "state", "context"], soa_version: ["snapshot"], audit: ["snapshot"], incident: ["timeline"], management_review: ["inputs"] }[entity] || [];
  const fs = e.fields.filter((f) => !f.hidden && !skip.includes(f.name));
  return h("div", { class: "stack" }, ...extra, h("div", { class: "card" }, h("dl", { class: "dl" }, fs.map((f) => { const v = showValue(entity, f, rec); return h("div", { class: ["long", "json", "refs"].includes(f.type) && v ? "wide" : "" }, h("dt", {}, f.label), h("dd", {}, v || h("span", { class: "muted" }, "Not set"))); }),
    h("div", {}, h("dt", {}, "Created"), h("dd", {}, fmt.dt(rec.created_at))), h("div", {}, h("dt", {}, "Last updated"), h("dd", {}, fmt.dt(rec.updated_at))))));
}

async function relatedTab(entity, rec) {
  const refs = [];
  for (const [k, e] of Object.entries(G.meta.entities)) if (can(e.module, 1) && !["notification"].includes(k)) for (const f of e.fields) if (f.to === entity && (f.type === "ref" || f.type === "refs")) refs.push([k, f]);
  const sets = await Promise.all(refs.map(([k, f]) => GET(`/api/e/${k}?${f.name}=${rec.id}&size=25`).then((d) => ({ k, f, d })).catch(() => null)));
  const tasks = can("work", 1) ? await GET(`/api/e/task?related_entity=${entity}&related_id=${rec.id}&size=25`).catch(() => null) : null;
  const blocks = sets.filter((s) => s && s.d.total).map(({ k, f, d }) => relatedBlock(k, `${ent(k).plural} (${f.label.toLowerCase()})`, d, `#/e/${k}?${f.name}=${rec.id}`));
  if (tasks && tasks.total) blocks.push(relatedBlock("task", "Tasks about this record", tasks, `#/e/task?related_entity=${entity}&related_id=${rec.id}`));
  return blocks.length ? h("div", { class: "stack" }, blocks) : h("div", { class: "card" }, empty("No linked records yet", "Records that refer to this one appear here."));
}
function relatedBlock(k, title, d, href) {
  const e = ent(k), cols = e.list_fields.slice(0, 5).map((n) => field(k, n)).filter(Boolean);
  return card([title, h("a", { href }, d.total > d.rows.length ? `All ${d.total}` : "Open list")], simpleTable([{ label: "Ref", key: "code", cls: "code" }, ...cols.map((f) => ({ label: f.label, render: (r) => showValue(k, f, r), cls: f === cols[0] ? "clip" : "" }))], d.rows, (r) => (location.hash = `#/e/${k}/${r.id}`)));
}
async function historyTab(entity, rec) {
  const d = await GET(`/api/e/${entity}/${rec.id}/history`);
  const change = (a) => Object.entries((a.details || {}).changes || {}).map(([k, v]) => h("div", { class: "small" }, h("b", {}, (field(entity, k) || { label: k }).label), ": ", h("span", { class: "muted" }, JSON.stringify(v[0])), " → ", JSON.stringify(v[1])));
  return h("div", { class: "grid g2" }, card("Activity", d.activity.length ? h("ul", { class: "timeline" }, d.activity.map((a) => h("li", {}, h("b", {}, a.action), ` by ${a.user_name}`, h("div", { class: "muted small" }, fmt.dt(a.ts)), change(a)))) : h("p", { class: "muted" }, "No activity recorded.")),
    card("Previous versions", d.versions.length ? simpleTable([{ label: "Version", key: "version" }, { label: "Replaced on", render: (v) => fmt.dt(v.ts) }, { label: "Changed by", key: "changed_by_name" },
      { label: "", render: (v) => h("button", { class: "btn sm", onclick: () => modal(`Version ${v.version}`, h("pre", { class: "report small" }, JSON.stringify(v.data, null, 2)), [{ label: "Close", run: () => {} }]) }, "View") }], d.versions) : h("p", { class: "muted" }, "This record has not been changed since it was created.")));
}

/* ── approvals ── */
function approvalButtons(a) {
  const decide = (approve) => () => noteBox(approve ? "Approve" : "Reject", approve ? "Note (optional)" : "Reason for rejection", approve ? "Approve" : "Reject", async (note) => { await POST(`/api/approvals/${a.id}/decide`, { approve, note }); toast(approve ? "Approved" : "Rejected"); G.me = await GET("/api/me"); render(); }, !approve);
  return [h("button", { class: "btn primary", onclick: decide(true) }, "Approve"), h("button", { class: "btn danger", onclick: decide(false) }, "Reject")];
}
P.approvals = async (root) => {
  const d = await GET("/api/approvals/mine");
  const link = (a) => (a.related_entity && a.related_id ? h("a", { href: `#/e/${a.related_entity}/${a.related_id}` }, `Open the ${ent(a.related_entity).label.toLowerCase()}`) : "");
  put(root, pageHead("Approvals", "Requests waiting for your decision. Workflows pause here until an authorized person approves or rejects."),
    card("Waiting for you", d.pending.length ? simpleTable([{ label: "Request", render: (a) => h("div", {}, h("a", { href: `#/e/approval/${a.id}` }, a.title), h("div", { class: "muted small" }, a.description)) }, { label: "For", render: (a) => a.approver_role || "You" }, { label: "Level", key: "level" },
      { label: "Record", render: link }, { label: "", render: (a) => h("div", { class: "row" }, approvalButtons(a)) }], d.pending) : empty("Nothing is waiting for you", "")),
    h("div", { style: "margin-top:16px" }, card("Recently decided", simpleTable([{ label: "Request", render: (a) => h("a", { href: `#/e/approval/${a.id}` }, a.title) }, { label: "Decision", render: (a) => chip(a.status) }, { label: "When", render: (a) => fmt.dt(a.decided_at) }, { label: "Note", key: "decision_note" }], d.decided))));
};

/* ── reports (UI-021) ── */
P.reports = async (root, id) => {
  const hid = hospitalId(), hp = hid ? `&hospital=${hid}` : "";
  if (!id) {
    const list = await GET("/api/reports");
    return put(root, pageHead("Reports", `${hospitalName(hid)}. Open a report to view it, or export it to Excel, CSV or PDF. Reports are built from the same records as the screens, and every export is recorded in the audit trail.`),
      h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Ref"), h("th", {}, "Report"), h("th", {}, "Area"), h("th", {}, "Export"))), h("tbody", {}, list.map((r) => h("tr", {}, h("td", { class: "code" }, r.id), h("td", {}, h("a", { href: `#/reports/${r.id}` }, r.name)), h("td", { class: "muted" }, G.meta.modules[r.module]),
        h("td", {}, ["xlsx", "csv", "pdf"].map((f) => h("a", { class: "btn sm", style: "margin-right:6px", href: `/api/reports/${r.id}?fmt=${f}${hp}` }, f === "xlsx" ? "Excel" : f.toUpperCase())))))))));
  }
  const r = await GET(`/api/reports/${id}${hid ? "?hospital=" + hid : ""}`);
  put(root, h("div", { class: "crumb" }, h("a", { href: "#/reports" }, "Reports"), " / ", r.id), pageHead(r.title, r.summary, ["xlsx", "csv", "pdf"].map((f) => h("a", { class: "btn", href: `/api/reports/${r.id}?fmt=${f}${hp}` }, f === "xlsx" ? "Excel" : f.toUpperCase())), h("button", { class: "btn", onclick: () => print() }, "Print"),
      h("button", { class: "btn", "data-tip": "For large reports. The file is prepared on the server while you carry on working, and you are notified when it is ready.", onclick: act(async () => { await POST(`/api/reports/${r.id}/generate`, { fmt: "xlsx" }); toast("Preparing the Excel file. You will be notified when it is ready under Reports, Report downloads."); }) }, "Prepare in background")),
    reportChart(r),
    r.rows.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, r.columns.map((c) => h("th", {}, c)))), h("tbody", {}, r.rows.map((row) => h("tr", {}, row.map((v) => h("td", { class: typeof v === "number" ? "num" : "" }, v === null || v === undefined ? "" : typeof v === "number" ? fmt.num(v) : toneOf(v) ? chip(v) : String(v)))))))) : h("div", { class: "card" }, empty("Nothing to report yet", "")));
};

/* ── training assessment ── */
P.training = async (root, id) => {
  const d = await GET(`/api/training/${id}/questions`);
  const form = h("form", { class: "stack", onsubmit: act(async () => {
    const answers = {};
    d.questions.forEach((_, i) => { const c = form.querySelector(`input[name=q${i}]:checked`); if (c) answers[i] = Number(c.value); });
    const r = await POST(`/api/training/${id}/submit`, { answers });
    modal(r.passed ? "Passed" : "Not passed yet", h("p", {}, `You scored ${r.score}% (${r.correct} of ${r.total}). The pass mark is ${r.pass_mark}%.` + (r.passed ? " Your completion has been recorded." : " You can review the material and try again.")), [{ label: "Done", cls: "primary", run: () => (location.hash = `#/e/training_assignment/${id}`) }], true);
  }) }, d.questions.map((q, i) => card(`${i + 1}. ${q.q}`, q.options.map((o, j) => h("label", { class: "check", style: "margin:6px 0" }, h("input", { type: "radio", name: `q${i}`, value: j, required: true }), o)))),
    d.questions.length ? h("div", {}, h("button", { class: "btn primary" }, "Submit answers")) : h("div", { class: "card" }, empty("No questions yet", "Ask HR to add assessment questions to this program.")));
  put(root, h("div", { class: "crumb" }, h("a", { href: "#/e/training_assignment" }, "Assignments"), " / assessment"), pageHead(d.program.title, `${d.program.description || ""} Pass mark ${d.program.pass_mark || 70}%.`), form);
};

/* ── administration ── */
P.roles = async (root) => {
  const mods = Object.entries(G.meta.modules), L = ["None", "View", "Edit", "Approve", "Administer"];
  put(root, pageHead("Roles and permissions", "What each role may do in each area. On top of the role: people assigned to named hospitals see only those hospitals; department heads, CAPA owners and employees see their own department's or their own records; audit working papers are visible only to the assigned audit team; and nobody approves their own work."),
    h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Area"), G.meta.roles.map((r) => h("th", { style: "white-space:normal;min-width:86px;font-size:12px" }, r)))),
      h("tbody", {}, mods.map(([k, label]) => h("tr", {}, h("td", { class: "nowrap" }, label), G.meta.roles.map((r) => { const v = G.meta.permissions[r][k] || 0; return h("td", { class: "small", style: v ? "" : "color:#c0c8d1" }, L[v]); })))))));
};
P.tokens = async (root) => {
  const d = await GET("/api/e/api_token?size=100");
  const create = () => { const n = h("input", { type: "text", placeholder: "For example: EHR asset discovery feed" }), s = h("input", { type: "text", placeholder: "info_asset, vendor, incident (leave empty for all)" }),
    ips = h("input", { type: "text", placeholder: "For example 10.20.0.5, 10.30.0.0/24 (leave empty for any)" }), exp = h("input", { type: "date" });
    modal("New API token", h("div", { class: "stack" }, h("label", { class: "f" }, h("span", {}, "Name"), n), h("label", { class: "f" }, h("span", {}, "Registers it may write to"), s, h("span", { class: "muted small" }, "Decisions and criteria (assessments, audits, findings, CAPA, the library) cannot be fed by a system.")),
      h("label", { class: "f" }, h("span", {}, "Only accept it from these network addresses"), ips), h("label", { class: "f" }, h("span", {}, "Expires on (recommended: within a year)"), exp)), [{ label: "Cancel", run: () => {} }, { label: "Create token", cls: "primary", run: async () => {
      const r = await POST("/api/tokens", { name: n.value, entities: s.value, allowed_ips: ips.value, expires_on: exp.value || null });
      modal("Copy this token now", h("div", { class: "stack" }, h("p", {}, "It is shown only once. Store it in the sending system's secret store."), h("pre", { class: "report", style: "user-select:all" }, r.token)), [{ label: "I have copied it", cls: "primary", run: () => render() }]);
    } }], true); };
  put(root, pageHead("API tokens", "Tokens let hospital systems send discovered records in, for example assets from the EHR or incidents from the SIEM. Each token is limited to the registers you name, and nothing is written back to the source system.", h("button", { class: "btn primary", onclick: create }, "New token")),
    simpleTable([{ label: "Name", key: "name" }, { label: "Token", key: "token_hint", cls: "code" }, { label: "Registers", render: (t) => t.entities || "All" }, { label: "Allowed from", render: (t) => t.allowed_ips || "Any address" }, { label: "Expires", render: (t) => (t.expires_on ? (t.expires_on < G.me.today ? chip("Expired") : fmt.date(t.expires_on)) : "Never") },
      { label: "Last used", render: (t) => (t.last_used ? `${fmt.dt(t.last_used)}${t.last_ip ? " from " + t.last_ip : ""}` : "Never") }, { label: "Status", render: (t) => chip(t.active ? "Active" : "Disabled") },
      { label: "", render: (t) => (t.active ? h("button", { class: "btn sm danger", onclick: act(async () => { await POST(`/api/tokens/${t.id}/revoke`); render(); }) }, "Revoke") : "") }], d.rows),
    h("div", { class: "card", style: "margin-top:16px" }, h("h2", {}, "Sending data in"), h("pre", { class: "report small" }, `POST ${location.origin}/api/integrations/info_asset\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{"records": [{"name": "Radiology reporting workstation 4", "hospital": "Lakeshore Regional Medical Center",\n  "asset_type": "Endpoint", "classification": "Confidential", "holds_health_data": true}]}`),
      h("p", { class: "small muted", style: "margin-bottom:0" }, "Assets, vendors and departments are matched on their name, so sending the same one again updates it. Full API reference: ", h("a", { href: "/docs", target: "_blank", rel: "noopener" }, "/docs"))));
};
P.auditTrail = async (root, q) => {
  const page = Number(q.page || 1), d = await GET(`/api/audit-trail?page=${page}&q=${encodeURIComponent(q.q || "")}&action=${q.action || ""}`);
  const result = h("span", {});
  put(root, pageHead("Audit trail", "Every sign-in, change, approval, export and AI decision. Entries are chained with a cryptographic hash, so an altered or deleted entry is detectable.",
    h("button", { class: "btn", onclick: act(async () => { const r = await GET("/api/audit-trail/verify"); put(result, r.intact ? chip("Verified") : chip("Failed"), r.intact ? ` ${fmt.num(r.entries)} entries, chain intact` : ` chain broken at entry ${r.broken_at_id}`); }) }, "Verify integrity"), result),
    h("div", { class: "row", style: "margin-bottom:12px" }, h("input", { type: "search", placeholder: "Search summary or user", value: q.q || "", style: "max-width:280px", onkeydown: (e) => { if (e.key === "Enter") location.hash = `#/audit-trail?q=${encodeURIComponent(e.target.value)}`; } })),
    simpleTable([{ label: "When", render: (a) => fmt.dt(a.ts), cls: "nowrap" }, { label: "Who", key: "user_name" }, { label: "Action", key: "action" }, { label: "Record", render: (a) => (a.entity && a.record_id && G.meta.entities[a.entity] ? h("a", { href: `#/e/${a.entity}/${a.record_id}` }, ent(a.entity).label) : a.entity) },
      { label: "Summary", key: "summary" }, { label: "Hash", render: (a) => h("span", { class: "code", "data-tip": a.hash }, (a.hash || "").slice(0, 10)) }], d.rows),
    h("div", { class: "pager" }, `Page ${page} of ${Math.max(1, Math.ceil(d.total / 100))}`, h("button", { class: "btn sm", disabled: page <= 1, onclick: () => (location.hash = `#/audit-trail?page=${page - 1}&q=${q.q || ""}`) }, "Previous"),
      h("button", { class: "btn sm", disabled: page * 100 >= d.total, onclick: () => (location.hash = `#/audit-trail?page=${page + 1}&q=${q.q || ""}`) }, "Next")));
};
P.settings = async (root) => {
  const d = await GET("/api/settings"), s = d.settings, admin = can("admin", 4);
  const num = (k, label, help) => { const i = h("input", { type: "number", step: "any", value: s[k], disabled: !admin }); i.dataset.k = k; return h("label", { class: "f" }, h("span", {}, label), i, help ? h("span", { class: "muted small" }, help) : null); };
  const ai = h("input", { type: "checkbox", checked: s.ai_enabled, disabled: !admin });
  const mfaReq = h("input", { type: "checkbox", checked: s.require_mfa, disabled: !admin });
  const indep = h("input", { type: "checkbox", checked: s.capa_independent_verification, disabled: !admin });
  const classes = h("input", { type: "text", value: (s.finding_classifications || []).join(", "), disabled: !admin });
  const form = h("div", { class: "form-grid" }, num("risk_acceptance_threshold", "Risk acceptance threshold (score out of 25)", "Risks scoring above this are shown as above the threshold. Acceptance always needs an approver, whatever the score."),
    num("rights_response_days", "Rights request: first response (days)"), num("rights_resolution_days", "Rights request: resolution (days)"),
    num("complaint_resolution_days", "Privacy complaint: resolution (days)", "HIPAA requires a complaint process but sets no deadline. This is your own standard."), num("amendment_days", "Amendment request: decision (days)", "The Privacy Rule allows 60 days."), num("accounting_days", "Accounting of disclosures: response (days)", "The Privacy Rule allows 60 days."),
    num("breach_notice_days", "Breach: notice to individuals and HHS (days from discovery)", "The Breach Notification Rule allows 60 calendar days."), num("state_notice_days", "Breach: state notice (days)", "State laws differ. Enter the shortest that applies to you."),
    num("evidence_default_validity_days", "Evidence validity when none is given (days)"), num("evidence_retention_years", "Evidence kept before archiving (years)"),
    h("label", { class: "f wide" }, h("span", {}, "Finding classifications (comma separated, most serious first)"), classes, h("span", { class: "muted small" }, "Used when a finding is raised. Existing findings keep the classification they were given.")),
    h("label", { class: "check wide" }, indep, "Require independent verification of corrective actions: the owner or implementer cannot approve the effectiveness of their own action"),
    h("label", { class: "check wide" }, ai, "Allow the AI audit assistant for this organization"),
    h("label", { class: "check wide" }, mfaReq, "Require two-step sign-in (MFA) for everyone who signs in with a password. People without it are asked to set it up before they can continue."));
  const save = act(async () => { const body = { ai_enabled: ai.checked, require_mfa: mfaReq.checked, capa_independent_verification: indep.checked, finding_classifications: classes.value.split(",").map((x) => x.trim()).filter(Boolean) };
    form.querySelectorAll("input[data-k]").forEach((i) => (body[i.dataset.k] = Number(i.value))); await PUT("/api/settings", body); G.me = await GET("/api/me"); toast("Settings saved"); });
  const newOrg = () => { const f = {}; const i = (k, l, t) => h("label", { class: "f" }, h("span", {}, l), (f[k] = h("input", { type: t || "text" }))); const sm = h("input", { type: "checkbox" });
    modal("New organization", h("div", { class: "stack" }, i("name", "Organization name"), i("admin_name", "Administrator's name"), i("admin_email", "Administrator's email", "email"), i("admin_password", "Administrator's password", "password"), h("label", { class: "check" }, sm, "Load sample data")),
      [{ label: "Cancel", run: () => {} }, { label: "Create organization", cls: "primary", run: async () => { await POST("/api/tenants", { name: f.name.value, admin_name: f.admin_name.value, admin_email: f.admin_email.value, admin_password: f.admin_password.value, sample_data: sm.checked }); toast("Organization created"); await boot(); } }], true); };
  put(root, pageHead("Settings", "Timelines and thresholds used by the rules, finding classifications, AI and email status, sample data and organizations."),
    h("div", { class: "grid g2" },
      h("div", { class: "span2" }, card("Rules and thresholds", form, admin ? h("div", { style: "margin-top:14px" }, h("button", { class: "btn primary", onclick: save }, "Save settings")) : null)),
      card("System", h("dl", { class: "dl" }, h("div", {}, h("dt", {}, "AI audit assistant"), h("dd", {}, d.ai_mode === "rules" ? "Built-in rules mode (no data leaves this server)" : d.ai_mode)), h("div", {}, h("dt", {}, "Email notifications"), h("dd", {}, d.email_configured ? "Configured" : "Not configured (in-app notifications only)")),
        h("div", {}, h("dt", {}, "Database"), h("dd", {}, d.database)), h("div", {}, h("dt", {}, "Sessions"), h("dd", {}, `${d.session_hours} hours, ${d.idle_minutes} minutes idle timeout`)), h("div", {}, h("dt", {}, "Version"), h("dd", {}, G.me.version))),
        h("p", { class: "small muted", style: "margin-bottom:0" }, "AI model, email server and database are set in the .env file. See the README.")),
      admin ? card("Sample data", h("p", {}, d.sample_loaded ? "A fictional hospital group's sample data is loaded. Remove it when you are ready to start with your own records. The starter library, workflows and anything you entered yourself stay." : "No sample data is loaded."),
        d.sample_loaded ? h("button", { class: "btn danger", onclick: () => confirmBox("Remove sample data?", "This deletes the fictional hospital group's records and anything raised against them. It cannot be undone.", "Remove sample data", async () => { const r = await POST("/api/admin/sample/clear"); toast(`${r.records} sample records removed`); G.optCache = {}; render(); }, true) }, "Remove sample data")
          : h("button", { class: "btn", onclick: act(async () => { const r = await POST("/api/admin/sample/load"); toast(`${r.records} sample records loaded`); G.optCache = {}; render(); }) }, "Load sample data")) : null,
      G.me.user.role === "SaaS Super Admin" ? card("Organizations (tenants)", h("p", {}, `${G.me.tenants.length} organization(s) on this installation. Each organization's data is isolated from the others.`), h("button", { class: "btn", onclick: newOrg }, "Add organization")) : null,
      can("workflow", 4) ? card("Scheduler", h("p", {}, "Scheduled and date-based workflows run every minute in the background. Run them now to see the effect immediately."), h("button", { class: "btn", onclick: act(async () => { const r = await POST("/api/scheduler/run"); toast(`${r.workflows_started} workflow run(s) started, ${r.flagged} overdue item(s) flagged`); }) }, "Run scheduler now")) : null));
};


