import { useEffect, useMemo, useState } from "react";
import api from "../api/client";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function parseAh(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*ah/i);
  return match ? Number(match[1]) : null;
}

function parseKW(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*kw/i);
  return match ? Number(match[1]) : null;
}

function parseTemplateBatteryAh(name) {
  return parseAh(name);
}

function getTemplateGroupLabel(name) {
  const text = normalizeText(name);
  const batteryAh = parseTemplateBatteryAh(name);

  if (text.includes("hybrid")) {
    if (batteryAh != null) return `Hybrid - ${batteryAh}Ah`;
    return "Hybrid - No Battery";
  }

  if (text.includes("grid tie") || text.includes("grid-tie") || text.includes("grid tied")) {
    return "Grid Tie";
  }

  if (batteryAh != null) return `Other - ${batteryAh}Ah`;
  return "Other";
}

function getTemplateSystemRank(name) {
  const text = normalizeText(name);
  if (text.includes("hybrid")) return 0;
  if (text.includes("grid tie") || text.includes("grid-tie") || text.includes("grid tied")) return 1;
  return 2;
}

function compareTemplatesBySize(a, b) {
  const systemRankDiff = getTemplateSystemRank(a.name) - getTemplateSystemRank(b.name);
  if (systemRankDiff !== 0) return systemRankDiff;

  const kwA = parseKW(a.name);
  const kwB = parseKW(b.name);
  if (kwA != null || kwB != null) {
    if (kwA == null) return 1;
    if (kwB == null) return -1;
    if (kwA !== kwB) return kwA - kwB;
  }

  const ahA = parseTemplateBatteryAh(a.name);
  const ahB = parseTemplateBatteryAh(b.name);
  if (ahA != null || ahB != null) {
    if (ahA == null) return 1;
    if (ahB == null) return -1;
    if (ahA !== ahB) return ahA - ahB;
  }

  return String(a.name || "").localeCompare(String(b.name || ""));
}

function compareTemplateGroups(a, b) {
  const aFirst = a.rows[0];
  const bFirst = b.rows[0];
  const systemRankDiff = getTemplateSystemRank(aFirst?.name) - getTemplateSystemRank(bFirst?.name);
  if (systemRankDiff !== 0) return systemRankDiff;

  const ahA = parseTemplateBatteryAh(aFirst?.name || "");
  const ahB = parseTemplateBatteryAh(bFirst?.name || "");
  if (ahA != null || ahB != null) {
    if (ahA == null) return 1;
    if (ahB == null) return -1;
    if (ahA !== ahB) return ahA - ahB;
  }

  return String(a.label || "").localeCompare(String(b.label || ""));
}

export default function PackagePricesTab() {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [scenarioLabel, setScenarioLabel] = useState("");
  const [packagePrice, setPackagePrice] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editActive, setEditActive] = useState(true);

  const loadTemplates = async () => {
    const res = await api.get("/templates");
    setTemplates(Array.isArray(res.data) ? res.data : []);
  };

  const loadRows = async (selectedTemplateId) => {
    if (!selectedTemplateId) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/package-prices?templateId=${Number(selectedTemplateId)}&activeOnly=0`);
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load package prices");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    loadRows(templateId);
  }, [templateId]);

  const selectedTemplateName = useMemo(() => {
    const hit = templates.find((t) => String(t.id) === String(templateId));
    return hit?.name || "";
  }, [templates, templateId]);

  const groupedTemplates = useMemo(() => {
    const groups = new Map();

    for (const row of [...templates].sort(compareTemplatesBySize)) {
      const label = getTemplateGroupLabel(row.name);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    }

    return Array.from(groups.entries())
      .map(([label, rows]) => ({ label, rows }))
      .sort(compareTemplateGroups);
  }, [templates]);

  const createScenario = async () => {
    if (!templateId || !scenarioLabel.trim()) return;
    setError("");

    try {
      await api.post("/package-prices", {
        templateId: Number(templateId),
        scenarioLabel: scenarioLabel.trim(),
        packagePrice: toNumber(packagePrice, 0)
      });
      setScenarioLabel("");
      setPackagePrice("");
      await loadRows(templateId);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create package scenario");
    }
  };

  const startEdit = (row) => {
    setEditingId(Number(row.id));
    setEditLabel(String(row.scenario_label || ""));
    setEditPrice(String(row.package_price || ""));
    setEditActive(Number(row.is_active) === 1);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
    setEditPrice("");
    setEditActive(true);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError("");
    try {
      await api.put(`/package-prices/${editingId}`, {
        templateId: Number(templateId),
        scenarioLabel: editLabel,
        packagePrice: toNumber(editPrice, 0),
        isActive: editActive
      });
      cancelEdit();
      await loadRows(templateId);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update package scenario");
    }
  };

  const removeScenario = async (id) => {
    setError("");
    try {
      await api.delete(`/package-prices/${id}`);
      await loadRows(templateId);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete package scenario");
    }
  };

  return (
    <div>
      <div className="materials-card">
        <div className="module-card-head">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          <div className="module-card-head-text">
            <strong>Package Price Matrix</strong>
            <span>Define fixed package prices per template. Quote installation will auto-balance from this target.</span>
          </div>
        </div>

        <div className="pkg-template-selector">
          <label className="field">
            <span>Select Template</span>
            <select
              id="packageTemplate"
              className="select template-group-select"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                cancelEdit();
              }}
            >
              <option value="">— Choose a template —</option>
              {groupedTemplates.map((group) => (
                <optgroup label={`── ${group.label} ──`} key={group.label}>
                  {group.rows.map((tpl) => (
                    <option value={tpl.id} key={tpl.id}>{tpl.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        {templateId && (
          <div className="add-item-card">
            <div className="add-item-card-head">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              <strong>Add Price Scenario</strong>
              {selectedTemplateName && (
                <span className="add-item-card-sub">for {selectedTemplateName}</span>
              )}
            </div>
            <div className="add-item-details-row row-auto">
              <label className="field">
                <span>Scenario Label</span>
                <input
                  className="input"
                  placeholder="e.g. 314AH Battery"
                  value={scenarioLabel}
                  onChange={(e) => setScenarioLabel(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Package Price (PHP)</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={packagePrice}
                  onChange={(e) => setPackagePrice(e.target.value)}
                />
              </label>
              <button
                className="btn btn-primary add-item-submit"
                type="button"
                onClick={createScenario}
                disabled={!scenarioLabel.trim() || !templateId}
              >
                Add Scenario
              </button>
            </div>
          </div>
        )}

        {error && <div className="error-text">{error}</div>}
        {loading && <p className="section-note">Loading package prices...</p>}

        {!templateId && !loading && (
          <div className="template-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            <strong>No template selected</strong>
            <p>
              Choose a template from the dropdown above to view and manage its package price
              scenarios.
            </p>
            {templates.length > 0 && (
              <p className="template-empty-count">
                {templates.length} template{templates.length !== 1 ? "s" : ""} available — pick one above.
              </p>
            )}
          </div>
        )}

        {templateId && (
        <div className="materials-table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Package Price (PHP)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {editingId === row.id ? (
                      <input
                        className="input"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                      />
                    ) : (
                      row.scenario_label
                    )}
                  </td>
                  <td>
                    {editingId === row.id ? (
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                      />
                    ) : (
                      Number(row.package_price || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })
                    )}
                  </td>
                  <td>
                    {editingId === row.id ? (
                      <select
                        className="select"
                        value={editActive ? "1" : "0"}
                        onChange={(e) => setEditActive(e.target.value === "1")}
                      >
                        <option value="1">Active</option>
                        <option value="0">Inactive</option>
                      </select>
                    ) : Number(row.is_active) === 1 ? (
                      "Active"
                    ) : (
                      "Inactive"
                    )}
                  </td>
                  <td>
                    <div className="materials-actions">
                      {editingId === row.id ? (
                        <>
                          <button className="btn btn-secondary" type="button" onClick={saveEdit}>
                            Save
                          </button>
                          <button className="btn btn-ghost" type="button" onClick={cancelEdit}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-ghost" type="button" onClick={() => startEdit(row)}>
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => removeScenario(row.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!rows.length && !loading && (
                <tr>
                  <td colSpan={4} className="section-note">
                    No package scenarios yet for this template.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
