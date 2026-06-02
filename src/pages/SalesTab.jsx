import { useEffect, useMemo, useState } from "react";
import api from "../api/client";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const PRICE_DECIMAL_PLACES = 4;

function formatMoney(value, fractionDigits = 2) {
  if (value == null || value === "") return "—";
  return toNumber(value, 0).toLocaleString("en-PH", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

function formatPhpCurrency(value, fractionDigits = 2) {
  if (value == null || value === "") return "₱-";
  return `₱${formatMoney(value, fractionDigits)}`;
}

function formatFormNumber(value) {
  if (value == null || value === "") return "";
  return String(value);
}

function formatFixedFormNumber(value, fractionDigits) {
  if (value == null || value === "") return "";
  return toNumber(value, 0).toFixed(fractionDigits);
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
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function localDate(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const STATUS_LABELS = { active: "Active", completed: "Completed", cancelled: "Cancelled" };
const STATUS_COLORS = { active: "sl-pill--active", completed: "sl-pill--done", cancelled: "sl-pill--cancelled" };
const PROJECT_CATEGORY_OPTIONS = [
  { value: "materials", label: "Materials" },
  { value: "labor", label: "Labor" },
  { value: "others", label: "Others" }
];

function projectPackageDisplayName(pkg) {
  const templateName = String(pkg?.template_name || "").trim();
  const scenarioLabel = String(pkg?.scenario_label || "").trim();
  if (templateName && scenarioLabel) return `${templateName} - ${scenarioLabel}`;
  return scenarioLabel || templateName || "System Package";
}

function projectPackageOptionLabel(pkg) {
  const scenarioLabel = String(pkg?.scenario_label || "").trim() || projectPackageDisplayName(pkg);
  return `${scenarioLabel} | ${formatPhpCurrency(pkg?.package_price)}`;
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

function projectCostAmount(project) {
  const snapshotCost = projectDetailsTotalCost(project);
  return snapshotCost > 0 ? snapshotCost : toNumber(project?.total_expenses, 0);
}

const EMPTY_CUST = { name: "", contact: "", tinNo: "", address: "", notes: "" };
const EMPTY_PROJ = {
  customerId: "",
  projectName: "",
  systemPackage: "",
  location: "",
  saleAmount: "",
  projectDate: localDate(),
  startDate: localDate(),
  endDate: "",
  status: "active",
  projectCategory: "materials",
  notes: "",
  ...projectDetailsForForm(null, true)
};

export default function SalesTab() {
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState({ totalCustomers: 0, totalProjects: 0, totalSales: 0, totalExpenses: 0, totalMargin: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [view, setView] = useState("overview"); // overview | customers | projects
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Customer form
  const [custForm, setCustForm] = useState(EMPTY_CUST);
  const [editingCust, setEditingCust] = useState(null);
  const [custOpen, setCustOpen] = useState(false);
  const [custSaving, setCustSaving] = useState(false);
  const [deletingCust, setDeletingCust] = useState(null);

  // Project form
  const [projForm, setProjForm] = useState(EMPTY_PROJ);
  const [editingProj, setEditingProj] = useState(null);
  const [projOpen, setProjOpen] = useState(false);
  const [projSaving, setProjSaving] = useState(false);
  const [deletingProj, setDeletingProj] = useState(null);
  const [projectPackages, setProjectPackages] = useState([]);
  const [projectPackagesLoading, setProjectPackagesLoading] = useState(false);
  const [projectPackageApplying, setProjectPackageApplying] = useState(false);

  // Project detail drawer
  const [detailProj, setDetailProj] = useState(null);
  const [detailTx, setDetailTx] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadAll = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [custRes, projRes, sumRes] = await Promise.all([
        api.get("/customers"),
        api.get("/customers/projects"),
        api.get("/customers/summary")
      ]);
      setCustomers(custRes.data || []);
      setProjects(projRes.data || []);
      setSummary(sumRes.data || {});
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load data.");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const loadProjectPackages = async (quiet = false) => {
    if (!quiet) setProjectPackagesLoading(true);
    try {
      const res = await api.get("/package-prices", {
        params: { activeOnly: 1 }
      });
      setProjectPackages(Array.isArray(res.data) ? res.data : []);
    } catch {
      setProjectPackages([]);
    } finally {
      if (!quiet) setProjectPackagesLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadProjectPackages(true); }, []);

  function flash(msg, type = "success") {
    if (type === "success") { setSuccess(msg); setError(""); }
    else { setError(msg); setSuccess(""); }
    setTimeout(() => { setSuccess(""); setError(""); }, 3500);
  }

  // ── Customer CRUD ──────────────────────────────────────────────────────────
  function openNewCust() { setEditingCust(null); setCustForm(EMPTY_CUST); setCustOpen(true); }
  function openEditCust(c) { setEditingCust(c); setCustForm({ name: c.name || "", contact: c.contact || "", tinNo: c.tin_no || c.tinNo || "", address: c.address || "", notes: c.notes || "" }); setCustOpen(true); }
  function closeCust() { setCustOpen(false); setEditingCust(null); setCustForm(EMPTY_CUST); }

  async function saveCust(e) {
    e.preventDefault(); setCustSaving(true);
    try {
      const payload = { name: custForm.name, contact: custForm.contact, tinNo: custForm.tinNo, address: custForm.address, notes: custForm.notes };
      if (editingCust) { await api.put(`/customers/${editingCust.id}`, payload); flash("Customer updated."); }
      else { await api.post("/customers", payload); flash("Customer created."); }
      closeCust(); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed to save.", "error"); }
    finally { setCustSaving(false); }
  }

  async function confirmDeleteCust(c) {
    try {
      const res = await api.delete(`/customers/${c.id}`);
      flash(res.data?.deactivated ? "Customer deactivated." : "Customer deleted.");
      setDeletingCust(null); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed.", "error"); setDeletingCust(null); }
  }

  // ── Project CRUD ───────────────────────────────────────────────────────────
  function openNewProj(custId = "") {
    setEditingProj(null);
    setProjForm({
      ...EMPTY_PROJ,
      ...projectDetailsForForm(null, true),
      customerId: custId ? String(custId) : "",
      projectDate: localDate(),
      startDate: localDate(),
      endDate: "",
      projectCategory: "materials"
    });
    setProjOpen(true);
  }
  function openEditProj(p) {
    setEditingProj(p);
    setProjForm({
      customerId: String(p.customer_id || ""),
      projectName: p.project_name || "",
      systemPackage: p.system_package || "",
      location: p.location || "",
      saleAmount: String(p.sale_amount ?? ""),
      projectDate: p.project_date ? localDate(p.project_date) : localDate(p.start_date || new Date()),
      startDate: p.start_date ? localDate(p.start_date) : p.project_date ? localDate(p.project_date) : "",
      endDate: p.end_date ? localDate(p.end_date) : "",
      status: p.status || "active",
      projectCategory: p.project_category || "materials",
      notes: p.notes || "",
      ...projectDetailsForForm(p, true)
    });
    setProjOpen(true);
  }
  function closeProj() { setProjOpen(false); setEditingProj(null); setProjForm(EMPTY_PROJ); }

  async function handleProjectPackageChange(packageId) {
    if (!packageId) {
      setProjForm((form) => ({ ...form, systemPackage: "" }));
      return;
    }
    if (packageId === "__current") return;

    const selectedPackage = projectPackages.find((pkg) => String(pkg.id) === String(packageId));
    if (!selectedPackage) return;

    const packageName = projectPackageDisplayName(selectedPackage);
    setProjForm((form) => ({
      ...form,
      systemPackage: packageName,
      saleAmount: formatFixedFormNumber(selectedPackage.package_price, 2)
    }));

    setProjectPackageApplying(true);
    try {
      const res = await api.get("/package-prices/costing", {
        params: {
          templateId: Number(selectedPackage.template_id),
          activeOnly: 0,
          vatMode: "incl"
        }
      });
      const materialRows = (Array.isArray(res.data?.items) ? res.data.items : [])
        .map((item) => {
          const qty = Math.max(0, toNumber(item.qty, 0));
          const unitCost = Math.max(0, toNumber(item.unit_cost, 0));
          return createMaterialDetail({
            item: String(item.description || item.catalog_material_name || "").trim(),
            qty: formatFormNumber(qty),
            unitCost: formatFormNumber(unitCost),
            total: formatFormNumber(qty * unitCost)
          });
        })
        .filter((row) => row.item);

      setProjForm((form) => ({
        ...form,
        materialsDetails: materialRows.length ? materialRows : [createMaterialDetail()]
      }));
    } catch (err) {
      flash(err?.response?.data?.message || "Failed to load materials for the selected package.", "error");
    } finally {
      setProjectPackageApplying(false);
    }
  }

  async function saveProj(e) {
    e.preventDefault(); setProjSaving(true);
    try {
      const payload = {
        customerId: Number(projForm.customerId),
        projectName: projForm.projectName,
        systemPackage: projForm.systemPackage,
        location: projForm.location,
        saleAmount: Number(projForm.saleAmount),
        projectDate: projForm.projectDate,
        startDate: projForm.startDate || projForm.projectDate,
        endDate: projForm.endDate,
        status: projForm.status,
        projectCategory: projForm.projectCategory,
        notes: projForm.notes,
        materialsDetails: projForm.materialsDetails,
        laborDetails: projForm.laborDetails,
        otherExpensesDetails: projForm.otherExpensesDetails
      };
      if (editingProj) { await api.put(`/customers/projects/${editingProj.id}`, payload); flash("Project updated."); }
      else { await api.post("/customers/projects", payload); flash("Project created."); }
      closeProj(); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed to save.", "error"); }
    finally { setProjSaving(false); }
  }

  async function confirmDeleteProj(p) {
    try {
      await api.delete(`/customers/projects/${p.id}`);
      flash("Project deleted."); setDeletingProj(null); await loadAll(true);
    } catch (err) { flash(err?.response?.data?.message || "Failed.", "error"); setDeletingProj(null); }
  }

  // ── Project detail ─────────────────────────────────────────────────────────
  async function openDetail(proj) {
    setDetailProj(proj); setDetailTx([]); setDetailLoading(true);
    try {
      const res = await api.get(`/customers/projects/${proj.id}/transactions`);
      setDetailTx(res.data || []);
    } catch { setDetailTx([]); }
    finally { setDetailLoading(false); }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredProjects = useMemo(() =>
    selectedCustomer ? projects.filter((p) => p.customer_id === selectedCustomer) : projects,
    [projects, selectedCustomer]
  );

  const projectPackageGroups = useMemo(() => {
    const groups = new Map();
    for (const pkg of [...projectPackages].sort((a, b) => {
      const templateDiff = String(a.template_name || "").localeCompare(String(b.template_name || ""));
      if (templateDiff !== 0) return templateDiff;
      return String(a.scenario_label || "").localeCompare(String(b.scenario_label || ""));
    })) {
      const label = String(pkg.template_name || "").trim() || "Packages";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(pkg);
    }
    return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows }));
  }, [projectPackages]);

  const selectedProjectPackageId = useMemo(() => {
    const savedPackage = String(projForm.systemPackage || "").trim();
    if (!savedPackage) return "";

    const existingProjectPackage = String(editingProj?.system_package || "").trim();
    if (editingProj && existingProjectPackage && savedPackage === existingProjectPackage) {
      return "__current";
    }

    const match = projectPackages.find((pkg) => {
      const displayName = projectPackageDisplayName(pkg);
      const scenarioLabel = String(pkg.scenario_label || "").trim();
      return displayName === savedPackage || scenarioLabel === savedPackage;
    });

    return match ? String(match.id) : "__current";
  }, [editingProj, projectPackages, projForm.systemPackage]);

  const crmContractValue = useMemo(
    () => projects.reduce((sum, project) => sum + toNumber(project.sale_amount, 0), 0),
    [projects]
  );
  const crmCostingExpenses = useMemo(
    () => projects.reduce((sum, project) => sum + projectCostAmount(project), 0),
    [projects]
  );
  const crmMargin = crmContractValue - crmCostingExpenses;
  const netPositive = crmMargin >= 0;

  return (
    <div className="sl">
      {/* ── KPI Strip ── */}
      <div className="sl-kpi-row">
        <div className="sl-kpi">
          <span className="sl-kpi-label">Customers</span>
          <strong className="sl-kpi-value">{summary.totalCustomers}</strong>
          <span className="sl-kpi-sub">{summary.totalProjects} project{summary.totalProjects !== 1 ? "s" : ""}</span>
        </div>
        <div className="sl-kpi sl-kpi--sales">
          <span className="sl-kpi-label">Total Sales</span>
          <strong className="sl-kpi-value">₱{formatMoney(crmContractValue)}</strong>
          <span className="sl-kpi-sub">contract value</span>
        </div>
        <div className="sl-kpi sl-kpi--expenses">
          <span className="sl-kpi-label">Total Expenses</span>
          <strong className="sl-kpi-value">₱{formatMoney(crmCostingExpenses)}</strong>
          <span className="sl-kpi-sub">project costing</span>
        </div>
        <div className={`sl-kpi sl-kpi--margin ${netPositive ? "sl-kpi--pos" : "sl-kpi--neg"}`}>
          <span className="sl-kpi-label">Net Margin</span>
          <strong className="sl-kpi-value">₱{formatMoney(crmMargin)}</strong>
          <span className={`sl-kpi-badge ${netPositive ? "sl-kpi-badge--pos" : "sl-kpi-badge--neg"}`}>{netPositive ? "Profit" : "Loss"}</span>
        </div>
      </div>

      {/* ── Toasts ── */}
      {success && <div className="bgt-toast bgt-toast--ok"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>{success}</div>}
      {error   && <div className="bgt-toast bgt-toast--err"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{error}</div>}

      {/* ── Toolbar ── */}
      <div className="bgt-toolbar">
        <div className="bgt-seg">
          <button className={`bgt-seg-btn${view === "overview" ? " bgt-seg-btn--on" : ""}`} onClick={() => { setView("overview"); setSelectedCustomer(null); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Overview
          </button>
          <button className={`bgt-seg-btn${view === "customers" ? " bgt-seg-btn--on" : ""}`} onClick={() => setView("customers")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Customers
          </button>
          <button className={`bgt-seg-btn${view === "projects" ? " bgt-seg-btn--on" : ""}`} onClick={() => setView("projects")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Projects
          </button>
        </div>
        <div className="bgt-toolbar-actions">
          {view === "customers" && <button className="btn btn-primary" onClick={openNewCust}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Customer</button>}
          {view === "projects" && <button className="btn btn-primary" onClick={() => openNewProj()}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Project</button>}
        </div>
      </div>

      {/* ── Overview ── */}
      {view === "overview" && (
        loading ? (
          <div className="bgt-empty"><div className="bgt-spinner" /><p>Loading…</p></div>
        ) : customers.length === 0 ? (
          <div className="bgt-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="bgt-empty-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <p>No customers yet. Add your first customer to get started.</p>
            <button className="btn btn-primary" onClick={openNewCust}>Add Customer</button>
          </div>
        ) : (
          <div className="sl-overview-grid">
            {customers.map((cust) => {
              const custProjects = projects.filter((p) => p.customer_id === cust.id);
              const totalSales = custProjects.reduce((s, p) => s + toNumber(p.sale_amount, 0), 0);
              const totalExp   = custProjects.reduce((s, p) => s + projectCostAmount(p), 0);
              const margin     = totalSales - totalExp;
              const marginPos  = margin >= 0;
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
                    <div className="sl-stat"><span className="sl-stat-label">Sales</span><span className="sl-stat-val sl-stat-val--sales">₱{formatMoney(totalSales)}</span></div>
                    <div className="sl-stat-div" />
                    <div className="sl-stat"><span className="sl-stat-label">Expenses</span><span className="sl-stat-val sl-stat-val--exp">₱{formatMoney(totalExp)}</span></div>
                    <div className="sl-stat-div" />
                    <div className="sl-stat"><span className="sl-stat-label">Margin</span><span className={`sl-stat-val ${marginPos ? "sl-stat-val--sales" : "sl-stat-val--exp"}`}>₱{formatMoney(margin)}</span></div>
                  </div>

                  {custProjects.length > 0 && (
                    <div className="sl-cust-projects">
                      {custProjects.map((p) => {
                        const projectCost = projectCostAmount(p);
                        const projectMargin = toNumber(p.sale_amount, 0) - projectCost;
                        return (
                          <button key={p.id} className="sl-proj-row" onClick={() => openDetail(p)}>
                            <div className="sl-proj-row-left">
                              <span className={`sl-pill ${STATUS_COLORS[p.status] || ""}`}>{STATUS_LABELS[p.status] || p.status}</span>
                              <div className="sl-proj-copy">
                                <span className="sl-proj-name">{p.project_name}</span>
                                <span className="sl-proj-sub">{p.system_package || "No package selected"} • Cost ₱{formatMoney(projectCost)}</span>
                              </div>
                            </div>
                            <div className="sl-proj-row-right">
                              <span className="sl-proj-margin" style={{ color: projectMargin >= 0 ? "#147845" : "#b83a3a" }}>
                                ₱{formatMoney(projectMargin)}
                              </span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button className="sl-add-proj-btn" onClick={() => openNewProj(cust.id)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Project
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Customers table ── */}
      {view === "customers" && (
        customers.length === 0 ? (
          <div className="bgt-empty">
            <p>No customers yet.</p>
            <button className="btn btn-primary" onClick={openNewCust}>Add First Customer</button>
          </div>
        ) : (
          <div className="bgt-table-wrap">
            <table className="bgt-table">
              <thead><tr><th>Full Name</th><th>Contact No.</th><th>Projects</th><th className="bgt-col-amt">Sales</th><th className="bgt-col-amt">Expenses</th><th className="bgt-col-amt">Margin</th><th /></tr></thead>
              <tbody>
                {customers.map((c) => {
                  const customerProjects = projects.filter((p) => p.customer_id === c.id);
                  const customerSales = customerProjects.reduce((sum, project) => sum + toNumber(project.sale_amount, 0), 0);
                  const customerCost = customerProjects.reduce((sum, project) => sum + projectCostAmount(project), 0);
                  const margin = customerSales - customerCost;
                  return (
                    <tr key={c.id} className="bgt-table-row">
                      <td><strong>{c.name}</strong></td>
                      <td className="bgt-muted">{c.contact || "—"}</td>
                      <td>{c.project_count}</td>
                      <td className="bgt-col-amt" style={{ color: "#147845", fontWeight: 700 }}>₱{formatMoney(customerSales)}</td>
                      <td className="bgt-col-amt" style={{ color: "#b83a3a", fontWeight: 700 }}>₱{formatMoney(customerCost)}</td>
                      <td className="bgt-col-amt" style={{ color: margin >= 0 ? "#147845" : "#b83a3a", fontWeight: 700 }}>₱{formatMoney(margin)}</td>
                      <td className="bgt-col-actions">
                        <button className="bgt-row-btn" onClick={() => openEditCust(c)}>Edit</button>
                        <button className="bgt-row-btn bgt-row-btn--del" onClick={() => setDeletingCust(c)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Projects table ── */}
      {view === "projects" && (
        <>
          <div className="sl-filter-bar">
            <select className="input sl-filter-select" value={selectedCustomer || ""} onChange={(e) => setSelectedCustomer(e.target.value ? Number(e.target.value) : null)}>
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {filteredProjects.length === 0 ? (
            <div className="bgt-empty"><p>No projects found.</p><button className="btn btn-primary" onClick={() => openNewProj()}>Add Project</button></div>
          ) : (
            <div className="bgt-table-wrap">
              <table className="bgt-table">
                <thead><tr><th>Customer</th><th>Project</th><th>System Package</th><th>Date</th><th>Status</th><th className="bgt-col-amt">Sale Amount</th><th className="bgt-col-amt">Expenses</th><th className="bgt-col-amt">Margin</th><th /></tr></thead>
                <tbody>
                  {filteredProjects.map((p) => {
                    const projectCost = projectCostAmount(p);
                    const margin = toNumber(p.sale_amount, 0) - projectCost;
                    return (
                      <tr key={p.id} className="bgt-table-row" style={{ cursor: "pointer" }} onClick={() => openDetail(p)}>
                        <td><span className="bgt-account-chip">{p.customer_name}</span></td>
                        <td><strong>{p.project_name}</strong></td>
                        <td>{p.system_package || <span className="bgt-muted">—</span>}</td>
                        <td className="bgt-cell-date">{formatDate(p.project_date)}</td>
                        <td><span className={`sl-pill ${STATUS_COLORS[p.status] || ""}`}>{STATUS_LABELS[p.status] || p.status}</span></td>
                        <td className="bgt-col-amt" style={{ color: "#147845", fontWeight: 700 }}>₱{formatMoney(p.sale_amount)}</td>
                        <td className="bgt-col-amt" style={{ color: "#b83a3a", fontWeight: 700 }}>₱{formatMoney(projectCost)}</td>
                        <td className="bgt-col-amt" style={{ color: margin >= 0 ? "#147845" : "#b83a3a", fontWeight: 700 }}>₱{formatMoney(margin)}</td>
                        <td className="bgt-col-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="bgt-row-btn" onClick={() => openEditProj(p)}>Edit</button>
                          <button className="bgt-row-btn bgt-row-btn--del" onClick={() => setDeletingProj(p)}>Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Customer form modal ── */}
      {custOpen && (
        <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeCust(); }}>
          <div className="bgt-modal bgt-modal--sm">
            <div className="bgt-modal-head">
              <div><p className="bgt-modal-eyebrow">{editingCust ? "Editing" : "New"}</p><h3 className="bgt-modal-title">{editingCust ? "Edit Customer" : "New Customer"}</h3></div>
              <button className="bgt-modal-x" onClick={closeCust}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <form className="bgt-modal-body" onSubmit={saveCust}>
              <div className="bgt-form-grid">
                <div className="bgt-field bgt-field--wide"><label className="bgt-label">Full Name <span className="bgt-req">*</span></label><input className="input" required placeholder="e.g. Allan Santos" value={custForm.name} onChange={(e) => setCustForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div className="bgt-field bgt-field--wide"><label className="bgt-label">Contact No.</label><input className="input" placeholder="Phone number" value={custForm.contact} onChange={(e) => setCustForm((f) => ({ ...f, contact: e.target.value }))} /></div>
                <div className="bgt-field bgt-field--wide"><label className="bgt-label">TIN No.</label><input className="input" placeholder="TIN No. (optional)" value={custForm.tinNo} onChange={(e) => setCustForm((f) => ({ ...f, tinNo: e.target.value }))} /></div>
                <div className="bgt-field bgt-field--wide"><label className="bgt-label">Address</label><input className="input" placeholder="Address (optional)" value={custForm.address} onChange={(e) => setCustForm((f) => ({ ...f, address: e.target.value }))} /></div>
                <div className="bgt-field bgt-field--wide"><label className="bgt-label">Notes</label><textarea className="input" rows={2} value={custForm.notes} onChange={(e) => setCustForm((f) => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div className="bgt-modal-foot"><button type="button" className="btn btn-ghost" onClick={closeCust} disabled={custSaving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={custSaving}>{custSaving ? "Saving…" : editingCust ? "Save Changes" : "Create Customer"}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* ── Project form modal ── */}
      {projOpen && (
        <div className="bgt-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeProj(); }}>
          <div className="bgt-modal bgt-modal--sm">
            <div className="bgt-modal-head">
              <div><p className="bgt-modal-eyebrow">{editingProj ? "Editing" : "New project"}</p><h3 className="bgt-modal-title">{editingProj ? "Edit Project" : "New Project"}</h3></div>
              <button className="bgt-modal-x" onClick={closeProj}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <form className="bgt-modal-body" onSubmit={saveProj}>
              <div className="bgt-form-grid">
                <div className="bgt-field bgt-field--wide"><label className="bgt-label">Customer <span className="bgt-req">*</span></label>
                  <select className="input" required value={projForm.customerId} onChange={(e) => setProjForm((f) => ({ ...f, customerId: e.target.value }))}>
                    <option value="">— Select customer —</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="bgt-field bgt-field--wide"><label className="bgt-label">Project Name <span className="bgt-req">*</span></label><input className="input" required placeholder="e.g. Solar Installation – Phase 1" value={projForm.projectName} onChange={(e) => setProjForm((f) => ({ ...f, projectName: e.target.value }))} /></div>
                <div className="bgt-field">
                  <label className="bgt-label">System Package</label>
                  <select
                    className="input select"
                    value={selectedProjectPackageId}
                    disabled={projectPackagesLoading || projectPackageApplying}
                    onChange={(e) => handleProjectPackageChange(e.target.value)}
                  >
                    <option value="">
                      {projectPackages.length ? "Select package" : "No active packages available"}
                    </option>
                    {selectedProjectPackageId === "__current" && (
                      <option value="__current">{projForm.systemPackage}</option>
                    )}
                    {projectPackageGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.rows.map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>
                            {projectPackageOptionLabel(pkg)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {projectPackageApplying && (
                    <p className="bgt-field-note">Creating project costing snapshot...</p>
                  )}
                </div>
                <div className="bgt-field"><label className="bgt-label">Location</label><input className="input" placeholder="Project location" value={projForm.location} onChange={(e) => setProjForm((f) => ({ ...f, location: e.target.value }))} /></div>
                <div className="bgt-field"><label className="bgt-label">Sale Amount (₱) <span className="bgt-req">*</span></label><input className="input" type="number" min="0" step="0.01" required placeholder="0.00" value={projForm.saleAmount} onChange={(e) => setProjForm((f) => ({ ...f, saleAmount: e.target.value }))} /></div>
                <div className="bgt-field"><label className="bgt-label">Date</label><input className="input" type="date" value={projForm.projectDate} onChange={(e) => setProjForm((f) => ({ ...f, projectDate: e.target.value }))} /></div>
                <div className="bgt-field"><label className="bgt-label">Status</label>
                  <select className="input" value={projForm.status} onChange={(e) => setProjForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="bgt-field"><label className="bgt-label">Category</label><select className="input" value={projForm.projectCategory} onChange={(e) => setProjForm((f) => ({ ...f, projectCategory: e.target.value }))}>{PROJECT_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                <div className="bgt-field bgt-field--wide"><label className="bgt-label">Notes</label><textarea className="input" rows={2} value={projForm.notes} onChange={(e) => setProjForm((f) => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div className="bgt-modal-foot"><button type="button" className="btn btn-ghost" onClick={closeProj} disabled={projSaving || projectPackageApplying}>Cancel</button><button type="submit" className="btn btn-primary" disabled={projSaving || projectPackageApplying}>{projSaving ? "Saving…" : editingProj ? "Save Changes" : "Create Project"}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* ── Project detail drawer ── */}
      {detailProj && (
        <div className="bgt-backdrop" onClick={() => setDetailProj(null)}>
          <div className="sl-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-modal-head">
              <div>
                <p className="bgt-modal-eyebrow">{detailProj.customer_name}</p>
                <h3 className="bgt-modal-title">{detailProj.project_name}</h3>
              </div>
              <button className="bgt-modal-x" onClick={() => setDetailProj(null)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div className="bgt-modal-body">
              {(() => {
                const detailCost = projectCostAmount(detailProj);
                const detailMargin = toNumber(detailProj.sale_amount, 0) - detailCost;
                return (
                  <>
                    <dl className="bgt-delete-fields bgt-delete-fields--wide">
                      <div><dt>System Package</dt><dd>{detailProj.system_package || "-"}</dd></div>
                      <div><dt>Location</dt><dd>{detailProj.location || "-"}</dd></div>
                      <div><dt>Start Date</dt><dd>{formatDate(detailProj.start_date || detailProj.project_date)}</dd></div>
                      <div><dt>End Date</dt><dd>{formatDate(detailProj.end_date)}</dd></div>
                    </dl>
              <div className="sl-drawer-stats">
                <div className="sl-dstat"><span className="sl-dstat-label">Sale Amount</span><strong className="sl-dstat-val sl-dstat-val--sales">₱{formatMoney(detailProj.sale_amount)}</strong></div>
                <div className="sl-dstat"><span className="sl-dstat-label">Project Cost</span><strong className="sl-dstat-val sl-dstat-val--exp">₱{formatMoney(detailCost)}</strong></div>
                <div className="sl-dstat"><span className="sl-dstat-label">Margin</span><strong className={`sl-dstat-val ${detailMargin >= 0 ? "sl-dstat-val--sales" : "sl-dstat-val--exp"}`}>₱{formatMoney(detailMargin)}</strong></div>
              </div>
                  </>
                );
              })()}

              <div className="sl-drawer-section">
                <p className="sl-drawer-section-title">Linked Expenses ({detailTx.length})</p>
                {detailLoading ? (
                  <div className="bgt-empty" style={{ padding: 24 }}><div className="bgt-spinner" /></div>
                ) : detailTx.length === 0 ? (
                  <p className="bgt-muted" style={{ padding: "12px 0", fontSize: 13 }}>No expenses linked to this project yet. Assign transactions via Financial Management.</p>
                ) : (
                  <div className="bgt-import-preview">
                    <table className="bgt-table bgt-table--compact">
                      <thead><tr><th>Date</th><th>Description</th><th>Account</th><th className="bgt-col-amt">Price</th><th>Qty</th><th className="bgt-col-amt">Discount</th><th className="bgt-col-amt">Amount</th></tr></thead>
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

      {/* ── Delete customer confirm ── */}
      {deletingCust && (
        <div className="bgt-backdrop" onClick={() => setDeletingCust(null)}>
          <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-confirm-icon bgt-confirm-icon--del"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></div>
            <h3 className="bgt-confirm-title">{deletingCust.project_count > 0 ? "Deactivate Customer?" : "Delete Customer?"}</h3>
            <p className="bgt-confirm-body">{deletingCust.project_count > 0 ? <><strong>{deletingCust.name}</strong> has {deletingCust.project_count} project(s) and will be deactivated.</> : <>Delete <strong>{deletingCust.name}</strong>? This cannot be undone.</>}</p>
            <div className="bgt-modal-foot bgt-modal-foot--center"><button className="btn btn-ghost" onClick={() => setDeletingCust(null)}>Cancel</button><button className="btn btn-danger" onClick={() => confirmDeleteCust(deletingCust)}>{deletingCust.project_count > 0 ? "Deactivate" : "Delete"}</button></div>
          </div>
        </div>
      )}

      {/* ── Delete project confirm ── */}
      {deletingProj && (
        <div className="bgt-backdrop" onClick={() => setDeletingProj(null)}>
          <div className="bgt-modal bgt-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="bgt-confirm-icon bgt-confirm-icon--del"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></div>
            <h3 className="bgt-confirm-title">Delete Project?</h3>
            <p className="bgt-confirm-body">Delete <strong>{deletingProj.project_name}</strong>? All linked expense assignments will be removed. This cannot be undone.</p>
            <div className="bgt-modal-foot bgt-modal-foot--center"><button className="btn btn-ghost" onClick={() => setDeletingProj(null)}>Cancel</button><button className="btn btn-danger" onClick={() => confirmDeleteProj(deletingProj)}>Delete</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
