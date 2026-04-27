import { useEffect, useState } from "react";
import api from "../api/client";

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

// Compact inline cell input — stays small to fit inside the table row.
const inlineInputStyle = {
  width: "78px",
  minWidth: "60px",
  padding: "6px 8px",
  fontSize: "13px",
  color: "#0f172a",
  background: "#fff",
  border: "1.5px solid #cbd5e1",
  borderRadius: "8px"
};

const inlineNameInputStyle = {
  width: "100%",
  minWidth: "180px",
  padding: "6px 8px",
  fontSize: "13px",
  color: "#0f172a",
  background: "#fff",
  border: "1.5px solid #cbd5e1",
  borderRadius: "8px"
};

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

  return (
    <div>
      <div className="materials-card">
        <div className="module-card-head">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19h16" /><path d="M4 15h16" /><path d="M8 11h12" /><path d="M12 7h8" />
          </svg>
          <div className="module-card-head-text">
            <strong>Margin Setup</strong>
            <span>Build reusable pricing presets for the six quote buckets used during quotation.</span>
          </div>
        </div>

        {/* CREATE-ONLY top form. Editing happens inline in the table below. */}
        <div className="add-item-card margin-setup-editor">
          <div className="margin-setup-editor-head">
            <div className="margin-setup-editor-copy">
              <strong style={{ color: "#fff" }}>Create Margin Template</strong>
              <span style={{ color: "rgba(255,255,255,0.72)" }}>
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
          </div>
        </div>

        {error && <div className="error-text">{error}</div>}
        {loading && <p className="section-note">Loading margin templates...</p>}

        <div className="materials-table-wrap margin-setup-table">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Inverter</th>
                <th>Panel</th>
                <th>Battery</th>
                <th>Safety</th>
                <th>Mounting</th>
                <th>Installation</th>
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
                      <td>{percentInputValue(row.inverterMargin)}%</td>
                      <td>{percentInputValue(row.panelMargin)}%</td>
                      <td>{percentInputValue(row.batteryMargin)}%</td>
                      <td>{percentInputValue(row.safetyMargin)}%</td>
                      <td>{percentInputValue(row.mountingMargin)}%</td>
                      <td>{percentInputValue(row.installationMargin)}%</td>
                      <td>
                        <span
                          className={`status-pill ${row.isActive ? "status-active" : "status-inactive"}`}
                        >
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
                            className="btn btn-danger"
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
                  <tr key={row.id} style={{ background: "#fffbe6" }}>
                    <td>
                      <input
                        style={inlineNameInputStyle}
                        value={editForm?.name || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...(prev || {}), name: e.target.value }))
                        }
                        placeholder="Template name"
                      />
                    </td>
                    {MARGIN_FIELDS.slice(0, 6).map((field) => (
                      <td key={field.key}>
                        <input
                          style={inlineInputStyle}
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
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#0f172a",
                          whiteSpace: "nowrap"
                        }}
                      >
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
                  <td colSpan="9" className="section-note">
                    No margin templates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}