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

const PRICE_DECIMAL_PLACES = 4;
const AMOUNT_DECIMAL_PLACES = 2;

function formatMoney(value, fractionDigits = 2) {
  if (value == null || value === "") return "—";
  return toNumber(value, 0).toLocaleString("en-PH", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

function formatQuantity(value) {
  if (value == null || value === "") return "—";
  return toNumber(value, 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: PRICE_DECIMAL_PLACES });
}

function formatDate(value) {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatFormNumber(value) {
  if (value == null || value === "") return "";
  return String(value);
}

function formatFixedFormNumber(value, fractionDigits) {
  if (value == null || value === "") return "";
  return toNumber(value, 0).toFixed(fractionDigits);
}

function calculateTransactionAmount(price, quantity, discount = 0) {
  const unitPrice = Number(price);
  const qty = Number(quantity);
  const discountAmount = discount === "" || discount == null ? 0 : Number(discount);
  if (!Number.isFinite(unitPrice) || !Number.isFinite(qty) || unitPrice <= 0 || qty <= 0) return "";
  if (!Number.isFinite(discountAmount) || discountAmount < 0) return "";
  const amount = unitPrice * qty - discountAmount;
  if (amount <= 0) return "";
  return (Math.round(amount * 100) / 100).toFixed(AMOUNT_DECIMAL_PLACES);
}

let txLineSequence = 0;

function createTxLine(overrides = {}) {
  txLineSequence += 1;
  return {
    lineKey: `tx-line-${txLineSequence}`,
    description: "",
    price: "",
    quantity: "",
    discount: "",
    amount: "",
    notes: "",
    ...overrides
  };
}

function hasTxLineInput(line) {
  return ["description", "price", "quantity", "discount", "amount", "notes"].some((field) => {
    const value = line?.[field];
    return value != null && String(value).trim() !== "";
  });
}

const EMPTY_TX_FORM = {
  accountId: "",
  projectId: "",
  type: "",
  referenceNo: "",
  transactionDate: localDateInput()
};

const ACCOUNT_TYPE_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "investment", label: "Investment" },
  { value: "withdrawal", label: "Withdrawal" }
];
const ACCOUNT_TYPE_DIRECTIONS = {
  expense: "out",
  income: "in",
  investment: "in",
  withdrawal: "out"
};
const PROJECT_CATEGORY_OPTIONS = [
  { value: "materials", label: "Materials" },
  { value: "labor", label: "Labor" },
  { value: "others", label: "Others" }
];
const STATUS_LABELS = { active: "Active", completed: "Completed", cancelled: "Cancelled" };
const STATUS_COLORS = { active: "sl-pill--active", completed: "sl-pill--done", cancelled: "sl-pill--cancelled" };

function accountTypeLabel(type) {
  return ACCOUNT_TYPE_OPTIONS.find((option) => option.value === type)?.label || "Expense";
}

function normalizeAccountType(type, fallback = "expense") {
  const normalized = String(type || "").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ACCOUNT_TYPE_DIRECTIONS, normalized)) return normalized;
  if (normalized === "in") return "income";
  if (normalized === "out") return "expense";
  return fallback;
}

function transactionDirectionFromAccountType(type) {
  return ACCOUNT_TYPE_DIRECTIONS[normalizeAccountType(type)] || "out";
}

function accountTypeFromTransactionRecord(tx) {
  return normalizeAccountType(tx?.account_type || tx?.type);
}

function transactionTypeLabel(type) {
  const accountType = normalizeAccountType(type);
  const direction = transactionDirectionFromAccountType(accountType) === "in" ? "In" : "Out";
  return `${accountTypeLabel(accountType)} (${direction})`;
}

function transactionTypeShortLabel(type) {
  const accountType = normalizeAccountType(type);
  const direction = transactionDirectionFromAccountType(accountType);
  return `${direction === "in" ? "↓" : "↑"} ${accountTypeLabel(accountType)}`;
}

function projectDisplayName(project) {
  if (!project) return "Untitled project";
  return project.customer_name ? `${project.customer_name} — ${project.project_name}` : project.project_name || "Untitled project";
}

function createMaterialDetail(overrides = {}) {
  return { item: "", qty: "", unitCost: "", total: "", ...overrides };
}

function createLaborDetail(overrides = {}) {
  return { description: "", amount: "", ...overrides };
}

function createOtherExpenseDetail(overrides = {}) {
  return { expenses: "", amount: "", ...overrides };
}

function materialDetailTotal(row) {
  const explicit = Number(row?.total);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const qty = Number(row?.qty);
  const unitCost = Number(row?.unitCost);
  if (!Number.isFinite(qty) || !Number.isFinite(unitCost)) return 0;
  return qty * unitCost;
}

function normalizeMaterialDetails(value, includeBlank = false) {
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows.map((row) => createMaterialDetail({
    item: row?.item || "",
    qty: formatFormNumber(row?.qty),
    unitCost: formatFormNumber(row?.unitCost ?? row?.unit_cost),
    total: formatFormNumber(row?.total)
  })).filter((row) => row.item || row.qty || row.unitCost || row.total);
  return normalized.length || !includeBlank ? normalized : [createMaterialDetail()];
}

function normalizeAmountDetails(value, labelField, createRow, includeBlank = false) {
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows.map((row) => createRow({
    [labelField]: row?.[labelField] || "",
    amount: formatFormNumber(row?.amount)
  })).filter((row) => row[labelField] || row.amount);
  return normalized.length || !includeBlank ? normalized : [createRow()];
}

function projectDetailsForForm(project, includeBlank = true) {
  return {
    materialsDetails: normalizeMaterialDetails(project?.materials_details, includeBlank),
    laborDetails: normalizeAmountDetails(project?.labor_details, "description", createLaborDetail, includeBlank),
    otherExpensesDetails: normalizeAmountDetails(project?.other_expenses_details, "expenses", createOtherExpenseDetail, includeBlank)
  };
}

function projectDetailsTotalCost(project) {
  const materials = normalizeMaterialDetails(project?.materials_details);
  const labor = normalizeAmountDetails(project?.labor_details, "description", createLaborDetail);
  const others = normalizeAmountDetails(project?.other_expenses_details, "expenses", createOtherExpenseDetail);
  return (
    materials.reduce((sum, row) => sum + materialDetailTotal(row), 0) +
    labor.reduce((sum, row) => sum + toNumber(row.amount, 0), 0) +
    others.reduce((sum, row) => sum + toNumber(row.amount, 0), 0)
  );
}

function projectFormTotalCost(form) {
  const materials = normalizeMaterialDetails(form?.materialsDetails);
  const labor = normalizeAmountDetails(form?.laborDetails, "description", createLaborDetail);
  const others = normalizeAmountDetails(form?.otherExpensesDetails, "expenses", createOtherExpenseDetail);
  return (
    materials.reduce((sum, row) => sum + materialDetailTotal(row), 0) +
    labor.reduce((sum, row) => sum + toNumber(row.amount, 0), 0) +
    others.reduce((sum, row) => sum + toNumber(row.amount, 0), 0)
  );
}

function ProjectDetailsSummary({ project }) {
  const materials = normalizeMaterialDetails(project?.materials_details);
  const labor = normalizeAmountDetails(project?.labor_details, "description", createLaborDetail);
  const others = normalizeAmountDetails(project?.other_expenses_details, "expenses", createOtherExpenseDetail);
  const hasDetails = materials.length || labor.length || others.length;

  if (!hasDetails) {
    return <p className="bgt-project-details-empty">No project details recorded.</p>;
  }

  return (
    <div className="bgt-project-details-summary">
      <div className="bgt-project-detail-section">
        <h4>Materials</h4>
        {materials.length ? (
          <div className="bgt-detail-table bgt-detail-table--materials">
            <span>Item</span><span>Qty</span><span>Unit Cost</span><span>Total</span>
            {materials.map((row, index) => (
              <div className="bgt-detail-row" key={`mat-${index}`}>
                <span>{row.item || "-"}</span>
                <span>{formatQuantity(row.qty)}</span>
                <span>₱{formatMoney(row.unitCost)}</span>
                <span>₱{formatMoney(materialDetailTotal(row))}</span>
              </div>
            ))}
          </div>
        ) : <p className="bgt-project-details-empty">No materials listed.</p>}
      </div>

      <div className="bgt-project-detail-section">
        <h4>Labor</h4>
        {labor.length ? (
          <div className="bgt-detail-table bgt-detail-table--amount">
            <span>Description</span><span>Amount</span>
            {labor.map((row, index) => (
              <div className="bgt-detail-row" key={`labor-${index}`}>
                <span>{row.description || "-"}</span>
                <span>₱{formatMoney(row.amount)}</span>
              </div>
            ))}
          </div>
        ) : <p className="bgt-project-details-empty">No labor listed.</p>}
      </div>

      <div className="bgt-project-detail-section">
        <h4>Others</h4>
        {others.length ? (
          <div className="bgt-detail-table bgt-detail-table--amount">
            <span>Expenses</span><span>Amount</span>
            {others.map((row, index) => (
              <div className="bgt-detail-row" key={`other-${index}`}>
                <span>{row.expenses || "-"}</span>
                <span>₱{formatMoney(row.amount)}</span>
              </div>
            ))}
          </div>
        ) : <p className="bgt-project-details-empty">No other expenses listed.</p>}
      </div>
    </div>
  );
}

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
  const [txLines, setTxLines] = useState(() => [createTxLine()]);
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
  const EMPTY_PROJ = { projectId: "", customerId: "", projectName: "", systemPackage: "", location: "", saleAmount: "", projectDate: localDateInput(), startDate: localDateInput(), endDate: "", status: "active", projectCategory: "materials", notes: "", ...projectDetailsForForm(null, true) };

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
  const [viewingProjDetails, setViewingProjDetails] = useState(null);

  const [detailProj, setDetailProj] = useState(null);
  const [detailTx, setDetailTx] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paymentDetailsProj, setPaymentDetailsProj] = useState(null);
  const [paymentDetailsRows, setPaymentDetailsRows] = useState([]);
  const [paymentDetailsLoading, setPaymentDetailsLoading] = useState(false);

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
  function accountTypeForAccountId(accountId, fallback = "expense") {
    const account = accounts.find((a) => String(a.id) === String(accountId));
    return account ? normalizeAccountType(account.type, fallback) : fallback;
  }
  function handleTxAccountChange(accountId) {
    setTxForm((form) => ({
      ...form,
      accountId,
      type: accountId ? accountTypeForAccountId(accountId, form.type) : ""
    }));
  }
  const defaultIncomeAccountId = incomeAccounts[0]?.id ? String(incomeAccounts[0].id) : "";
  const hasFilters = filterType !== "all" || filterAccount !== "all" || filterDateFrom || filterDateTo || searchRaw || scopeMode !== "overall";
  const projectCostingHasFilters = filterDateFrom || filterDateTo || searchRaw;
  const netPositive = toNumber(summary.netBalance, 0) >= 0;
  const visibleTxIds = useMemo(() => transactions.map((tx) => tx.id), [transactions]);
  const selectedTxCount = selectedTxIds.size;
  const allVisibleTxSelected = visibleTxIds.length > 0 && visibleTxIds.every((id) => selectedTxIds.has(id));
  const projectScoped = scopeMode === "project" && !!scopeProjectId;
  const selectedScopeProject = useMemo(
    () => projects.find((p) => String(p.id) === String(scopeProjectId)) || null,
    [projects, scopeProjectId]
  );
  const projectCostingProjectOptions = useMemo(
    () => projects.filter((project) => projForm.customerId && String(project.customer_id || "") === String(projForm.customerId)),
    [projects, projForm.customerId]
  );
  const salesCollected = useMemo(
    () => projects.reduce((sum, project) => sum + toNumber(project.total_income, 0), 0),
    [projects]
  );
  const salesContractValue = useMemo(
    () => projects.reduce((sum, project) => sum + toNumber(project.sale_amount, 0), 0),
    [projects]
  );
  const salesProjectCostingExpenses = useMemo(
    () => projects.reduce((sum, project) => sum + projectDetailsTotalCost(project), 0),
    [projects]
  );
  const salesProjectCostingMargin = salesContractValue - salesProjectCostingExpenses;
  const salesBalanceDue = useMemo(
    () => projects.reduce((sum, project) => sum + Math.max(0, toNumber(project.sale_amount, 0) - toNumber(project.total_income, 0)), 0),
    [projects]
  );
  const projectCostingRows = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();
    return projects.filter((project) => {
      const date = project.start_date || project.project_date || "";
      if (filterDateFrom && date && date < filterDateFrom) return false;
      if (filterDateTo && date && date > filterDateTo) return false;
      if (query) {
        const haystack = [
          project.project_name,
          project.system_package,
          project.location,
          project.customer_name,
          project.start_date,
          project.end_date,
          STATUS_LABELS[project.status] || project.status
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [projects, filterDateFrom, filterDateTo, search]);
  const txLinesTotal = useMemo(
    () => txLines.reduce((sum, line) => sum + toNumber(calculateTransactionAmount(line.price, line.quantity, line.discount) || line.amount, 0), 0),
    [txLines]
  );

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
    if (!importAccountId) { flash("Please select a category.", "error"); return; }
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

  function projectFormFromProject(p) {
    return {
      projectId: p?.id ? String(p.id) : "",
      customerId: p?.customer_id ? String(p.customer_id) : "",
      projectName: p?.project_name || "",
      systemPackage: p?.system_package || "",
      location: p?.location || "",
      saleAmount: p?.sale_amount == null ? "" : String(p.sale_amount),
      projectDate: p?.project_date ? localDateInput(p.project_date) : localDateInput(p?.start_date || new Date()),
      startDate: p?.start_date ? localDateInput(p.start_date) : p?.project_date ? localDateInput(p.project_date) : "",
      endDate: p?.end_date ? localDateInput(p.end_date) : "",
      status: p?.status || "active",
      projectCategory: p?.project_category || "materials",
      notes: p?.notes || "",
      ...projectDetailsForForm(p, true)
    };
  }
  function openNewProj(custId = "") { setEditingProj(null); setProjForm({ ...EMPTY_PROJ, ...projectDetailsForForm(null, true), projectId: "", customerId: custId ? String(custId) : "", projectDate: localDateInput(), startDate: localDateInput(), endDate: "", projectCategory: "materials" }); setProjOpen(true); }
  function openEditProj(p) { setEditingProj(p); setProjForm(projectFormFromProject(p)); setProjOpen(true); }
  function closeProj() { setProjOpen(false); setEditingProj(null); setProjForm(EMPTY_PROJ); }
  function handleProjectCostingCustomerChange(customerId) {
    setEditingProj(null);
    setProjForm({ ...EMPTY_PROJ, ...projectDetailsForForm(null, true), projectId: "", customerId, projectDate: localDateInput(), startDate: localDateInput(), endDate: "", projectCategory: "materials" });
  }
  function handleProjectCostingProjectChange(projectId) {
    const selectedProject = projects.find((project) => String(project.id) === String(projectId));
    if (!selectedProject) {
      setEditingProj(null);
      setProjForm((form) => ({ ...form, projectId: "", projectName: "" }));
      return;
    }
    setEditingProj(selectedProject);
    setProjForm(projectFormFromProject(selectedProject));
  }
  function updateProjectDetail(section, index, field, value) {
    setProjForm((form) => {
      const rows = [...(form[section] || [])];
      rows[index] = { ...rows[index], [field]: value };
      if (section === "materialsDetails" && (field === "qty" || field === "unitCost")) {
        const qty = Number(rows[index].qty);
        const unitCost = Number(rows[index].unitCost);
        rows[index].total = Number.isFinite(qty) && Number.isFinite(unitCost) && qty > 0 && unitCost > 0 ? String(qty * unitCost) : "";
      }
      return { ...form, [section]: rows };
    });
  }
  function addProjectDetail(section) {
    const createRow = section === "materialsDetails" ? createMaterialDetail : section === "laborDetails" ? createLaborDetail : createOtherExpenseDetail;
    setProjForm((form) => ({ ...form, [section]: [...(form[section] || []), createRow()] }));
  }
  function removeProjectDetail(section, index) {
    setProjForm((form) => {
      const createRow = section === "materialsDetails" ? createMaterialDetail : section === "laborDetails" ? createLaborDetail : createOtherExpenseDetail;
      const rows = (form[section] || []).filter((_, rowIndex) => rowIndex !== index);
      return { ...form, [section]: rows.length ? rows : [createRow()] };
    });
  }
  async function saveProj(e) {
    e.preventDefault();
    const isProjectCostingForm = view === "transactions" && scopeMode === "project";
    const selectedProject = isProjectCostingForm && projForm.projectId ? projects.find((project) => String(project.id) === String(projForm.projectId)) : null;
    const targetProject = editingProj || selectedProject;
    if (isProjectCostingForm && !targetProject) {
      flash("Select an existing Sales project for project costing.", "error");
      return;
    }
    setProjSaving(true);
    try {
      const selectedProjectDate = isProjectCostingForm ? projForm.startDate : projForm.projectDate;
      const payload = { customerId: Number(projForm.customerId) || null, projectName: projForm.projectName, systemPackage: projForm.systemPackage, location: projForm.location, saleAmount: Number(projForm.saleAmount), projectDate: selectedProjectDate || null, startDate: isProjectCostingForm ? projForm.startDate : selectedProjectDate, endDate: projForm.endDate, status: projForm.status, projectCategory: projForm.projectCategory, notes: projForm.notes, materialsDetails: projForm.materialsDetails, laborDetails: projForm.laborDetails, otherExpensesDetails: projForm.otherExpensesDetails };
      if (targetProject) { await api.put(`/customers/projects/${targetProject.id}`, payload); flash("Project updated."); }
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
  async function openPaymentDetails(project) {
    if (!project?.id) return;
    setPaymentDetailsProj(project);
    setPaymentDetailsRows([]);
    setPaymentDetailsLoading(true);
    try {
      const res = await api.get(`/customers/projects/${project.id}/transactions`);
      setPaymentDetailsRows((res.data || []).filter((tx) => accountTypeFromTransactionRecord(tx) === "income"));
    } catch {
      setPaymentDetailsRows([]);
      flash("Failed to load payment details.", "error");
    } finally {
      setPaymentDetailsLoading(false);
    }
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
    const safeOverrides = overrides && overrides.currentTarget ? {} : overrides;
    const { description, price, quantity, discount, amount, notes, ...headerOverrides } = safeOverrides;
    const accountId = headerOverrides.accountId || "";
    setEditingTx(null);
    setError("");
    setSuccess("");
    setTxForm({
      ...EMPTY_TX_FORM,
      transactionDate: localDateInput(),
      projectId: projectScoped && selectedScopeProject ? String(selectedScopeProject.id) : "",
      ...headerOverrides,
      accountId,
      type: headerOverrides.type ? normalizeAccountType(headerOverrides.type) : accountTypeForAccountId(accountId, EMPTY_TX_FORM.type)
    });
    setTxLines([createTxLine({
      description: description || "",
      price: price || "",
      quantity: quantity || "",
      discount: discount || "",
      amount: amount || "",
      notes: notes || ""
    })]);
    setTxFormOpen(true);
  }
  function openNewPayment(project = null) {
    const targetProject = project || selectedScopeProject || null;
    openNewTx({
      type: "income",
      accountId: defaultIncomeAccountId,
      projectId: targetProject?.id ? String(targetProject.id) : ""
    });
  }
  function openEditTx(tx) {
    setEditingTx(tx);
    setError("");
    setSuccess("");
    setTxForm({
      accountId: String(tx.account_id),
      projectId: tx.project_id ? String(tx.project_id) : "",
      type: accountTypeFromTransactionRecord(tx),
      referenceNo: tx.reference_no || "",
      transactionDate: tx.transaction_date ? localDateInput(tx.transaction_date) : localDateInput()
    });
    setTxLines([createTxLine({
      price: formatFormNumber(tx.price),
      quantity: formatFormNumber(tx.quantity),
      discount: formatFormNumber(tx.discount),
      amount: formatFixedFormNumber(tx.amount, AMOUNT_DECIMAL_PLACES),
      description: tx.description || "",
      notes: tx.notes || ""
    })]);
    setTxFormOpen(true);
  }
  function closeTxForm() {
    setTxFormOpen(false);
    setEditingTx(null);
    setTxForm(EMPTY_TX_FORM);
    setTxLines([createTxLine()]);
    setError("");
  }
  function updateTxLineValue(lineKey, field, value) {
    setTxLines((prev) => prev.map((line) => {
      if (line.lineKey !== lineKey) return line;
      const next = { ...line, [field]: value };
      if (field === "price" || field === "quantity" || field === "discount") {
        next.amount = calculateTransactionAmount(next.price, next.quantity, next.discount);
      }
      return next;
    }));
  }
  function addTxLine() {
    setTxLines((prev) => [...prev, createTxLine()]);
  }
  function removeTxLine(lineKey) {
    setTxLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.lineKey !== lineKey)));
  }
  function normalizeTxLineForPayload(line, index) {
    const calculatedAmount = calculateTransactionAmount(line.price, line.quantity, line.discount);
    const amount = Number(calculatedAmount || line.amount);
    const price = line.price === "" ? null : Number(line.price);
    const quantity = line.quantity === "" ? null : Number(line.quantity);
    const discount = line.discount === "" ? null : Number(line.discount);
    const grossAmount = price != null && quantity != null ? price * quantity : null;

    if (price != null && (!Number.isFinite(price) || price < 0)) {
      return { error: `Line ${index + 1}: price cannot be negative.` };
    }
    if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
      return { error: `Line ${index + 1}: qty cannot be negative.` };
    }
    if (discount != null && (!Number.isFinite(discount) || discount < 0)) {
      return { error: `Line ${index + 1}: discount cannot be negative.` };
    }
    if (discount != null && grossAmount != null && discount >= grossAmount) {
      return { error: `Line ${index + 1}: discount must be less than price times qty.` };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: `Line ${index + 1}: amount must be greater than zero.` };
    }

    return {
      value: {
        price,
        quantity,
        discount,
        amount,
        description: line.description,
        notes: line.notes
      }
    };
  }
  async function saveTx(e) {
    e.preventDefault(); setTxSaving(true);
    try {
      const payloadLines = txLines
        .filter(hasTxLineInput)
        .map((line, index) => normalizeTxLineForPayload(line, index));
      const invalidLine = payloadLines.find((line) => line.error);
      if (invalidLine) { flash(invalidLine.error, "error"); return; }
      const items = payloadLines.map((line) => line.value);
      if (!items.length) { flash("Add at least one transaction line.", "error"); return; }

      const sharedPayload = {
        accountId: Number(txForm.accountId),
        projectId: txForm.projectId ? Number(txForm.projectId) : null,
        type: transactionDirectionFromAccountType(accountTypeForAccountId(txForm.accountId, txForm.type)),
        referenceNo: txForm.referenceNo,
        transactionDate: txForm.transactionDate
      };
      if (editingTx) {
        await api.put(`/budget/${editingTx.id}`, { ...sharedPayload, ...items[0] });
        flash("Transaction updated.");
      }
      else {
        const res = await api.post("/budget", { ...sharedPayload, items });
        const createdCount = res.data?.created || items.length;
        flash(`${createdCount} transaction${createdCount !== 1 ? "s" : ""} recorded.`);
      }
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
      if (editingAcc) { await api.put(`/budget/accounts/${editingAcc.id}`, payload); flash("Category updated."); }
      else { await api.post("/budget/accounts", payload); flash("Category created."); }
      closeAccForm(); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed to save category.", "error"); }
    finally { setAccSaving(false); }
  }
  async function confirmDeleteAcc(acc) {
    try {
      const res = await api.delete(`/budget/accounts/${acc.id}`);
      flash(res.data?.deactivated ? "Category deactivated." : "Category deleted.");
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
            Category
          </button>
          <button className={`bgt-seg-btn${view === "sales" ? " bgt-seg-btn--on" : ""}`} onClick={() => setView("sales")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            Sales
          </button>
        </div>

        <div className="bgt-toolbar-actions">
          {view === "transactions" && (
            scopeMode === "project" ? (
              <button className="btn btn-primary" onClick={() => openNewProj()}>
                <IconPlus /> Add Project
              </button>
            ) : (
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
                <button className="btn btn-primary" onClick={() => openNewTx()}>
                  <IconPlus /> Record Transaction
                </button>
              </>
            )
          )}
          {view === "accounts" && (
            <button className="btn btn-primary" onClick={openNewAcc}>
              <IconPlus /> New Category
            </button>
          )}
          {view === "sales" && (
            <div className="bgt-toolbar-actions">
              <button className="btn btn-ghost bgt-btn-import" onClick={openImport}>
                <IconUpload /> Import Expenses
              </button>
              <button className="btn btn-ghost" onClick={() => openNewPayment(detailProj)} disabled={!defaultIncomeAccountId}><IconArrowDown /> Add Payment</button>
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
              <button className={`bgt-seg-btn${scopeMode === "overall" ? " bgt-seg-btn--on" : ""}`} onClick={() => { setScopeMode("overall"); setScopeProjectId(""); }}>
                Raw Logs
              </button>
              <button className={`bgt-seg-btn${scopeMode === "project" ? " bgt-seg-btn--on" : ""}`} onClick={() => { setScopeMode("project"); setScopeProjectId(""); setFilterType("all"); setFilterAccount("all"); }}>
                Project Costing
              </button>
              <button className={`bgt-seg-btn${scopeMode === "transaction" ? " bgt-seg-btn--on" : ""}`} onClick={() => { setScopeMode("transaction"); setScopeProjectId(""); }}>
                Entity
              </button>
            </div>
            <div className="bgt-search-wrap">
              <span className="bgt-search-icon"><IconSearch /></span>
              <input className="input bgt-search-input" placeholder={scopeMode === "project" ? "Search customer, project, package, location..." : "Search description, reference, category…"} value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} />
            </div>
            {scopeMode !== "project" && (
              <>
                <select className="input bgt-filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="all">All transaction types</option>
                  {ACCOUNT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{transactionTypeLabel(option.value)}</option>
                  ))}
                </select>
                <select className="input bgt-filter-select" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
                  <option value="all">All categories</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </>
            )}
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

          {scopeMode === "project" ? (
            loading ? (
              <div className="bgt-empty">
                <div className="bgt-spinner" />
                <p>Loading projects...</p>
              </div>
            ) : projectCostingRows.length === 0 ? (
              <div className="bgt-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="bgt-empty-icon"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                <p>{projectCostingHasFilters ? "No projects match your filters." : "No project costing records yet."}</p>
                {!projectCostingHasFilters && <button className="btn btn-primary" onClick={() => openNewProj()}><IconPlus /> Add Project</button>}
              </div>
            ) : (
              <div className="bgt-table-wrap">
                <table className="bgt-table">
                  <thead>
                    <tr>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Customer Name</th>
                      <th>Project</th>
                      <th>System Package</th>
                      <th>Location</th>
                      <th className="bgt-col-amt">Total Cost</th>
                      <th className="bgt-col-amt">Selling Price</th>
                      <th>Status</th>
                      <th className="bgt-col-actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {projectCostingRows.map((project) => (
                      <tr key={project.id} className="bgt-table-row">
                        <td className="bgt-cell-date">{formatDate(project.start_date)}</td>
                        <td className="bgt-cell-date">{formatDate(project.end_date)}</td>
                        <td><span className="bgt-account-chip">{project.customer_name || "-"}</span></td>
                        <td>
                          <strong>{project.project_name}</strong>
                        </td>
                        <td>{project.system_package || <span className="bgt-muted">—</span>}</td>
                        <td>{project.location || <span className="bgt-muted">—</span>}</td>
                        <td className="bgt-col-amt" style={{ color: "#b83a3a", fontWeight: 700 }}>₱{formatMoney(projectDetailsTotalCost(project))}</td>
                        <td className="bgt-col-amt" style={{ color: "#147845", fontWeight: 700 }}>₱{formatMoney(project.sale_amount)}</td>
                        <td><span className={`sl-pill ${STATUS_COLORS[project.status] || ""}`}>{STATUS_LABELS[project.status] || project.status || "Active"}</span></td>
                        <td className="bgt-col-actions">
                          <button className="bgt-row-btn" onClick={() => setViewingProjDetails(project)} title="View Details">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" /><circle cx="12" cy="12" r="3" /></svg>
                            View Details
                          </button>
                          <button className="bgt-row-btn" onClick={() => openEditProj(project)} title="Edit">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            Edit
                          </button>
                          <button className="bgt-row-btn bgt-row-btn--del" onClick={() => setDeletingProj(project)} title="Delete">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bgt-table-footer">
                  {projectCostingRows.length} project{projectCostingRows.length !== 1 ? "s" : ""}
                </div>
              </div>
            )
          ) : loading ? (
            <div className="bgt-empty">
              <div className="bgt-spinner" />
              <p>Loading transactions…</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="bgt-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="bgt-empty-icon"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M9 13h1M14 13h1M9 17h1M14 17h1" /></svg>
              <p>{hasFilters ? "No transactions match your filters." : "No transactions yet. Record one or import from Excel."}</p>
              {!hasFilters && <button className="btn btn-primary" onClick={() => openNewTx()}><IconPlus /> Record First Transaction</button>}
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
                    <th>Category</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th>Transaction Type</th>
                    <th className="bgt-col-amt">Price</th>
                    <th>Qty</th>
                    <th className="bgt-col-amt">Discount</th>
                    <th className="bgt-col-amt">Amount</th>
                    <th className="bgt-col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const txAccountType = accountTypeFromTransactionRecord(tx);
                    const txDirection = transactionDirectionFromAccountType(txAccountType);
                    return (
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
                        <span className={`bgt-type-pill bgt-type-pill--${txAccountType}`}>
                          {transactionTypeShortLabel(txAccountType)}
                        </span>
                      </td>
                      <td className="bgt-col-amt">{tx.price == null ? <span className="bgt-muted">—</span> : <>₱{formatMoney(tx.price)}</>}</td>
                      <td>{tx.quantity == null ? <span className="bgt-muted">—</span> : formatQuantity(tx.quantity)}</td>
                      <td className="bgt-col-amt">{tx.discount == null ? <span className="bgt-muted">—</span> : <>₱{formatMoney(tx.discount)}</>}</td>
                      <td className={`bgt-col-amt bgt-amount--${txDirection}`}>
                        <span className="bgt-amount-sign">{txDirection === "in" ? "+" : "−"}</span>
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
                    );
                  })}
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
                  {projects.map((p) => <option key={p.id} value={p.id}>{projectDisplayName(p)}</option>)}
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
            <p>No categories yet.</p>
            <button className="btn btn-primary" onClick={openNewAcc}><IconPlus /> Create First Category</button>
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
                      <span className={`bgt-pill bgt-pill--${acc.type}`}>{accountTypeLabel(acc.type)}</span>
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
        const netPos = salesProjectCostingMargin >= 0;
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
                <strong className="sl-kpi-value">₱{formatMoney(salesContractValue)}</strong>
                <span className="sl-kpi-sub">₱{formatMoney(salesBalanceDue)} still to collect</span>
              </div>
              <div className="sl-kpi sl-kpi--expenses">
                <span className="sl-kpi-label">Total Expenses</span>
                <strong className="sl-kpi-value">₱{formatMoney(salesProjectCostingExpenses)}</strong>
                <span className="sl-kpi-sub">project costing</span>
              </div>
              <div className={`sl-kpi ${netPos ? "sl-kpi--pos" : "sl-kpi--neg"}`}>
                <span className="sl-kpi-label">Net Margin</span>
                <strong className="sl-kpi-value">₱{formatMoney(salesProjectCostingMargin)}</strong>
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
                    const tExp = custProjs.reduce((s, p) => s + projectDetailsTotalCost(p), 0);
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
                            {custProjs.map((p) => {
                              const projectExpense = projectDetailsTotalCost(p);
                              const projectMargin = toNumber(p.sale_amount, 0) - projectExpense;
                              return (
                                <button key={p.id} className="sl-proj-row" onClick={() => openDetail(p)}>
                                  <div className="sl-proj-row-left">
                                    <span className={`sl-pill ${STATUS_COLORS[p.status] || ""}`}>{STATUS_LABELS[p.status] || p.status}</span>
                                    <div className="sl-proj-copy">
                                      <span className="sl-proj-name">{p.project_name}</span>
                                      <span className="sl-proj-sub">Expenses ₱{formatMoney(projectExpense)} • Collected ₱{formatMoney(p.total_income)} of ₱{formatMoney(p.sale_amount)}</span>
                                    </div>
                                  </div>
                                  <div className="sl-proj-row-right">
                                    <span className="sl-proj-margin" style={{ color: projectMargin >= 0 ? "#147845" : "#b83a3a" }}>₱{formatMoney(projectMargin)}</span>
                                    {toNumber(p.total_income, 0) > 0 && (
                                      <button className="bgt-row-btn" onClick={(e) => { e.stopPropagation(); openPaymentDetails(p); }}>View Payment Details</button>
                                    )}
                                    <button className="bgt-row-btn" onClick={(e) => { e.stopPropagation(); openNewPayment(p); }}>Add Payment</button>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                                  </div>
                                </button>
                              );
                            })}
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
                            const projectExpense = projectDetailsTotalCost(p);
                            const m = toNumber(p.sale_amount, 0) - projectExpense;
                            return (
                              <tr key={p.id} className="bgt-table-row" style={{ cursor: "pointer" }} onClick={() => openDetail(p)}>
                                <td><span className="bgt-account-chip">{p.customer_name}</span></td>
                                <td><strong>{p.project_name}</strong></td>
                                <td className="bgt-cell-date">{formatDate(p.project_date)}</td>
                                <td><span className={`sl-pill ${STATUS_COLORS[p.status] || ""}`}>{STATUS_LABELS[p.status] || p.status}</span></td>
                                <td className="bgt-col-amt" style={{ color: "#147845", fontWeight: 700 }}>₱{formatMoney(p.sale_amount)}</td>
                                <td className="bgt-col-amt" style={{ color: "#b83a3a", fontWeight: 700 }}>₱{formatMoney(projectExpense)}</td>
                                <td className="bgt-col-amt" style={{ color: m >= 0 ? "#147845" : "#b83a3a", fontWeight: 700 }}>₱{formatMoney(m)}</td>
                                <td className="bgt-col-actions" onClick={(e) => e.stopPropagation()}>
                                  {toNumber(p.total_income, 0) > 0 && (
                                    <button className="bgt-row-btn" onClick={() => openPaymentDetails(p)}>View Payment Details</button>
                                  )}
                                  <button className="bgt-row-btn" onClick={() => openNewPayment(p)}>Add Payment</button>
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
                      <div className="sl-dstat"><span className="sl-dstat-label">Expenses</span><strong className="sl-dstat-val sl-dstat-val--exp">₱{formatMoney(projectDetailsTotalCost(detailProj))}</strong></div>
                      <div className="sl-dstat"><span className="sl-dstat-label">Margin</span><strong className={`sl-dstat-val ${toNumber(detailProj.sale_amount, 0) - projectDetailsTotalCost(detailProj) >= 0 ? "sl-dstat-val--sales" : "sl-dstat-val--exp"}`}>₱{formatMoney(toNumber(detailProj.sale_amount, 0) - projectDetailsTotalCost(detailProj))}</strong></div>
                    </div>
                    <div className="bgt-modal-foot" style={{ justifyContent: "flex-start", paddingTop: 0 }}>
                      {toNumber(detailProj.total_income, 0) > 0 && (
                        <button className="btn btn-ghost" onClick={() => openPaymentDetails(detailProj)}>View Payment Details</button>
                      )}
                      <button className="btn btn-ghost" onClick={() => openNewPayment(detailProj)} disabled={!defaultIncomeAccountId}><IconArrowDown /> Add Payment</button>
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
                            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="bgt-col-amt">Price</th><th>Qty</th><th className="bgt-col-amt">Discount</th><th className="bgt-col-amt">Amount</th></tr></thead>
                            <tbody>
                              {detailTx.map((tx) => (
                                <tr key={tx.id}>
                                  <td className="bgt-cell-date">{formatDate(tx.transaction_date)}</td>
                                  <td>{tx.description || <span className="bgt-muted">—</span>}</td>
                                  <td><span className="bgt-account-chip">{tx.account_name}</span></td>
                                  <td className="bgt-col-amt">{tx.price == null ? <span className="bgt-muted">—</span> : <>₱{formatMoney(tx.price)}</>}</td>
                                  <td>{tx.quantity == null ? <span className="bgt-muted">—</span> : formatQuantity(tx.quantity)}</td>
                                  <td className="bgt-col-amt">{tx.discount == null ? <span className="bgt-muted">—</span> : <>₱{formatMoney(tx.discount)}</>}</td>
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

            {paymentDetailsProj && (
              <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPaymentDetailsProj(null); }}>
                <div className="bgt-modal bgt-modal--project-details" onClick={(e) => e.stopPropagation()}>
                  <div className="bgt-modal-head">
                    <div>
                      <p className="bgt-modal-eyebrow">{paymentDetailsProj.customer_name || "Customer"}</p>
                      <h3 className="bgt-modal-title">Payment Details</h3>
                    </div>
                    <button className="bgt-modal-x" onClick={() => setPaymentDetailsProj(null)} aria-label="Close">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                  <div className="bgt-modal-body">
                    <dl className="bgt-delete-fields bgt-delete-fields--wide">
                      <div><dt>Customer</dt><dd>{paymentDetailsProj.customer_name || "-"}</dd></div>
                      <div><dt>Project</dt><dd>{paymentDetailsProj.project_name || "-"}</dd></div>
                      <div><dt>Total Collected</dt><dd>₱{formatMoney(paymentDetailsRows.reduce((sum, tx) => sum + toNumber(tx.amount, 0), 0))}</dd></div>
                      <div><dt>Payments</dt><dd>{paymentDetailsRows.length}</dd></div>
                    </dl>
                    {paymentDetailsLoading ? (
                      <div className="bgt-empty" style={{ padding: 24 }}><div className="bgt-spinner" /></div>
                    ) : paymentDetailsRows.length === 0 ? (
                      <p className="bgt-project-details-empty">No payments recorded for this customer and project.</p>
                    ) : (
                      <div className="bgt-import-preview">
                        <table className="bgt-table bgt-table--compact">
                          <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Category</th><th className="bgt-col-amt">Amount</th></tr></thead>
                          <tbody>
                            {paymentDetailsRows.map((tx) => (
                              <tr key={tx.id}>
                                <td className="bgt-cell-date">{formatDate(tx.transaction_date)}</td>
                                <td>{tx.description || <span className="bgt-muted">-</span>}</td>
                                <td>{tx.reference_no || <span className="bgt-muted">-</span>}</td>
                                <td><span className="bgt-account-chip">{tx.account_name || "-"}</span></td>
                                <td className="bgt-col-amt bgt-amount--in">₱{formatMoney(tx.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="bgt-modal-foot">
                      <button className="btn btn-ghost" onClick={() => { const project = paymentDetailsProj; setPaymentDetailsProj(null); openNewPayment(project); }} disabled={!defaultIncomeAccountId}>Add Payment</button>
                      <button className="btn btn-primary" onClick={() => setPaymentDetailsProj(null)}>Close</button>
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
                  <div className="bgt-modal-head"><div><p className="bgt-modal-eyebrow">{editingProj ? "Editing" : "New project"}</p><h3 className="bgt-modal-title">{editingProj ? "Edit Project" : "Add Project"}</h3></div><button className="bgt-modal-x" onClick={closeProj}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button></div>
                  <form className="bgt-modal-body" onSubmit={saveProj}>
                    <div className="bgt-form-grid">
                      <div className="bgt-field bgt-field--wide"><label className="bgt-label">Customer <span className="bgt-req">*</span></label><select className="input" required value={projForm.customerId} onChange={(e) => setProjForm((f) => ({ ...f, customerId: e.target.value }))}><option value="">— Select customer —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                      <div className="bgt-field bgt-field--wide"><label className="bgt-label">Project <span className="bgt-req">*</span></label><input className="input" required placeholder="e.g. Solar Installation – Phase 1" value={projForm.projectName} onChange={(e) => setProjForm((f) => ({ ...f, projectName: e.target.value }))} /></div>
                      <div className="bgt-field"><label className="bgt-label">System Package</label><input className="input" placeholder="e.g. 5kW Hybrid" value={projForm.systemPackage} onChange={(e) => setProjForm((f) => ({ ...f, systemPackage: e.target.value }))} /></div>
                      <div className="bgt-field"><label className="bgt-label">Location</label><input className="input" placeholder="Project location" value={projForm.location} onChange={(e) => setProjForm((f) => ({ ...f, location: e.target.value }))} /></div>
                      <div className="bgt-field"><label className="bgt-label">Selling Price (₱) <span className="bgt-req">*</span></label><input className="input" type="number" min="0" step="0.01" required placeholder="0.00" value={projForm.saleAmount} onChange={(e) => setProjForm((f) => ({ ...f, saleAmount: e.target.value }))} /></div>
                      <div className="bgt-field"><label className="bgt-label">Date</label><input className="input" type="date" value={projForm.projectDate} onChange={(e) => setProjForm((f) => ({ ...f, projectDate: e.target.value }))} /></div>
                      <div className="bgt-field"><label className="bgt-label">Status</label><select className="input" value={projForm.status} onChange={(e) => setProjForm((f) => ({ ...f, status: e.target.value }))}><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
                      <div className="bgt-field"><label className="bgt-label">Category</label><select className="input" value={projForm.projectCategory} onChange={(e) => setProjForm((f) => ({ ...f, projectCategory: e.target.value }))}>{PROJECT_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                    </div>
                    <div className="bgt-modal-foot"><button type="button" className="btn btn-ghost" onClick={closeProj} disabled={projSaving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={projSaving}>{projSaving ? "Saving…" : editingProj ? "Save Changes" : "Create Project"}</button></div>
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

      {/* Project Costing project modals */}
      {view === "transactions" && scopeMode === "project" && projOpen && (
        <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeProj(); }}>
          <div className="bgt-modal bgt-modal--project-form">
            <div className="bgt-modal-head">
              <div>
                <p className="bgt-modal-eyebrow">{editingProj ? "Editing" : "New project"}</p>
                <h3 className="bgt-modal-title">{editingProj ? "Edit Project" : "Add Project"}</h3>
              </div>
              <button className="bgt-modal-x" onClick={closeProj} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form className="bgt-modal-body" onSubmit={saveProj}>
              <div className="bgt-form-grid">
                <div className="bgt-field">
                  <label className="bgt-label">Start Date</label>
                  <input className="input" type="date" value={projForm.startDate} onChange={(e) => setProjForm((f) => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div className="bgt-field">
                  <label className="bgt-label">End Date</label>
                  <input className="input" type="date" value={projForm.endDate} onChange={(e) => setProjForm((f) => ({ ...f, endDate: e.target.value }))} />
                </div>
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Customer Name <span className="bgt-req">*</span></label>
                  <select className="input" required value={projForm.customerId} onChange={(e) => handleProjectCostingCustomerChange(e.target.value)}>
                    <option value="">{customers.length ? "Select customer" : "No customers available"}</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </div>
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Project <span className="bgt-req">*</span></label>
                  <select className="input" required value={projForm.projectId} onChange={(e) => handleProjectCostingProjectChange(e.target.value)}>
                    <option value="">
                      {!projForm.customerId ? "Select customer first" : projectCostingProjectOptions.length ? "Select project" : "No projects found for this customer"}
                    </option>
                    {projectCostingProjectOptions.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.project_name || "Untitled project"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bgt-field">
                  <label className="bgt-label">System Package</label>
                  <input className="input" placeholder="e.g. 5kW Hybrid" value={projForm.systemPackage} onChange={(e) => setProjForm((f) => ({ ...f, systemPackage: e.target.value }))} />
                </div>
                <div className="bgt-field">
                  <label className="bgt-label">Location</label>
                  <input className="input" placeholder="Project location" value={projForm.location} onChange={(e) => setProjForm((f) => ({ ...f, location: e.target.value }))} />
                </div>
                <div className="bgt-field">
                  <label className="bgt-label">Selling Price <span className="bgt-req">*</span></label>
                  <input className="input" type="number" min="0" step="0.01" required placeholder="0.00" value={projForm.saleAmount} onChange={(e) => setProjForm((f) => ({ ...f, saleAmount: e.target.value }))} />
                </div>
                <div className="bgt-field">
                  <label className="bgt-label">Status</label>
                  <select className="input" value={projForm.status} onChange={(e) => setProjForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="bgt-project-details-editor">
                <div className="bgt-project-detail-editor-section">
                  <div className="bgt-project-detail-editor-head">
                    <h4>Materials</h4>
                    <button type="button" className="btn btn-ghost bgt-detail-add-btn" onClick={() => addProjectDetail("materialsDetails")}><IconPlus /> Add Material</button>
                  </div>
                  <div className="bgt-detail-edit-grid bgt-detail-edit-grid--materials">
                    <span>Item</span><span>Qty</span><span>Unit Cost</span><span>Total</span><span />
                    {(projForm.materialsDetails || []).map((row, index) => (
                      <div className="bgt-detail-edit-row" key={`project-material-${index}`}>
                        <input className="input" placeholder="Item" value={row.item} onChange={(e) => updateProjectDetail("materialsDetails", index, "item", e.target.value)} />
                        <input className="input" type="number" min="0" step="0.0001" placeholder="0" value={row.qty} onChange={(e) => updateProjectDetail("materialsDetails", index, "qty", e.target.value)} />
                        <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={row.unitCost} onChange={(e) => updateProjectDetail("materialsDetails", index, "unitCost", e.target.value)} />
                        <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={row.total} readOnly />
                        <button type="button" className="bgt-row-icon-btn" onClick={() => removeProjectDetail("materialsDetails", index)} title="Remove material">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bgt-project-detail-editor-section">
                  <div className="bgt-project-detail-editor-head">
                    <h4>Labor</h4>
                    <button type="button" className="btn btn-ghost bgt-detail-add-btn" onClick={() => addProjectDetail("laborDetails")}><IconPlus /> Add Labor</button>
                  </div>
                  <div className="bgt-detail-edit-grid bgt-detail-edit-grid--amount">
                    <span>Description</span><span>Amount</span><span />
                    {(projForm.laborDetails || []).map((row, index) => (
                      <div className="bgt-detail-edit-row" key={`project-labor-${index}`}>
                        <input className="input" placeholder="Description" value={row.description} onChange={(e) => updateProjectDetail("laborDetails", index, "description", e.target.value)} />
                        <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={row.amount} onChange={(e) => updateProjectDetail("laborDetails", index, "amount", e.target.value)} />
                        <button type="button" className="bgt-row-icon-btn" onClick={() => removeProjectDetail("laborDetails", index)} title="Remove labor">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bgt-project-detail-editor-section">
                  <div className="bgt-project-detail-editor-head">
                    <h4>Others</h4>
                    <button type="button" className="btn btn-ghost bgt-detail-add-btn" onClick={() => addProjectDetail("otherExpensesDetails")}><IconPlus /> Add Other</button>
                  </div>
                  <div className="bgt-detail-edit-grid bgt-detail-edit-grid--amount">
                    <span>Expenses</span><span>Amount</span><span />
                    {(projForm.otherExpensesDetails || []).map((row, index) => (
                      <div className="bgt-detail-edit-row" key={`project-other-${index}`}>
                        <input className="input" placeholder="Expenses" value={row.expenses} onChange={(e) => updateProjectDetail("otherExpensesDetails", index, "expenses", e.target.value)} />
                        <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={row.amount} onChange={(e) => updateProjectDetail("otherExpensesDetails", index, "amount", e.target.value)} />
                        <button type="button" className="bgt-row-icon-btn" onClick={() => removeProjectDetail("otherExpensesDetails", index)} title="Remove other expense">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bgt-modal-foot bgt-modal-foot--with-total">
                <div className="bgt-project-total-cost">
                  <span>Total Cost</span>
                  <strong>₱{formatMoney(projectFormTotalCost(projForm))}</strong>
                </div>
                <div className="bgt-modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={closeProj} disabled={projSaving}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={projSaving}>{projSaving ? "Saving..." : editingProj ? "Save Changes" : "Create Project"}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {view === "transactions" && scopeMode === "project" && viewingProjDetails && (
        <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setViewingProjDetails(null); }}>
          <div className="bgt-modal bgt-modal--project-details">
            <div className="bgt-modal-head">
              <div>
                <p className="bgt-modal-eyebrow">Project details</p>
                <h3 className="bgt-modal-title">{viewingProjDetails.project_name || "Project"}</h3>
              </div>
              <button className="bgt-modal-x" onClick={() => setViewingProjDetails(null)} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="bgt-modal-body">
              <dl className="bgt-delete-fields bgt-delete-fields--wide">
                <div><dt>Start Date</dt><dd>{formatDate(viewingProjDetails.start_date)}</dd></div>
                <div><dt>End Date</dt><dd>{formatDate(viewingProjDetails.end_date)}</dd></div>
                <div><dt>Customer Name</dt><dd>{viewingProjDetails.customer_name || "-"}</dd></div>
                <div><dt>System Package</dt><dd>{viewingProjDetails.system_package || "-"}</dd></div>
                <div><dt>Location</dt><dd>{viewingProjDetails.location || "-"}</dd></div>
                <div><dt>Selling Price</dt><dd>₱{formatMoney(viewingProjDetails.sale_amount)}</dd></div>
                <div><dt>Status</dt><dd>{STATUS_LABELS[viewingProjDetails.status] || viewingProjDetails.status || "Active"}</dd></div>
              </dl>
              <ProjectDetailsSummary project={viewingProjDetails} />
              <div className="bgt-modal-foot bgt-modal-foot--with-total">
                <div className="bgt-project-total-cost">
                  <span>Total Cost</span>
                  <strong>₱{formatMoney(projectDetailsTotalCost(viewingProjDetails))}</strong>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => setViewingProjDetails(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "transactions" && scopeMode === "project" && deletingProj && (
        <div className="bgt-backdrop" onClick={() => setDeletingProj(null)}>
          <div className="bgt-modal bgt-modal--confirm bgt-modal--project-delete" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-confirm-icon bgt-confirm-icon--del">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
            </div>
            <h3 className="bgt-confirm-title">Delete Project?</h3>
            <p className="bgt-confirm-body">
              Delete <strong>{deletingProj.project_name}</strong>? All linked expense assignments will be removed.
            </p>
            <dl className="bgt-delete-fields">
              <div><dt>Start Date</dt><dd>{formatDate(deletingProj.start_date)}</dd></div>
              <div><dt>End Date</dt><dd>{formatDate(deletingProj.end_date)}</dd></div>
              <div><dt>Customer Name</dt><dd>{deletingProj.customer_name || "-"}</dd></div>
              <div><dt>Project</dt><dd>{deletingProj.project_name || "-"}</dd></div>
              <div><dt>System Package</dt><dd>{deletingProj.system_package || "-"}</dd></div>
              <div><dt>Location</dt><dd>{deletingProj.location || "-"}</dd></div>
              <div><dt>Selling Price</dt><dd>₱{formatMoney(deletingProj.sale_amount)}</dd></div>
              <div><dt>Status</dt><dd>{STATUS_LABELS[deletingProj.status] || deletingProj.status || "Active"}</dd></div>
            </dl>
            <ProjectDetailsSummary project={deletingProj} />
            <div className="bgt-modal-foot bgt-modal-foot--center">
              <button className="btn btn-ghost" onClick={() => setDeletingProj(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => confirmDeleteProj(deletingProj)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction modal */}
      {txFormOpen && (
        <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeTxForm(); }}>
          <div className="bgt-modal bgt-modal--tx">
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
              <div className="bgt-type-toggle bgt-type-toggle--transaction bgt-type-toggle--readonly">
                {ACCOUNT_TYPE_OPTIONS.map((option) => {
                  const direction = transactionDirectionFromAccountType(option.value);
                  const TypeIcon = direction === "in" ? IconArrowDown : IconArrowUp;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled
                      className={`bgt-type-btn bgt-type-btn--${option.value}${txForm.type === option.value ? " bgt-type-btn--on" : ""}`}
                    >
                      <TypeIcon /> {transactionTypeLabel(option.value)}
                    </button>
                  );
                })}
              </div>

              <div className="bgt-form-grid bgt-form-grid--tx-header">
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Category <span className="bgt-req">*</span></label>
                  <select className="input" required value={txForm.accountId} onChange={(e) => handleTxAccountChange(e.target.value)}>
                    <option value="">— Select category —</option>
                    {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Project <span className="bgt-label-opt">(optional)</span></label>
                  <select className="input" value={txForm.projectId} onChange={(e) => setTxForm((f) => ({ ...f, projectId: e.target.value }))}>
                    <option value="">— No project —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{projectDisplayName(p)}</option>)}
                  </select>
                </div>
                <div className="bgt-field">
                  <label className="bgt-label">Date <span className="bgt-req">*</span></label>
                  <input className="input" type="date" required value={txForm.transactionDate} onChange={(e) => setTxForm((f) => ({ ...f, transactionDate: e.target.value }))} />
                </div>
                <div className="bgt-field bgt-field--wide">
                  <label className="bgt-label">Reference No.</label>
                  <input className="input" type="text" placeholder="OR, receipt, invoice number…" value={txForm.referenceNo} onChange={(e) => setTxForm((f) => ({ ...f, referenceNo: e.target.value }))} />
                </div>
              </div>

              <div className="bgt-tx-lines">
                <div className="bgt-tx-lines-head">
                  <div>
                    <span className="bgt-label">Line Entries</span>
                    <span className="bgt-field-note">All entries use the selected transaction type, category, project, date, and reference.</span>
                  </div>
                  {!editingTx && (
                    <button type="button" className="btn btn-ghost bgt-tx-add-line" onClick={addTxLine}>
                      <IconPlus /> Add Line
                    </button>
                  )}
                </div>

                {txLines.map((line, index) => (
                  <div className="bgt-tx-line" key={line.lineKey}>
                    <div className="bgt-tx-line-head">
                      <span className="bgt-tx-line-title">Entry {index + 1}</span>
                      {!editingTx && txLines.length > 1 && (
                        <button type="button" className="bgt-row-btn bgt-row-btn--del" onClick={() => removeTxLine(line.lineKey)}>
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="bgt-line-grid">
                      <div className="bgt-field bgt-line-desc">
                        <label className="bgt-label">Description</label>
                        <input className="input" type="text" placeholder="What is this for?" value={line.description} onChange={(e) => updateTxLineValue(line.lineKey, "description", e.target.value)} />
                      </div>
                      <div className="bgt-field">
                        <label className="bgt-label">Price (₱)</label>
                        <input className="input" type="number" min="0" step="0.0001" placeholder="0.0000" value={line.price} onChange={(e) => updateTxLineValue(line.lineKey, "price", e.target.value)} />
                      </div>
                      <div className="bgt-field">
                        <label className="bgt-label">Qty</label>
                        <input className="input" type="number" min="0" step="0.0001" placeholder="1" value={line.quantity} onChange={(e) => updateTxLineValue(line.lineKey, "quantity", e.target.value)} />
                      </div>
                      <div className="bgt-field">
                        <label className="bgt-label">Discount (₱)</label>
                        <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={line.discount} onChange={(e) => updateTxLineValue(line.lineKey, "discount", e.target.value)} />
                      </div>
                      <div className="bgt-field">
                        <label className="bgt-label">Amount (₱) <span className="bgt-req">*</span></label>
                        <input className="input" type="number" min="0.01" step="0.01" placeholder="0.00" value={line.amount} readOnly={calculateTransactionAmount(line.price, line.quantity, line.discount) !== ""} onChange={(e) => updateTxLineValue(line.lineKey, "amount", e.target.value)} />
                      </div>
                      <div className="bgt-field bgt-line-notes">
                        <label className="bgt-label">Notes</label>
                        <textarea className="input" rows={2} placeholder="Additional notes…" value={line.notes} onChange={(e) => updateTxLineValue(line.lineKey, "notes", e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="bgt-tx-total-row">
                  <span>Total</span>
                  <strong>₱{formatMoney(txLinesTotal)}</strong>
                </div>
              </div>

              <div className="bgt-modal-foot">
                <button type="button" className="btn btn-ghost" onClick={closeTxForm} disabled={txSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={txSaving}>
                  {txSaving ? "Saving…" : editingTx ? "Save Changes" : `Record ${txLines.filter(hasTxLineInput).length || 1} Transaction${(txLines.filter(hasTxLineInput).length || 1) !== 1 ? "s" : ""}`}
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
                <h3 className="bgt-modal-title">{editingAcc ? "Edit Category" : "New Category"}</h3>
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
                  <label className="bgt-label">Transaction Type <span className="bgt-req">*</span></label>
                  <select className="input" value={accForm.type} onChange={(e) => setAccForm((f) => ({ ...f, type: e.target.value }))}>
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
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
                  {accSaving ? "Saving…" : editingAcc ? "Save Changes" : "Create Category"}
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
                          <th>Category</th>
                          <th>Transaction Type</th>
                          <th className="bgt-col-amt">Price</th>
                          <th>Qty</th>
                          <th className="bgt-col-amt">Discount</th>
                          <th className="bgt-col-amt">Amount</th>
                          <th className="bgt-col-actions">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(importResult.transactions || []).map((tx) => {
                          const txAccountType = accountTypeFromTransactionRecord(tx);
                          const txDirection = transactionDirectionFromAccountType(txAccountType);
                          return (
                          <tr key={tx.id}>
                            <td className="bgt-cell-date">{formatDate(tx.transaction_date)}</td>
                            <td>{tx.description || <span className="bgt-muted">—</span>}</td>
                            <td><span className="bgt-account-chip">{tx.account_name || "—"}</span></td>
                            <td>
                              <span className={`bgt-type-pill bgt-type-pill--${txAccountType}`}>
                                {transactionTypeShortLabel(txAccountType)}
                              </span>
                            </td>
                            <td className="bgt-col-amt">{tx.price == null ? <span className="bgt-muted">—</span> : <>₱{formatMoney(tx.price)}</>}</td>
                            <td>{tx.quantity == null ? <span className="bgt-muted">—</span> : formatQuantity(tx.quantity)}</td>
                            <td className="bgt-col-amt">{tx.discount == null ? <span className="bgt-muted">—</span> : <>₱{formatMoney(tx.discount)}</>}</td>
                            <td className={`bgt-col-amt bgt-amount--${txDirection}`}>₱{formatMoney(tx.amount)}</td>
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
                          );
                        })}
                        {(!importResult.transactions || importResult.transactions.length === 0) && (importResult.rows || []).map((r, i) => (
                          <tr key={i}>
                            <td className="bgt-cell-date">{formatDate(r.transactionDate)}</td>
                            <td>{r.description}</td>
                            <td><span className="bgt-muted">—</span></td>
                            <td><span className="bgt-muted">—</span></td>
                            <td className="bgt-col-amt">{r.price == null ? <span className="bgt-muted">—</span> : <>₱{formatMoney(r.price)}</>}</td>
                            <td>{r.quantity == null ? <span className="bgt-muted">—</span> : formatQuantity(r.quantity)}</td>
                            <td className="bgt-col-amt">{r.discount == null ? <span className="bgt-muted">—</span> : <>₱{formatMoney(r.discount)}</>}</td>
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
                      {["Date", "Description / Expenses", "Price", "Qty", "Discount", "Sub Total"].map((col) => (
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
                      <label className="bgt-label">Category <span className="bgt-req">*</span></label>
                      <select className="input" required value={importAccountId} onChange={(e) => setImportAccountId(e.target.value)}>
                        <option value="">— Select category —</option>
                        {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>

                    <div className="bgt-field bgt-field--wide">
                      <label className="bgt-label">Assign to Project <span className="bgt-label-opt">(optional)</span></label>
                      <select className="input" value={importProjectId} onChange={(e) => setImportProjectId(e.target.value)}>
                        <option value="">— No project —</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{projectDisplayName(p)}</option>)}
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
                        <input type="file" accept=".xlsx" required className="bgt-file-input" onChange={(e) => setImportFile(e.target.files[0] || null)} />
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                        <span className="bgt-file-label">
                          {importFile ? importFile.name : <><strong>Choose file</strong> or drag & drop</>}
                        </span>
                        <span className="bgt-file-note">.xlsx · max 20 MB</span>
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
              This will permanently delete the {accountTypeLabel(accountTypeFromTransactionRecord(deletingTx)).toLowerCase()} of <strong>₱{formatMoney(deletingTx.amount)}</strong>
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
            <h3 className="bgt-confirm-title">{deletingAcc.transaction_count > 0 ? "Deactivate Category?" : "Delete Category?"}</h3>
            <p className="bgt-confirm-body">
              {deletingAcc.transaction_count > 0
                ? <><strong>{deletingAcc.name}</strong> has {deletingAcc.transaction_count} transaction(s) and cannot be deleted — it will be deactivated instead.</>
                : <>Delete category <strong>{deletingAcc.name}</strong>? This cannot be undone.</>}
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
