import { useDeferredValue, useEffect, useMemo, useState } from "react";
import api from "../api/client";

function localDateInput(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value) {
  if (value == null || value === "") return "—";
  return toNumber(value, 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const EMPTY_TX_FORM = {
  accountId: "",
  type: "out",
  amount: "",
  description: "",
  referenceNo: "",
  transactionDate: localDateInput(),
  notes: ""
};

const EMPTY_ACCOUNT_FORM = { name: "", type: "expense", description: "" };

function IconArrowDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12l7 7 7-7"/>
    </svg>
  );
}
function IconArrowUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7"/>
    </svg>
  );
}
function IconBalance() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v20M2 12h20"/>
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

export default function BudgetTab() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState({ totalIn: 0, totalOut: 0, netBalance: 0, transactionCount: 0, activeAccounts: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [filterType, setFilterType] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDeferredValue(searchRaw);

  const [view, setView] = useState("transactions");

  const [txForm, setTxForm] = useState(EMPTY_TX_FORM);
  const [editingTx, setEditingTx] = useState(null);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txSaving, setTxSaving] = useState(false);

  const [accForm, setAccForm] = useState(EMPTY_ACCOUNT_FORM);
  const [editingAcc, setEditingAcc] = useState(null);
  const [accFormOpen, setAccFormOpen] = useState(false);
  const [accSaving, setAccSaving] = useState(false);

  const [deletingTx, setDeletingTx] = useState(null);
  const [deletingAcc, setDeletingAcc] = useState(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importAccountId, setImportAccountId] = useState("");
  const [importType, setImportType] = useState("out");
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const loadAll = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (filterAccount !== "all") params.set("accountId", filterAccount);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      if (search) params.set("q", search);
      const summaryParams = new URLSearchParams();
      if (filterDateFrom) summaryParams.set("dateFrom", filterDateFrom);
      if (filterDateTo) summaryParams.set("dateTo", filterDateTo);
      const [txRes, accRes, sumRes] = await Promise.all([
        api.get(`/budget?${params}`),
        api.get("/budget/accounts"),
        api.get(`/budget/summary?${summaryParams}`)
      ]);
      setTransactions(txRes.data || []);
      setAccounts(accRes.data || []);
      setSummary(sumRes.data || { totalIn: 0, totalOut: 0, netBalance: 0, transactionCount: 0, activeAccounts: 0 });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load budget data.");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterAccount, filterDateFrom, filterDateTo, search]);

  function flash(msg, type = "success") {
    if (type === "success") { setSuccess(msg); setError(""); }
    else { setError(msg); setSuccess(""); }
    setTimeout(() => { setSuccess(""); setError(""); }, 3500);
  }

  const activeAccounts = useMemo(() => accounts.filter((a) => Number(a.is_active) === 1), [accounts]);
  const hasFilters = filterType !== "all" || filterAccount !== "all" || filterDateFrom || filterDateTo || searchRaw;
  const netPositive = toNumber(summary.netBalance, 0) >= 0;

  // ── Import ──────────────────────────────────────────────────────────────────
  function openImport() {
    setImportAccountId(activeAccounts[0]?.id ? String(activeAccounts[0].id) : "");
    setImportType("out"); setImportFile(null); setImportResult(null); setImportOpen(true);
  }
  function closeImport() { setImportOpen(false); setImportFile(null); setImportResult(null); }
  async function submitImport(e) {
    e.preventDefault();
    if (!importFile) { flash("Please select an Excel file.", "error"); return; }
    if (!importAccountId) { flash("Please select an account.", "error"); return; }
    setImportLoading(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile); fd.append("accountId", importAccountId); fd.append("type", importType);
      const res = await api.post("/budget/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(res.data);
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Import failed.", "error");
    } finally { setImportLoading(false); }
  }

  // ── Transaction form ────────────────────────────────────────────────────────
  function openNewTx() {
    setEditingTx(null); setTxForm({ ...EMPTY_TX_FORM, transactionDate: localDateInput() }); setTxFormOpen(true);
  }
  function openEditTx(tx) {
    setEditingTx(tx);
    setTxForm({
      accountId: String(tx.account_id), type: tx.type, amount: String(tx.amount),
      description: tx.description || "", referenceNo: tx.reference_no || "",
      transactionDate: tx.transaction_date ? tx.transaction_date.slice(0, 10) : localDateInput(),
      notes: tx.notes || ""
    });
    setTxFormOpen(true);
  }
  function closeTxForm() { setTxFormOpen(false); setEditingTx(null); setTxForm(EMPTY_TX_FORM); }
  async function saveTx(e) {
    e.preventDefault(); setTxSaving(true);
    try {
      const payload = { accountId: Number(txForm.accountId), type: txForm.type, amount: Number(txForm.amount), description: txForm.description, referenceNo: txForm.referenceNo, transactionDate: txForm.transactionDate, notes: txForm.notes };
      if (editingTx) { await api.put(`/budget/${editingTx.id}`, payload); flash("Transaction updated."); }
      else { await api.post("/budget", payload); flash("Transaction recorded."); }
      closeTxForm(); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed to save transaction.", "error"); }
    finally { setTxSaving(false); }
  }
  async function confirmDeleteTx(tx) {
    try { await api.delete(`/budget/${tx.id}`); flash("Transaction deleted."); setDeletingTx(null); await loadAll(true); }
    catch (err) { flash(err?.response?.data?.message || "Failed to delete.", "error"); setDeletingTx(null); }
  }

  // ── Account form ────────────────────────────────────────────────────────────
  function openNewAcc() { setEditingAcc(null); setAccForm(EMPTY_ACCOUNT_FORM); setAccFormOpen(true); }
  function openEditAcc(acc) {
    setEditingAcc(acc); setAccForm({ name: acc.name || "", type: acc.type || "expense", description: acc.description || "" }); setAccFormOpen(true);
  }
  function closeAccForm() { setAccFormOpen(false); setEditingAcc(null); setAccForm(EMPTY_ACCOUNT_FORM); }
  async function saveAcc(e) {
    e.preventDefault(); setAccSaving(true);
    try {
      const payload = { name: accForm.name, type: accForm.type, description: accForm.description };
      if (editingAcc) { await api.put(`/budget/accounts/${editingAcc.id}`, payload); flash("Account updated."); }
      else { await api.post("/budget/accounts", payload); flash("Account created."); }
      closeAccForm(); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed to save account.", "error"); }
    finally { setAccSaving(false); }
  }
  async function confirmDeleteAcc(acc) {
    try {
      const res = await api.delete(`/budget/accounts/${acc.id}`);
      flash(res.data?.deactivated ? "Account deactivated." : "Account deleted.");
      setDeletingAcc(null); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed.", "error"); setDeletingAcc(null); }
  }

  return (
    <div className="bgt">

      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <div className="bgt-kpi-row">
        <div className="bgt-kpi bgt-kpi--in">
          <div className="bgt-kpi-icon"><IconArrowDown /></div>
          <div className="bgt-kpi-body">
            <span className="bgt-kpi-label">Total Income</span>
            <strong className="bgt-kpi-value">₱{formatMoney(summary.totalIn)}</strong>
          </div>
        </div>
        <div className="bgt-kpi bgt-kpi--out">
          <div className="bgt-kpi-icon"><IconArrowUp /></div>
          <div className="bgt-kpi-body">
            <span className="bgt-kpi-label">Total Expenses</span>
            <strong className="bgt-kpi-value">₱{formatMoney(summary.totalOut)}</strong>
          </div>
        </div>
        <div className={`bgt-kpi bgt-kpi--net ${netPositive ? "bgt-kpi--net-pos" : "bgt-kpi--net-neg"}`}>
          <div className="bgt-kpi-icon"><IconBalance /></div>
          <div className="bgt-kpi-body">
            <span className="bgt-kpi-label">Net Balance</span>
            <strong className="bgt-kpi-value">₱{formatMoney(summary.netBalance)}</strong>
          </div>
          <div className={`bgt-kpi-badge ${netPositive ? "bgt-kpi-badge--pos" : "bgt-kpi-badge--neg"}`}>
            {netPositive ? "Surplus" : "Deficit"}
          </div>
        </div>
        <div className="bgt-kpi bgt-kpi--count">
          <div className="bgt-kpi-body">
            <span className="bgt-kpi-label">Transactions</span>
            <strong className="bgt-kpi-value">{summary.transactionCount}</strong>
          </div>
          <div className="bgt-kpi-sub">{summary.activeAccounts} active account{summary.activeAccounts !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {success && (
        <div className="bgt-toast bgt-toast--ok" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          {success}
        </div>
      )}
      {error && (
        <div className="bgt-toast bgt-toast--err" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="bgt-toolbar">
        <div className="bgt-seg">
          <button className={`bgt-seg-btn${view === "transactions" ? " bgt-seg-btn--on" : ""}`} onClick={() => setView("transactions")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
            Transactions
          </button>
          <button className={`bgt-seg-btn${view === "accounts" ? " bgt-seg-btn--on" : ""}`} onClick={() => setView("accounts")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M7 15h2M12 15h2"/></svg>
            Accounts
          </button>
        </div>

        <div className="bgt-toolbar-actions">
          {view === "transactions" && (
            <>
              <button className="btn btn-ghost bgt-btn-import" onClick={openImport}>
                <IconUpload /> Import Excel
              </button>
              <button className="btn btn-primary" onClick={openNewTx}>
                <IconPlus /> Record Transaction
              </button>
            </>
          )}
          {view === "accounts" && (
            <button className="btn btn-primary" onClick={openNewAcc}>
              <IconPlus /> New Account
            </button>
          )}
        </div>
      </div>

      {/* ── Transactions view ──────────────────────────────────────────────── */}
      {view === "transactions" && (
        <>
          <div className="bgt-filters">
            <div className="bgt-search-wrap">
              <span className="bgt-search-icon"><IconSearch /></span>
              <input className="input bgt-search-input" placeholder="Search description, reference, account…" value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} />
            </div>
            <select className="input bgt-filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All types</option>
              <option value="in">Income (In)</option>
              <option value="out">Expense (Out)</option>
            </select>
            <select className="input bgt-filter-select" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
              <option value="all">All accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div className="bgt-date-range">
              <input className="input bgt-date-input" type="date" title="From" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
              <span className="bgt-date-sep">—</span>
              <input className="input bgt-date-input" type="date" title="To" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
            </div>
            {hasFilters && (
              <button className="btn btn-ghost bgt-clear-btn" onClick={() => { setFilterType("all"); setFilterAccount("all"); setFilterDateFrom(""); setFilterDateTo(""); setSearchRaw(""); }}>
                Clear filters
              </button>
            )}
          </div>

          {loading ? (
            <div className="bgt-empty">
              <div className="bgt-spinner" />
              <p>Loading transactions…</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="bgt-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="bgt-empty-icon"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M9 13h1M14 13h1M9 17h1M14 17h1"/></svg>
              <p>{hasFilters ? "No transactions match your filters." : "No transactions yet. Record one or import from Excel."}</p>
              {!hasFilters && <button className="btn btn-primary" onClick={openNewTx}><IconPlus /> Record First Transaction</button>}
            </div>
          ) : (
            <div className="bgt-table-wrap">
              <table className="bgt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Account</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th>Type</th>
                    <th className="bgt-col-amt">Amount</th>
                    <th className="bgt-col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="bgt-table-row">
                      <td className="bgt-cell-date">{formatDate(tx.transaction_date)}</td>
                      <td className="bgt-cell-account">
                        <span className="bgt-account-chip">{tx.account_name || "—"}</span>
                      </td>
                      <td className="bgt-cell-desc">{tx.description || <span className="bgt-muted">—</span>}</td>
                      <td className="bgt-cell-ref">
                        {tx.reference_no ? <code className="bgt-ref-code">{tx.reference_no}</code> : <span className="bgt-muted">—</span>}
                      </td>
                      <td>
                        <span className={`bgt-type-pill bgt-type-pill--${tx.type}`}>
                          {tx.type === "in" ? "↓ In" : "↑ Out"}
                        </span>
                      </td>
                      <td className={`bgt-col-amt bgt-amount--${tx.type}`}>
                        <span className="bgt-amount-sign">{tx.type === "in" ? "+" : "−"}</span>
                        <span>₱{formatMoney(tx.amount)}</span>
                      </td>
                      <td className="bgt-col-actions">
                        <button className="bgt-row-btn" onClick={() => openEditTx(tx)} title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Edit
                        </button>
                        <button className="bgt-row-btn bgt-row-btn--del" onClick={() => setDeletingTx(tx)} title="Delete">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bgt-table-footer">
                {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Accounts view ──────────────────────────────────────────────────── */}
      {view === "accounts" && (
        accounts.length === 0 ? (
          <div className="bgt-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="bgt-empty-icon"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h2M12 15h2"/></svg>
            <p>No accounts yet.</p>
            <button className="btn btn-primary" onClick={openNewAcc}><IconPlus /> Create First Account</button>
          </div>
        ) : (
          <div className="bgt-accounts-grid">
            {accounts.map((acc) => {
              const inactive = Number(acc.is_active) !== 1;
              const bal = toNumber(acc.balance, 0);
              return (
                <div key={acc.id} className={`bgt-acc-card${inactive ? " bgt-acc-card--inactive" : ""}`}>
                  <div className="bgt-acc-head">
                    <div className="bgt-acc-info">
                      <span className={`bgt-acc-type-dot bgt-acc-type-dot--${acc.type}`} />
                      <div>
                        <strong className="bgt-acc-name">{acc.name}</strong>
                        {acc.description && <p className="bgt-acc-desc">{acc.description}</p>}
                      </div>
                    </div>
                    <div className="bgt-acc-badges">
                      <span className={`bgt-pill bgt-pill--${acc.type}`}>{acc.type === "income" ? "Income" : "Expense"}</span>
                      {inactive && <span className="bgt-pill bgt-pill--inactive">Inactive</span>}
                    </div>
                  </div>

                  <div className="bgt-acc-stats">
                    <div className="bgt-acc-stat">
                      <span className="bgt-acc-stat-label">In</span>
                      <span className="bgt-acc-stat-val bgt-acc-stat-val--in">+₱{formatMoney(acc.total_in)}</span>
                    </div>
                    <div className="bgt-acc-divider" />
                    <div className="bgt-acc-stat">
                      <span className="bgt-acc-stat-label">Out</span>
                      <span className="bgt-acc-stat-val bgt-acc-stat-val--out">−₱{formatMoney(acc.total_out)}</span>
                    </div>
                    <div className="bgt-acc-divider" />
                    <div className="bgt-acc-stat">
                      <span className="bgt-acc-stat-label">Balance</span>
                      <span className={`bgt-acc-stat-val ${bal >= 0 ? "bgt-acc-stat-val--in" : "bgt-acc-stat-val--out"}`}>
                        ₱{formatMoney(acc.balance)}
                      </span>
                    </div>
                    <div className="bgt-acc-divider" />
                    <div className="bgt-acc-stat">
                      <span className="bgt-acc-stat-label">Entries</span>
                      <span className="bgt-acc-stat-val">{acc.transaction_count}</span>
                    </div>
                  </div>

                  <div className="bgt-acc-actions">
                    <button className="btn btn-ghost bgt-acc-btn" onClick={() => openEditAcc(acc)}>Edit</button>
                    <button className="btn btn-ghost bgt-acc-btn bgt-acc-btn--del" onClick={() => setDeletingAcc(acc)}>
                      {Number(acc.is_active) === 1 && acc.transaction_count > 0 ? "Deactivate" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Transaction modal ──────────────────────────────────────────────── */}
      {txFormOpen && (
        <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeTxForm(); }}>
          <div className="bgt-modal">
            <div className="bgt-modal-head">
              <div>
                <p className="bgt-modal-eyebrow">{editingTx ? "Editing record" : "New entry"}</p>
                <h3 className="bgt-modal-title">{editingTx ? "Edit Transaction" : "Record Transaction"}</h3>
              </div>
              <button className="bgt-modal-x" onClick={closeTxForm} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form className="bgt-modal-body" onSubmit={saveTx}>
              <div className="bgt-type-toggle">
                <button type="button" className={`bgt-type-btn bgt-type-btn--out${txForm.type === "out" ? " bgt-type-btn--on" : ""}`} onClick={() => setTxForm((f) => ({ ...f, type: "out" }))}>
                  <IconArrowUp /> Expense (Out)
                </button>
                <button type="button" className={`bgt-type-btn bgt-type-btn--in${txForm.type === "in" ? " bgt-type-btn--on" : ""}`} onClick={() => setTxForm((f) => ({ ...f, type: "in" }))}>
                  <IconArrowDown /> Income (In)
                </button>
              </div>

              <div className="bgt-form-grid">
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Account <span className="bgt-req">*</span></label>
                  <select className="input" required value={txForm.accountId} onChange={(e) => setTxForm((f) => ({ ...f, accountId: e.target.value }))}>
                    <option value="">— Select account —</option>
                    {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="bgt-field">
                  <label className="bgt-label">Date <span className="bgt-req">*</span></label>
                  <input className="input" type="date" required value={txForm.transactionDate} onChange={(e) => setTxForm((f) => ({ ...f, transactionDate: e.target.value }))} />
                </div>
                <div className="bgt-field">
                  <label className="bgt-label">Amount (₱) <span className="bgt-req">*</span></label>
                  <input className="input" type="number" min="0.01" step="0.01" required placeholder="0.00" value={txForm.amount} onChange={(e) => setTxForm((f) => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Description</label>
                  <input className="input" type="text" placeholder="What is this for?" value={txForm.description} onChange={(e) => setTxForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Reference No.</label>
                  <input className="input" type="text" placeholder="OR, receipt, invoice number…" value={txForm.referenceNo} onChange={(e) => setTxForm((f) => ({ ...f, referenceNo: e.target.value }))} />
                </div>
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Notes</label>
                  <textarea className="input" rows={3} placeholder="Additional notes…" value={txForm.notes} onChange={(e) => setTxForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>

              <div className="bgt-modal-foot">
                <button type="button" className="btn btn-ghost" onClick={closeTxForm} disabled={txSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={txSaving}>
                  {txSaving ? "Saving…" : editingTx ? "Save Changes" : "Record Transaction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Account modal ──────────────────────────────────────────────────── */}
      {accFormOpen && (
        <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeAccForm(); }}>
          <div className="bgt-modal bgt-modal--sm">
            <div className="bgt-modal-head">
              <div>
                <p className="bgt-modal-eyebrow">{editingAcc ? "Editing" : "New category"}</p>
                <h3 className="bgt-modal-title">{editingAcc ? "Edit Account" : "New Account"}</h3>
              </div>
              <button className="bgt-modal-x" onClick={closeAccForm} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form className="bgt-modal-body" onSubmit={saveAcc}>
              <div className="bgt-form-grid">
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Name <span className="bgt-req">*</span></label>
                  <input className="input" type="text" required placeholder="e.g. Equipment, Labor, Sales Revenue…" value={accForm.name} onChange={(e) => setAccForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Type <span className="bgt-req">*</span></label>
                  <select className="input" value={accForm.type} onChange={(e) => setAccForm((f) => ({ ...f, type: e.target.value }))}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Description</label>
                  <input className="input" type="text" placeholder="Short description (optional)" value={accForm.description} onChange={(e) => setAccForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <div className="bgt-modal-foot">
                <button type="button" className="btn btn-ghost" onClick={closeAccForm} disabled={accSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={accSaving}>
                  {accSaving ? "Saving…" : editingAcc ? "Save Changes" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Import modal ───────────────────────────────────────────────────── */}
      {importOpen && (
        <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeImport(); }}>
          <div className="bgt-modal bgt-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-modal-head">
              <div>
                <p className="bgt-modal-eyebrow">Bulk import</p>
                <h3 className="bgt-modal-title">Import from Excel</h3>
              </div>
              <button className="bgt-modal-x" onClick={closeImport} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="bgt-modal-body">
              {importResult ? (
                <>
                  <div className="bgt-import-success">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <strong>{importResult.imported} transaction{importResult.imported !== 1 ? "s" : ""} imported successfully</strong>
                  </div>
                  <div className="bgt-import-preview">
                    <table className="bgt-table bgt-table--compact">
                      <thead><tr><th>Date</th><th>Description</th><th className="bgt-col-amt">Amount</th></tr></thead>
                      <tbody>
                        {importResult.rows.map((r, i) => (
                          <tr key={i}>
                            <td className="bgt-cell-date">{formatDate(r.transactionDate)}</td>
                            <td>{r.description}</td>
                            <td className="bgt-col-amt bgt-amount--out">₱{formatMoney(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bgt-modal-foot">
                    <button className="btn btn-primary" onClick={closeImport}>Done</button>
                  </div>
                </>
              ) : (
                <form onSubmit={submitImport}>
                  <div className="bgt-import-hint">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Expected columns: <strong>Date</strong>, <strong>Expenses / Description</strong>, <strong>Price</strong>, <strong>Qty</strong>. Matches the standard format — dates are carried forward across merged rows.
                  </div>
                  <div className="bgt-form-grid">
                    <div className="bgt-field bgt-field--wide">
                      <label className="bgt-label">Account <span className="bgt-req">*</span></label>
                      <select className="input" required value={importAccountId} onChange={(e) => setImportAccountId(e.target.value)}>
                        <option value="">— Select account —</option>
                        {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="bgt-field bgt-field--wide">
                      <label className="bgt-label">Transaction Type <span className="bgt-req">*</span></label>
                      <div className="bgt-type-toggle">
                        <button type="button" className={`bgt-type-btn bgt-type-btn--out${importType === "out" ? " bgt-type-btn--on" : ""}`} onClick={() => setImportType("out")}>
                          <IconArrowUp /> Expense (Out)
                        </button>
                        <button type="button" className={`bgt-type-btn bgt-type-btn--in${importType === "in" ? " bgt-type-btn--on" : ""}`} onClick={() => setImportType("in")}>
                          <IconArrowDown /> Income (In)
                        </button>
                      </div>
                    </div>
                    <div className="bgt-field bgt-field--wide">
                      <label className="bgt-label">Excel File (.xlsx / .xls) <span className="bgt-req">*</span></label>
                      <input className="input" type="file" accept=".xlsx,.xls" required onChange={(e) => setImportFile(e.target.files[0] || null)} />
                    </div>
                  </div>
                  <div className="bgt-modal-foot">
                    <button type="button" className="btn btn-ghost" onClick={closeImport} disabled={importLoading}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={importLoading}>
                      {importLoading ? "Importing…" : "Import"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete tx confirm ──────────────────────────────────────────────── */}
      {deletingTx && (
        <div className="bgt-backdrop" onClick={() => setDeletingTx(null)}>
          <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-confirm-icon bgt-confirm-icon--del">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </div>
            <h3 className="bgt-confirm-title">Delete Transaction?</h3>
            <p className="bgt-confirm-body">
              This will permanently delete the {deletingTx.type === "in" ? "income" : "expense"} of <strong>₱{formatMoney(deletingTx.amount)}</strong>
              {deletingTx.description ? ` — "${deletingTx.description}"` : ""}. This cannot be undone.
            </p>
            <div className="bgt-modal-foot bgt-modal-foot--center">
              <button className="btn btn-ghost" onClick={() => setDeletingTx(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => confirmDeleteTx(deletingTx)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete account confirm ─────────────────────────────────────────── */}
      {deletingAcc && (
        <div className="bgt-backdrop" onClick={() => setDeletingAcc(null)}>
          <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-confirm-icon bgt-confirm-icon--del">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </div>
            <h3 className="bgt-confirm-title">{deletingAcc.transaction_count > 0 ? "Deactivate Account?" : "Delete Account?"}</h3>
            <p className="bgt-confirm-body">
              {deletingAcc.transaction_count > 0
                ? <><strong>{deletingAcc.name}</strong> has {deletingAcc.transaction_count} transaction(s) and cannot be deleted — it will be deactivated instead.</>
                : <>Delete account <strong>{deletingAcc.name}</strong>? This cannot be undone.</>}
            </p>
            <div className="bgt-modal-foot bgt-modal-foot--center">
              <button className="btn btn-ghost" onClick={() => setDeletingAcc(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => confirmDeleteAcc(deletingAcc)}>
                {deletingAcc.transaction_count > 0 ? "Deactivate" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
