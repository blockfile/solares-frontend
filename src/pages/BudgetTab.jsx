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
  const n = toNumber(value, 0);
  return "₱ " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoneyPlain(value) {
  return toNumber(value, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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

const EMPTY_ACCOUNT_FORM = {
  name: "",
  type: "expense",
  description: ""
};

export default function BudgetTab() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState({ totalIn: 0, totalOut: 0, netBalance: 0, transactionCount: 0, activeAccounts: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filter state
  const [filterType, setFilterType] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDeferredValue(searchRaw);

  // Views
  const [view, setView] = useState("transactions"); // "transactions" | "accounts"

  // Transaction form
  const [txForm, setTxForm] = useState(EMPTY_TX_FORM);
  const [editingTx, setEditingTx] = useState(null);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txSaving, setTxSaving] = useState(false);

  // Account form
  const [accForm, setAccForm] = useState(EMPTY_ACCOUNT_FORM);
  const [editingAcc, setEditingAcc] = useState(null);
  const [accFormOpen, setAccFormOpen] = useState(false);
  const [accSaving, setAccSaving] = useState(false);

  // Delete confirm
  const [deletingTx, setDeletingTx] = useState(null);
  const [deletingAcc, setDeletingAcc] = useState(null);

  // Excel import
  const [importOpen, setImportOpen] = useState(false);
  const [importAccountId, setImportAccountId] = useState("");
  const [importType, setImportType] = useState("out");
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null); // { imported, rows }

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

  // ── Excel Import ───────────────────────────────────────────────────────────

  function openImport() {
    setImportAccountId(activeAccounts[0]?.id ? String(activeAccounts[0].id) : "");
    setImportType("out");
    setImportFile(null);
    setImportResult(null);
    setImportOpen(true);
  }

  function closeImport() {
    setImportOpen(false);
    setImportFile(null);
    setImportResult(null);
  }

  async function submitImport(e) {
    e.preventDefault();
    if (!importFile) { flash("Please select an Excel file.", "error"); return; }
    if (!importAccountId) { flash("Please select an account.", "error"); return; }
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("accountId", importAccountId);
      formData.append("type", importType);
      const res = await api.post("/budget/import", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setImportResult(res.data);
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Import failed.", "error");
    } finally {
      setImportLoading(false);
    }
  }

  // ── Transaction form ───────────────────────────────────────────────────────

  function openNewTx() {
    setEditingTx(null);
    setTxForm({ ...EMPTY_TX_FORM, transactionDate: localDateInput() });
    setTxFormOpen(true);
  }

  function openEditTx(tx) {
    setEditingTx(tx);
    setTxForm({
      accountId: String(tx.account_id),
      type: tx.type,
      amount: String(tx.amount),
      description: tx.description || "",
      referenceNo: tx.reference_no || "",
      transactionDate: tx.transaction_date ? tx.transaction_date.slice(0, 10) : localDateInput(),
      notes: tx.notes || ""
    });
    setTxFormOpen(true);
  }

  function closeTxForm() {
    setTxFormOpen(false);
    setEditingTx(null);
    setTxForm(EMPTY_TX_FORM);
  }

  async function saveTx(e) {
    e.preventDefault();
    setTxSaving(true);
    try {
      const payload = {
        accountId: Number(txForm.accountId),
        type: txForm.type,
        amount: Number(txForm.amount),
        description: txForm.description,
        referenceNo: txForm.referenceNo,
        transactionDate: txForm.transactionDate,
        notes: txForm.notes
      };
      if (editingTx) {
        await api.put(`/budget/${editingTx.id}`, payload);
        flash("Transaction updated.");
      } else {
        await api.post("/budget", payload);
        flash("Transaction recorded.");
      }
      closeTxForm();
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to save transaction.", "error");
    } finally {
      setTxSaving(false);
    }
  }

  async function confirmDeleteTx(tx) {
    try {
      await api.delete(`/budget/${tx.id}`);
      flash("Transaction deleted.");
      setDeletingTx(null);
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to delete transaction.", "error");
      setDeletingTx(null);
    }
  }

  // ── Account form ───────────────────────────────────────────────────────────

  function openNewAcc() {
    setEditingAcc(null);
    setAccForm(EMPTY_ACCOUNT_FORM);
    setAccFormOpen(true);
  }

  function openEditAcc(acc) {
    setEditingAcc(acc);
    setAccForm({
      name: acc.name || "",
      type: acc.type || "expense",
      description: acc.description || ""
    });
    setAccFormOpen(true);
  }

  function closeAccForm() {
    setAccFormOpen(false);
    setEditingAcc(null);
    setAccForm(EMPTY_ACCOUNT_FORM);
  }

  async function saveAcc(e) {
    e.preventDefault();
    setAccSaving(true);
    try {
      const payload = { name: accForm.name, type: accForm.type, description: accForm.description };
      if (editingAcc) {
        await api.put(`/budget/accounts/${editingAcc.id}`, payload);
        flash("Account updated.");
      } else {
        await api.post("/budget/accounts", payload);
        flash("Account created.");
      }
      closeAccForm();
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to save account.", "error");
    } finally {
      setAccSaving(false);
    }
  }

  async function confirmDeleteAcc(acc) {
    try {
      const res = await api.delete(`/budget/accounts/${acc.id}`);
      flash(res.data?.deactivated ? "Account deactivated (has existing transactions)." : "Account deleted.");
      setDeletingAcc(null);
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to delete account.", "error");
      setDeletingAcc(null);
    }
  }

  // ── Filtered display ───────────────────────────────────────────────────────

  const activeAccounts = useMemo(
    () => accounts.filter((a) => Number(a.is_active) === 1),
    [accounts]
  );

  const netClass = summary.netBalance >= 0 ? "budget-positive" : "budget-negative";

  return (
    <div className="budget-tab">
      {/* Summary cards */}
      <div className="budget-summary-row">
        <div className="budget-summary-card budget-summary-in">
          <span className="budget-summary-label">Total In</span>
          <strong className="budget-summary-value">{formatMoney(summary.totalIn)}</strong>
        </div>
        <div className="budget-summary-card budget-summary-out">
          <span className="budget-summary-label">Total Out</span>
          <strong className="budget-summary-value">{formatMoney(summary.totalOut)}</strong>
        </div>
        <div className={`budget-summary-card budget-summary-net ${netClass}`}>
          <span className="budget-summary-label">Net Balance</span>
          <strong className="budget-summary-value">{formatMoney(summary.netBalance)}</strong>
        </div>
        <div className="budget-summary-card">
          <span className="budget-summary-label">Transactions</span>
          <strong className="budget-summary-value">{summary.transactionCount}</strong>
        </div>
      </div>

      {/* Messages */}
      {success && <p className="form-success">{success}</p>}
      {error   && <p className="form-error">{error}</p>}

      {/* View toggle */}
      <div className="budget-view-bar">
        <div className="budget-view-tabs">
          <button
            className={`budget-view-tab${view === "transactions" ? " active" : ""}`}
            onClick={() => setView("transactions")}
          >Transactions</button>
          <button
            className={`budget-view-tab${view === "accounts" ? " active" : ""}`}
            onClick={() => setView("accounts")}
          >Accounts</button>
        </div>
        {view === "transactions" && (
          <div className="budget-action-group">
            <button className="btn btn-ghost" onClick={openImport}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Import Excel
            </button>
            <button className="btn btn-primary" onClick={openNewTx}>+ Record Transaction</button>
          </div>
        )}
        {view === "accounts" && (
          <button className="btn btn-primary" onClick={openNewAcc}>+ New Account</button>
        )}
      </div>

      {/* ── Transactions view ── */}
      {view === "transactions" && (
        <>
          <div className="budget-filters">
            <input
              className="input"
              placeholder="Search description, ref, account…"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
            />
            <select className="input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All types</option>
              <option value="in">In (Income)</option>
              <option value="out">Out (Expense)</option>
            </select>
            <select className="input" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input
              className="input"
              type="date"
              title="From date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
            <input
              className="input"
              type="date"
              title="To date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
            {(filterType !== "all" || filterAccount !== "all" || filterDateFrom || filterDateTo || searchRaw) && (
              <button className="btn btn-ghost" onClick={() => {
                setFilterType("all"); setFilterAccount("all");
                setFilterDateFrom(""); setFilterDateTo(""); setSearchRaw("");
              }}>Clear</button>
            )}
          </div>

          {loading ? (
            <p className="loading-text">Loading…</p>
          ) : transactions.length === 0 ? (
            <p className="empty-text">No transactions found. Record one to get started.</p>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Account</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th>Type</th>
                    <th className="text-right">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{formatDate(tx.transaction_date)}</td>
                      <td>{tx.account_name || "—"}</td>
                      <td>{tx.description || "—"}</td>
                      <td className="monospace">{tx.reference_no || "—"}</td>
                      <td>
                        <span className={`badge ${tx.type === "in" ? "badge-green" : "badge-red"}`}>
                          {tx.type === "in" ? "In" : "Out"}
                        </span>
                      </td>
                      <td className={`text-right monospace ${tx.type === "in" ? "budget-positive" : "budget-negative"}`}>
                        {tx.type === "in" ? "+" : "−"}₱{formatMoneyPlain(tx.amount)}
                      </td>
                      <td className="table-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditTx(tx)}>Edit</button>
                        <button className="btn btn-ghost btn-sm btn-danger" onClick={() => setDeletingTx(tx)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Accounts view ── */}
      {view === "accounts" && (
        <div className="table-wrapper">
          {accounts.length === 0 ? (
            <p className="empty-text">No accounts found.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="text-right">Total In</th>
                  <th className="text-right">Total Out</th>
                  <th className="text-right">Balance</th>
                  <th>Transactions</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id} className={Number(acc.is_active) !== 1 ? "row-inactive" : ""}>
                    <td>
                      <strong>{acc.name}</strong>
                      {acc.description && <p className="table-sub">{acc.description}</p>}
                    </td>
                    <td>
                      <span className={`badge ${acc.type === "income" ? "badge-green" : "badge-red"}`}>
                        {acc.type === "income" ? "Income" : "Expense"}
                      </span>
                    </td>
                    <td className="text-right budget-positive monospace">+₱{formatMoneyPlain(acc.total_in)}</td>
                    <td className="text-right budget-negative monospace">−₱{formatMoneyPlain(acc.total_out)}</td>
                    <td className={`text-right monospace ${toNumber(acc.balance, 0) >= 0 ? "budget-positive" : "budget-negative"}`}>
                      {formatMoney(acc.balance)}
                    </td>
                    <td>{acc.transaction_count}</td>
                    <td>
                      <span className={`badge ${Number(acc.is_active) === 1 ? "badge-green" : "badge-gray"}`}>
                        {Number(acc.is_active) === 1 ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="table-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditAcc(acc)}>Edit</button>
                      <button className="btn btn-ghost btn-sm btn-danger" onClick={() => setDeletingAcc(acc)}>
                        {Number(acc.is_active) === 1 && acc.transaction_count > 0 ? "Deactivate" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Transaction form modal ── */}
      {txFormOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeTxForm(); }}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editingTx ? "Edit Transaction" : "Record Transaction"}</h2>
              <button className="modal-close" onClick={closeTxForm} aria-label="Close">×</button>
            </div>
            <form className="modal-body" onSubmit={saveTx}>
              <div className="form-row">
                <label className="form-label">Type <span className="required">*</span></label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio" value="out"
                      checked={txForm.type === "out"}
                      onChange={() => setTxForm((f) => ({ ...f, type: "out" }))}
                    />
                    <span className="budget-negative">Out (Expense)</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio" value="in"
                      checked={txForm.type === "in"}
                      onChange={() => setTxForm((f) => ({ ...f, type: "in" }))}
                    />
                    <span className="budget-positive">In (Income)</span>
                  </label>
                </div>
              </div>

              <div className="form-row">
                <label className="form-label">Account <span className="required">*</span></label>
                <select
                  className="input"
                  required
                  value={txForm.accountId}
                  onChange={(e) => setTxForm((f) => ({ ...f, accountId: e.target.value }))}
                >
                  <option value="">— Select account —</option>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label className="form-label">Date <span className="required">*</span></label>
                <input
                  className="input"
                  type="date"
                  required
                  value={txForm.transactionDate}
                  onChange={(e) => setTxForm((f) => ({ ...f, transactionDate: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Amount (₱) <span className="required">*</span></label>
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={txForm.amount}
                  onChange={(e) => setTxForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Description</label>
                <input
                  className="input"
                  type="text"
                  placeholder="What is this for?"
                  value={txForm.description}
                  onChange={(e) => setTxForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Reference No.</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Receipt, OR, invoice number…"
                  value={txForm.referenceNo}
                  onChange={(e) => setTxForm((f) => ({ ...f, referenceNo: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Notes</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Additional notes…"
                  value={txForm.notes}
                  onChange={(e) => setTxForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={closeTxForm} disabled={txSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={txSaving}>
                  {txSaving ? "Saving…" : editingTx ? "Save Changes" : "Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Account form modal ── */}
      {accFormOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAccForm(); }}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editingAcc ? "Edit Account" : "New Account"}</h2>
              <button className="modal-close" onClick={closeAccForm} aria-label="Close">×</button>
            </div>
            <form className="modal-body" onSubmit={saveAcc}>
              <div className="form-row">
                <label className="form-label">Name <span className="required">*</span></label>
                <input
                  className="input"
                  type="text"
                  required
                  placeholder="e.g. Equipment, Labor, Sales Revenue…"
                  value={accForm.name}
                  onChange={(e) => setAccForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Type <span className="required">*</span></label>
                <select
                  className="input"
                  value={accForm.type}
                  onChange={(e) => setAccForm((f) => ({ ...f, type: e.target.value }))}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>

              <div className="form-row">
                <label className="form-label">Description</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Optional short description"
                  value={accForm.description}
                  onChange={(e) => setAccForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={closeAccForm} disabled={accSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={accSaving}>
                  {accSaving ? "Saving…" : editingAcc ? "Save Changes" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete transaction confirm ── */}
      {deletingTx && (
        <div className="modal-overlay" onClick={() => setDeletingTx(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Transaction</h2>
            </div>
            <div className="modal-body">
              <p>
                Delete this {deletingTx.type === "in" ? "income" : "expense"} of{" "}
                <strong>₱{formatMoneyPlain(deletingTx.amount)}</strong>
                {deletingTx.description ? ` (${deletingTx.description})` : ""}?
                This cannot be undone.
              </p>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setDeletingTx(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => confirmDeleteTx(deletingTx)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Excel Import modal ── */}
      {importOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeImport(); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Import from Excel</h2>
              <button className="modal-close" onClick={closeImport} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              {importResult ? (
                <div>
                  <p className="form-success">
                    Successfully imported <strong>{importResult.imported}</strong> transaction(s).
                  </p>
                  <div className="table-wrapper" style={{ maxHeight: 320, overflowY: "auto" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th className="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.rows.map((r, i) => (
                          <tr key={i}>
                            <td>{formatDate(r.transactionDate)}</td>
                            <td>{r.description}</td>
                            <td className="text-right monospace">₱{formatMoneyPlain(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="modal-actions">
                    <button className="btn btn-primary" onClick={closeImport}>Done</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submitImport}>
                  <p className="import-hint">
                    Upload your Excel file (.xlsx / .xls). Expected columns: <strong>Date</strong>, <strong>Expenses / Description</strong>, <strong>Price</strong>, <strong>Qty</strong> — matches the standard format. Date column is optional if dates are merged rows.
                  </p>

                  <div className="form-row">
                    <label className="form-label">Account <span className="required">*</span></label>
                    <select
                      className="input"
                      required
                      value={importAccountId}
                      onChange={(e) => setImportAccountId(e.target.value)}
                    >
                      <option value="">— Select account —</option>
                      {activeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <label className="form-label">Transaction Type <span className="required">*</span></label>
                    <div className="radio-group">
                      <label className="radio-label">
                        <input type="radio" value="out" checked={importType === "out"} onChange={() => setImportType("out")} />
                        <span className="budget-negative">Out (Expenses)</span>
                      </label>
                      <label className="radio-label">
                        <input type="radio" value="in" checked={importType === "in"} onChange={() => setImportType("in")} />
                        <span className="budget-positive">In (Income)</span>
                      </label>
                    </div>
                  </div>

                  <div className="form-row">
                    <label className="form-label">Excel File <span className="required">*</span></label>
                    <input
                      className="input"
                      type="file"
                      accept=".xlsx,.xls"
                      required
                      onChange={(e) => setImportFile(e.target.files[0] || null)}
                    />
                  </div>

                  <div className="modal-actions">
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

      {/* ── Delete account confirm ── */}
      {deletingAcc && (
        <div className="modal-overlay" onClick={() => setDeletingAcc(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {deletingAcc.transaction_count > 0 ? "Deactivate Account" : "Delete Account"}
              </h2>
            </div>
            <div className="modal-body">
              {deletingAcc.transaction_count > 0 ? (
                <p>
                  <strong>{deletingAcc.name}</strong> has {deletingAcc.transaction_count} transaction(s).
                  It will be deactivated instead of deleted.
                </p>
              ) : (
                <p>Delete account <strong>{deletingAcc.name}</strong>? This cannot be undone.</p>
              )}
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setDeletingAcc(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => confirmDeleteAcc(deletingAcc)}>
                  {deletingAcc.transaction_count > 0 ? "Deactivate" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
