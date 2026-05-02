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
  projectId: "",
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
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  );
}
function IconArrowUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
function IconBalance() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v20M2 12h20" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
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
  const [scopeMode, setScopeMode] = useState("overall");
  const [scopeProjectId, setScopeProjectId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDeferredValue(searchRaw);

  const [view, setView] = useState("transactions"); // "transactions" | "accounts" | "sales"

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
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingImportedId, setDeletingImportedId] = useState(null);
  const [confirmImportedDeleteTx, setConfirmImportedDeleteTx] = useState(null);
  const [clearImportedOpen, setClearImportedOpen] = useState(false);
  const [clearingImported, setClearingImported] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignProjectId, setAssignProjectId] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importAccountId, setImportAccountId] = useState("");
  const [importType, setImportType] = useState("out");
  const [importProjectId, setImportProjectId] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importBatches, setImportBatches] = useState([]);
  const [deletingImportBatch, setDeletingImportBatch] = useState(null);
  const [importBatchDeleting, setImportBatchDeleting] = useState(false);
  const [projects, setProjects] = useState([]);

  // ── Sales / Customers state ─────────────────────────────────────────────────
  const [customers, setCustomers] = useState([]);
  const [salesSummary, setSalesSummary] = useState({ totalCustomers: 0, totalProjects: 0, totalSales: 0, totalExpenses: 0, totalMargin: 0 });
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState(null);

  const EMPTY_CUST = { name: "", contact: "", address: "", notes: "" };
  const EMPTY_PROJ = { customerId: "", projectName: "", saleAmount: "", projectDate: localDateInput(), status: "active", notes: "" };

  const [custForm, setCustForm] = useState(EMPTY_CUST);
  const [editingCust, setEditingCust] = useState(null);
  const [custOpen, setCustOpen] = useState(false);
  const [custSaving, setCustSaving] = useState(false);
  const [deletingCust, setDeletingCust] = useState(null);

  const [projForm, setProjForm] = useState(EMPTY_PROJ);
  const [editingProj, setEditingProj] = useState(null);
  const [projOpen, setProjOpen] = useState(false);
  const [projSaving, setProjSaving] = useState(false);
  const [deletingProj, setDeletingProj] = useState(null);

  const [detailProj, setDetailProj] = useState(null);
  const [detailTx, setDetailTx] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [salesView, setSalesView] = useState("overview"); // "overview" | "projects"

  const loadAll = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (filterAccount !== "all") params.set("accountId", filterAccount);
      if (scopeMode === "project" && scopeProjectId) params.set("projectId", scopeProjectId);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      if (search) params.set("q", search);
      const summaryParams = new URLSearchParams();
      if (scopeMode === "project" && scopeProjectId) summaryParams.set("projectId", scopeProjectId);
      if (filterDateFrom) summaryParams.set("dateFrom", filterDateFrom);
      if (filterDateTo) summaryParams.set("dateTo", filterDateTo);
      const [txRes, accRes, sumRes, projRes, custRes, salesSumRes, importBatchRes] = await Promise.all([
        api.get(`/budget?${params}`),
        api.get("/budget/accounts"),
        api.get(`/budget/summary?${summaryParams}`),
        api.get("/customers/projects").catch(() => ({ data: [] })),
        api.get("/customers").catch(() => ({ data: [] })),
        api.get("/customers/summary").catch(() => ({ data: {} })),
        api.get("/budget/import-batches").catch(() => ({ data: [] }))
      ]);
      setTransactions(txRes.data || []);
      setAccounts(accRes.data || []);
      setSummary(sumRes.data || { totalIn: 0, totalOut: 0, netBalance: 0, transactionCount: 0, activeAccounts: 0 });
      setProjects(projRes.data || []);
      setCustomers(custRes.data || []);
      setSalesSummary(salesSumRes.data || {});
      setImportBatches(importBatchRes.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load budget data.");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterAccount, filterDateFrom, filterDateTo, search, scopeMode, scopeProjectId]);

  function flash(msg, type = "success") {
    if (type === "success") { setSuccess(msg); setError(""); }
    else { setError(msg); setSuccess(""); }
    setTimeout(() => { setSuccess(""); setError(""); }, 3500);
  }

  const activeAccounts = useMemo(() => accounts.filter((a) => Number(a.is_active) === 1), [accounts]);
  const incomeAccounts = useMemo(
    () => activeAccounts.filter((a) => String(a.type || "").toLowerCase() === "income"),
    [activeAccounts]
  );
  const defaultIncomeAccountId = incomeAccounts[0]?.id ? String(incomeAccounts[0].id) : "";
  const hasFilters = filterType !== "all" || filterAccount !== "all" || filterDateFrom || filterDateTo || searchRaw || scopeMode !== "overall";
  const netPositive = toNumber(summary.netBalance, 0) >= 0;
  const visibleTxIds = useMemo(() => transactions.map((tx) => tx.id), [transactions]);
  const selectedTxCount = selectedTxIds.size;
  const allVisibleTxSelected = visibleTxIds.length > 0 && visibleTxIds.every((id) => selectedTxIds.has(id));
  const projectScoped = scopeMode === "project" && !!scopeProjectId;
  const selectedScopeProject = useMemo(
    () => projects.find((p) => String(p.id) === String(scopeProjectId)) || null,
    [projects, scopeProjectId]
  );
  const projectProjectedIncome = projectScoped ? toNumber(summary.projectedIncome ?? summary.projectBudget ?? summary.totalIn, 0) : toNumber(summary.totalIn, 0);
  const projectCollectedIncome = projectScoped ? toNumber(summary.collectedIncome ?? summary.totalIn, 0) : toNumber(summary.totalIn, 0);
  const projectBalanceDue = projectScoped ? toNumber(summary.balanceDue, Math.max(0, projectProjectedIncome - projectCollectedIncome)) : 0;
  const salesCollected = useMemo(
    () => projects.reduce((sum, project) => sum + toNumber(project.total_income, 0), 0),
    [projects]
  );
  const salesBalanceDue = useMemo(
    () => projects.reduce((sum, project) => sum + Math.max(0, toNumber(project.sale_amount, 0) - toNumber(project.total_income, 0)), 0),
    [projects]
  );

  useEffect(() => {
    if (scopeMode === "project" && !scopeProjectId && projects[0]?.id) {
      setScopeProjectId(String(projects[0].id));
    }
  }, [scopeMode, scopeProjectId, projects]);

  useEffect(() => {
    setSelectedTxIds((prev) => {
      const visible = new Set(visibleTxIds);
      const next = new Set(Array.from(prev).filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleTxIds]);

  // ── Import ──────────────────────────────────────────────────────────────────
  function openImport() {
    setImportAccountId(activeAccounts[0]?.id ? String(activeAccounts[0].id) : "");
    setImportType("out");
    setImportProjectId(projectScoped && selectedScopeProject ? String(selectedScopeProject.id) : "");
    setImportFile(null);
    setImportResult(null);
    setImportOpen(true);
  }
  function closeImport() {
    setImportOpen(false);
    setImportFile(null);
    setImportResult(null);
    setImportProjectId("");
    setConfirmImportedDeleteTx(null);
    setClearImportedOpen(false);
    setDeletingImportBatch(null);
  }
  async function submitImport(e) {
    e.preventDefault();
    if (!importFile) { flash("Please select an Excel file.", "error"); return; }
    if (!importAccountId) { flash("Please select an account.", "error"); return; }
    setImportLoading(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("accountId", importAccountId);
      fd.append("type", importType);
      if (importProjectId) fd.append("projectId", importProjectId);
      const res = await api.post("/budget/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(res.data);
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Import failed.", "error");
    } finally { setImportLoading(false); }
  }

  async function confirmDeleteImportBatch() {
    if (!deletingImportBatch?.import_batch_id) return;

    setImportBatchDeleting(true);
    try {
      const res = await api.delete(`/budget/import-batches/${encodeURIComponent(deletingImportBatch.import_batch_id)}`);
      flash(`${res.data?.deleted || deletingImportBatch.transaction_count} imported transaction(s) deleted.`);
      setImportResult((prev) => (prev?.importBatchId === deletingImportBatch.import_batch_id ? null : prev));
      setDeletingImportBatch(null);
      setSelectedTxIds(new Set());
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to delete imported Excel batch.", "error");
    } finally {
      setImportBatchDeleting(false);
    }
  }

  // ── Customer / Project handlers ─────────────────────────────────────────────
  function openNewCust() { setEditingCust(null); setCustForm(EMPTY_CUST); setCustOpen(true); }
  function openEditCust(c) { setEditingCust(c); setCustForm({ name: c.name || "", contact: c.contact || "", address: c.address || "", notes: c.notes || "" }); setCustOpen(true); }
  function closeCust() { setCustOpen(false); setEditingCust(null); setCustForm(EMPTY_CUST); }
  async function saveCust(e) {
    e.preventDefault(); setCustSaving(true);
    try {
      const payload = { name: custForm.name, contact: custForm.contact, address: custForm.address, notes: custForm.notes };
      if (editingCust) { await api.put(`/customers/${editingCust.id}`, payload); flash("Customer updated."); }
      else { await api.post("/customers", payload); flash("Customer created."); }
      closeCust(); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed to save.", "error"); }
    finally { setCustSaving(false); }
  }
  async function confirmDeleteCust(c) {
    try { const res = await api.delete(`/customers/${c.id}`); flash(res.data?.deactivated ? "Customer deactivated." : "Customer deleted."); setDeletingCust(null); await loadAll(true); }
    catch (err) { flash(err?.response?.data?.message || "Failed.", "error"); setDeletingCust(null); }
  }

  function openNewProj(custId = "") { setEditingProj(null); setProjForm({ ...EMPTY_PROJ, customerId: custId ? String(custId) : "", projectDate: localDateInput() }); setProjOpen(true); }
  function openEditProj(p) { setEditingProj(p); setProjForm({ customerId: String(p.customer_id), projectName: p.project_name || "", saleAmount: String(p.sale_amount), projectDate: p.project_date ? p.project_date.slice(0, 10) : localDateInput(), status: p.status || "active", notes: p.notes || "" }); setProjOpen(true); }
  function closeProj() { setProjOpen(false); setEditingProj(null); setProjForm(EMPTY_PROJ); }
  async function saveProj(e) {
    e.preventDefault(); setProjSaving(true);
    try {
      const payload = { customerId: Number(projForm.customerId), projectName: projForm.projectName, saleAmount: Number(projForm.saleAmount), projectDate: projForm.projectDate, status: projForm.status, notes: projForm.notes };
      if (editingProj) { await api.put(`/customers/projects/${editingProj.id}`, payload); flash("Project updated."); }
      else { await api.post("/customers/projects", payload); flash("Project created."); }
      closeProj(); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed to save.", "error"); }
    finally { setProjSaving(false); }
  }
  async function confirmDeleteProj(p) {
    try { await api.delete(`/customers/projects/${p.id}`); flash("Project deleted."); setDeletingProj(null); await loadAll(true); }
    catch (err) { flash(err?.response?.data?.message || "Failed.", "error"); setDeletingProj(null); }
  }
  async function openDetail(proj) {
    setDetailProj(proj); setDetailTx([]); setDetailLoading(true);
    try { const res = await api.get(`/customers/projects/${proj.id}/transactions`); setDetailTx(res.data || []); }
    catch { setDetailTx([]); }
    finally { setDetailLoading(false); }
  }

  // ── Transaction form ────────────────────────────────────────────────────────
  function toggleTxSelection(id) {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisibleTxSelection() {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      const allSelected = visibleTxIds.length > 0 && visibleTxIds.every((id) => next.has(id));
      visibleTxIds.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }

  function openAssignProject() {
    if (!selectedTxCount) return;
    setAssignProjectId(projects[0]?.id ? String(projects[0].id) : "");
    setAssignOpen(true);
  }

  function closeAssignProject() {
    setAssignOpen(false);
    setAssignProjectId("");
  }

  async function submitAssignProject(e) {
    e.preventDefault();
    if (!assignProjectId) { flash("Please select a project.", "error"); return; }
    setAssignSaving(true);
    try {
      const res = await api.put("/budget/bulk/project", {
        transactionIds: Array.from(selectedTxIds),
        projectId: Number(assignProjectId)
      });
      flash(`${res.data?.updated || selectedTxCount} transaction(s) assigned to project.`);
      setSelectedTxIds(new Set());
      closeAssignProject();
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to assign transactions.", "error");
    } finally {
      setAssignSaving(false);
    }
  }

  function openNewTx(overrides = {}) {
    setEditingTx(null);
    setTxForm({
      ...EMPTY_TX_FORM,
      transactionDate: localDateInput(),
      projectId: projectScoped && selectedScopeProject ? String(selectedScopeProject.id) : "",
      ...overrides
    });
    setTxFormOpen(true);
  }
  function openNewPayment(project = null) {
    const targetProject = project || selectedScopeProject || null;
    openNewTx({
      type: "in",
      accountId: defaultIncomeAccountId,
      projectId: targetProject?.id ? String(targetProject.id) : "",
      description: "Partial client payment"
    });
  }
  function openEditTx(tx) {
    setEditingTx(tx);
    setTxForm({
      accountId: String(tx.account_id), projectId: tx.project_id ? String(tx.project_id) : "", type: tx.type, amount: String(tx.amount),
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
      const payload = { accountId: Number(txForm.accountId), projectId: txForm.projectId ? Number(txForm.projectId) : null, type: txForm.type, amount: Number(txForm.amount), description: txForm.description, referenceNo: txForm.referenceNo, transactionDate: txForm.transactionDate, notes: txForm.notes };
      if (editingTx) { await api.put(`/budget/${editingTx.id}`, payload); flash("Transaction updated."); }
      else { await api.post("/budget", payload); flash("Transaction recorded."); }
      closeTxForm(); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed to save transaction.", "error"); }
    finally { setTxSaving(false); }
  }
  async function confirmDeleteTx(tx) {
    try {
      await api.delete(`/budget/${tx.id}`);
      flash("Transaction deleted.");
      setDeletingTx(null);
      setSelectedTxIds((prev) => {
        const next = new Set(prev);
        next.delete(tx.id);
        return next;
      });
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to delete.", "error");
      setDeletingTx(null);
    }
  }

  async function confirmBulkDeleteTx() {
    if (!selectedTxCount) return;

    setBulkDeleting(true);
    try {
      const res = await api.delete("/budget/bulk", {
        data: { transactionIds: Array.from(selectedTxIds) }
      });

      flash(`${res.data?.deleted || selectedTxCount} transaction(s) deleted.`);
      setSelectedTxIds(new Set());
      setBulkDeleteOpen(false);
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to delete selected transactions.", "error");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function deleteImportedTransaction(txId) {
    if (!txId) return;

    setDeletingImportedId(txId);
    try {
      await api.delete(`/budget/${txId}`);

      setImportResult((prev) => {
        if (!prev) return prev;
        const transactions = (prev.transactions || []).filter((tx) => Number(tx.id) !== Number(txId));
        return {
          ...prev,
          imported: transactions.length,
          transactions
        };
      });

      setSelectedTxIds((prev) => {
        const next = new Set(prev);
        next.delete(txId);
        return next;
      });

      await loadAll(true);
      flash("Imported transaction deleted.");
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to delete imported transaction.", "error");
    } finally {
      setDeletingImportedId(null);
    }
  }

  async function confirmDeleteAllImported() {
    if (importResult?.importBatchId) {
      setDeletingImportBatch({
        import_batch_id: importResult.importBatchId,
        import_source_name: importResult.importSourceName || "Imported Excel",
        transaction_count: (importResult.transactions || []).length
      });
      setClearImportedOpen(false);
      return;
    }

    const txIds = (importResult?.transactions || [])
      .map((tx) => Number(tx.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (!txIds.length) {
      setImportResult(null);
      setClearImportedOpen(false);
      return;
    }

    setClearingImported(true);
    try {
      const res = await api.delete("/budget/bulk", {
        data: { transactionIds: txIds }
      });

      flash(`${res.data?.deleted || txIds.length} imported transaction(s) deleted.`);
      setImportResult(null);
      setClearImportedOpen(false);
      setSelectedTxIds(new Set());
      await loadAll(true);
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to clear imported transactions.", "error");
    } finally {
      setClearingImported(false);
    }
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
      {projectScoped ? (
        <div className="bgt-kpi-row">
          <div className="bgt-kpi bgt-kpi--in">
            <div className="bgt-kpi-icon"><IconArrowDown /></div>
            <div className="bgt-kpi-body">
              <span className="bgt-kpi-label">Contract Value</span>
              <strong className="bgt-kpi-value">₱{formatMoney(summary.projectBudget)}</strong>
              <span className="bgt-kpi-sub">agreed project price</span>
            </div>
          </div>
          <div className="bgt-kpi bgt-kpi--count">
            <div className="bgt-kpi-body">
              <span className="bgt-kpi-label">Collected Payments</span>
              <strong className="bgt-kpi-value">₱{formatMoney(summary.collectedIncome ?? summary.totalIn)}</strong>
            </div>
            <div className="bgt-kpi-sub" style={{ color: toNumber(summary.balanceDue, 0) > 0 ? "#b86d12" : "#147845" }}>
              Balance due ₱{formatMoney(summary.balanceDue)}
            </div>
          </div>
          <div className="bgt-kpi bgt-kpi--out">
            <div className="bgt-kpi-icon"><IconArrowUp /></div>
            <div className="bgt-kpi-body">
              <span className="bgt-kpi-label">Current Expenses</span>
              <strong className="bgt-kpi-value">₱{formatMoney(summary.totalOut)}</strong>
              <span className="bgt-kpi-sub">linked costs</span>
            </div>
          </div>
          <div className={`bgt-kpi bgt-kpi--net ${netPositive ? "bgt-kpi--net-pos" : "bgt-kpi--net-neg"}`}>
            <div className="bgt-kpi-icon"><IconBalance /></div>
            <div className="bgt-kpi-body">
              <span className="bgt-kpi-label">Collected vs Expenses</span>
              <strong className="bgt-kpi-value">₱{formatMoney(summary.netBalance)}</strong>
            </div>
            <div className={`bgt-kpi-badge ${netPositive ? "bgt-kpi-badge--pos" : "bgt-kpi-badge--neg"}`}>
              {netPositive ? "Ahead" : "Short"}
            </div>
          </div>
        </div>
      ) : (
        <div className="bgt-kpi-row">
          <div className="bgt-kpi bgt-kpi--in">
            <div className="bgt-kpi-icon"><IconArrowDown /></div>
            <div className="bgt-kpi-body">
              <span className="bgt-kpi-label">Projected Revenue</span>
              <strong className="bgt-kpi-value">₱{formatMoney(summary.projectedRevenue ?? summary.totalBudget)}</strong>
              <span className="bgt-kpi-sub">total contract value</span>
            </div>
          </div>
          <div className="bgt-kpi bgt-kpi--in" style={{ opacity: 0.85 }}>
            <div className="bgt-kpi-icon"><IconArrowDown /></div>
            <div className="bgt-kpi-body">
              <span className="bgt-kpi-label">Total Collected</span>
              <strong className="bgt-kpi-value">₱{formatMoney(summary.totalIn)}</strong>
              <span className="bgt-kpi-sub">payments received</span>
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
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {success && (
        <div className="bgt-toast bgt-toast--ok" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          {success}
        </div>
      )}
      {error && (
        <div className="bgt-toast bgt-toast--err" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          {error}
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="bgt-toolbar">
        <div className="bgt-seg">
          <button className={`bgt-seg-btn${view === "transactions" ? " bgt-seg-btn--on" : ""}`} onClick={() => setView("transactions")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></svg>
            Transactions
          </button>
          <button className={`bgt-seg-btn${view === "accounts" ? " bgt-seg-btn--on" : ""}`} onClick={() => setView("accounts")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18" /><path d="M7 15h2M12 15h2" /></svg>
            Accounts
          </button>
          <button className={`bgt-seg-btn${view === "sales" ? " bgt-seg-btn--on" : ""}`} onClick={() => setView("sales")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            Sales
          </button>
        </div>

        <div className="bgt-toolbar-actions">
          {view === "transactions" && (
            <>
              <button className="btn btn-ghost bgt-btn-import" onClick={openAssignProject} disabled={!selectedTxCount || projects.length === 0}>
                <IconPlus /> Assign to Project{selectedTxCount ? ` (${selectedTxCount})` : ""}
              </button>
              <button className="btn btn-danger" onClick={() => setBulkDeleteOpen(true)} disabled={!selectedTxCount}>
                Delete Selected{selectedTxCount ? ` (${selectedTxCount})` : ""}
              </button>
              <button className="btn btn-ghost bgt-btn-import" onClick={openImport}>
                <IconUpload /> Import Excel
              </button>
              <button className="btn btn-ghost" onClick={() => openNewPayment()} disabled={!defaultIncomeAccountId}>
                <IconArrowDown /> Record Payment
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
          {view === "sales" && (
            <div className="bgt-toolbar-actions">
              <button className="btn btn-ghost bgt-btn-import" onClick={openImport}>
                <IconUpload /> Import Expenses
              </button>
              <button className="btn btn-ghost" onClick={() => openNewPayment(detailProj)} disabled={!defaultIncomeAccountId}><IconArrowDown /> Record Payment</button>
              <button className="btn btn-ghost bgt-btn-import" onClick={openNewCust}><IconPlus /> Add Client</button>
              <button className="btn btn-primary" onClick={() => openNewProj()}><IconPlus /> Add Project / Sale</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Transactions view ──────────────────────────────────────────────── */}
      {view === "transactions" && (
        <>
          <div className="bgt-filters">
            <div className="bgt-seg" style={{ flexShrink: 0 }}>
              <button className={`bgt-seg-btn${scopeMode === "overall" ? " bgt-seg-btn--on" : ""}`} onClick={() => setScopeMode("overall")}>
                Overall
              </button>
              <button className={`bgt-seg-btn${scopeMode === "project" ? " bgt-seg-btn--on" : ""}`} onClick={() => { setScopeMode("project"); if (!scopeProjectId && projects[0]?.id) setScopeProjectId(String(projects[0].id)); }}>
                Per Project
              </button>
            </div>
            {scopeMode === "project" && (
              <select className="input bgt-filter-select" value={scopeProjectId} onChange={(e) => setScopeProjectId(e.target.value)}>
                <option value="">Select project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.customer_name} — {p.project_name}</option>)}
              </select>
            )}
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
              <button className="btn btn-ghost bgt-clear-btn" onClick={() => { setFilterType("all"); setFilterAccount("all"); setScopeMode("overall"); setScopeProjectId(""); setFilterDateFrom(""); setFilterDateTo(""); setSearchRaw(""); }}>
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
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="bgt-empty-icon"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M9 13h1M14 13h1M9 17h1M14 17h1" /></svg>
              <p>{hasFilters ? "No transactions match your filters." : "No transactions yet. Record one or import from Excel."}</p>
              {!hasFilters && <button className="btn btn-primary" onClick={openNewTx}><IconPlus /> Record First Transaction</button>}
            </div>
          ) : (
            <div className="bgt-table-wrap">
              <table className="bgt-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={allVisibleTxSelected}
                        onChange={toggleVisibleTxSelection}
                        aria-label="Select all visible transactions"
                      />
                    </th>
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
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedTxIds.has(tx.id)}
                          onChange={() => toggleTxSelection(tx.id)}
                          aria-label={`Select transaction ${tx.id}`}
                        />
                      </td>
                      <td className="bgt-cell-date">{formatDate(tx.transaction_date)}</td>
                      <td className="bgt-cell-account">
                        <span className="bgt-account-chip">{tx.account_name || "—"}</span>
                        {tx.project_id && (
                          <div className="bgt-muted" style={{ marginTop: 5, fontSize: 11 }}>
                            {tx.customer_name ? `${tx.customer_name} — ` : ""}{tx.project_name}
                          </div>
                        )}
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
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          Edit
                        </button>
                        <button className="bgt-row-btn bgt-row-btn--del" onClick={() => setDeletingTx(tx)} title="Delete">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bgt-table-footer">
                {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
                {selectedTxCount > 0 ? ` • ${selectedTxCount} selected` : ""}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Accounts view ──────────────────────────────────────────────────── */}
      {assignOpen && (
        <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeAssignProject(); }}>
          <div className="bgt-modal bgt-modal--sm">
            <div className="bgt-modal-head">
              <div>
                <p className="bgt-modal-eyebrow">Assign expenses</p>
                <h3 className="bgt-modal-title">Assign to Project</h3>
              </div>
              <button className="bgt-modal-x" onClick={closeAssignProject} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form className="bgt-modal-body" onSubmit={submitAssignProject}>
              <div className="bgt-field">
                <label className="bgt-label">Selected Transactions</label>
                <div className="bgt-account-chip">{selectedTxCount} selected</div>
              </div>
              <div className="bgt-field">
                <label className="bgt-label">Project <span className="bgt-req">*</span></label>
                <select className="input" required value={assignProjectId} onChange={(e) => setAssignProjectId(e.target.value)}>
                  <option value="">— Select project —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.customer_name} — {p.project_name}</option>)}
                </select>
              </div>
              <div className="bgt-modal-foot">
                <button type="button" className="btn btn-ghost" onClick={closeAssignProject} disabled={assignSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={assignSaving || !assignProjectId}>
                  {assignSaving ? "Assigning…" : "Assign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {view === "accounts" && (
        accounts.length === 0 ? (
          <div className="bgt-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="bgt-empty-icon"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M7 15h2M12 15h2" /></svg>
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

      {/* ── Sales view ─────────────────────────────────────────────────────── */}
      {view === "sales" && (() => {
        const STATUS_LABELS = { active: "Active", completed: "Completed", cancelled: "Cancelled" };
        const STATUS_COLORS = { active: "sl-pill--active", completed: "sl-pill--done", cancelled: "sl-pill--cancelled" };
        const netPos = toNumber(salesSummary.totalMargin, 0) >= 0;
        return (
          <>
            {/* Sales KPI strip */}
            <div className="sl-kpi-row">
              <div className="sl-kpi">
                <span className="sl-kpi-label">Clients</span>
                <strong className="sl-kpi-value">{salesSummary.totalCustomers || 0}</strong>
                <span className="sl-kpi-sub">{salesSummary.totalProjects || 0} project(s) • ₱{formatMoney(salesCollected)} collected</span>
              </div>
              <div className="sl-kpi sl-kpi--sales">
                <span className="sl-kpi-label">Contract Value</span>
                <strong className="sl-kpi-value">₱{formatMoney(salesSummary.totalSales)}</strong>
                <span className="sl-kpi-sub">₱{formatMoney(salesBalanceDue)} still to collect</span>
              </div>
              <div className="sl-kpi sl-kpi--expenses">
                <span className="sl-kpi-label">Total Expenses</span>
                <strong className="sl-kpi-value">₱{formatMoney(salesSummary.totalExpenses)}</strong>
                <span className="sl-kpi-sub">linked costs</span>
              </div>
              <div className={`sl-kpi ${netPos ? "sl-kpi--pos" : "sl-kpi--neg"}`}>
                <span className="sl-kpi-label">Net Margin</span>
                <strong className="sl-kpi-value">₱{formatMoney(salesSummary.totalMargin)}</strong>
                <span className={`sl-kpi-badge ${netPos ? "sl-kpi-badge--pos" : "sl-kpi-badge--neg"}`}>{netPos ? "Profit" : "Loss"}</span>
              </div>
            </div>

            {/* Sub-view toggle */}
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`bgt-seg-btn${salesView === "overview" ? " bgt-seg-btn--on" : ""}`} style={{ background: salesView === "overview" ? "#fff" : "transparent", borderRadius: 9, padding: "7px 14px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }} onClick={() => setSalesView("overview")}>Overall</button>
              <button className={`bgt-seg-btn${salesView === "projects" ? " bgt-seg-btn--on" : ""}`} style={{ background: salesView === "projects" ? "#fff" : "transparent", borderRadius: 9, padding: "7px 14px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }} onClick={() => setSalesView("projects")}>All Projects</button>
            </div>

            {/* Overview — customer cards */}
            {salesView === "overview" && (
              customers.length === 0 ? (
                <div className="bgt-empty">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="bgt-empty-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                  <p>No clients yet. Add your first client, then create a project under that client.</p>
                  <button className="btn btn-primary" onClick={openNewCust}><IconPlus /> Add Client</button>
                </div>
              ) : (
                <div className="sl-overview-grid">
                  {customers.map((cust) => {
                    const custProjs = projects.filter((p) => p.customer_id === cust.id);
                    const tSales = custProjs.reduce((s, p) => s + toNumber(p.sale_amount, 0), 0);
                    const tExp = custProjs.reduce((s, p) => s + toNumber(p.total_expenses, 0), 0);
                    const margin = tSales - tExp;
                    return (
                      <div key={cust.id} className="sl-cust-card">
                        <div className="sl-cust-card-head">
                          <div className="sl-cust-avatar">{cust.name.slice(0, 1).toUpperCase()}</div>
                          <div className="sl-cust-info">
                            <strong className="sl-cust-name">{cust.name}</strong>
                            {cust.contact && <p className="sl-cust-meta">{cust.contact}</p>}
                          </div>
                          <div className="sl-cust-actions">
                            <button className="bgt-row-btn" onClick={() => openEditCust(cust)}>Edit</button>
                            <button className="bgt-row-btn bgt-row-btn--del" onClick={() => setDeletingCust(cust)}>Delete</button>
                          </div>
                        </div>
                        <div className="sl-cust-stats">
                          <div className="sl-stat"><span className="sl-stat-label">Sales</span><span className="sl-stat-val sl-stat-val--sales">₱{formatMoney(tSales)}</span></div>
                          <div className="sl-stat-div" />
                          <div className="sl-stat"><span className="sl-stat-label">Expenses</span><span className="sl-stat-val sl-stat-val--exp">₱{formatMoney(tExp)}</span></div>
                          <div className="sl-stat-div" />
                          <div className="sl-stat"><span className="sl-stat-label">Margin</span><span className={`sl-stat-val ${margin >= 0 ? "sl-stat-val--sales" : "sl-stat-val--exp"}`}>₱{formatMoney(margin)}</span></div>
                        </div>
                        {custProjs.length > 0 && (
                          <div className="sl-cust-projects">
                            {custProjs.map((p) => (
                              <button key={p.id} className="sl-proj-row" onClick={() => openDetail(p)}>
                                <div className="sl-proj-row-left">
                                  <span className={`sl-pill ${STATUS_COLORS[p.status] || ""}`}>{STATUS_LABELS[p.status] || p.status}</span>
                                  <div className="sl-proj-copy">
                                    <span className="sl-proj-name">{p.project_name}</span>
                                    <span className="sl-proj-sub">Collected ₱{formatMoney(p.total_income)} of ₱{formatMoney(p.sale_amount)}</span>
                                  </div>
                                </div>
                                <div className="sl-proj-row-right">
                                  <span className="sl-proj-margin" style={{ color: toNumber(p.margin, 0) >= 0 ? "#147845" : "#b83a3a" }}>₱{formatMoney(p.margin)}</span>
                                  <button className="bgt-row-btn" onClick={(e) => { e.stopPropagation(); openNewPayment(p); }}>Payment</button>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        <button className="sl-add-proj-btn" onClick={() => openNewProj(cust.id)}><IconPlus /> Add Project / Sale</button>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Projects table */}
            {salesView === "projects" && (
              <>
                <div className="sl-filter-bar">
                  <select className="input sl-filter-select" value={selectedCustomerFilter || ""} onChange={(e) => setSelectedCustomerFilter(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">All customers</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {(() => {
                  const filtered = selectedCustomerFilter ? projects.filter((p) => p.customer_id === selectedCustomerFilter) : projects;
                  return filtered.length === 0 ? (
                    <div className="bgt-empty"><p>No projects found.</p><button className="btn btn-primary" onClick={() => openNewProj()}><IconPlus /> Add Project / Sale</button></div>
                  ) : (
                    <div className="bgt-table-wrap">
                      <table className="bgt-table">
                        <thead><tr><th>Customer</th><th>Project</th><th>Date</th><th>Status</th><th className="bgt-col-amt">Contract</th><th className="bgt-col-amt">Expenses</th><th className="bgt-col-amt">Margin</th><th /></tr></thead>
                        <tbody>
                          {filtered.map((p) => {
                            const m = toNumber(p.margin, 0);
                            return (
                              <tr key={p.id} className="bgt-table-row" style={{ cursor: "pointer" }} onClick={() => openDetail(p)}>
                                <td><span className="bgt-account-chip">{p.customer_name}</span></td>
                                <td><strong>{p.project_name}</strong></td>
                                <td className="bgt-cell-date">{p.project_date ? new Date(p.project_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</td>
                                <td><span className={`sl-pill ${STATUS_COLORS[p.status] || ""}`}>{STATUS_LABELS[p.status] || p.status}</span></td>
                                <td className="bgt-col-amt" style={{ color: "#147845", fontWeight: 700 }}>₱{formatMoney(p.sale_amount)}</td>
                                <td className="bgt-col-amt" style={{ color: "#b83a3a", fontWeight: 700 }}>₱{formatMoney(p.total_expenses)}</td>
                                <td className="bgt-col-amt" style={{ color: m >= 0 ? "#147845" : "#b83a3a", fontWeight: 700 }}>₱{formatMoney(m)}</td>
                                <td className="bgt-col-actions" onClick={(e) => e.stopPropagation()}>
                                  <button className="bgt-row-btn" onClick={() => openNewPayment(p)}>Payment</button>
                                  <button className="bgt-row-btn" onClick={() => openEditProj(p)}>Edit</button>
                                  <button className="bgt-row-btn bgt-row-btn--del" onClick={() => setDeletingProj(p)}>Delete</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Project detail modal */}
            {detailProj && (
              <div className="bgt-backdrop" onClick={() => setDetailProj(null)}>
                <div className="sl-drawer" onClick={(e) => e.stopPropagation()}>
                  <div className="bgt-modal-head">
                    <div><p className="bgt-modal-eyebrow">{detailProj.customer_name}</p><h3 className="bgt-modal-title">{detailProj.project_name}</h3></div>
                    <button className="bgt-modal-x" onClick={() => setDetailProj(null)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                  </div>
                  <div className="bgt-modal-body">
                    <div className="sl-drawer-stats">
                      <div className="sl-dstat"><span className="sl-dstat-label">Collected</span><strong className="sl-dstat-val sl-dstat-val--sales">₱{formatMoney(detailProj.total_income)}</strong></div>
                      <div className="sl-dstat"><span className="sl-dstat-label">Balance Due</span><strong className="sl-dstat-val" style={{ color: toNumber(detailProj.balance_due, 0) > 0 ? "#b86d12" : "#147845" }}>₱{formatMoney(detailProj.balance_due)}</strong></div>
                      <div className="sl-dstat"><span className="sl-dstat-label">Sale Amount</span><strong className="sl-dstat-val sl-dstat-val--sales">₱{formatMoney(detailProj.sale_amount)}</strong></div>
                      <div className="sl-dstat"><span className="sl-dstat-label">Expenses</span><strong className="sl-dstat-val sl-dstat-val--exp">₱{formatMoney(detailProj.total_expenses)}</strong></div>
                      <div className="sl-dstat"><span className="sl-dstat-label">Margin</span><strong className={`sl-dstat-val ${toNumber(detailProj.margin, 0) >= 0 ? "sl-dstat-val--sales" : "sl-dstat-val--exp"}`}>₱{formatMoney(detailProj.margin)}</strong></div>
                    </div>
                    <div className="bgt-modal-foot" style={{ justifyContent: "flex-start", paddingTop: 0 }}>
                      <button className="btn btn-ghost" onClick={() => openNewPayment(detailProj)} disabled={!defaultIncomeAccountId}><IconArrowDown /> Record Partial Payment</button>
                      <button className="btn btn-ghost" onClick={() => openEditProj(detailProj)}>Edit Contract</button>
                    </div>
                    <div className="sl-drawer-section">
                      <p className="sl-drawer-section-title">Linked Transactions ({detailTx.length})</p>
                      {detailLoading ? (
                        <div className="bgt-empty" style={{ padding: 24 }}><div className="bgt-spinner" /></div>
                      ) : detailTx.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)", padding: "10px 0" }}>No expenses linked yet. Assign via Import Excel → select this project.</p>
                      ) : (
                        <div className="bgt-import-preview">
                          <table className="bgt-table bgt-table--compact">
                            <thead><tr><th>Date</th><th>Description</th><th>Account</th><th className="bgt-col-amt">Amount</th></tr></thead>
                            <tbody>
                              {detailTx.map((tx) => (
                                <tr key={tx.id}>
                                  <td className="bgt-cell-date">{tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</td>
                                  <td>{tx.description || <span className="bgt-muted">—</span>}</td>
                                  <td><span className="bgt-account-chip">{tx.account_name}</span></td>
                                  <td className={`bgt-col-amt bgt-amount--${tx.type}`}>₱{formatMoney(tx.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    <div className="bgt-modal-foot">
                      <button className="btn btn-ghost" onClick={() => { setDetailProj(null); openEditProj(detailProj); }}>Edit Project</button>
                      <button className="btn btn-primary" onClick={() => setDetailProj(null)}>Close</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Customer form */}
            {custOpen && (
              <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeCust(); }}>
                <div className="bgt-modal bgt-modal--sm">
                  <div className="bgt-modal-head"><div><p className="bgt-modal-eyebrow">{editingCust ? "Editing" : "New client"}</p><h3 className="bgt-modal-title">{editingCust ? "Edit Client" : "Add Client"}</h3></div><button className="bgt-modal-x" onClick={closeCust}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button></div>
                  <form className="bgt-modal-body" onSubmit={saveCust}>
                    <div className="bgt-form-grid">
                      <div className="bgt-field bgt-field--wide"><label className="bgt-label">Name <span className="bgt-req">*</span></label><input className="input" required placeholder="e.g. Allan Santos" value={custForm.name} onChange={(e) => setCustForm((f) => ({ ...f, name: e.target.value }))} /></div>
                      <div className="bgt-field bgt-field--wide"><label className="bgt-label">Contact / Phone</label><input className="input" placeholder="Phone or email" value={custForm.contact} onChange={(e) => setCustForm((f) => ({ ...f, contact: e.target.value }))} /></div>
                      <div className="bgt-field bgt-field--wide"><label className="bgt-label">Address</label><input className="input" placeholder="Address (optional)" value={custForm.address} onChange={(e) => setCustForm((f) => ({ ...f, address: e.target.value }))} /></div>
                    </div>
                    <div className="bgt-modal-foot"><button type="button" className="btn btn-ghost" onClick={closeCust} disabled={custSaving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={custSaving}>{custSaving ? "Saving…" : editingCust ? "Save Changes" : "Create Client"}</button></div>
                  </form>
                </div>
              </div>
            )}

            {/* Project form */}
            {projOpen && (
              <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeProj(); }}>
                <div className="bgt-modal bgt-modal--sm">
                  <div className="bgt-modal-head"><div><p className="bgt-modal-eyebrow">{editingProj ? "Editing" : "New project / sale"}</p><h3 className="bgt-modal-title">{editingProj ? "Edit Project / Sale" : "Add Project / Sale"}</h3></div><button className="bgt-modal-x" onClick={closeProj}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button></div>
                  <form className="bgt-modal-body" onSubmit={saveProj}>
                    <div className="bgt-form-grid">
                      <div className="bgt-field bgt-field--wide"><label className="bgt-label">Customer <span className="bgt-req">*</span></label><select className="input" required value={projForm.customerId} onChange={(e) => setProjForm((f) => ({ ...f, customerId: e.target.value }))}><option value="">— Select customer —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                      <div className="bgt-field bgt-field--wide"><label className="bgt-label">Project Name <span className="bgt-req">*</span></label><input className="input" required placeholder="e.g. Solar Installation – Phase 1" value={projForm.projectName} onChange={(e) => setProjForm((f) => ({ ...f, projectName: e.target.value }))} /></div>
                      <div className="bgt-field"><label className="bgt-label">Contract Amount (₱) <span className="bgt-req">*</span></label><input className="input" type="number" min="0" step="0.01" required placeholder="0.00" value={projForm.saleAmount} onChange={(e) => setProjForm((f) => ({ ...f, saleAmount: e.target.value }))} /><span className="bgt-field-note">Use the full project price here. Partial client payments are recorded later as Income.</span></div>
                      <div className="bgt-field"><label className="bgt-label">Date</label><input className="input" type="date" value={projForm.projectDate} onChange={(e) => setProjForm((f) => ({ ...f, projectDate: e.target.value }))} /></div>
                      <div className="bgt-field bgt-field--wide"><label className="bgt-label">Status</label><select className="input" value={projForm.status} onChange={(e) => setProjForm((f) => ({ ...f, status: e.target.value }))}><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
                    </div>
                    <div className="bgt-modal-foot"><button type="button" className="btn btn-ghost" onClick={closeProj} disabled={projSaving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={projSaving}>{projSaving ? "Saving…" : editingProj ? "Save Changes" : "Create Project / Sale"}</button></div>
                  </form>
                </div>
              </div>
            )}

            {/* Delete customer */}
            {deletingCust && (
              <div className="bgt-backdrop" onClick={() => setDeletingCust(null)}>
                <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
                  <div className="bgt-confirm-icon bgt-confirm-icon--del"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg></div>
                  <h3 className="bgt-confirm-title">{deletingCust.project_count > 0 ? "Deactivate Customer?" : "Delete Customer?"}</h3>
                  <p className="bgt-confirm-body">{deletingCust.project_count > 0 ? <><strong>{deletingCust.name}</strong> has {deletingCust.project_count} project(s) and will be deactivated.</> : <>Delete <strong>{deletingCust.name}</strong>? This cannot be undone.</>}</p>
                  <div className="bgt-modal-foot bgt-modal-foot--center"><button className="btn btn-ghost" onClick={() => setDeletingCust(null)}>Cancel</button><button className="btn btn-danger" onClick={() => confirmDeleteCust(deletingCust)}>{deletingCust.project_count > 0 ? "Deactivate" : "Delete"}</button></div>
                </div>
              </div>
            )}

            {/* Delete project */}
            {deletingProj && (
              <div className="bgt-backdrop" onClick={() => setDeletingProj(null)}>
                <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
                  <div className="bgt-confirm-icon bgt-confirm-icon--del"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg></div>
                  <h3 className="bgt-confirm-title">Delete Project?</h3>
                  <p className="bgt-confirm-body">Delete <strong>{deletingProj.project_name}</strong>? All linked expense assignments will be removed.</p>
                  <div className="bgt-modal-foot bgt-modal-foot--center"><button className="btn btn-ghost" onClick={() => setDeletingProj(null)}>Cancel</button><button className="btn btn-danger" onClick={() => confirmDeleteProj(deletingProj)}>Delete</button></div>
                </div>
              </div>
            )}
          </>
        );
      })()}

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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
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
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Project <span className="bgt-label-opt">(optional)</span></label>
                  <select className="input" value={txForm.projectId} onChange={(e) => setTxForm((f) => ({ ...f, projectId: e.target.value }))}>
                    <option value="">— No project —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.customer_name} — {p.project_name}</option>)}
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
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
          <div className="bgt-modal bgt-modal--import" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-modal-head">
              <div>
                <p className="bgt-modal-eyebrow">Bulk import</p>
                <h3 className="bgt-modal-title">Import from Excel</h3>
              </div>
              <button className="bgt-modal-x" onClick={closeImport} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="bgt-modal-body">
              {importResult ? (
                <>
                  <div className="bgt-import-success">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                    <strong>{importResult.imported} transaction{importResult.imported !== 1 ? "s" : ""} imported from {importResult.importSourceName || "Excel file"}</strong>
                  </div>
                  <div className="bgt-import-preview">
                    <table className="bgt-table bgt-table--compact">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Account</th>
                          <th>Type</th>
                          <th className="bgt-col-amt">Amount</th>
                          <th className="bgt-col-actions">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(importResult.transactions || []).map((tx) => (
                          <tr key={tx.id}>
                            <td className="bgt-cell-date">{formatDate(tx.transaction_date)}</td>
                            <td>{tx.description || <span className="bgt-muted">—</span>}</td>
                            <td><span className="bgt-account-chip">{tx.account_name || "—"}</span></td>
                            <td>
                              <span className={`bgt-type-pill bgt-type-pill--${tx.type}`}>
                                {tx.type === "in" ? "↓ In" : "↑ Out"}
                              </span>
                            </td>
                            <td className={`bgt-col-amt bgt-amount--${tx.type}`}>₱{formatMoney(tx.amount)}</td>
                            <td className="bgt-col-actions">
                              <button
                                type="button"
                                className="bgt-row-btn bgt-row-btn--del"
                                disabled={deletingImportedId === tx.id}
                                onClick={() => setConfirmImportedDeleteTx(tx)}
                              >
                                {deletingImportedId === tx.id ? "Deleting…" : "Delete"}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(!importResult.transactions || importResult.transactions.length === 0) && (importResult.rows || []).map((r, i) => (
                          <tr key={i}>
                            <td className="bgt-cell-date">{formatDate(r.transactionDate)}</td>
                            <td>{r.description}</td>
                            <td><span className="bgt-muted">—</span></td>
                            <td><span className="bgt-muted">—</span></td>
                            <td className="bgt-col-amt bgt-amount--out">₱{formatMoney(r.amount)}</td>
                            <td className="bgt-col-actions"><span className="bgt-muted">Reload required</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bgt-modal-foot">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setImportResult(null)}
                    >
                      Clear Preview
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setClearImportedOpen(true)}
                      disabled={!(importResult.transactions || []).length}
                    >
                      Delete This Imported Excel
                    </button>
                    <button className="btn btn-primary" onClick={closeImport}>Done</button>
                  </div>
                </>
              ) : (
                <form onSubmit={submitImport}>

                  {/* Format hint */}
                  <div className="bgt-import-format">
                    <div className="bgt-import-format-title">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                      Expected Excel format
                    </div>
                    <div className="bgt-import-cols">
                      {["Date", "Description / Expenses", "Price", "Qty", "Sub Total"].map((col) => (
                        <span key={col} className="bgt-import-col-chip">{col}</span>
                      ))}
                    </div>
                    <p className="bgt-import-format-note">Dates carry forward across merged rows automatically. If Sub Total exists, it is used as the row amount.</p>
                  </div>
                  <p className="bgt-import-helper">
                    Create the client/project first if you want these imported rows linked to a sale. Partial client payments should be recorded as Income, not imported with expense sheets.
                  </p>

                  {importBatches.length > 0 && (
                    <div className="bgt-import-history">
                      <div className="bgt-import-history-head">
                        <strong>Recent imported Excels</strong>
                        <span>{importBatches.length} batch{importBatches.length !== 1 ? "es" : ""}</span>
                      </div>
                      <div className="bgt-import-history-list">
                        {importBatches.map((batch) => (
                          <div key={batch.import_batch_id} className="bgt-import-history-item">
                            <div className="bgt-import-history-copy">
                              <strong>{batch.import_source_name || "Imported Excel"}</strong>
                              <span>{batch.transaction_count} row(s) • ₱{formatMoney(batch.total_amount)}</span>
                            </div>
                            <button type="button" className="bgt-row-btn bgt-row-btn--del" onClick={() => setDeletingImportBatch(batch)}>
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bgt-form-grid" style={{ marginTop: 16 }}>
                    <div className="bgt-field bgt-field--wide">
                      <label className="bgt-label">Account <span className="bgt-req">*</span></label>
                      <select className="input" required value={importAccountId} onChange={(e) => setImportAccountId(e.target.value)}>
                        <option value="">— Select account —</option>
                        {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>

                    <div className="bgt-field bgt-field--wide">
                      <label className="bgt-label">Assign to Project <span className="bgt-label-opt">(optional)</span></label>
                      <select className="input" value={importProjectId} onChange={(e) => setImportProjectId(e.target.value)}>
                        <option value="">— No project —</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.customer_name} — {p.project_name}</option>)}
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
                      <label className="bgt-label">Excel File <span className="bgt-req">*</span></label>
                      <label className="bgt-file-drop">
                        <input type="file" accept=".xlsx,.xls" required className="bgt-file-input" onChange={(e) => setImportFile(e.target.files[0] || null)} />
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                        <span className="bgt-file-label">
                          {importFile ? importFile.name : <><strong>Choose file</strong> or drag & drop</>}
                        </span>
                        <span className="bgt-file-note">.xlsx or .xls · max 20 MB</span>
                      </label>
                    </div>
                  </div>

                  <div className="bgt-modal-foot" style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-ghost" onClick={closeImport} disabled={importLoading}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={importLoading || !importFile}>
                      {importLoading
                        ? <><span className="bgt-btn-spinner" /> Importing…</>
                        : <><IconUpload /> Import</>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk delete tx confirm ─────────────────────────────────────────── */}
      {confirmImportedDeleteTx && (
        <div className="bgt-backdrop" onClick={() => setConfirmImportedDeleteTx(null)}>
          <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-confirm-icon bgt-confirm-icon--del">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
            </div>
            <h3 className="bgt-confirm-title">Delete Imported Row?</h3>
            <p className="bgt-confirm-body">
              This will permanently delete <strong>{confirmImportedDeleteTx.description || "this imported transaction"}</strong>. This cannot be undone.
            </p>
            <div className="bgt-modal-foot bgt-modal-foot--center">
              <button className="btn btn-ghost" onClick={() => setConfirmImportedDeleteTx(null)} disabled={deletingImportedId === confirmImportedDeleteTx.id}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={deletingImportedId === confirmImportedDeleteTx.id}
                onClick={async () => {
                  const txId = confirmImportedDeleteTx.id;
                  setConfirmImportedDeleteTx(null);
                  await deleteImportedTransaction(txId);
                }}
              >
                {deletingImportedId === confirmImportedDeleteTx.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {clearImportedOpen && (
        <div className="bgt-backdrop" onClick={() => !clearingImported && setClearImportedOpen(false)}>
          <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-confirm-icon bgt-confirm-icon--del">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
            </div>
            <h3 className="bgt-confirm-title">Delete All Imported Rows?</h3>
            <p className="bgt-confirm-body">
              This will permanently delete <strong>{(importResult?.transactions || []).length}</strong> imported transaction(s) from this Excel import. This cannot be undone.
            </p>
            <div className="bgt-modal-foot bgt-modal-foot--center">
              <button className="btn btn-ghost" onClick={() => setClearImportedOpen(false)} disabled={clearingImported}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteAllImported} disabled={clearingImported}>
                {clearingImported ? "Deleting..." : "Delete All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingImportBatch && (
        <div className="bgt-backdrop" onClick={() => !importBatchDeleting && setDeletingImportBatch(null)}>
          <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-confirm-icon bgt-confirm-icon--del">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
            </div>
            <h3 className="bgt-confirm-title">Delete Imported Excel?</h3>
            <p className="bgt-confirm-body">
              This will permanently delete <strong>{deletingImportBatch.import_source_name || "this imported Excel"}</strong> and all <strong>{deletingImportBatch.transaction_count}</strong> transaction(s) created from it.
            </p>
            <div className="bgt-modal-foot bgt-modal-foot--center">
              <button className="btn btn-ghost" onClick={() => setDeletingImportBatch(null)} disabled={importBatchDeleting}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteImportBatch} disabled={importBatchDeleting}>
                {importBatchDeleting ? "Deleting..." : "Delete Imported Excel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div className="bgt-backdrop" onClick={() => setBulkDeleteOpen(false)}>
          <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-confirm-icon bgt-confirm-icon--del">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
            </div>
            <h3 className="bgt-confirm-title">Delete Selected Transactions?</h3>
            <p className="bgt-confirm-body">
              This will permanently delete <strong>{selectedTxCount}</strong> selected transaction{selectedTxCount !== 1 ? "s" : ""}. This cannot be undone.
            </p>
            <div className="bgt-modal-foot bgt-modal-foot--center">
              <button className="btn btn-ghost" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmBulkDeleteTx} disabled={bulkDeleting || !selectedTxCount}>
                {bulkDeleting ? "Deleting…" : "Delete Selected"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete tx confirm ──────────────────────────────────────────────── */}
      {deletingTx && (
        <div className="bgt-backdrop" onClick={() => setDeletingTx(null)}>
          <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-confirm-icon bgt-confirm-icon--del">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
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
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
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
