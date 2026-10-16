"use strict";

const cfg = window.APP_CONFIG || {};
const DEMO = !cfg.SUPABASE_URL || cfg.SUPABASE_URL.startsWith("YOUR_");

const STATUS_LABEL = { normal: "정상", watch: "관찰", alert: "주의" };
const $ = (id) => document.getElementById(id);

/* ---------- 유틸 ---------- */
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const fmtNum = (v, d = 1) => (v == null || v === "" ? "-" : Number(v).toLocaleString("ko-KR", { maximumFractionDigits: d }));
const fmtEok = (v) => (v == null || v === "" ? "-" : fmtNum(v) + "억");
const moic = (c) => (c.fair_value != null && Number(c.invested_amount) > 0 ? Number(c.fair_value) / Number(c.invested_amount) : null);
const fmtMoic = (m) => (m == null ? "-" : m.toFixed(2) + "x");

/* ---------- 데이터 계층 ---------- */
const store = DEMO ? createDemoStore() : createSupabaseStore();

function createSupabaseStore() {
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    async getUser() {
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.user : null;
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error("로그인에 실패했습니다. 이메일/비밀번호를 확인하세요.");
      return data.user;
    },
    async signOut() { await sb.auth.signOut(); },
    async getRole(user) {
      const { data } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
      return data ? data.role : null; // null = 허용되지 않은 사용자
    },
    async listCompanies() { return check(await sb.from("companies").select("*")); },
    async saveCompany(c) {
      if (c.id) {
        const { id, ...rest } = c;
        return check(await sb.from("companies").update(rest).eq("id", id).select().single());
      }
      return check(await sb.from("companies").insert(c).select().single());
    },
    async deleteCompany(id) { check(await sb.from("companies").delete().eq("id", id)); },
    async listUpdates(companyId) {
      return check(await sb.from("company_updates").select("*").eq("company_id", companyId).order("reported_on", { ascending: false }));
    },
    async addUpdate(u) { return check(await sb.from("company_updates").insert(u).select().single()); },
    async deleteUpdate(id) { check(await sb.from("company_updates").delete().eq("id", id)); },
  };
}

function createDemoStore() {
  let seq = 100;
  const companies = [
    { id: "d1", name: "샘플바이오", sector: "바이오", invest_date: "2022-03-15", stage: "Series A", invested_amount: 30, ownership_pct: 8.5, manager: "홍길동", status: "normal", latest_valuation: 520, fair_value: 44, exit_plan: "2027년 IPO 추진", memo: "" },
    { id: "d2", name: "데모로보틱스", sector: "로봇", invest_date: "2021-11-02", stage: "Series B", invested_amount: 50, ownership_pct: 6.2, manager: "김영희", status: "watch", latest_valuation: 700, fair_value: 43, exit_plan: "M&A 검토", memo: "신제품 출시 지연" },
    { id: "d3", name: "예시소프트", sector: "SaaS", invest_date: "2023-06-20", stage: "Seed", invested_amount: 15, ownership_pct: 12, manager: "홍길동", status: "alert", latest_valuation: 90, fair_value: 10.8, exit_plan: "", memo: "현금 6개월분 미만" },
    { id: "d4", name: "테스트모빌리티", sector: "모빌리티", invest_date: "2020-09-01", stage: "Pre-IPO", invested_amount: 40, ownership_pct: 4.1, manager: "김영희", status: "normal", latest_valuation: 1800, fair_value: 74, exit_plan: "2026년 하반기 상장 예정", memo: "" },
  ];
  const updates = [
    { id: "u1", company_id: "d1", reported_on: "2026-06-30", revenue: 12.4, operating_profit: -3.1, cash: 28, headcount: 42, comment: "2분기 매출 전분기 대비 +18%" },
    { id: "u2", company_id: "d3", reported_on: "2026-06-30", revenue: 2.1, operating_profit: -2.6, cash: 3.2, headcount: 11, comment: "브릿지 투자 협의 중" },
  ];
  const user = { id: "demo", email: "demo@example.com" };
  let signedIn = true;
  return {
    async getUser() { return signedIn ? user : null; },
    async signIn() { signedIn = true; return user; },
    async signOut() { signedIn = false; },
    async getRole() { return "editor"; },
    async listCompanies() { return companies.map((c) => ({ ...c })); },
    async saveCompany(c) {
      if (c.id) {
        const i = companies.findIndex((x) => x.id === c.id);
        companies[i] = { ...companies[i], ...c };
        return { ...companies[i] };
      }
      const row = { ...c, id: "d" + ++seq };
      companies.push(row);
      return { ...row };
    },
    async deleteCompany(id) {
      companies.splice(companies.findIndex((x) => x.id === id), 1);
      for (let i = updates.length - 1; i >= 0; i--) if (updates[i].company_id === id) updates.splice(i, 1);
    },
    async listUpdates(companyId) {
      return updates.filter((u) => u.company_id === companyId).sort((a, b) => b.reported_on.localeCompare(a.reported_on)).map((u) => ({ ...u }));
    },
    async addUpdate(u) { const row = { ...u, id: "u" + ++seq }; updates.push(row); return { ...row }; },
    async deleteUpdate(id) { updates.splice(updates.findIndex((x) => x.id === id), 1); },
  };
}

/* ---------- 상태 ---------- */
let currentUser = null;
let role = null;
let companies = [];
let editingId = null; // null = 신규
const canEdit = () => role === "editor";

/* ---------- 화면 전환 ---------- */
function show(view) {
  $("login-view").hidden = view !== "login";
  $("app-view").hidden = view !== "app";
}

async function enterApp(user) {
  currentUser = user;
  role = await store.getRole(user);
  if (!role) {
    await store.signOut();
    show("login");
    $("login-error").textContent = "접근 권한이 없는 계정입니다. 관리자에게 문의하세요.";
    return;
  }
  $("user-info").textContent = `${user.email} (${canEdit() ? "편집" : "조회"})`;
  $("btn-add").hidden = !canEdit();
  show("app");
  await loadCompanies();
}

async function loadCompanies() {
  $("load-error").textContent = "";
  try {
    companies = await store.listCompanies();
  } catch (e) {
    companies = [];
    $("load-error").textContent = "데이터를 불러오지 못했습니다: " + e.message;
  }
  render();
}

/* ---------- 렌더링 ---------- */
function filteredCompanies() {
  const q = $("filter-text").value.trim().toLowerCase();
  const st = $("filter-status").value;
  const sort = $("sort").value;
  const list = companies.filter((c) => {
    if (st && c.status !== st) return false;
    if (!q) return true;
    return [c.name, c.sector, c.manager].some((v) => (v || "").toLowerCase().includes(q));
  });
  const key = {
    name: (a, b) => (a.name || "").localeCompare(b.name || "", "ko"),
    invest_date: (a, b) => (b.invest_date || "").localeCompare(a.invest_date || ""),
    invested_amount: (a, b) => Number(b.invested_amount) - Number(a.invested_amount),
    moic: (a, b) => (moic(b) ?? -1) - (moic(a) ?? -1),
  }[sort];
  return list.sort(key);
}

function renderSummary() {
  const invested = companies.reduce((s, c) => s + Number(c.invested_amount || 0), 0);
  const valued = companies.filter((c) => c.fair_value != null);
  const fair = valued.reduce((s, c) => s + Number(c.fair_value), 0);
  const base = valued.reduce((s, c) => s + Number(c.invested_amount || 0), 0);
  const attention = companies.filter((c) => c.status !== "normal").length;
  const stats = [
    ["투자 회사", companies.length + "개"],
    ["총 투자금액", fmtEok(invested)],
    ["총 평가액", valued.length ? fmtEok(fair) : "-"],
    ["전체 MOIC", base > 0 ? fmtMoic(fair / base) : "-"],
    ["관찰·주의", attention + "개"],
  ];
  $("summary").innerHTML = stats
    .map(([l, v]) => `<div class="card stat"><div class="label">${esc(l)}</div><div class="value">${esc(v)}</div></div>`)
    .join("");
}

function renderCards() {
  const list = filteredCompanies();
  if (!list.length) {
    $("cards").innerHTML = `<p class="empty">${companies.length ? "조건에 맞는 회사가 없습니다." : "등록된 회사가 없습니다."}</p>`;
    return;
  }
  $("cards").innerHTML = list
    .map(
      (c) => `
    <button type="button" class="card company" data-id="${esc(c.id)}">
      <div class="row-head">
        <div>
          <div class="name">${esc(c.name)}</div>
          <div class="sub">${esc([c.sector, c.stage].filter(Boolean).join(" · ") || "-")}</div>
        </div>
        <span class="badge ${esc(c.status)}">${esc(STATUS_LABEL[c.status] || c.status)}</span>
      </div>
      <dl>
        <dt>투자금액</dt><dd>${esc(fmtEok(c.invested_amount))}</dd>
        <dt>지분율</dt><dd>${c.ownership_pct == null ? "-" : esc(fmtNum(c.ownership_pct)) + "%"}</dd>
        <dt>평가액</dt><dd>${esc(fmtEok(c.fair_value))}</dd>
        <dt>MOIC</dt><dd>${esc(fmtMoic(moic(c)))}</dd>
        <dt>투자일</dt><dd>${esc(c.invest_date || "-")}</dd>
        <dt>담당</dt><dd>${esc(c.manager || "-")}</dd>
      </dl>
    </button>`
    )
    .join("");
}

function render() {
  renderSummary();
  renderCards();
}

/* ---------- 다이얼로그 ---------- */
const dialog = $("detail-dialog");
const form = $("company-form");

function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const strOrNull = (v) => (v === "" || v == null ? null : v);

function openDialog(company) {
  editingId = company ? company.id : null;
  form.reset();
  $("form-error").textContent = "";
  $("dialog-title").textContent = company ? company.name : "회사 추가";
  if (company) {
    for (const el of form.elements) {
      if (el.name && company[el.name] != null) el.value = company[el.name];
    }
  }
  $("company-fields").disabled = !canEdit();
  $("company-actions").hidden = !canEdit();
  $("btn-delete").hidden = !company;
  $("updates-section").hidden = !company;
  $("update-form").hidden = !canEdit();
  if (company) {
    $("update-form").reset();
    $("update-form").elements.reported_on.value = new Date().toISOString().slice(0, 10);
    loadUpdates();
  }
  dialog.showModal();
}

async function loadUpdates() {
  const tbody = $("updates-table").querySelector("tbody");
  const id = editingId;
  let rows = [];
  try {
    rows = await store.listUpdates(id);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="error">${esc(e.message)}</td></tr>`;
    return;
  }
  if (id !== editingId) return; // 그 사이 다른 회사로 바뀐 경우
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center">이력이 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (u) => `<tr>
      <td>${esc(u.reported_on)}</td>
      <td>${esc(fmtNum(u.revenue))}</td>
      <td>${esc(fmtNum(u.operating_profit))}</td>
      <td>${esc(fmtNum(u.cash))}</td>
      <td>${esc(fmtNum(u.headcount, 0))}</td>
      <td>${esc(u.comment || "")}</td>
      <td>${canEdit() ? `<button type="button" class="btn" data-del-update="${esc(u.id)}">삭제</button>` : ""}</td>
    </tr>`
    )
    .join("");
}

/* ---------- CSV ---------- */
function exportCsv() {
  const cols = [
    ["name", "회사명"], ["sector", "업종"], ["invest_date", "투자일"], ["stage", "투자단계"],
    ["invested_amount", "투자금액(억)"], ["ownership_pct", "지분율(%)"], ["manager", "담당"],
    ["status", "상태"], ["latest_valuation", "최근밸류(억)"], ["fair_value", "평가액(억)"],
    ["exit_plan", "회수계획"], ["memo", "메모"],
  ];
  // 스프레드시트 수식 주입 방지: = + - @ 로 시작하는 문자열 앞에 ' 를 붙임
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const lines = [cols.map(([, h]) => cell(h)).join(",")];
  for (const c of companies) {
    lines.push(cols.map(([k]) => cell(k === "status" ? STATUS_LABEL[c[k]] : c[k])).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- 이벤트 ---------- */
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";
  try {
    const user = await store.signIn($("login-email").value.trim(), $("login-password").value);
    $("login-password").value = "";
    await enterApp(user);
  } catch (err) {
    $("login-error").textContent = err.message;
  }
});

$("btn-logout").addEventListener("click", async () => {
  await store.signOut();
  companies = [];
  currentUser = null;
  role = null;
  show("login");
});

$("btn-add").addEventListener("click", () => openDialog(null));
$("btn-export").addEventListener("click", exportCsv);
$("btn-close").addEventListener("click", () => dialog.close());

$("cards").addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (!card) return;
  openDialog(companies.find((c) => c.id === card.dataset.id));
});

for (const id of ["filter-text", "filter-status", "sort"]) $(id).addEventListener("input", renderCards);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!canEdit()) return;
  const fd = new FormData(form);
  const row = {
    name: String(fd.get("name")).trim(),
    sector: strOrNull(fd.get("sector")),
    invest_date: strOrNull(fd.get("invest_date")),
    stage: strOrNull(fd.get("stage")),
    invested_amount: numOrNull(fd.get("invested_amount")) ?? 0,
    ownership_pct: numOrNull(fd.get("ownership_pct")),
    manager: strOrNull(fd.get("manager")),
    status: fd.get("status"),
    latest_valuation: numOrNull(fd.get("latest_valuation")),
    fair_value: numOrNull(fd.get("fair_value")),
    exit_plan: strOrNull(fd.get("exit_plan")),
    memo: strOrNull(fd.get("memo")),
  };
  if (editingId) row.id = editingId;
  $("btn-save").disabled = true;
  try {
    await store.saveCompany(row);
    dialog.close();
    await loadCompanies();
  } catch (err) {
    $("form-error").textContent = "저장 실패: " + err.message;
  } finally {
    $("btn-save").disabled = false;
  }
});

$("btn-delete").addEventListener("click", async () => {
  if (!editingId || !canEdit()) return;
  const c = companies.find((x) => x.id === editingId);
  if (!confirm(`'${c ? c.name : ""}' 회사와 모든 현황 이력을 삭제할까요? 되돌릴 수 없습니다.`)) return;
  try {
    await store.deleteCompany(editingId);
    dialog.close();
    await loadCompanies();
  } catch (err) {
    $("form-error").textContent = "삭제 실패: " + err.message;
  }
});

$("update-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!canEdit() || !editingId) return;
  const fd = new FormData($("update-form"));
  try {
    await store.addUpdate({
      company_id: editingId,
      reported_on: fd.get("reported_on"),
      revenue: numOrNull(fd.get("revenue")),
      operating_profit: numOrNull(fd.get("operating_profit")),
      cash: numOrNull(fd.get("cash")),
      headcount: numOrNull(fd.get("headcount")),
      comment: strOrNull(fd.get("comment")),
    });
    const date = fd.get("reported_on");
    $("update-form").reset();
    $("update-form").elements.reported_on.value = date;
    await loadUpdates();
  } catch (err) {
    $("form-error").textContent = "이력 추가 실패: " + err.message;
  }
});

$("updates-table").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-del-update]");
  if (!btn || !canEdit()) return;
  if (!confirm("이 이력을 삭제할까요?")) return;
  try {
    await store.deleteUpdate(btn.dataset.delUpdate);
    await loadUpdates();
  } catch (err) {
    $("form-error").textContent = "삭제 실패: " + err.message;
  }
});

/* ---------- 시작 ---------- */
(async function init() {
  $("demo-banner").hidden = !DEMO;
  try {
    const user = await store.getUser();
    if (user) await enterApp(user);
    else show("login");
  } catch (e) {
    show("login");
    $("login-error").textContent = "초기화 오류: " + e.message;
  }
})();
