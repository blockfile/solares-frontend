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
      <div className="section-head">
        <div>
          <h3>Package Price Matrix</h3>
          <p className="section-note">
            Define fixed package prices per template. Quote installation will auto-balance from this
            target.
          </p>
        </div>
      </div>

      <div className="materials-card">
        <div className="field">
          <label htmlFor="packageTemplate">Template</label>
          <select
            id="packageTemplate"
            className="select template-group-select"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              cancelEdit();
            }}
          >
            <option value="">Select Template</option>
            {groupedTemplates.map((group) => (
              <optgroup label={`---- ${group.label} ----`} key={group.label}>
                {group.rows.map((tpl) => (
                  <option value={tpl.id} key={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {templateId && (
          <div className="materials-form package-form">
            <input
              className="input"
              placeholder="Scenario Label (e.g. 314AH Battery)"
              value={scenarioLabel}
              onChange={(e) => setScenarioLabel(e.target.value)}
            />
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Package Price (PHP)"
              value={packagePrice}
              onChange={(e) => setPackagePrice(e.target.value)}
            />
            <button
              className="btn btn-primary"
              type="button"
              onClick={createScenario}
              disabled={!scenarioLabel.trim() || !templateId}
            >
              Add Scenario
            </button>
          </div>
        )}

        {selectedTemplateName && (
          <p className="section-note">Editing package scenarios for: {selectedTemplateName}</p>
        )}

        {error && <div className="error-text">{error}</div>}
        {loading && <p className="section-note">Loading package prices...</p>}

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
      </div>
    </div>
  );
}
