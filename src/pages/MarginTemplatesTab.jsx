import { useEffect, useState } from "react";
import api from "../api/client";
import "../styles/pricing.css";

function normalizeRateInput(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function percentInputValue(rate) {
  return (Number(rate || 0) * 100).toFixed(2);
}

function toPayload(state) {
  return {
    name: String(state.name || "").trim(),
    inverterMargin: normalizeRateInput(state.inverterMargin) / 100,
    panelMargin: normalizeRateInput(state.panelMargin) / 100,
    batteryMargin: normalizeRateInput(state.batteryMargin) / 100,
    safetyMargin: normalizeRateInput(state.safetyMargin) / 100,
    mountingMargin: normalizeRateInput(state.mountingMargin) / 100,
    installationMargin: normalizeRateInput(state.installationMargin) / 100,
    isActive: Boolean(state.isActive)
  };
}

function createEmptyForm() {
  return {
    name: "",
    inverterMargin: "19.00",
    panelMargin: "19.00",
    batteryMargin: "19.00",
    safetyMargin: "19.00",
    mountingMargin: "19.00",
    installationMargin: "6.34",
    isActive: true
  };
}

function rowToEditState(row) {
  return {
    name: row.name || "",
    inverterMargin: percentInputValue(row.inverterMargin),
    panelMargin: percentInputValue(row.panelMargin),
    batteryMargin: percentInputValue(row.batteryMargin),
    safetyMargin: percentInputValue(row.safetyMargin),
    mountingMargin: percentInputValue(row.mountingMargin),
    installationMargin: percentInputValue(row.installationMargin),
    isActive: Boolean(row.isActive)
  };
}

const MARGIN_FIELDS = [
  {
    key: "inverterMargin",
    label: "Inverter",
    note: "Applied to inverter line items."
  },
  {
    key: "panelMargin",
    label: "Solar Panel",
    note: "Applied to panel line items."
  },
  {
    key: "batteryMargin",
    label: "Battery",
    note: "Applied to battery line items."
  },
  {
    key: "safetyMargin",
    label: "Safety Breakers / SPD",
    note: "Applied to breakers, SPD, and other protection items."
  },
  {
    key: "mountingMargin",
    label: "Mounting Fixtures",
    note: "Applied to rails, clamps, and structural mounting items."
  },
  {
    key: "installationMargin",
    label: "Installation",
    note: "Applied to the installation line."
  }
];

export default function MarginTemplatesTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Top form is for CREATE ONLY now.
  const [createForm, setCreateForm] = useState(createEmptyForm());
  const [creating, setCreating] = useState(false);

  // Inline edit state for the row being edited (only one row at a time).
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Atlas UI-only state: whether the create-template panel is expanded.
  const [showCreate, setShowCreate] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/margin-templates", { params: { activeOnly: 0 } });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setRows([]);
      setError(err?.response?.data?.message || "Failed to load margin templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const resetCreateForm = () => {
    setCreateForm(createEmptyForm());
  };

  const submitCreate = async () => {
    if (!createForm.name.trim()) return;
    setError("");
    setCreating(true);
    try {
      await api.post("/margin-templates", toPayload(createForm));
      resetCreateForm();
      await loadRows();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create margin template");
    } finally {
      setCreating(false);
    }
  };

  const startEditRow = (row) => {
    setEditingId(Number(row.id));
    setEditForm(rowToEditState(row));
    setError("");
  };

  const cancelEditRow = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEditRow = async () => {
    if (!editingId || !editForm) return;
    if (!editForm.name.trim()) return;
    setError("");
    setSavingEdit(true);
    try {
      await api.put(`/margin-templates/${editingId}`, toPayload(editForm));
      setEditingId(null);
      setEditForm(null);
      await loadRows();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save margin template");
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (id) => {
    setError("");
    try {
      await api.delete(`/margin-templates/${id}`);
      if (Number(editingId) === Number(id)) cancelEditRow();
      await loadRows();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete margin template");
    }
  };

  const activeCount = rows.filter((row) => Boolean(row.isActive)).length;

  return (
    <div className="pricing-page">
      {/* ── Page head (Atlas §4) ── */}
      <header className="page-head">
        <span className="page-head-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
          </svg>
        </span>
        <div className="page-head-text">
          <h2 className="page-head-title">Margin Setup</h2>
          <p className="page-head-desc">
            Reusable pricing presets for the six quote buckets used during quotation.
          </p>
        </div>
        <div className="page-head-actions">
          <button
            className="btn btn-primary"
            type="button"
            aria-expanded={showCreate}
            aria-controls="margin-create-panel"
            onClick={() => setShowCreate((open) => !open)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New template
          </button>
        </div>
      </header>

      {/* ── Toolbar: quiet stat chips (moved from the old ink banner) ── */}
      <div className="page-toolbar pricing-toolbar">
        <div className="pricing-statbar">
          <span className="pricing-stat-chip">
            <span className="pricing-stat-chip-label">Templates</span>
            <span className="pricing-stat-chip-value num">{rows.length}</span>
          </span>
          <span className="pricing-stat-chip">
            <span className="pricing-stat-chip-label">Active</span>
            <span className="pricing-stat-chip-value num">{activeCount}</span>
          </span>
        </div>
      </div>

      {/* ── Collapsed CREATE-ONLY form (opens from the page-head button).
             Editing happens inline in the table below. ── */}
      {showCreate && (
        <section className="add-item-card margin-setup-editor" id="margin-create-panel">
          <div className="margin-setup-editor-head">
            <div className="margin-setup-editor-copy">
              <strong>Create margin template</strong>
              <span>
                Set percentage margins for system hardware, protection, mounting, and installation.
                Existing templates can be edited inline in the table below.
              </span>
            </div>
            <label className="margin-setup-status">
              <span>Active Template</span>
              <input
                type="checkbox"
                checked={createForm.isActive}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
            </label>
          </div>

          <div className="margin-setup-topbar">
            <label className="field">
              <span>Template Name</span>
              <input
                className="input"
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Standard Hybrid 19%"
              />
            </label>
          </div>

          <div className="margin-setup-grid">
            {MARGIN_FIELDS.map((field) => (
              <div className="margin-setup-card" key={field.key}>
                <div className="margin-setup-card-head">
                  <strong>{field.label}</strong>
                  <span>{field.note}</span>
                </div>
                <label className="field">
                  <span>Margin %</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={createForm[field.key]}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="materials-actions margin-setup-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={submitCreate}
              disabled={!createForm.name.trim() || creating}
            >
              {creating ? "Adding..." : "Add Template"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={resetCreateForm}
              disabled={creating}
            >
              Reset
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              Close
            </button>
          </div>
        </section>
      )}

      {error && <div className="error-text">{error}</div>}
      {loading && <p className="section-note">Loading margin templates...</p>}

      <section className="materials-card pricing-table-card">
        <div className="package-costing-section-head">
          <strong>Margin Templates</strong>
          <span>{rows.length} template{rows.length === 1 ? "" : "s"}</span>
        </div>
        <div className="materials-table-wrap margin-setup-table">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Template</th>
                <th className="num">Inverter</th>
                <th className="num">Panel</th>
                <th className="num">Battery</th>
                <th className="num">Safety</th>
                <th className="num">Mounting</th>
                <th className="num">Installation</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEditing = Number(editingId) === Number(row.id);

                if (!isEditing) {
                  // Static read-only row
                  return (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td className="num">{percentInputValue(row.inverterMargin)}%</td>
                      <td className="num">{percentInputValue(row.panelMargin)}%</td>
                      <td className="num">{percentInputValue(row.batteryMargin)}%</td>
                      <td className="num">{percentInputValue(row.safetyMargin)}%</td>
                      <td className="num">{percentInputValue(row.mountingMargin)}%</td>
                      <td className="num">{percentInputValue(row.installationMargin)}%</td>
                      <td>
                        <span className={`chip ${row.isActive ? "chip-success" : "chip-danger"}`}>
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <div className="materials-actions">
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => startEditRow(row)}
                            disabled={Boolean(editingId)}
                            title={editingId ? "Finish editing the current row first" : "Edit"}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost pricing-btn-danger"
                            type="button"
                            onClick={() => remove(row.id)}
                            disabled={Boolean(editingId)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                // Inline-editing row
                return (
                  <tr key={row.id} className="pricing-row-editing">
                    <td>
                      <input
                        className="input pricing-inline-input pricing-inline-name"
                        value={editForm?.name || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...(prev || {}), name: e.target.value }))
                        }
                        placeholder="Template name"
                      />
                    </td>
                    {MARGIN_FIELDS.slice(0, 6).map((field) => (
                      <td key={field.key} className="num">
                        <input
                          className="input pricing-inline-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm?.[field.key] ?? ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...(prev || {}),
                              [field.key]: e.target.value
                            }))
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <label className="pricing-active-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(editForm?.isActive)}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...(prev || {}),
                              isActive: e.target.checked
                            }))
                          }
                        />
                        {editForm?.isActive ? "Active" : "Inactive"}
                      </label>
                    </td>
                    <td>
                      <div className="materials-actions">
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={saveEditRow}
                          disabled={savingEdit || !editForm?.name?.trim()}
                        >
                          {savingEdit ? "Saving..." : "Save"}
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={cancelEditRow}
                          disabled={savingEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan="9" className="section-note empty-state-cell">
                    No margin templates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
