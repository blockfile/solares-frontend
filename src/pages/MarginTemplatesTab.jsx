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
  const [form, setForm] = useState(createEmptyForm());
  const [editingId, setEditingId] = useState(null);

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

  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingId(null);
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    setError("");
    try {
      if (editingId) {
        await api.put(`/margin-templates/${editingId}`, toPayload(form));
      } else {
        await api.post("/margin-templates", toPayload(form));
      }
      resetForm();
      await loadRows();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save margin template");
    }
  };

  const startEdit = (row) => {
    setEditingId(Number(row.id));
    setForm({
      name: row.name || "",
      inverterMargin: percentInputValue(row.inverterMargin),
      panelMargin: percentInputValue(row.panelMargin),
      batteryMargin: percentInputValue(row.batteryMargin),
      safetyMargin: percentInputValue(row.safetyMargin),
      mountingMargin: percentInputValue(row.mountingMargin),
      installationMargin: percentInputValue(row.installationMargin),
      isActive: Boolean(row.isActive)
    });
  };

  const remove = async (id) => {
    setError("");
    try {
      await api.delete(`/margin-templates/${id}`);
      if (Number(editingId) === Number(id)) resetForm();
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

        <div className="add-item-card">
          <div className="add-item-card-head">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            <strong>{editingId ? "Edit Margin Template" : "Create Margin Template"}</strong>
            <span className="add-item-card-sub">Set percentage margins for system hardware, protection, mounting, and installation.</span>
          </div>

          <div className="margin-setup-topbar">
            <label className="field">
              <span>Template Name</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Standard Hybrid 19%"
              />
            </label>
            <label className="margin-setup-status">
              <span>Active Template</span>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
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
                    value={form[field.key]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="materials-actions">
            <button className="btn btn-primary" type="button" onClick={submit} disabled={!form.name.trim()}>
              {editingId ? "Save Template" : "Add Template"}
            </button>
            {editingId ? (
              <button className="btn btn-ghost" type="button" onClick={resetForm}>
                Cancel Edit
              </button>
            ) : null}
          </div>
        </div>

        {error && <div className="error-text">{error}</div>}
        {loading && <p className="section-note">Loading margin templates...</p>}

        <div className="materials-table-wrap">
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
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{percentInputValue(row.inverterMargin)}%</td>
                  <td>{percentInputValue(row.panelMargin)}%</td>
                  <td>{percentInputValue(row.batteryMargin)}%</td>
                  <td>{percentInputValue(row.safetyMargin)}%</td>
                  <td>{percentInputValue(row.mountingMargin)}%</td>
                  <td>{percentInputValue(row.installationMargin)}%</td>
                  <td>
                    <span className={`status-pill ${row.isActive ? "status-active" : "status-inactive"}`}>
                      {row.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="materials-actions">
                      <button className="btn btn-ghost" type="button" onClick={() => startEdit(row)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" type="button" onClick={() => remove(row.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan="9" className="section-note">No margin templates yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
