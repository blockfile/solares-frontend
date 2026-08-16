import { useDeferredValue, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import "../styles/payroll.css";

const EMPTY_EMPLOYEE_FORM = {
  employeeName: "",
  employeeCode: "",
  roleTitle: "",
  payType: "monthly",
  baseRate: "",
  contactNo: "",
  notes: "",
  status: "active"
};

function monthStartInput(value = new Date()) {
  const date = new Date(value);
  return localDateInput(new Date(date.getFullYear(), date.getMonth(), 1));
}

function monthEndInput(value = new Date()) {
  const date = new Date(value);
  return localDateInput(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function localDateInput(value = new Date()) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

const EMPTY_PAYROLL_FORM = {
  employeeId: "",
  periodStart: monthStartInput(),
  periodEnd: monthEndInput(),
  payDate: localDateInput(),
  status: "draft",
  regularDays: "",
  regularHours: "",
  overtimeHours: "",
  basicPay: "",
  overtimePay: "",
  allowances: "",
  bonus: "",
  deductions: "",
  advances: "",
  otherDeductions: "",
  referenceNo: "",
  notes: ""
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value) {
  return toNumber(value, 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function payTypeLabel(value) {
  const text = String(value || "monthly");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function statusLabel(value) {
  const text = String(value || "draft").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function statusChipClass(value) {
  const status = String(value || "").toLowerCase();
  if (["paid", "active", "completed"].includes(status)) return "chip chip-success";
  if (["unpaid", "pending", "approved"].includes(status)) return "chip chip-warn";
  if (["overdue", "failed", "inactive", "rejected", "void"].includes(status)) return "chip chip-danger";
  if (status === "draft") return "chip chip-info";
  return "chip chip-neutral";
}

function calculateDefaultBasicPay(employee, form) {
  if (!employee) return 0;
  const baseRate = toNumber(employee.base_rate, 0);
  const payType = String(employee.pay_type || "monthly");
  if (payType === "daily") return baseRate * toNumber(form.regularDays, 0);
  if (payType === "hourly") return baseRate * toNumber(form.regularHours, 0);
  return baseRate;
}

function calculatePayrollPreview(employee, form) {
  const basicPay =
    String(form.basicPay).trim() === ""
      ? calculateDefaultBasicPay(employee, form)
      : toNumber(form.basicPay, 0);
  const overtimePay = toNumber(form.overtimePay, 0);
  const allowances = toNumber(form.allowances, 0);
  const bonus = toNumber(form.bonus, 0);
  const deductions = toNumber(form.deductions, 0);
  const advances = toNumber(form.advances, 0);
  const otherDeductions = toNumber(form.otherDeductions, 0);
  const grossPay = basicPay + overtimePay + allowances + bonus;
  const netPay = Math.max(0, grossPay - deductions - advances - otherDeductions);

  return {
    basicPay,
    grossPay,
    netPay,
    deductionsTotal: deductions + advances + otherDeductions
  };
}

export default function PayrollTab() {
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({
    activeEmployees: 0,
    draftEntries: 0,
    paidEntries: 0,
    paidThisMonth: 0
  });
  const [employeeForm, setEmployeeForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [payrollForm, setPayrollForm] = useState(EMPTY_PAYROLL_FORM);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [entrySearch, setEntrySearch] = useState("");
  const [entryStatusFilter, setEntryStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // UI-only collapse toggles for the create forms (Atlas page frame).
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);

  const deferredEmployeeSearch = useDeferredValue(employeeSearch);
  const deferredEntrySearch = useDeferredValue(entrySearch);

  const loadAll = async ({ background = false } = {}) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [employeesRes, entriesRes, summaryRes] = await Promise.all([
        api.get("/payroll/employees?active=all"),
        api.get("/payroll/entries?limit=160"),
        api.get("/payroll/summary")
      ]);
      const nextEmployees = Array.isArray(employeesRes.data) ? employeesRes.data : [];
      setEmployees(nextEmployees);
      setEntries(Array.isArray(entriesRes.data) ? entriesRes.data : []);
      setSummary(summaryRes.data || {});
      setPayrollForm((prev) => {
        if (prev.employeeId && nextEmployees.some((employee) => String(employee.id) === String(prev.employeeId))) {
          return prev;
        }
        const firstActive = nextEmployees.find((employee) => employee.status !== "inactive");
        return { ...prev, employeeId: firstActive ? String(firstActive.id) : "" };
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load payroll");
      setEmployees([]);
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => String(employee.id) === String(payrollForm.employeeId)) || null,
    [employees, payrollForm.employeeId]
  );

  const payrollPreview = useMemo(
    () => calculatePayrollPreview(selectedEmployee, payrollForm),
    [payrollForm, selectedEmployee]
  );

  const visibleEmployees = useMemo(() => {
    const needle = deferredEmployeeSearch.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((employee) =>
      [
        employee.employee_name,
        employee.employee_code,
        employee.role_title,
        employee.contact_no,
        employee.pay_type,
        employee.status
      ].some((value) => String(value || "").toLowerCase().includes(needle))
    );
  }, [deferredEmployeeSearch, employees]);

  const visibleEntries = useMemo(() => {
    const needle = deferredEntrySearch.trim().toLowerCase();
    return entries.filter((entry) => {
      if (entryStatusFilter !== "all" && entry.status !== entryStatusFilter) return false;
      if (!needle) return true;
      return [
        entry.employee_name,
        entry.employee_code,
        entry.role_title,
        entry.reference_no,
        entry.notes,
        entry.status
      ].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [deferredEntrySearch, entries, entryStatusFilter]);

  const updateEmployeeForm = (field, value) => {
    setEmployeeForm((prev) => ({ ...prev, [field]: value }));
  };

  const updatePayrollForm = (field, value) => {
    setPayrollForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetEmployeeForm = () => {
    setEditingEmployeeId(null);
    setEmployeeForm(EMPTY_EMPLOYEE_FORM);
  };

  const resetPayrollForm = () => {
    setEditingEntryId(null);
    setPayrollForm((prev) => ({
      ...EMPTY_PAYROLL_FORM,
      employeeId: prev.employeeId || "",
      periodStart: monthStartInput(),
      periodEnd: monthEndInput(),
      payDate: localDateInput()
    }));
  };

  const saveEmployee = async () => {
    if (!employeeForm.employeeName.trim()) return;
    setError("");
    setSuccess("");

    const payload = {
      employeeName: employeeForm.employeeName,
      employeeCode: employeeForm.employeeCode,
      roleTitle: employeeForm.roleTitle,
      payType: employeeForm.payType,
      baseRate: toNumber(employeeForm.baseRate, 0),
      contactNo: employeeForm.contactNo,
      notes: employeeForm.notes,
      status: employeeForm.status
    };

    try {
      if (editingEmployeeId) {
        await api.put(`/payroll/employees/${editingEmployeeId}`, payload);
        setSuccess("Payroll employee updated.");
      } else {
        await api.post("/payroll/employees", payload);
        setSuccess("Payroll employee added.");
      }
      resetEmployeeForm();
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save payroll employee");
    }
  };

  const startEditEmployee = (employee) => {
    setEditingEmployeeId(employee.id);
    setEmployeeForm({
      employeeName: employee.employee_name || "",
      employeeCode: employee.employee_code || "",
      roleTitle: employee.role_title || "",
      payType: employee.pay_type || "monthly",
      baseRate: String(employee.base_rate ?? ""),
      contactNo: employee.contact_no || "",
      notes: employee.notes || "",
      status: employee.status || "active"
    });
  };

  const deactivateEmployee = async (employee) => {
    if (!window.confirm(`Deactivate ${employee.employee_name} from payroll? Existing payroll records stay available.`)) return;
    setError("");
    setSuccess("");

    try {
      await api.delete(`/payroll/employees/${employee.id}`);
      setSuccess(`${employee.employee_name} deactivated.`);
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to deactivate payroll employee");
    }
  };

  const payrollPayload = () => {
    const payload = {
      employeeId: Number(payrollForm.employeeId),
      periodStart: payrollForm.periodStart,
      periodEnd: payrollForm.periodEnd,
      payDate: payrollForm.payDate || null,
      status: payrollForm.status,
      regularDays: toNumber(payrollForm.regularDays, 0),
      regularHours: toNumber(payrollForm.regularHours, 0),
      overtimeHours: toNumber(payrollForm.overtimeHours, 0),
      overtimePay: toNumber(payrollForm.overtimePay, 0),
      allowances: toNumber(payrollForm.allowances, 0),
      bonus: toNumber(payrollForm.bonus, 0),
      deductions: toNumber(payrollForm.deductions, 0),
      advances: toNumber(payrollForm.advances, 0),
      otherDeductions: toNumber(payrollForm.otherDeductions, 0),
      referenceNo: payrollForm.referenceNo,
      notes: payrollForm.notes
    };

    if (String(payrollForm.basicPay).trim() !== "") {
      payload.basicPay = toNumber(payrollForm.basicPay, 0);
    }

    return payload;
  };

  const savePayrollEntry = async () => {
    if (!payrollForm.employeeId || !payrollForm.periodStart || !payrollForm.periodEnd) return;
    setError("");
    setSuccess("");

    try {
      if (editingEntryId) {
        await api.put(`/payroll/entries/${editingEntryId}`, payrollPayload());
        setSuccess("Payroll entry updated.");
      } else {
        await api.post("/payroll/entries", payrollPayload());
        setSuccess("Payroll entry created.");
      }
      resetPayrollForm();
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save payroll entry");
    }
  };

  const startEditEntry = (entry) => {
    setEditingEntryId(entry.id);
    setPayrollForm({
      employeeId: String(entry.employee_id || ""),
      periodStart: localDateInput(entry.period_start),
      periodEnd: localDateInput(entry.period_end),
      payDate: localDateInput(entry.pay_date),
      status: entry.status || "draft",
      regularDays: String(entry.regular_days ?? ""),
      regularHours: String(entry.regular_hours ?? ""),
      overtimeHours: String(entry.overtime_hours ?? ""),
      basicPay: String(entry.basic_pay ?? ""),
      overtimePay: String(entry.overtime_pay ?? ""),
      allowances: String(entry.allowances ?? ""),
      bonus: String(entry.bonus ?? ""),
      deductions: String(entry.deductions ?? ""),
      advances: String(entry.advances ?? ""),
      otherDeductions: String(entry.other_deductions ?? ""),
      referenceNo: entry.reference_no || "",
      notes: entry.notes || ""
    });
  };

  const removeEntry = async (entry) => {
    if (!window.confirm(`Delete payroll record for ${entry.employee_name}?`)) return;
    setError("");
    setSuccess("");

    try {
      await api.delete(`/payroll/entries/${entry.id}`);
      setSuccess("Payroll entry deleted.");
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete payroll entry");
    }
  };

  const applyDefaultBasicPay = () => {
    setPayrollForm((prev) => ({
      ...prev,
      basicPay: String(calculateDefaultBasicPay(selectedEmployee, prev) || "")
    }));
  };

  return (
    <div className="payroll-page">
      <header className="page-head">
        <span className="page-head-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
            <path d="M7.5 9h9" />
            <path d="M7.5 13h4" />
            <path d="M15 13.5c0 1 .8 1.5 1.8 1.5s1.7-.5 1.7-1.4c0-.8-.5-1.2-1.7-1.5-1.1-.3-1.7-.7-1.7-1.5 0-.9.7-1.5 1.7-1.5s1.7.6 1.7 1.5" />
          </svg>
        </span>
        <div className="page-head-text">
          <h1>Payroll</h1>
          <p>Manage employees, pay periods, manual earnings, deductions, and paid status.</p>
        </div>
        <div className="page-head-actions payroll-head-actions">
          <span className="payroll-head-chip">
            <span className="payroll-head-chip-label">Paid this month</span>
            <strong className="mono">PHP {formatMoney(summary.paidThisMonth || 0)}</strong>
          </span>
          <button
            className="btn btn-secondary"
            type="button"
            aria-expanded={showEmployeeForm}
            aria-controls="payroll-employee-form"
            onClick={() => setShowEmployeeForm((open) => !open)}
          >
            Add employee
          </button>
          <button
            className="btn btn-primary"
            type="button"
            aria-expanded={showEntryForm}
            aria-controls="payroll-entry-form"
            onClick={() => setShowEntryForm((open) => !open)}
          >
            Create payroll entry
          </button>
        </div>
      </header>

      <div className="materials-dashboard-grid">
          <div className="materials-summary-card metric-accent-blue">
            <span className="payroll-stat-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <div className="payroll-stat-text">
              <span>Active employees</span>
              <strong className="mono">{summary.activeEmployees || 0}</strong>
            </div>
          </div>
          <div className="materials-summary-card metric-accent-orange">
            <span className="payroll-stat-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
              </svg>
            </span>
            <div className="payroll-stat-text">
              <span>Draft payroll</span>
              <strong className="mono">{summary.draftEntries || 0}</strong>
            </div>
          </div>
          <div className="materials-summary-card metric-accent-green">
            <span className="payroll-stat-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="M22 4 12 14.01l-3-3" />
              </svg>
            </span>
            <div className="payroll-stat-text">
              <span>Paid records</span>
              <strong className="mono">{summary.paidEntries || 0}</strong>
            </div>
          </div>
          <div className="materials-summary-card metric-accent-gold">
            <span className="payroll-stat-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="12" cy="12" r="2.5" />
                <path d="M6 12h.01" />
                <path d="M18 12h.01" />
              </svg>
            </span>
            <div className="payroll-stat-text">
              <span>Paid this month</span>
              <strong className="mono">{formatMoney(summary.paidThisMonth || 0)}</strong>
            </div>
          </div>
        </div>

      <div className="page-toolbar payroll-toolbar">
        <div className="payroll-toolbar-filters">
          <input
            className="input payroll-toolbar-search"
            placeholder="Search employees"
            aria-label="Search employees"
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
          />
          <select
            className="select"
            aria-label="Filter payroll records by status"
            value={entryStatusFilter}
            onChange={(e) => setEntryStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
          <input
            className="input payroll-toolbar-search"
            placeholder="Search payroll records"
            aria-label="Search payroll records"
            value={entrySearch}
            onChange={(e) => setEntrySearch(e.target.value)}
          />
        </div>
        <span className="payroll-toolbar-note">
          {refreshing ? "Refreshing..." : `${visibleEmployees.length} employees · ${visibleEntries.length} records`}
        </span>
      </div>

      {error && <div className="error-text">{error}</div>}
      {success && <div className="success-text">{success}</div>}
      {loading && <p className="section-note">Loading payroll...</p>}

      {showEmployeeForm && (
        <section className="payroll-form-card" id="payroll-employee-form">
          <div className="payroll-form-card-head">
              <strong>{editingEmployeeId ? "Edit employee" : "Add employee"}</strong>
              <button
                className="btn btn-ghost payroll-form-close"
                type="button"
                onClick={() => setShowEmployeeForm(false)}
                aria-label="Close employee form"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="payroll-form-card-body">
              <div className="payroll-form-grid payroll-employee-form-grid">
                <label className="field payroll-field-wide">
                  <span>Name</span>
                  <input className="input" value={employeeForm.employeeName} onChange={(e) => updateEmployeeForm("employeeName", e.target.value)} placeholder="Employee name" />
                </label>
                <label className="field">
                  <span>Employee code</span>
                  <input className="input" value={employeeForm.employeeCode} onChange={(e) => updateEmployeeForm("employeeCode", e.target.value)} placeholder="Optional" />
                </label>
                <label className="field">
                  <span>Role / position</span>
                  <input className="input" value={employeeForm.roleTitle} onChange={(e) => updateEmployeeForm("roleTitle", e.target.value)} placeholder="Installer, admin..." />
                </label>
                <label className="field">
                  <span>Pay type</span>
                  <select className="select" value={employeeForm.payType} onChange={(e) => updateEmployeeForm("payType", e.target.value)}>
                    <option value="monthly">Monthly</option>
                    <option value="daily">Daily</option>
                    <option value="hourly">Hourly</option>
                    <option value="project">Project</option>
                  </select>
                </label>
                <label className="field">
                  <span>Base rate</span>
                  <input className="input" type="number" min="0" step="0.01" value={employeeForm.baseRate} onChange={(e) => updateEmployeeForm("baseRate", e.target.value)} />
                </label>
                <label className="field">
                  <span>Contact</span>
                  <input className="input" value={employeeForm.contactNo} onChange={(e) => updateEmployeeForm("contactNo", e.target.value)} placeholder="Optional" />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select className="select" value={employeeForm.status} onChange={(e) => updateEmployeeForm("status", e.target.value)}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label className="field payroll-field-wide">
                  <span>Notes</span>
                  <input className="input" value={employeeForm.notes} onChange={(e) => updateEmployeeForm("notes", e.target.value)} placeholder="Optional notes" />
                </label>
              </div>
              <div className="materials-inline-actions">
                <button className="btn btn-primary" type="button" onClick={saveEmployee} disabled={!employeeForm.employeeName.trim()}>
                  {editingEmployeeId ? "Save employee" : "Add employee"}
                </button>
                {editingEmployeeId && (
                  <button className="btn btn-ghost" type="button" onClick={resetEmployeeForm}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
        </section>
      )}

      {showEntryForm && (
        <section className="payroll-form-card" id="payroll-entry-form">
          <div className="payroll-form-card-head">
              <strong>{editingEntryId ? "Edit payroll entry" : "Create payroll entry"}</strong>
              <button
                className="btn btn-ghost payroll-form-close"
                type="button"
                onClick={() => setShowEntryForm(false)}
                aria-label="Close payroll entry form"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="payroll-form-card-body">
              <div className="payroll-form-grid payroll-entry-form-grid">
                <label className="field payroll-field-wide">
                  <span>Employee</span>
                  <select className="select" value={payrollForm.employeeId} onChange={(e) => updatePayrollForm("employeeId", e.target.value)}>
                    <option value="">Choose employee</option>
                    {employees.filter((employee) => employee.status !== "inactive").map((employee) => (
                      <option value={employee.id} key={employee.id}>
                        {employee.employee_name} - {payTypeLabel(employee.pay_type)} PHP {formatMoney(employee.base_rate)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Period start</span>
                  <input className="input" type="date" value={payrollForm.periodStart} onChange={(e) => updatePayrollForm("periodStart", e.target.value)} />
                </label>
                <label className="field">
                  <span>Period end</span>
                  <input className="input" type="date" value={payrollForm.periodEnd} onChange={(e) => updatePayrollForm("periodEnd", e.target.value)} />
                </label>
                <label className="field">
                  <span>Pay date</span>
                  <input className="input" type="date" value={payrollForm.payDate} onChange={(e) => updatePayrollForm("payDate", e.target.value)} />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select className="select" value={payrollForm.status} onChange={(e) => updatePayrollForm("status", e.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="approved">Approved</option>
                    <option value="paid">Paid</option>
                    <option value="void">Void</option>
                  </select>
                </label>
                <label className="field">
                  <span>Days</span>
                  <input className="input" type="number" min="0" step="0.01" value={payrollForm.regularDays} onChange={(e) => updatePayrollForm("regularDays", e.target.value)} />
                </label>
                <label className="field">
                  <span>Hours</span>
                  <input className="input" type="number" min="0" step="0.01" value={payrollForm.regularHours} onChange={(e) => updatePayrollForm("regularHours", e.target.value)} />
                </label>
                <label className="field">
                  <span>OT hours</span>
                  <input className="input" type="number" min="0" step="0.01" value={payrollForm.overtimeHours} onChange={(e) => updatePayrollForm("overtimeHours", e.target.value)} />
                </label>
                <label className="field">
                  <span>Basic pay</span>
                  <input className="input" type="number" min="0" step="0.01" value={payrollForm.basicPay} onChange={(e) => updatePayrollForm("basicPay", e.target.value)} placeholder="Auto if blank" />
                </label>
                <label className="field">
                  <span>OT pay</span>
                  <input className="input" type="number" min="0" step="0.01" value={payrollForm.overtimePay} onChange={(e) => updatePayrollForm("overtimePay", e.target.value)} />
                </label>
                <label className="field">
                  <span>Allowances</span>
                  <input className="input" type="number" min="0" step="0.01" value={payrollForm.allowances} onChange={(e) => updatePayrollForm("allowances", e.target.value)} />
                </label>
                <label className="field">
                  <span>Bonus</span>
                  <input className="input" type="number" min="0" step="0.01" value={payrollForm.bonus} onChange={(e) => updatePayrollForm("bonus", e.target.value)} />
                </label>
                <label className="field">
                  <span>Deductions</span>
                  <input className="input" type="number" min="0" step="0.01" value={payrollForm.deductions} onChange={(e) => updatePayrollForm("deductions", e.target.value)} />
                </label>
                <label className="field">
                  <span>Advances</span>
                  <input className="input" type="number" min="0" step="0.01" value={payrollForm.advances} onChange={(e) => updatePayrollForm("advances", e.target.value)} />
                </label>
                <label className="field">
                  <span>Other deductions</span>
                  <input className="input" type="number" min="0" step="0.01" value={payrollForm.otherDeductions} onChange={(e) => updatePayrollForm("otherDeductions", e.target.value)} />
                </label>
                <label className="field">
                  <span>Reference</span>
                  <input className="input" value={payrollForm.referenceNo} onChange={(e) => updatePayrollForm("referenceNo", e.target.value)} placeholder="Payroll ref" />
                </label>
                <label className="field payroll-field-wide">
                  <span>Notes</span>
                  <input className="input" value={payrollForm.notes} onChange={(e) => updatePayrollForm("notes", e.target.value)} placeholder="Manual notes" />
                </label>
              </div>
              <div className="payroll-preview-row">
                <div>
                  <span>Gross</span>
                  <strong className="mono">PHP {formatMoney(payrollPreview.grossPay)}</strong>
                </div>
                <div>
                  <span>Deductions</span>
                  <strong className="mono">PHP {formatMoney(payrollPreview.deductionsTotal)}</strong>
                </div>
                <div>
                  <span>Net pay</span>
                  <strong className="mono">PHP {formatMoney(payrollPreview.netPay)}</strong>
                </div>
              </div>
              <div className="materials-inline-actions">
                <button className="btn btn-primary" type="button" onClick={savePayrollEntry} disabled={!payrollForm.employeeId || !payrollForm.periodStart || !payrollForm.periodEnd}>
                  {editingEntryId ? "Save payroll" : "Create payroll"}
                </button>
                <button className="btn btn-secondary" type="button" onClick={applyDefaultBasicPay} disabled={!selectedEmployee}>
                  Use base rate
                </button>
                {editingEntryId && (
                  <button className="btn btn-ghost" type="button" onClick={resetPayrollForm}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
        </section>
      )}

      <section className="materials-card payroll-section">
        <div className="materials-table-toolbar">
          <div>
            <strong>Employees</strong>
            <span>Maintain payroll employees and base rates.</span>
          </div>
        </div>

        <div className="materials-table-wrap payroll-table-wrap">
          <table className="materials-table payroll-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Pay type</th>
                <th className="th-num">Base rate</th>
                <th>Status</th>
                <th className="th-num">Payroll count</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <strong>{employee.employee_name}</strong>
                    <span className="table-subtext">{employee.employee_code || "No employee code"}</span>
                  </td>
                  <td>{employee.role_title || "-"}</td>
                  <td>{payTypeLabel(employee.pay_type)}</td>
                  <td className="num">PHP {formatMoney(employee.base_rate)}</td>
                  <td>
                    <span className={statusChipClass(employee.status)}>
                      {statusLabel(employee.status)}
                    </span>
                  </td>
                  <td className="num">{employee.payroll_count || 0}</td>
                  <td>
                    <div className="materials-actions payroll-actions">
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => {
                          startEditEmployee(employee);
                          setShowEmployeeForm(true);
                        }}
                      >
                        Edit
                      </button>
                      {employee.status !== "inactive" && (
                        <button className="btn btn-ghost btn-outline-danger" type="button" onClick={() => deactivateEmployee(employee)}>
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleEmployees.length && !loading && (
                <tr>
                  <td colSpan={7} className="section-note">No payroll employees yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="materials-card payroll-section">
        <div className="materials-table-toolbar">
          <div>
            <strong>Payroll records</strong>
            <span>Track draft, approved, paid, and void payroll entries.</span>
          </div>
        </div>

        <div className="materials-table-wrap payroll-table-wrap">
          <table className="materials-table payroll-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Period</th>
                <th>Pay date</th>
                <th className="th-num">Gross</th>
                <th className="th-num">Deductions</th>
                <th className="th-num">Net pay</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => {
                const deductionsTotal = toNumber(entry.deductions, 0) + toNumber(entry.advances, 0) + toNumber(entry.other_deductions, 0);
                return (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.employee_name}</strong>
                      <span className="table-subtext">{entry.employee_code || entry.role_title || "-"}</span>
                    </td>
                    <td className="mono">{formatDate(entry.period_start)} - {formatDate(entry.period_end)}</td>
                    <td className="mono">{formatDate(entry.pay_date)}</td>
                    <td className="num">PHP {formatMoney(entry.gross_pay)}</td>
                    <td className="num">PHP {formatMoney(deductionsTotal)}</td>
                    <td className="num">
                      <strong>PHP {formatMoney(entry.net_pay)}</strong>
                    </td>
                    <td>
                      <span className={statusChipClass(entry.status)}>
                        {statusLabel(entry.status)}
                      </span>
                    </td>
                    <td>
                      <div className="materials-actions payroll-actions">
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => {
                            startEditEntry(entry);
                            setShowEntryForm(true);
                          }}
                        >
                          Edit
                        </button>
                        <button className="btn btn-ghost btn-outline-danger" type="button" onClick={() => removeEntry(entry)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visibleEntries.length && !loading && (
                <tr>
                  <td colSpan={8} className="section-note">No payroll records match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
