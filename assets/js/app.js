/* app.js — واجهة وتفاعلات التطبيق
   يعتمد على FinanceStorage من storage.js
*/

(() => {
  // ---------- Utilities ----------
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const SAR_FMT = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 });
  const NUM_FMT = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 });

  const formatCurrency = (n) => (isFinite(n) ? SAR_FMT.format(+n || 0) : "—");
  const formatDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "2-digit" });
    } catch { return iso || ""; }
  };
  const parseAmount = (v) => {
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
    return isFinite(n) ? n : 0;
  };

  // Toast notification (مستقل عن CSS خارجي)
  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    const bg = type === "success" ? "linear-gradient(135deg,#16a34a66,#16a34a22)" : "linear-gradient(135deg,#ef444466,#ef444422)";
    toast.style.cssText = `
      position: fixed; top: 80px; right: 20px; z-index: 2000;
      color: #fff; padding: 14px 18px; border-radius: 12px;
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.25); box-shadow: 0 10px 30px rgba(0,0,0,.25);
      background: ${bg}; font-weight: 700; max-width: 80vw;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ---------- App Core ----------
  class FinanceApp {
    constructor() {
      // يتطلب FinanceStorage من storage.js
      this.store = new FinanceStorage();

      // الحالة
      this.currentTab = "dashboard";
      this.activePeriod = "week"; // للفلاتر

      // تشغيل init مهما كان توقيت تحميل السكربت
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.init());
      } else {
        this.init();
      }
    }

    init() {
      this.ensureDefaultDates();
      this.setupNavigation();
      this.setupModals();
      this.setupButtons();
      this.setupForms();

      // مزامنة القوائم من التخزين
      this.renderAccountsSelect();
      this.renderCategoriesSelect();
      this.renderPeopleList();

      this.refreshAllViews();
    }

    // ضبط قيمة اليوم لكل حقول التاريخ الفارغة
    ensureDefaultDates() {
      const today = new Date().toISOString().split("T")[0];
      $$('input[type="date"]').forEach((el) => { if (!el.value) el.value = today; });
    }

    // ---------- Navigation ----------
    setupNavigation() {
      $$(".nav-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tab = btn.getAttribute("data-tab");
          this.switchTab(tab);
        });
      });

      // "عرض الكل" في لوحة التحكم
      $("#see-all-transactions")?.addEventListener("click", () => this.switchTab("transactions"));

      // فلاتر الفترة في صفحة المعاملات
      this.bindPeriodFilters();
      this.switchTab("dashboard");
    }

    switchTab(tabName) {
      if (!tabName) return;
      $$(".tab-content").forEach((c) => c.classList.remove("active"));
      $$(".nav-tab").forEach((b) => b.classList.remove("active"));

      const content = $("#" + tabName);
      const navBtn  = $(`.nav-tab[data-tab="${tabName}"]`);
      if (content && navBtn) {
        content.classList.add("active");
        navBtn.classList.add("active");
        this.currentTab = tabName;
      }

      // تحديث الصفحة الحالية
      switch (tabName) {
        case "dashboard":    return this.updateDashboard();
        case "transactions": return this.updateTransactionsView();
        case "accounts":     return this.updateAccountsView();
        case "debts":        return this.updateDebtsView();
        case "savings":      return this.updateSavingsView();
        case "settings":     return this.updateSettingsView();
      }
    }

    bindPeriodFilters() {
      $$(".period-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          $$(".period-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.activePeriod = btn.getAttribute("data-period") || "week";
          this.updateTransactionsView();
        });
      });
    }

    // ---------- Modals ----------
    setupModals() {
      // إغلاق بالأزرار
      $$(".modal .close").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const modal = e.currentTarget.closest(".modal");
          if (modal) this.closeModal(modal.id);
        });
      });
      // إغلاق عند الضغط خارج المحتوى
      $$(".modal").forEach((m) => {
        m.addEventListener("click", (e) => {
          if (e.target === m) this.closeModal(m.id);
        });
      });
    }

    openModal(id) {
      const m = $("#" + id);
      if (!m) return;
      m.style.display = "block";
      setTimeout(() => {
        const first = m.querySelector("input,select,textarea,button");
        first?.focus();
      }, 60);
    }

    closeModal(id) {
      const m = $("#" + id);
      if (!m) return;
      m.style.display = "none";
      // إعادة ضبط النموذج داخلها
      m.querySelectorAll("form").forEach((f) => f.reset());
      this.ensureDefaultDates();
      // حدّث القوائم بعد الإغلاق (لو أضفت فئات/أشخاص)
      this.renderAccountsSelect();
      this.renderCategoriesSelect();
      this.renderPeopleList();
    }

    // ---------- Buttons / Quick Actions ----------
    setupButtons() {
      $("#add-income-btn")?.addEventListener("click", () => {
        this.renderAccountsSelect();
        this.openModal("transaction-modal");
        $("#transaction-type").value = "income";
      });
      $("#add-expense-btn")?.addEventListener("click", () => {
        this.renderAccountsSelect();
        this.openModal("transaction-modal");
        $("#transaction-type").value = "expense";
      });

      $("#add-transaction-btn")?.addEventListener("click", () => {
        this.renderAccountsSelect();
        this.openModal("transaction-modal");
      });
      $("#add-account-btn")?.addEventListener("click", () => this.openModal("account-modal"));
      $("#add-debt-btn")?.addEventListener("click", () => {
        this.injectDebtAccountSelectIfMissing();
        this.renderAccountsSelect();
        this.openModal("debt-modal");
      });
      $("#add-savings-goal-btn")?.addEventListener("click", () => this.openModal("savings-modal"));

      // الإعدادات
      $("#manage-categories-btn")?.addEventListener("click", () => this.openModal("categories-modal"));
      $("#manage-people-btn")?.addEventListener("click", () => this.openModal("people-modal"));

      // تصدير/مسح البيانات
      $("#export-data-btn")?.addEventListener("click", async () => {
        try {
          const { filename, blob } = await this.store.exportData();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click();
          a.remove(); URL.revokeObjectURL(url);
          showToast("تم تصدير البيانات بنجاح ✅");
        } catch (e) {
          console.error(e);
          showToast("تعذر تصدير البيانات", "error");
        }
      });

      $("#clear-all-data-btn")?.addEventListener("click", async () => {
        if (!confirm("هل أنت متأكد من مسح جميع البيانات؟ لا يمكن التراجع.")) return;
        await this.store.clearAllData();
        this.refreshAllViews();
        showToast("تم مسح جميع البيانات 🧹");
      });
    }

    // ---------- Forms ----------
    setupForms() {
      // معاملات
      $("#transaction-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = {
          type: $("#transaction-type").value,
          amount: parseAmount($("#transaction-amount").value),
          description: $("#transaction-description").value?.trim(),
          category: $("#transaction-category").value,
          account: $("#transaction-account").value,
          date: $("#transaction-date").value,
          notes: $("#transaction-notes").value?.trim(),
          createdAt: new Date().toISOString(),
        };
        if (!data.type || !data.amount || !data.category || !data.account || !data.date) {
          return showToast("الرجاء إكمال الحقول المطلوبة", "error");
        }
        await this.store.addTransaction(data);
        this.closeModal("transaction-modal");
        this.refreshAllViews();
        showToast("تم حفظ المعاملة 💾");
      });

      // حسابات
      $("#account-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = {
          name: $("#account-name").value?.trim(),
          type: $("#account-type").value,
          initialBalance: parseAmount($("#account-initial-balance").value),
          balance: parseAmount($("#account-initial-balance").value),
          createdAt: new Date().toISOString(),
        };
        if (!data.name || !data.type) return showToast("أكمل بيانات الحساب", "error");
        await this.store.addAccount(data);
        this.closeModal("account-modal");
        this.updateAccountsView();
        this.updateDashboard();
        this.renderAccountsSelect();
        showToast("تم إضافة الحساب ✅");
      });

      // حقن خانة حساب للدَّين إن لزم
      this.injectDebtAccountSelectIfMissing();

      // ديون
      $("#debt-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = {
          type: $("#debt-type").value,           // to-me | from-me
          personId: $("#debt-person").value,
          amount: parseAmount($("#debt-amount").value),
          description: $("#debt-description").value?.trim(),
          date: $("#debt-date").value,
          dueDate: $("#debt-date").value,
          status: "pending",
          notes: "",
          account: $("#debt-account")?.value || "",
          affectBalance: true
        };
        if (!data.type || !data.personId || !data.amount || !data.date) {
          return showToast("أكمل بيانات الدين", "error");
        }
        await this.store.addDebt(data);
        this.closeModal("debt-modal");
        this.updateDebtsView();
        this.updateDashboard();
        showToast("تم حفظ الدين 🤝");
      });

      // أهداف الادخار
      $("#savings-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = {
          name: $("#savings-goal-name").value?.trim(),
          targetAmount: parseAmount($("#savings-target-amount").value),
          currentAmount: parseAmount($("#savings-current-amount").value),
          targetDate: $("#savings-target-date").value || "",
          description: "",
          createdAt: new Date().toISOString(),
        };
        if (!data.name || !data.targetAmount) {
          return showToast("أدخل اسم الهدف والمبلغ المستهدف", "error");
        }
        await this.store.addSavingsGoal(data);
        this.closeModal("savings-modal");
        this.updateSavingsView();
        this.updateDashboard();
        showToast("تم إضافة هدف الادخار 🎯");
      });

      // فئات
      $("#add-category-btn")?.addEventListener("click", async () => {
        const name = $("#new-category-name").value?.trim();
        const type = $("#new-category-type").value;
        if (!name) return showToast("أدخل اسم الفئة", "error");
        await this.store.addCategory({ name, type, icon: "🏷️", color: "#ccc" });
        $("#new-category-name").value = "";
        this.renderCategoriesList();
        this.renderCategoriesSelect();
        showToast("تمت إضافة الفئة 📋");
      });

      // أشخاص
      $("#add-person-btn")?.addEventListener("click", async () => {
        const name = $("#new-person-name").value?.trim();
        const phone = $("#new-person-phone").value?.trim();
        if (!name) return showToast("أدخل اسم الشخص", "error");
        await this.store.addPerson({ name, phone, email: "", notes: "" });
        $("#new-person-name").value = "";
        $("#new-person-phone").value = "";
        this.renderPeopleList();
        showToast("تمت إضافة الشخص 👤");
      });
    }

    // حقن خانة حساب في نموذج الدَّين إذا لم توجد
    injectDebtAccountSelectIfMissing() {
      const debtForm = $("#debt-form");
      if (debtForm && !$("#debt-account")) {
        const grp = document.createElement("div");
        grp.className = "form-group";
        grp.innerHTML = `
          <label>الحساب:</label>
          <select id="debt-account" required></select>
        `;
        const where = debtForm.querySelector(".form-group:nth-child(2)") || debtForm.firstElementChild;
        debtForm.insertBefore(grp, where?.nextSibling || null);
        this.renderAccountsSelect();
      }
    }

    // ---------- Views ----------
    refreshAllViews() {
      this.updateDashboard();
      if ($("#transactions")?.classList.contains("active")) this.updateTransactionsView();
      if ($("#accounts")?.classList.contains("active")) this.updateAccountsView();
      if ($("#debts")?.classList.contains("active")) this.updateDebtsView();
      if ($("#savings")?.classList.contains("active")) this.updateSavingsView();
      if ($("#settings")?.classList.contains("active")) this.updateSettingsView();
    }

    // لوحة التحكم
    updateDashboard() {
      const balance = this.store.calculateTotalBalance();
      const inc = this.store.calculateMonthlyIncome(new Date());
      const exp = this.store.calculateMonthlyExpenses(new Date());

      $("#total-balance").textContent = formatCurrency(balance);
      $("#total-income").textContent  = formatCurrency(inc);
      $("#total-expenses").textContent = formatCurrency(exp);

      // أحدث معاملات
      const recent = this.store.getTransactions().slice(-3).reverse();
      const list = $("#recent-transactions");
      if (list) list.innerHTML = recent.map(t => this.transactionItemHTML(t)).join("") || this.emptyHint("لا توجد معاملات بعد");
    }

    // المعاملات + الفلاتر
    updateTransactionsView() {
      const tx = this.store.getTransactionsByPeriod(this.activePeriod);
      const list = $("#all-transactions");
      if (list) list.innerHTML = tx.map(t => this.transactionItemHTML(t, true)).join("") || this.emptyHint("لا توجد معاملات في هذه الفترة");
    }

    // الحسابات (مع أزرار تعديل/حذف)
    updateAccountsView() {
      const cards = this.store.getAccounts();
      const wrap = $("#accounts-list");
      if (!wrap) return;
      wrap.innerHTML = cards.map(acc => `
        <div class="account-card" data-id="${acc.id}">
          <div class="account-type">${this.mapAccountType(acc.type)}</div>
          <div class="account-name">${acc.name}</div>
          <div class="account-balance">${formatCurrency(acc.balance)}</div>
          <div class="account-actions" style="margin-top:8px; display:flex; gap:8px;">
            <button class="edit-account">تعديل</button>
            <button class="delete-account">حذف</button>
          </div>
        </div>
      `).join("") || this.emptyHint("لا توجد حسابات — أضف حسابًا جديدًا");

      // تفويض أحداث (مرة في كل إعادة رسم)
      wrap.addEventListener("click", async (e) => {
        const card = e.target.closest(".account-card");
        if (!card) return;
        const id = card.getAttribute("data-id");

        if (e.target.classList.contains("edit-account")) {
          const acc = this.store.getAccounts().find(a => a.id === id);
          if (!acc) return;
          const newName = prompt("اسم الحساب:", acc.name);
          if (!newName) return;
          const newType = prompt("نوع الحساب (cash/bank/credit/savings):", acc.type) || acc.type;
          const newBalanceStr = prompt("الرصيد الحالي:", acc.balance);
          const newBalance = parseAmount(newBalanceStr);
          await this.store.updateAccount(id, { name: newName.trim(), type: newType, balance: newBalance });
          this.updateAccountsView(); this.updateDashboard(); this.renderAccountsSelect();
          showToast("تم تحديث الحساب ✅");
        }

        if (e.target.classList.contains("delete-account")) {
          if (!confirm("حذف هذا الحساب؟ إذا كانت هناك معاملات مرتبطة سيتم منع الحذف.")) return;
          const ok = await this.store.deleteAccount(id);
          if (!ok) return showToast("لا يمكن حذف الحساب لوجود معاملات مرتبطة به", "error");
          this.updateAccountsView(); this.updateDashboard(); this.renderAccountsSelect();
          showToast("تم حذف الحساب 🗑️");
        }
      }, { once: true });

      // تحديث قائمة الحسابات في النماذج
      this.renderAccountsSelect();
    }

    // الديون (مع سداد/استرداد)
    updateDebtsView() {
      const toMe   = this.store.getDebtsToMe();
      const fromMe = this.store.getDebtsFromMe();

      const toMeEl   = $("#debts-to-me");
      const fromMeEl = $("#debts-from-me");

      if (toMeEl) {
        toMeEl.innerHTML = toMe.map(d => `
          <div class="debt-card debt-to-me" data-id="${d.id}">
            <div class="debt-info">
              <h4>${this.personName(d.personId)}</h4>
              <p>${formatDate(d.date)} • ${d.description || "—"} • الحالة: ${d.status}</p>
            </div>
            <div class="debt-amount positive">+${formatCurrency(d.amount)}</div>
            <div class="debt-actions" style="margin-top:8px; display:flex; gap:8px;">
              <button class="receive-debt">استرداد</button>
            </div>
          </div>
        `).join("") || this.emptyHint("لا توجد ديون لك");
      }

      if (fromMeEl) {
        fromMeEl.innerHTML = fromMe.map(d => `
          <div class="debt-card debt-from-me" data-id="${d.id}">
            <div class="debt-info">
              <h4>${this.personName(d.personId)}</h4>
              <p>${formatDate(d.date)} • ${d.description || "—"} • الحالة: ${d.status}</p>
            </div>
            <div class="debt-amount negative">-${formatCurrency(d.amount)}</div>
            <div class="debt-actions" style="margin-top:8px; display:flex; gap:8px;">
              <button class="pay-debt">سداد</button>
            </div>
          </div>
        `).join("") || this.emptyHint("لا توجد ديون عليك");
      }

      const handler = async (e) => {
        const card = e.target.closest(".debt-card");
        if (!card) return;
        const id = card.getAttribute("data-id");
        if (e.target.classList.contains("receive-debt")) {
          const amt = parseAmount(prompt("المبلغ المسترد:", ""));
          if (!amt) return;
          const accName = prompt("اسم الحساب الذي سيتم إيداعه فيه:", "محفظة نقدية");
          const ok = await this.store.receiveDebt(id, amt, accName);
          if (!ok) return showToast("تعذر الاسترداد. تأكد من الحساب.", "error");
          this.updateDebtsView(); this.updateDashboard();
          showToast("تم الاسترداد ✅");
        }
        if (e.target.classList.contains("pay-debt")) {
          const amt = parseAmount(prompt("مبلغ السداد:", ""));
          if (!amt) return;
          const accName = prompt("اسم الحساب الذي سيتم السداد منه:", "محفظة نقدية");
          const ok = await this.store.payDebt(id, amt, accName);
          if (!ok) return showToast("تعذر السداد. تأكد من الحساب.", "error");
          this.updateDebtsView(); this.updateDashboard();
          showToast("تم السداد ✅");
        }
      };

      toMeEl?.addEventListener("click", handler, { once: true });
      fromMeEl?.addEventListener("click", handler, { once: true });
    }

    // الادخار (إيداع/تعديل)
    updateSavingsView() {
      const goals = this.store.getSavingsGoals();
      const wrap = $("#savings-goals");
      if (!wrap) return;
      wrap.innerHTML = goals.map((g) => {
        const pct = Math.min(100, Math.round((parseAmount(g.currentAmount) / Math.max(1, parseAmount(g.targetAmount))) * 100));
        return `
          <div class="account-card" data-id="${g.id}">
            <div class="account-type">هدف الادخار</div>
            <div class="account-name">${g.name}</div>
            <div class="account-balance">${NUM_FMT.format(g.currentAmount)} / ${NUM_FMT.format(g.targetAmount)}</div>
            <div style="margin-top: 16px;">
              <div style="background: rgba(255,255,255,0.2); height: 8px; border-radius: 4px; overflow: hidden;">
                <div style="height: 100%; width: ${pct}%; border-radius: 4px; transition: width .5s ease;"></div>
              </div>
              <div style="margin-top:8px; font-size:12px;">${pct}% مكتمل ${g.targetDate ? `• الهدف: ${formatDate(g.targetDate)}` : ""}</div>
            </div>
            <div class="goal-actions" style="margin-top:8px; display:flex; gap:8px;">
              <button class="contribute-goal">إيداع للهدف</button>
              <button class="edit-goal">تعديل</button>
            </div>
          </div>
        `;
      }).join("") || this.emptyHint("لا توجد أهداف ادخار بعد");

      wrap.addEventListener("click", async (e) => {
        const card = e.target.closest(".account-card");
        if (!card) return;
        const id = card.getAttribute("data-id");

        if (e.target.classList.contains("contribute-goal")) {
          const amt = parseAmount(prompt("المبلغ الذي تريد إيداعه:", ""));
          if (!amt) return;
          const accName = prompt("اسم الحساب الذي سيتم السحب منه:", "محفظة نقدية");
          const ok = await this.store.contributeToSavings(id, amt, accName);
          if (!ok) return showToast("تعذر الإيداع. تأكد من الحساب.", "error");
          this.updateSavingsView(); this.updateDashboard();
          showToast("تم الإيداع في الهدف 💰");
        }

        if (e.target.classList.contains("edit-goal")) {
          const g = this.store.getSavingsGoals().find(x => x.id === id);
          if (!g) return;
          const newName = prompt("اسم الهدف:", g.name) || g.name;
          const newTarget = parseAmount(prompt("المبلغ المستهدف:", g.targetAmount));
          const newCurrent = parseAmount(prompt("المبلغ الحالي:", g.currentAmount));
          const newDate = prompt("التاريخ المستهدف (YYYY-MM-DD):", g.targetDate) || g.targetDate;
          await this.store.updateSavingsGoal(id, { name: newName.trim(), targetAmount: newTarget, currentAmount: newCurrent, targetDate: newDate });
          this.updateSavingsView();
          showToast("تم تعديل الهدف ✅");
        }
      }, { once: true });
    }

    // الإعدادات (قوائم الفئات والأشخاص داخل النوافذ)
    updateSettingsView() {
      this.renderCategoriesList();
      this.renderPeopleList();
      this.renderCategoriesSelect();
    }

    renderCategoriesList() {
      const list = $("#categories-list");
      if (!list) return;
      const cats = this.store.getCategories();
      list.innerHTML = cats.map(c => `
        <div class="setting-item">
          <div class="setting-icon">${c.icon || "🏷️"}</div>
          <div class="setting-info">
            <div class="setting-title">${c.name}</div>
            <div class="setting-description">${c.type === "income" ? "دخل" : "مصروف"}</div>
          </div>
        </div>
      `).join("") || this.emptyHint("أضف فئة جديدة لبدء التنظيم");

      // تحديث قائمة الفئات في نموذج المعاملة
      this.renderCategoriesSelect();
    }

    renderPeopleList() {
      const list = $("#people-list");
      if (!list) return;
      const ppl = this.store.getPeople();
      list.innerHTML = ppl.map(p => `
        <div class="setting-item">
          <div class="setting-icon">👤</div>
          <div class="setting-info">
            <div class="setting-title">${p.name}</div>
            <div class="setting-description">${p.phone || "—"}</div>
          </div>
        </div>
      `).join("") || this.emptyHint("أضف أشخاصاً لاستخدامهم في الديون");
      // تحديث الأشخاص بنموذج الديون
      const sel = $("#debt-person");
      if (sel) {
        sel.innerHTML = `<option value="">اختر الشخص</option>` +
          ppl.map(p => `<option value="${p.id || p.name}">${p.name}</option>`).join("");
      }
    }

    renderAccountsSelect() {
      const selTx   = $("#transaction-account");
      const selDebt = $("#debt-account");
      const accs = this.store.getAccounts();
      const options = [`<option value="">اختر الحساب</option>`]
        .concat(accs.map(a => `<option value="${a.name}">${a.name}</option>`))
        .join("");
      if (selTx)   selTx.innerHTML = options;
      if (selDebt) selDebt.innerHTML = options;
    }

    renderCategoriesSelect() {
      const sel = $("#transaction-category");
      if (!sel) return;
      const cats = this.store.getCategories();
      sel.innerHTML = `<option value="">اختر الفئة</option>` +
        cats.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
    }

    // ---------- Small helpers ----------
    transactionItemHTML(t, withDate = false) {
      const isIncome = t.type === "income";
      const icon = isIncome ? "💼" : this.iconForCategory(t.category);
      const amountTxt = (isIncome ? "+" : "-") + formatCurrency(Math.abs(parseAmount(t.amount)));
      const dateChip = withDate ? ` • ${formatDate(t.date)}` : "";
      return `
        <div class="transaction-item">
          <div class="transaction-icon ${isIncome ? "income" : "expense"}">${icon}</div>
          <div class="transaction-details">
            <div class="transaction-title">${t.description || (isIncome ? "دخل" : "مصروف")}</div>
            <div class="transaction-category">${t.category || "أخرى"}${dateChip}</div>
          </div>
          <div class="transaction-amount ${isIncome ? "income" : "expense"}">${amountTxt}</div>
        </div>
      `;
    }

    iconForCategory(cat = "") {
      const map = {
        "طعام وشراب": "🍔",
        "النقل": "⛽",
        "السكن": "🏠",
        "راتب": "💼",
      };
      return map[cat] || "🧾";
    }

    mapAccountType(t) {
      return (
        {
          cash: "نقدي",
          bank: "حساب بنكي",
          credit: "بطاقة ائتمان",
          savings: "حساب توفير",
        }[t] || t || "حساب"
      );
    }

    personName(idOrName) {
      const p = this.store.getPeople().find((x) => (x.id || x.name) === idOrName);
      return p?.name || idOrName || "—";
    }

    emptyHint(text) {
      return `
        <div style="padding:20px; text-align:center; color:var(--text-secondary); opacity:.9;">
          ${text}
        </div>
      `;
    }
  }

  // ---------- Bootstrap ----------
  window.__financeApp = new FinanceApp();
})();
