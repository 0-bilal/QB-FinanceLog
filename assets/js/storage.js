/* storage.js — طبقة التخزين والمنطق الأساسي */

class FinanceStorage {
  constructor(namespace = "QB-Finance") {
    this.ns = namespace;

    // مفاتيح التخزين
    this.keys = {
      accounts: `${this.ns}:accounts`,
      transactions: `${this.ns}:transactions`,
      debts: `${this.ns}:debts`,
      savings: `${this.ns}:savings`,
      categories: `${this.ns}:categories`,
      people: `${this.ns}:people`,
      meta: `${this.ns}:meta`,
    };

    // تهيئة البيانات إن لم توجد
    this._ensureInit();
  }

  // =============== أدوات عامة ===============
  _read(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : structuredClone(fallback);
    } catch {
      return structuredClone(fallback);
    }
  }

  _write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  _id(prefix = "id") {
    const rnd = crypto?.getRandomValues?.(new Uint32Array(1))[0] ?? Math.floor(Math.random() * 1e9);
    return `${prefix}_${Date.now().toString(36)}_${rnd.toString(36)}`;
  }

  _todayISO() {
    return new Date().toISOString().split("T")[0];
  }

  _parseAmount(v) {
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
    return isFinite(n) ? n : 0;
  }

  // =============== تهيئة أولية ===============
  _ensureInit() {
    // فئات افتراضية
    if (!localStorage.getItem(this.keys.categories)) {
      const defaults = [
        { id: this._id("cat"), name: "راتب", type: "income", icon: "💼", color: "#16a34a" },
        { id: this._id("cat"), name: "طعام وشراب", type: "expense", icon: "🍔", color: "#f97316" },
        { id: this._id("cat"), name: "النقل", type: "expense", icon: "⛽", color: "#06b6d4" },
        { id: this._id("cat"), name: "السكن", type: "expense", icon: "🏠", color: "#3b82f6" },
        { id: this._id("cat"), name: "أخرى", type: "expense", icon: "🧾", color: "#94a3b8" },
      ];
      this._write(this.keys.categories, defaults);
    }

    // حساب نقدي افتراضي
    if (!localStorage.getItem(this.keys.accounts)) {
      const defaults = [
        {
          id: this._id("acc"),
          name: "محفظة نقدية",
          type: "cash", // cash | bank | credit | savings
          initialBalance: 0,
          balance: 0,
          createdAt: new Date().toISOString(),
        },
      ];
      this._write(this.keys.accounts, defaults);
    }

    // جداول فارغة عند الحاجة
    for (const k of ["transactions", "debts", "savings", "people"]) {
      if (!localStorage.getItem(this.keys[k])) this._write(this.keys[k], []);
    }

    if (!localStorage.getItem(this.keys.meta)) {
      this._write(this.keys.meta, { createdAt: new Date().toISOString(), schema: 1 });
    }
  }

  // =============== تصدير/مسح البيانات ===============
  async exportData() {
    const payload = {
      meta: this._read(this.keys.meta, {}),
      accounts: this._read(this.keys.accounts, []),
      transactions: this._read(this.keys.transactions, []),
      debts: this._read(this.keys.debts, []),
      savings: this._read(this.keys.savings, []),
      categories: this._read(this.keys.categories, []),
      people: this._read(this.keys.people, []),
      exportedAt: new Date().toISOString(),
      version: "v1",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const filename = `QB-Finance-Export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    return { filename, blob };
  }

  async clearAllData() {
    for (const k of Object.values(this.keys)) localStorage.removeItem(k);
    this._ensureInit();
  }

  // =============== الحسابات ===============
  getAccounts() {
    return this._read(this.keys.accounts, []);
  }

  async addAccount({ name, type = "cash", initialBalance = 0, balance = null, createdAt = null }) {
    const accounts = this.getAccounts();
    const acc = {
      id: this._id("acc"),
      name: name?.trim(),
      type,
      initialBalance: this._parseAmount(initialBalance),
      balance: balance == null ? this._parseAmount(initialBalance) : this._parseAmount(balance),
      createdAt: createdAt || new Date().toISOString(),
    };
    accounts.push(acc);
    this._write(this.keys.accounts, accounts);
    return acc;
  }

  async updateAccount(accountId, { name, type, balance }) {
    const accounts = this.getAccounts();
    const idx = accounts.findIndex(a => a.id === accountId);
    if (idx === -1) return false;
    if (name) accounts[idx].name = name;
    if (type) accounts[idx].type = type;
    if (balance != null && isFinite(balance)) accounts[idx].balance = this._parseAmount(balance);
    this._write(this.keys.accounts, accounts);
    return true;
  }

  async deleteAccount(accountId) {
    const tx = this.getTransactions();
    if (tx.some(t => t.accountId === accountId)) return false; // منع حذف حساب عليه معاملات
    const accounts = this.getAccounts().filter(a => a.id !== accountId);
    this._write(this.keys.accounts, accounts);
    return true;
  }

  _setAccountBalance(accountId, newBalance) {
    const accounts = this.getAccounts();
    const idx = accounts.findIndex((a) => a.id === accountId || a.name === accountId);
    if (idx >= 0) {
      accounts[idx].balance = this._parseAmount(newBalance);
      this._write(this.keys.accounts, accounts);
    }
  }

  _findAccount(accountIdOrName) {
    const accounts = this.getAccounts();
    return (
      accounts.find((a) => a.id === accountIdOrName) ||
      accounts.find((a) => a.name === accountIdOrName) ||
      null
    );
  }

  // =============== المعاملات ===============
  getTransactions() {
    const list = this._read(this.keys.transactions, []);
    return list.sort((a, b) => new Date(a.date) - new Date(b.date)); // تصاعدي
  }

  async addTransaction({ type, amount, description, category, account, date, notes = "", createdAt = null }) {
    const txs = this.getTransactions();
    const acc = this._findAccount(account);
    if (!acc) throw new Error("الحساب المحدد غير موجود");

    const amt = this._parseAmount(amount);
    const tx = {
      id: this._id("tx"),
      type, // income | expense
      amount: amt,
      description: description?.trim(),
      category,
      accountId: acc.id, // نخزن المعرّف لضمان الثبات
      accountName: acc.name,
      date, // YYYY-MM-DD
      notes,
      createdAt: createdAt || new Date().toISOString(),
    };

    // تعديل رصيد الحساب
    const delta = type === "income" ? amt : -amt;
    this._setAccountBalance(acc.id, (acc.balance || 0) + delta);

    txs.push(tx);
    this._write(this.keys.transactions, txs);
    return tx;
  }

  // فترات: day | week | month | year | all
  getTransactionsByPeriod(period = "week") {
    const all = this.getTransactions();
    if (period === "all") return all.slice().reverse();

    const start = this._startOfPeriod(period);
    return all.filter((t) => new Date(t.date) >= start).reverse();
  }

  _startOfPeriod(period) {
    const now = new Date();

    if (period === "day") {
      const d = new Date(now);
      d.setHours(0,0,0,0);
      return d;
    }

    if (period === "week") {
      const d = new Date(now);
      const day = (d.getDay() + 6) % 7; // نجعل الاثنين = 0 (ISO)
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (period === "month") {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    if (period === "year") {
      return new Date(now.getFullYear(), 0, 1);
    }
    return new Date(0);
  }

  // =============== إجماليات ولوحات ===============
  calculateTotalBalance() {
    return this.getAccounts().reduce((s, a) => s + (this._parseAmount(a.balance) || 0), 0);
  }

  calculateMonthlyIncome(dateInMonth = new Date()) {
    const monthStart = new Date(dateInMonth.getFullYear(), dateInMonth.getMonth(), 1);
    const monthEnd = new Date(dateInMonth.getFullYear(), dateInMonth.getMonth() + 1, 0, 23, 59, 59, 999);
    return this.getTransactions()
      .filter((t) => t.type === "income")
      .filter((t) => {
        const d = new Date(t.date);
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((s, t) => s + this._parseAmount(t.amount), 0);
  }

  calculateMonthlyExpenses(dateInMonth = new Date()) {
    const monthStart = new Date(dateInMonth.getFullYear(), dateInMonth.getMonth(), 1);
    const monthEnd = new Date(dateInMonth.getFullYear(), dateInMonth.getMonth() + 1, 0, 23, 59, 59, 999);
    return this.getTransactions()
      .filter((t) => t.type === "expense")
      .filter((t) => {
        const d = new Date(t.date);
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((s, t) => s + this._parseAmount(t.amount), 0);
  }

  // =============== الديون ===============
  getDebtsToMe() {
    return this._read(this.keys.debts, []).filter((d) => d.type === "to-me");
  }

  getDebtsFromMe() {
    return this._read(this.keys.debts, []).filter((d) => d.type === "from-me");
  }

  async addDebt({ type, personId, amount, description = "", date, dueDate = null, status = "pending", notes = "", account = "", affectBalance = false }) {
    const debts = this._read(this.keys.debts, []);
    let person = this.getPeople().find((p) => (p.id === personId || p.name === personId));
    if (!person) person = await this.addPerson({ name: personId, phone: "", email: "", notes: "" });

    // ربط الحساب إن وُجد
    const acc = account ? this._findAccount(account) : this._findAccount("محفظة نقدية");
    const entry = {
      id: this._id("debt"),
      type, // "to-me" | "from-me"
      personId: person.id,
      amount: this._parseAmount(amount),
      description: description?.trim(),
      date, // YYYY-MM-DD
      dueDate: dueDate || date,
      status, // pending | paid | partial
      notes,
      accountId: acc?.id || null,
      createdAt: new Date().toISOString(),
    };

    debts.push(entry);
    this._write(this.keys.debts, debts);

    // التأثير على الرصيد عند الإنشاء
    if (affectBalance && acc) {
      // to-me = أنا أعطيت مال (ينقص الرصيد)، from-me = استلمت مال (يزيد الرصيد)
      const delta = (type === "to-me") ? -entry.amount : +entry.amount;
      this._setAccountBalance(acc.id, (acc.balance || 0) + delta);
    }

    return entry;
  }

  async payDebt(debtId, amount, accountNameOrId) {
    amount = this._parseAmount(amount);
    const debts = this._read(this.keys.debts, []);
    const d = debts.find(x => x.id === debtId);
    if (!d) return false;
    const acc = this._findAccount(accountNameOrId) || (d.accountId ? this._findAccount(d.accountId) : null);
    if (!acc) return false;

    // سداد دين "from-me": أخرج مالًا → ينقص الرصيد
    this._setAccountBalance(acc.id, (acc.balance || 0) - amount);

    if (amount >= d.amount) { d.status = "paid"; d.amount = 0; }
    else { d.amount = this._parseAmount(d.amount - amount); d.status = "partial"; }

    this._write(this.keys.debts, debts);
    return true;
  }

  async receiveDebt(debtId, amount, accountNameOrId) {
    amount = this._parseAmount(amount);
    const debts = this._read(this.keys.debts, []);
    const d = debts.find(x => x.id === debtId);
    if (!d) return false;
    const acc = this._findAccount(accountNameOrId) || (d.accountId ? this._findAccount(d.accountId) : null);
    if (!acc) return false;

    // استرداد دين "to-me": دخل → يزيد الرصيد
    this._setAccountBalance(acc.id, (acc.balance || 0) + amount);

    if (amount >= d.amount) { d.status = "paid"; d.amount = 0; }
    else { d.amount = this._parseAmount(d.amount - amount); d.status = "partial"; }

    this._write(this.keys.debts, debts);
    return true;
  }

  // =============== الادخار ===============
  getSavingsGoals() {
    return this._read(this.keys.savings, []);
  }

  async addSavingsGoal({ name, targetAmount, currentAmount = 0, targetDate = "", description = "", createdAt = null }) {
    const goals = this.getSavingsGoals();
    const g = {
      id: this._id("sav"),
      name: name?.trim(),
      targetAmount: this._parseAmount(targetAmount),
      currentAmount: this._parseAmount(currentAmount),
      targetDate,
      description,
      createdAt: createdAt || new Date().toISOString(),
    };
    goals.push(g);
    this._write(this.keys.savings, goals);
    return g;
  }

  async updateSavingsGoal(goalId, { name, targetAmount, currentAmount, targetDate }) {
    const goals = this.getSavingsGoals();
    const idx = goals.findIndex(g => g.id === goalId);
    if (idx === -1) return false;
    if (name) goals[idx].name = name;
    if (targetAmount != null) goals[idx].targetAmount = this._parseAmount(targetAmount);
    if (currentAmount != null) goals[idx].currentAmount = this._parseAmount(currentAmount);
    if (targetDate != null) goals[idx].targetDate = targetDate;
    this._write(this.keys.savings, goals);
    return true;
  }

  async contributeToSavings(goalId, amount, fromAccount) {
    amount = this._parseAmount(amount);
    const goals = this.getSavingsGoals();
    const idx = goals.findIndex(g => g.id === goalId);
    if (idx === -1) return false;
    const acc = this._findAccount(fromAccount);
    if (!acc) return false;
    // خصم من الحساب + زيادة في الادخار
    this._setAccountBalance(acc.id, (acc.balance || 0) - amount);
    goals[idx].currentAmount = this._parseAmount((goals[idx].currentAmount || 0) + amount);
    this._write(this.keys.savings, goals);
    return true;
  }

  // =============== الفئات ===============
  getCategories() {
    return this._read(this.keys.categories, []);
  }

  async addCategory({ name, type = "expense", icon = "🏷️", color = "#ccc" }) {
    const cats = this.getCategories();
    const exists = cats.some((c) => c.name === name && c.type === type);
    if (exists) return cats.find((c) => c.name === name && c.type === type);

    const c = {
      id: this._id("cat"),
      name: name?.trim(),
      type, // income | expense
      icon,
      color,
    };
    cats.push(c);
    this._write(this.keys.categories, cats);
    return c;
  }

  // =============== الأشخاص ===============
  getPeople() {
    return this._read(this.keys.people, []);
  }

  async addPerson({ name, phone = "", email = "", notes = "" }) {
    const ppl = this.getPeople();
    const found = ppl.find((p) => p.name === name);
    if (found) return found;

    const p = {
      id: this._id("person"),
      name: name?.trim(),
      phone,
      email,
      notes,
      createdAt: new Date().toISOString(),
    };
    ppl.push(p);
    this._write(this.keys.people, ppl);
    return p;
  }
}

// اجعل الكلاس متاحًا عالميًا
window.FinanceStorage = FinanceStorage;
