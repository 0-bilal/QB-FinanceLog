/* app.js — UI / Logic Only (No persistence)
   -----------------------------------------
   👈 متوقع توفّر كائن global باسم `store` في ملف التخزين لاحقًا.
   واجهة `store` المقترحة (Promisified):
   - store.init()
   - store.getSettings() -> { currency, locale, dateStart, theme, ... }
   - store.getDashboardSummary() -> { totalBalance, monthIncome, monthExpense, netSaving, savingRate, spendRate }
   - store.getLatestTransactions(limit=5) -> [ {id, dateISO, amount, type:'income'|'expense', category, desc, accountName} ]
   - store.getAlerts() -> [ { id, type:'info'|'warn'|'error'|'success', text } ]
   - store.clearAlerts()
   - store.listAccountsSummary() -> [ {id, name, type, balance, income, expense, opsCount, lastActivityISO, status} ]
   - store.getSelectLists() -> { categories:[{id,name}], accounts:[{id,name}] }
   - store.addTransaction(tx) -> {ok, id}
   - store.addDebt(d) -> {ok, id}
   - store.addObligation(o) -> {ok, id}
   - store.listObligations() -> [...]
   - store.addBill(b) -> {ok, id}
   - store.addFine(f) -> {ok, id}
   - store.getReports() -> {
       totalIncome, totalExpense, totalSaving, savingRate,
       byCategory:[{category, amount, rate}],
       receivables, payables,
       kpis:{ saving, fixedOblig, dailySpend, emergency }
     }
   ملاحظة: يمكنك تعديل/توسيع الواجهة لاحقًا وسأكيّف الكود بسرعة.
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)];

  const defaultLocale = "ar-SA";
  const nf = (n, locale) =>
    isFinite(n) ? n.toLocaleString(locale || defaultLocale, { maximumFractionDigits: 2 }) : "—";
  const nf0 = (n, locale) =>
    isFinite(n) ? n.toLocaleString(locale || defaultLocale, { maximumFractionDigits: 0 }) : "—";
  const df = (iso, locale) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat(locale || defaultLocale, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(d);
    } catch {
      return "—";
    }
  };

  const todayStr = (locale) =>
    new Intl.DateTimeFormat(locale || defaultLocale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date());

  const toast = (msg, opts = {}) => {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    if (opts.type) {
      el.dataset.type = opts.type;
    }
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => el.classList.add("hidden"), opts.timeout || 2600);
  };

  const openDialog = (id) => {
    const dlg = $(id);
    if (dlg && typeof dlg.showModal === "function") dlg.showModal();
  };
  const closeDialog = (id) => {
    const dlg = $(id);
    if (dlg && typeof dlg.close === "function") dlg.close();
  };

  // حراسة ناعمة عند غياب ملف التخزين
  const hasStore = () => typeof window.store === "object" && window.store !== null;
  const safe = async (fnName, ...args) => {
    if (!hasStore()) {
      console.warn(`[store missing] call skipped: ${fnName}`, args);
      toast("⚠️ ربط التخزين غير مفعّل. سيتم التفعيل عند إضافة ملف التخزين.", { type: "warn" });
      return null;
    }
    try {
      const fn = window.store[fnName];
      if (typeof fn !== "function") {
        console.warn(`[store method missing] ${fnName}`);
        toast("⚠️ دالة التخزين غير متاحة حاليًا.", { type: "warn" });
        return null;
      }
      return await fn(...args);
    } catch (e) {
      console.error(`[store error] ${fnName}`, e);
      toast("حدث خطأ أثناء التعامل مع التخزين.", { type: "error" });
      return null;
    }
  };

  // ---------- State ----------
  const State = {
    locale: defaultLocale,
    currency: "SAR",
    theme: "system",
    navSection: "dashboard",
  };

  // ---------- Navigation ----------
  function initNav() {
    const links = qa(".nav-link");
    links.forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const sec = a.dataset.section;
        navigateTo(sec);
      });
    });

    // hash-based navigation
    const hash = (location.hash || "#dashboard").replace("#", "");
    navigateTo(hash);

    // sidebar toggle (mobile)
    const btn = $("btnToggleSidebar");
    const sidebar = $("sidebar");
    if (btn && sidebar) {
      btn.addEventListener("click", () => {
        sidebar.classList.toggle("is-open");
        btn.setAttribute(
          "aria-expanded",
          sidebar.classList.contains("is-open") ? "true" : "false"
        );
      });
      // Close sidebar when clicking a link (on mobile)
      qa(".sidebar .nav-link").forEach((link) =>
        link.addEventListener("click", () => sidebar.classList.remove("is-open"))
      );
    }
  }

  function navigateTo(sectionId) {
    State.navSection = sectionId;
    // active link
    qa(".nav-link").forEach((el) =>
      el.classList.toggle("is-active", el.dataset.section === sectionId)
    );
    // sections toggle
    qa(".section").forEach((sec) =>
      sec.classList.toggle("is-visible", sec.dataset.section === sectionId)
    );
    history.replaceState(null, "", `#${sectionId}`);

    // render on demand
    if (sectionId === "dashboard") renderDashboard();
    else if (sectionId === "accounts") renderAccounts();
    else if (sectionId === "info") initInfoForm(); // ensures selects are filled
    else if (sectionId === "debts") initDebtForm();
    else if (sectionId === "oblig") renderObligations();
    else if (sectionId === "bills") initBillsForm();
    else if (sectionId === "fines") initFinesForm();
    else if (sectionId === "reports") renderReports();
    else if (sectionId === "settings") initSettings();
  }

  // ---------- Renderers: Dashboard ----------
  async function renderDashboard() {
    $("todayLabel").textContent = todayStr(State.locale);

    const summary = (await safe("getDashboardSummary")) || {
      totalBalance: 0,
      monthIncome: 0,
      monthExpense: 0,
      netSaving: 0,
      savingRate: 0,
      spendRate: 0,
    };

    $("totalBalance").textContent = nf(summary.totalBalance, State.locale);
    $("monthIncome").textContent = nf(summary.monthIncome, State.locale);
    $("monthExpense").textContent = nf(summary.monthExpense, State.locale);
    $("netSaving").textContent = nf(summary.netSaving, State.locale);

    // progress bars
    $("savingRate").value = Math.max(0, Math.min(100, summary.savingRate || 0));
    $("savingRateLabel").textContent = `${Math.round(summary.savingRate || 0)}%`;

    $("spendRate").value = Math.max(0, Math.min(100, summary.spendRate || 0));
    $("spendRateLabel").textContent = `${Math.round(summary.spendRate || 0)}%`;

    // latest transactions
    const list = $("latestTransactions");
    list.innerHTML = "";
    const txs = (await safe("getLatestTransactions", 6)) || [];
    if (!txs.length) {
      const li = document.createElement("li");
      li.className = "tx-item";
      li.innerHTML = `<div class="tx-left"><span class="tx-cat">—</span><span class="tx-desc">لا توجد عمليات بعد</span></div>`;
      list.appendChild(li);
    } else {
      const tpl = $("tpl-transaction-item");
      txs.forEach((tx) => {
        const node = tpl.content.firstElementChild.cloneNode(true);
        node.dataset.id = tx.id || "";
        q(".tx-cat", node).textContent = tx.category || (tx.type === "income" ? "دخل" : "مصروف");
        q(".tx-desc", node).textContent = tx.desc || "—";
        q(".tx-date", node).textContent = df(tx.dateISO, State.locale);
        q(".tx-amount", node).textContent = (tx.type === "expense" ? "-" : "+") + nf(tx.amount, State.locale);
        list.appendChild(node);
      });
    }

    // alerts
    await renderAlerts();
  }

  async function renderAlerts() {
    const alertsEl = $("alertsList");
    alertsEl.innerHTML = "";
    const alerts = (await safe("getAlerts")) || [];
    if (!alerts.length) return;

    const tpl = $("tpl-alert-item");
    alerts.forEach((a) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.type = a.type || "info";
      q(".alert-text", node).textContent = a.text || "—";
      const btn = q(".alert-dismiss", node);
      btn.addEventListener("click", async () => {
        await safe("clearAlerts"); // اختصار لمسح الكل (يمكن جعلها per id لاحقًا)
        renderAlerts();
      });
      alertsEl.appendChild(node);
    });
  }

  // ---------- Renderers: Accounts ----------
  async function renderAccounts() {
    // cards
    const grid = $("accountsGrid");
    grid.innerHTML = "";
    const tableBody = q("#accountsTable tbody");
    tableBody.innerHTML = "";

    const rows = (await safe("listAccountsSummary")) || [];
    const cardTpl = $("tpl-account-card");
    const rowTpl = $("tpl-accounts-row");

    rows.forEach((acc) => {
      // card
      const c = cardTpl.content.firstElementChild.cloneNode(true);
      c.dataset.id = acc.id || "";
      q(".account-name", c).textContent = acc.name || "—";
      q(".account-type", c).textContent = acc.type || "—";
      q(".acc-balance", c).textContent = nf(acc.balance, State.locale);
      q(".acc-income", c).textContent = nf(acc.income, State.locale);
      q(".acc-expense", c).textContent = nf(acc.expense, State.locale);
      grid.appendChild(c);

      // row
      const r = rowTpl.content.firstElementChild.cloneNode(true);
      r.dataset.id = acc.id || "";
      q(".td-name", r).textContent = acc.name || "—";
      q(".td-type", r).textContent = acc.type || "—";
      q(".td-balance", r).textContent = nf(acc.balance, State.locale);
      q(".td-count", r).textContent = nf0(acc.opsCount || 0, State.locale);
      q(".td-last", r).textContent = df(acc.lastActivityISO, State.locale);
      q(".td-status", r).textContent = acc.status || "—";
      tableBody.appendChild(r);
    });
  }

  // ---------- Forms: Info (Transactions) ----------
  let selectsFilled = { info: false, bills: false, fines: false, debts: false };

  async function fillSelectListsFor(ids = []) {
    const lists = (await safe("getSelectLists")) || { categories: [], accounts: [] };
    ids.forEach((id) => {
      const sel = $(id);
      if (!sel) return;
      const isCat = id.toLowerCase().includes("category");
      const items = isCat ? lists.categories : lists.accounts;
      sel.innerHTML = items
        .map((x) => `<option value="${x.id}">${x.name}</option>`)
        .join("");
    });
  }

  function initInfoForm() {
    if (!selectsFilled.info) {
      fillSelectListsFor(["category", "account"]);
      selectsFilled.info = true;
    }
  }

  function initBillsForm() {
    if (!selectsFilled.bills) {
      fillSelectListsFor(["billAccount"]);
      selectsFilled.bills = true;
    }
  }

  function initFinesForm() {
    if (!selectsFilled.fines) {
      fillSelectListsFor(["fineAccount"]);
      selectsFilled.fines = true;
    }
  }

  function initDebtForm() {
    if (!selectsFilled.debts) {
      fillSelectListsFor(["debtAccount"]);
      selectsFilled.debts = true;
    }
  }

  // submit handlers
  async function onTxnSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      type: form.opType.value, // 'income' | 'expense'
      amount: parseFloat(form.amount.value) || 0,
      desc: form.desc.value?.trim() || "",
      categoryId: form.category.value,
      accountId: form.account.value,
      dateISO: form.date.value ? new Date(form.date.value).toISOString() : new Date().toISOString(),
    };
    const res = await safe("addTransaction", payload);
    if (res?.ok) {
      form.reset();
      toast("تم حفظ العملية بنجاح ✅", { type: "success" });
      // refresh dashboard + accounts
      if (State.navSection === "dashboard") renderDashboard();
      if (State.navSection === "accounts") renderAccounts();
    }
  }

  async function onDebtSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      type: form.debtType.value, // 'receivable'|'payable'
      amount: parseFloat(form.debtAmount.value) || 0,
      desc: form.debtDesc.value?.trim() || "",
      accountId: form.debtAccount.value,
      dueISO: form.debtDue.value ? new Date(form.debtDue.value).toISOString() : null,
    };
    const res = await safe("addDebt", payload);
    if (res?.ok) {
      form.reset();
      toast("تم حفظ الدين بنجاح ✅", { type: "success" });
      if (State.navSection === "reports") renderReports();
    }
  }

  async function onObligSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      name: form.obligName.value?.trim(),
      amount: parseFloat(form.obligAmount.value) || 0,
      cycle: form.obligCycle.value, // 'monthly'|'yearly'
      category: form.obligCategory.value?.trim() || "",
      dueISO: form.obligDue.value ? new Date(form.obligDue.value).toISOString() : null,
      status: form.obligStatus.value || "active",
    };
    const res = await safe("addObligation", payload);
    if (res?.ok) {
      form.reset();
      toast("تم حفظ الالتزام ✅", { type: "success" });
      renderObligations();
      if (State.navSection === "reports") renderReports();
    }
  }

  async function onBillSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      name: form.billName.value?.trim(),
      amount: parseFloat(form.billAmount.value) || 0,
      accountId: form.billAccount.value,
      dateISO: form.billDate.value ? new Date(form.billDate.value).toISOString() : new Date().toISOString(),
      ref: form.billRef.value?.trim() || "",
    };
    const res = await safe("addBill", payload);
    if (res?.ok) {
      form.reset();
      toast("تم تسجيل سداد الفاتورة ✅", { type: "success" });
      renderDashboard();
      renderAccounts();
    }
  }

  async function onFineSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      authority: form.fineAuth.value?.trim(),
      amount: parseFloat(form.fineAmount.value) || 0,
      accountId: form.fineAccount.value,
      dateISO: form.fineDate.value ? new Date(form.fineDate.value).toISOString() : new Date().toISOString(),
      note: form.fineNote.value?.trim() || "",
    };
    const res = await safe("addFine", payload);
    if (res?.ok) {
      form.reset();
      toast("تم تسجيل سداد المخالفة ✅", { type: "success" });
      renderDashboard();
      renderAccounts();
    }
  }

  // ---------- Obligations table ----------
  async function renderObligations() {
    const tbody = q("#obligTable tbody");
    tbody.innerHTML = "";
    const list = (await safe("listObligations")) || [];
    const tpl = $("tpl-oblig-row");
    list.forEach((o) => {
      const tr = tpl.content.firstElementChild.cloneNode(true);
      tr.dataset.id = o.id || "";
      q(".td-name", tr).textContent = o.name || "—";
      q(".td-cat", tr).textContent = o.category || "—";
      q(".td-cycle", tr).textContent = o.cycle === "yearly" ? "سنوي" : "شهري";
      q(".td-amount", tr).textContent = nf(o.amount, State.locale);
      q(".td-due", tr).textContent = df(o.dueISO, State.locale);
      q(".td-status", tr).textContent = o.status || "active";
      const btnEdit = q('[data-action="edit"]', tr);
      const btnDel = q('[data-action="delete"]', tr);
      btnEdit.addEventListener("click", () => {
        toast("ميزة التعديل ستُفعَّل لاحقًا ✏️");
      });
      btnDel.addEventListener("click", () => {
        toast("ميزة الحذف ستُفعَّل لاحقًا 🗑️");
      });
      tbody.appendChild(tr);
    });
  }

  // ---------- Reports ----------
  async function renderReports() {
    const rep = (await safe("getReports")) || {
      totalIncome: 0,
      totalExpense: 0,
      totalSaving: 0,
      savingRate: 0,
      byCategory: [],
      receivables: 0,
      payables: 0,
      kpis: { saving: 0, fixedOblig: 0, dailySpend: 0, emergency: 0 },
    };

    $("repTotalIncome").textContent = nf(rep.totalIncome, State.locale);
    $("repTotalExpense").textContent = nf(rep.totalExpense, State.locale);
    $("repTotalSaving").textContent = nf(rep.totalSaving, State.locale);
    $("repSavingRate").textContent = `${Math.round(rep.savingRate || 0)}%`;

    // byCategory table
    const tbody = q("#byCategory tbody");
    tbody.innerHTML = "";
    const tpl = $("tpl-bycat-row");
    (rep.byCategory || []).forEach((row) => {
      const tr = tpl.content.firstElementChild.cloneNode(true);
      q(".td-cat", tr).textContent = row.category || "—";
      q(".td-amount", tr).textContent = nf(row.amount, State.locale);
      q(".td-rate", tr).textContent = `${Math.round(row.rate || 0)}%`;
      tbody.appendChild(tr);
    });

    // small debt summary
    $("repReceivables").textContent = nf(rep.receivables || 0, State.locale);
    $("repPayables").textContent = nf(rep.payables || 0, State.locale);

    // KPIs progress
    $("kpiSaving").value = clamp0to100(rep.kpis?.saving);
    $("kpiSavingLabel").textContent = `${Math.round(rep.kpis?.saving || 0)}%`;

    $("kpiFixedOblig").value = clamp0to100(rep.kpis?.fixedOblig);
    $("kpiFixedObligLabel").textContent = `${Math.round(rep.kpis?.fixedOblig || 0)}%`;

    $("kpiDailySpend").value = clamp0to100(rep.kpis?.dailySpend);
    $("kpiDailySpendLabel").textContent = nf(rep.kpis?.dailySpend || 0, State.locale);

    $("kpiEmergency").value = clamp0to100(rep.kpis?.emergency);
    $("kpiEmergencyLabel").textContent = `${Math.round(rep.kpis?.emergency || 0)}%`;
  }

  function clamp0to100(v) {
    v = Number(v) || 0;
    return Math.max(0, Math.min(100, v));
  }

  // ---------- Settings ----------
  async function initSettings() {
    const s = (await safe("getSettings")) || {};
    if (s.currency) State.currency = s.currency;
    if (s.locale) State.locale = s.locale;
    if (s.theme) State.theme = s.theme;

    // تعبئة الحقول (إن وجدت)
    if ($("currency")) $("currency").value = s.currency || State.currency;
    if ($("locale")) $("locale").value = s.locale || State.locale;
    if ($("theme")) $("theme").value = s.theme || State.theme;
    if ($("dateStart")) $("dateStart").value = s.dateStart || 1;
  }

  // ---------- Wireup ----------
  function wireForms() {
    const txnForm = $("txnForm");
    if (txnForm) txnForm.addEventListener("submit", onTxnSubmit);

    const debtForm = $("debtForm");
    if (debtForm) debtForm.addEventListener("submit", onDebtSubmit);

    const obligForm = $("obligForm");
    if (obligForm) obligForm.addEventListener("submit", onObligSubmit);

    const billForm = $("billForm");
    if (billForm) billForm.addEventListener("submit", onBillSubmit);

    const fineForm = $("fineForm");
    if (fineForm) fineForm.addEventListener("submit", onFineSubmit);

    // clear alerts
    const btnClearAlerts = $("btnClearAlerts");
    if (btnClearAlerts)
      btnClearAlerts.addEventListener("click", async () => {
        await safe("clearAlerts");
        renderAlerts();
      });

    // dialogs
    const btnQuickAdd = $("btnQuickAdd");
    if (btnQuickAdd) btnQuickAdd.addEventListener("click", () => openDialog("dlgQuickAdd"));
    qa("[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => openDialog(btn.dataset.open));
    });

    // export/import (سيتم تمكينها مع التخزين)
    const btnExport = $("btnExport");
    if (btnExport) btnExport.addEventListener("click", () => toast("ميزة التصدير ستُفعل مع التخزين 💾"));

    const btnImport = $("btnImport");
    if (btnImport) btnImport.addEventListener("click", () => toast("ميزة الاستيراد ستُفعل مع التخزين 📥"));
  }

  async function boot() {
    // حاول قراءة الإعدادات أولاً
    if (hasStore() && typeof window.store.init === "function") {
      await safe("init");
    }
    const s = (await safe("getSettings")) || {};
    State.locale = s.locale || State.locale;
    State.currency = s.currency || State.currency;
    State.theme = s.theme || State.theme;

    $("todayLabel") && ( $("todayLabel").textContent = todayStr(State.locale) );

    initNav();
    wireForms();

    // render initial section
    if (State.navSection === "dashboard") renderDashboard();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
