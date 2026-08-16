import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import "../styles/pricing.css";

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

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2
  }).format(toNumber(value, 0));
}

function formatNumber(value, digits = 2) {
  return toNumber(value, 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatPercent(value) {
  return `${formatNumber(value, 2)}%`;
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

function buildScenarioMetrics(row, overridePackagePrice = null) {
  const packagePrice =
    overridePackagePrice == null ? toNumber(row.package_price, 0) : toNumber(overridePackagePrice, 0);
  const materialCost = toNumber(row.material_cost_total, 0);
  const quotedMaterialTotal = toNumber(row.quoted_material_total, 0);
  const grossProfit = packagePrice - materialCost;

  return {
    packagePrice,
    materialCost,
    quotedMaterialTotal,
    installationAllowance: Math.max(0, packagePrice - quotedMaterialTotal),
    grossProfit,
    grossMarginPercent: packagePrice > 0 ? (grossProfit / packagePrice) * 100 : 0
  };
}

export default function PackagePricesTab() {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [vatMode, setVatMode] = useState("incl");
  const [rows, setRows] = useState([]);
  const [costing, setCosting] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [scenarioLabel, setScenarioLabel] = useState("");
  const [packagePrice, setPackagePrice] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editActive, setEditActive] = useState(true);

  // Atlas UI-only state: whether the "Add scenario" panel is expanded.
  const [showCreate, setShowCreate] = useState(false);

  const loadTemplates = async () => {
    const res = await api.get("/templates", { params: { includeAll: 1 } });
    setTemplates(Array.isArray(res.data) ? res.data : []);
  };

  const loadRows = async (selectedTemplateId, selectedVatMode = vatMode) => {
    if (!selectedTemplateId) {
      setRows([]);
      setCosting(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await api.get("/package-prices/costing", {
        params: {
          templateId: Number(selectedTemplateId),
          activeOnly: 0,
          vatMode: selectedVatMode
        }
      });
      const payload = res.data || {};
      setCosting(payload);
      setRows(Array.isArray(payload.package_scenarios) ? payload.package_scenarios : []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load package costing");
      setRows([]);
      setCosting(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    loadRows(templateId, vatMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, vatMode]);

  const selectedTemplateName = useMemo(() => {
    if (costing?.template?.name) return costing.template.name;
    const hit = templates.find((t) => String(t.id) === String(templateId));
    return hit?.name || "";
  }, [costing, templates, templateId]);

  const groupedTemplates = useMemo(() => {
    const groups = new Map();

    for (const row of [...templates].sort(compareTemplatesBySize)) {
      const label = getTemplateGroupLabel(row.name);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    }

    return Array.from(groups.entries())
      .map(([label, groupRows]) => ({ label, rows: groupRows }))
      .sort(compareTemplateGroups);
  }, [templates]);

  const costingItems = Array.isArray(costing?.items) ? costing.items : [];
  const costingSections = Array.isArray(costing?.sections) ? costing.sections : [];
  const costingBasisLabel = vatMode === "incl" ? "VAT incl." : "VAT excl.";
  const costingLinkedLabel = `${toNumber(costing?.linked_item_count, 0)} / ${toNumber(costing?.item_count, 0)}`;

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
      await loadRows(templateId, vatMode);
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
      await loadRows(templateId, vatMode);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update package scenario");
    }
  };

  const removeScenario = async (id) => {
    setError("");
    try {
      await api.delete(`/package-prices/${id}`);
      await loadRows(templateId, vatMode);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete package scenario");
    }
  };

  return (
    <div className="pricing-page">
      {/* ── Page head (Atlas §4) ── */}
      <header className="page-head">
        <span className="page-head-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
        </span>
        <div className="page-head-text">
          <h2 className="page-head-title">Package Prices</h2>
          <p className="page-head-desc">
            Live material costing, package prices, installation allowance, and margin by system package.
          </p>
        </div>
        <div className="page-head-actions">
          <button
            className="btn btn-primary"
            type="button"
            aria-expanded={showCreate}
            aria-controls="pricing-add-scenario-panel"
            disabled={!templateId}
            title={templateId ? undefined : "Select a template first"}
            onClick={() => setShowCreate((open) => !open)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add scenario
          </button>
        </div>
      </header>

      {/* ── Toolbar: template + costing basis left, quiet stat chips right ── */}
      <div className="page-toolbar pricing-toolbar">
        <label className="pricing-toolbar-field">
          <span>Template</span>
          <select
            id="packageTemplate"
            className="select template-group-select pricing-template-select"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              cancelEdit();
            }}
          >
            <option value="">Choose a template</option>
            {groupedTemplates.map((group) => (
              <optgroup label={`---- ${group.label} ----`} key={group.label}>
                {group.rows.map((tpl) => (
                  <option value={tpl.id} key={tpl.id}>{tpl.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="pricing-toolbar-field">
          <span>Costing basis</span>
          <select
            className="select"
            value={vatMode}
            onChange={(e) => setVatMode(e.target.value)}
          >
            <option value="incl">With VAT</option>
            <option value="excl">Without VAT</option>
          </select>
        </label>

        {templateId && costing && (
          <div className="page-toolbar-actions pricing-statbar">
            <span className="pricing-stat-chip">
              <span className="pricing-stat-chip-label">Material cost · {costingBasisLabel}</span>
              <span className="pricing-stat-chip-value num">{formatCurrency(costing.material_cost_total)}</span>
            </span>
            <span className="pricing-stat-chip">
              <span className="pricing-stat-chip-label">Quoted materials</span>
              <span className="pricing-stat-chip-value num">{formatCurrency(costing.quoted_material_total)}</span>
            </span>
            <span className="pricing-stat-chip">
              <span className="pricing-stat-chip-label">Markup</span>
              <span className="pricing-stat-chip-value num">{formatPercent(toNumber(costing.material_markup_rate, 0) * 100)}</span>
            </span>
            <span className="pricing-stat-chip">
              <span className="pricing-stat-chip-label">Catalog links</span>
              <span className="pricing-stat-chip-value num">{costingLinkedLabel}</span>
            </span>
            <span className="pricing-stat-chip">
              <span className="pricing-stat-chip-label">Template-priced</span>
              <span className="pricing-stat-chip-value num">{toNumber(costing.unlinked_item_count, 0)}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Collapsed create form (opens from the page-head button) ── */}
      {templateId && showCreate && (
        <section className="add-item-card pricing-create-card" id="pricing-add-scenario-panel">
          <div className="add-item-card-head">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            <strong>Add Price Scenario</strong>
            {selectedTemplateName && (
              <span className="add-item-card-sub">for {selectedTemplateName}</span>
            )}
            <button
              className="btn btn-ghost pricing-card-close"
              type="button"
              onClick={() => setShowCreate(false)}
              aria-label="Close add scenario form"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
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
        </section>
      )}

      {error && <div className="error-text">{error}</div>}
      {loading && <p className="section-note">Loading package costing...</p>}

      {!templateId && !loading && (
        <div className="materials-card pricing-table-card">
          <div className="template-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            <strong>No template selected</strong>
            <p>Choose a template to view package prices and live material costing.</p>
            {templates.length > 0 && (
              <p className="template-empty-count">
                {templates.length} template{templates.length !== 1 ? "s" : ""} available.
              </p>
            )}
          </div>
        </div>
      )}

      {templateId && (
        <>
          <section className="materials-card pricing-table-card">
            <div className="package-costing-section-head">
              <strong>Package Costing Table</strong>
              <span>{selectedTemplateName || "Selected template"}</span>
            </div>
            <div className="materials-table-wrap package-costing-table-wrap">
              <table className="materials-table package-costing-table">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th className="num">Package Price</th>
                    <th className="num">Material Cost</th>
                    <th className="num">Quoted Materials</th>
                    <th className="num">Install Allowance</th>
                    <th className="num">Gross Profit</th>
                    <th className="num">Margin</th>
                    <th className="num">Linked Items</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isEditing = Number(editingId) === Number(row.id);
                    const metrics = buildScenarioMetrics(row, isEditing ? editPrice : null);
                    const profitClass = metrics.grossProfit < 0 ? "is-negative" : "is-positive";

                    return (
                      <tr key={row.id} className={isEditing ? "pricing-row-editing" : undefined}>
                        <td>
                          {isEditing ? (
                            <input
                              className="input"
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                            />
                          ) : (
                            <strong>{row.scenario_label}</strong>
                          )}
                        </td>
                        <td className="num">
                          {isEditing ? (
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                            />
                          ) : (
                            formatCurrency(metrics.packagePrice)
                          )}
                        </td>
                        <td className="num">{formatCurrency(metrics.materialCost)}</td>
                        <td className="num">{formatCurrency(metrics.quotedMaterialTotal)}</td>
                        <td className="num">{formatCurrency(metrics.installationAllowance)}</td>
                        <td className={`num package-money ${profitClass}`}>
                          {formatCurrency(metrics.grossProfit)}
                        </td>
                        <td className={`num package-money ${profitClass}`}>
                          {formatPercent(metrics.grossMarginPercent)}
                        </td>
                        <td className="num">{toNumber(row.costing_linked_item_count, 0)} / {toNumber(row.costing_item_count, 0)}</td>
                        <td>
                          {isEditing ? (
                            <select
                              className="select"
                              value={editActive ? "1" : "0"}
                              onChange={(e) => setEditActive(e.target.value === "1")}
                            >
                              <option value="1">Active</option>
                              <option value="0">Inactive</option>
                            </select>
                          ) : Number(row.is_active) === 1 ? (
                            <span className="chip chip-success">Active</span>
                          ) : (
                            <span className="chip chip-danger">Inactive</span>
                          )}
                        </td>
                        <td>
                          <div className="package-actions">
                            {isEditing ? (
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
                                  className="btn btn-ghost pricing-btn-danger"
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
                    );
                  })}

                  {!rows.length && !loading && (
                    <tr>
                      <td colSpan={10} className="section-note empty-state-cell">
                        No package scenarios yet for this template.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="materials-card pricing-table-card">
            <div className="package-costing-section-head">
              <strong>Material Cost Breakdown</strong>
              <span>{costingSections.length} section{costingSections.length === 1 ? "" : "s"}</span>
            </div>
            <div className="materials-table-wrap package-breakdown-table-wrap">
              <table className="materials-table package-breakdown-table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Material</th>
                    <th>Unit</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit Cost</th>
                    <th className="num">Line Cost</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {costingItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.section_label}</td>
                      <td>
                        <div className="package-material-name">
                          <strong>{item.description}</strong>
                          {item.catalog_material_name && <span>{item.catalog_material_name}</span>}
                        </div>
                      </td>
                      <td>{item.unit || "-"}</td>
                      <td className="num">{formatNumber(item.qty, 2)}</td>
                      <td className="num">{formatCurrency(item.unit_cost)}</td>
                      <td className="num">{formatCurrency(item.line_cost)}</td>
                      <td>
                        {item.price_source === "catalog" ? (
                          <span className="chip chip-info">Catalog</span>
                        ) : (
                          <span className="chip chip-neutral">Template</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {!costingItems.length && !loading && (
                    <tr>
                      <td colSpan={7} className="section-note empty-state-cell">
                        No costing items found for this template.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
