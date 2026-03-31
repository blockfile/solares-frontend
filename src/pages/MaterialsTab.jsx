import { useDeferredValue, useEffect, useState } from "react";
import api from "../api/client";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function MaterialsTab() {
  const CATEGORY_OPTIONS = ["main", "mounting", "pv", "battery_ac", "other"];

  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [comparisonRows, setComparisonRows] = useState([]);
  const [recentImports, setRecentImports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [materialName, setMaterialName] = useState("");
  const [unit, setUnit] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [category, setCategory] = useState("other");
  const [subgroup, setSubgroup] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCategory, setEditCategory] = useState("other");
  const [editSubgroup, setEditSubgroup] = useState("");
  const [subgroupFilter, setSubgroupFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("");
  const [comparisonFilter, setComparisonFilter] = useState("");

  const [supplierName, setSupplierName] = useState("");
  const [supplierFile, setSupplierFile] = useState(null);
  const [applyToCatalog, setApplyToCatalog] = useState(true);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [markPreferred, setMarkPreferred] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [supplierFileInputKey, setSupplierFileInputKey] = useState(0);
  const [savingSupplierId, setSavingSupplierId] = useState(null);
  const [selectingPriceKey, setSelectingPriceKey] = useState("");

  const loadAll = async ({ background = false } = {}) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [materialsRes, suppliersRes, comparisonRes, priceListsRes] = await Promise.allSettled([
        api.get("/materials"),
        api.get("/materials/suppliers"),
        api.get("/materials/comparison"),
        api.get("/materials/price-lists", { params: { limit: 8 } })
      ]);
      setMaterials(
        materialsRes.status === "fulfilled" && Array.isArray(materialsRes.value.data)
          ? materialsRes.value.data
          : []
      );
      setSuppliers(
        suppliersRes.status === "fulfilled" && Array.isArray(suppliersRes.value.data)
          ? suppliersRes.value.data
          : []
      );
      setComparisonRows(
        comparisonRes.status === "fulfilled" && Array.isArray(comparisonRes.value.data)
          ? comparisonRes.value.data
          : []
      );
      setRecentImports(
        priceListsRes.status === "fulfilled" && Array.isArray(priceListsRes.value.data)
          ? priceListsRes.value.data
          : []
      );

      const firstError =
        [materialsRes, suppliersRes, comparisonRes, priceListsRes]
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason?.response?.data?.message || result.reason?.message)
          .find(Boolean) || "";

      if (firstError) setError(firstError);
    } catch (err) {
      setError(err?.message || "Failed to load materials");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const deferredMaterialFilter = useDeferredValue(materialFilter);
  const deferredComparisonFilter = useDeferredValue(comparisonFilter);

  const comparisonByMaterialId = {};
  for (const row of comparisonRows) {
    if (row.materialId) comparisonByMaterialId[row.materialId] = row;
  }

  const subgroupOptions = Array.from(
    new Set(materials.map((m) => String(m.subgroup || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const visibleMaterials = materials.filter((material) => {
    if (subgroupFilter !== "all" && String(material.subgroup || "") !== subgroupFilter) return false;
    if (!deferredMaterialFilter.trim()) return true;

    const match = comparisonByMaterialId[material.id];
    const needle = deferredMaterialFilter.trim().toLowerCase();
    return [
      material.material_name,
      material.unit,
      material.category,
      material.subgroup,
      match?.activeSupplierName
    ].some((value) => String(value || "").toLowerCase().includes(needle));
  });

  const visibleComparisonRows = comparisonRows.filter((row) => {
    if (subgroupFilter !== "all" && String(row.subgroup || "") !== subgroupFilter) return false;
    if (!deferredComparisonFilter.trim()) return true;
    const needle = deferredComparisonFilter.trim().toLowerCase();
    return (
      String(row.materialName || "").toLowerCase().includes(needle) ||
      String(row.activeSupplierName || "").toLowerCase().includes(needle) ||
      row.supplierPrices.some((entry) => String(entry.supplierName || "").toLowerCase().includes(needle))
    );
  });

  const clearMaterialForm = () => {
    setMaterialName("");
    setUnit("");
    setBasePrice("");
    setCategory("other");
    setSubgroup("");
  };

  const createMaterial = async () => {
    setError("");
    setSuccess("");
    try {
      await api.post("/materials", {
        materialName,
        unit,
        basePrice: toNumber(basePrice, 0),
        category,
        subgroup
      });
      clearMaterialForm();
      setSuccess("Material added to the active catalog.");
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create material");
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditName(row.material_name || "");
    setEditUnit(row.unit || "");
    setEditPrice(String(row.base_price ?? ""));
    setEditCategory(row.category || "other");
    setEditSubgroup(row.subgroup || "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError("");
    setSuccess("");
    try {
      await api.put(`/materials/${editingId}`, {
        materialName: editName,
        unit: editUnit,
        basePrice: toNumber(editPrice, 0),
        category: editCategory,
        subgroup: editSubgroup
      });
      setEditingId(null);
      setSuccess("Material updated.");
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update material");
    }
  };

  const removeMaterial = async (id) => {
    setError("");
    setSuccess("");
    try {
      await api.delete(`/materials/${id}`);
      setSuccess("Material removed from the active catalog.");
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete material");
    }
  };

  const uploadPriceList = async () => {
    if (!supplierName.trim() || !supplierFile) return;
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.append("supplierName", supplierName.trim());
      formData.append("isPreferred", markPreferred ? "1" : "0");
      formData.append("applyToCatalog", applyToCatalog ? "1" : "0");
      formData.append("replaceExisting", replaceExisting ? "1" : "0");
      formData.append("file", supplierFile);
      const res = await api.post("/materials/import-price-list", formData);
      setSupplierName("");
      setSupplierFile(null);
      setSupplierFileInputKey((value) => value + 1);
      setMarkPreferred(false);
      setApplyToCatalog(true);
      setReplaceExisting(true);
      setSuccess(
        `Imported ${res.data?.importedCount || 0} rows for ${res.data?.supplier?.supplier_name || "supplier"}.`
      );
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to import supplier price list");
    } finally {
      setUploading(false);
    }
  };

  const updateSupplierPreference = async (supplier, nextPreferred) => {
    setSavingSupplierId(supplier.id);
    setError("");
    setSuccess("");
    try {
      await api.put(`/materials/suppliers/${supplier.id}`, {
        supplierName: supplier.supplier_name,
        notes: supplier.notes || "",
        isPreferred: nextPreferred
      });
      setSuccess(`${supplier.supplier_name} updated.`);
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update supplier");
    } finally {
      setSavingSupplierId(null);
    }
  };

  const selectSupplierPrice = async (row, supplierPrice) => {
    if (!row.materialId) return;
    const actionKey = `${row.materialId}:${supplierPrice.supplierPriceId}`;
    setSelectingPriceKey(actionKey);
    setError("");
    setSuccess("");
    try {
      await api.post(`/materials/${row.materialId}/select-supplier-price`, {
        supplierPriceId: supplierPrice.supplierPriceId
      });
      setSuccess(`${row.materialName} now uses ${supplierPrice.supplierName}.`);
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to select supplier price");
    } finally {
      setSelectingPriceKey("");
    }
  };

  return (
    <div className="materials-page-grid">
      <div className="materials-card">
        <div className="module-card-head">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <div className="module-card-head-text">
            <strong>Material Pricing Hub</strong>
            <span>Upload supplier PDF or Excel price lists, compare supplier prices, and keep the active quote catalog in sync.</span>
          </div>
          <div className="module-card-head-filter materials-head-actions">
            <select
              id="subgroupFilter"
              className="select"
              value={subgroupFilter}
              onChange={(e) => setSubgroupFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              {subgroupOptions.map((sg) => (
                <option value={sg} key={sg}>{sg}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="materials-dashboard-grid">
          <div className="materials-summary-card">
            <strong>{materials.length}</strong>
            <span>Active catalog items</span>
          </div>
          <div className="materials-summary-card">
            <strong>{suppliers.length}</strong>
            <span>Suppliers tracked</span>
          </div>
          <div className="materials-summary-card">
            <strong>{recentImports.length}</strong>
            <span>Recent price list uploads</span>
          </div>
          <div className="materials-summary-card">
            <strong>{refreshing ? "..." : visibleComparisonRows.length}</strong>
            <span>Comparison rows</span>
          </div>
        </div>

        <div className="materials-layout-grid">
          <div className="add-item-card materials-feature-card">
            <div className="add-item-card-head materials-feature-head">
              <strong>Supplier Price List Import</strong>
            </div>
            <div className="materials-feature-body">
              <p className="materials-feature-copy">
                Upload the latest supplier PDF or Excel list. The system keeps that supplier&apos;s prices,
                compares them with other suppliers, and can update the active quote catalog automatically.
              </p>
              <div className="materials-upload-grid">
                <label className="field">
                  <span>Supplier Name</span>
                  <input
                    className="input"
                    placeholder="e.g. Canadian Solar Distributor"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Price List File</span>
                  <input
                    key={supplierFileInputKey}
                    className="input"
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv,.json"
                    onChange={(e) => setSupplierFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <div className="materials-option-grid">
                <label className="materials-option-card">
                  <div className="materials-option-check">
                    <input type="checkbox" checked={markPreferred} onChange={(e) => setMarkPreferred(e.target.checked)} />
                    <strong>Preferred Supplier</strong>
                  </div>
                  <span>Favor this supplier when the system auto-picks the active catalog price.</span>
                </label>
                <label className="materials-option-card">
                  <div className="materials-option-check">
                    <input type="checkbox" checked={applyToCatalog} onChange={(e) => setApplyToCatalog(e.target.checked)} />
                    <strong>Auto-Sync Catalog</strong>
                  </div>
                  <span>Immediately update active material prices used by quotes after import.</span>
                </label>
                <label className="materials-option-card">
                  <div className="materials-option-check">
                    <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
                    <strong>Replace Old Supplier List</strong>
                  </div>
                  <span>Remove supplier prices that are no longer present in this newest uploaded list.</span>
                </label>
              </div>
              <div className="materials-upload-footer">
                <div className="materials-inline-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!supplierName.trim() || !supplierFile || uploading}
                    onClick={uploadPriceList}
                  >
                    {uploading ? "Uploading..." : "Upload Price List"}
                  </button>
                  <span className="section-note">Supported: PDF, XLSX, XLS, CSV, JSON</span>
                </div>
                <div className="materials-file-pill">
                  {supplierFile ? supplierFile.name : "No file selected yet"}
                </div>
              </div>
            </div>
          </div>

          <div className="add-item-card materials-feature-card">
            <div className="add-item-card-head materials-feature-head">
              <strong>Supplier Directory</strong>
            </div>
            <div className="materials-feature-body">
              <p className="materials-feature-copy">
                Preferred suppliers are prioritized when the system auto-selects the active catalog price.
              </p>
              <div className="materials-supplier-list">
                {suppliers.map((supplier) => (
                <div className="materials-supplier-row" key={supplier.id}>
                  <div>
                    <strong>{supplier.supplier_name}</strong>
                    <div className="section-note">
                      {supplier.material_count || 0} materials
                      {" - "}
                      Last upload: {formatDateTime(supplier.latest_uploaded_at)}
                    </div>
                  </div>
                  <label className="materials-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(supplier.is_preferred)}
                      disabled={savingSupplierId === supplier.id}
                      onChange={(e) => updateSupplierPreference(supplier, e.target.checked)}
                    />
                    <span>{Boolean(supplier.is_preferred) ? "Preferred" : "Standard"}</span>
                  </label>
                </div>
                ))}
                {!suppliers.length && !loading && <div className="section-note">No suppliers yet. Upload the first price list to create one.</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="materials-layout-grid">
          <div className="add-item-card materials-feature-card">
            <div className="add-item-card-head materials-feature-head">
              <strong>Add Material</strong>
            </div>
            <div className="materials-feature-body">
              <p className="materials-feature-copy">
                Use manual items for one-off prices or special parts that are not coming from supplier uploads.
                Manual edits stay pinned and won&apos;t be overwritten by auto-sync.
              </p>
              <div className="add-item-picker-row">
                <label className="field">
                  <span>Material Name</span>
                  <input className="input" placeholder="e.g. Solar Panel 450W" value={materialName} onChange={(e) => setMaterialName(e.target.value)} />
                </label>
                <label className="field">
                  <span>Unit</span>
                  <input className="input" placeholder="PCS, m, roll..." value={unit} onChange={(e) => setUnit(e.target.value)} />
                </label>
                <label className="field">
                  <span>Base Price (PHP)</span>
                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
                </label>
              </div>
              <div className="add-item-details-row row-auto">
                <label className="field">
                  <span>Category</span>
                  <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option value={opt} key={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Subgroup</span>
                  <input className="input" placeholder="battery, inverter, cable..." value={subgroup} onChange={(e) => setSubgroup(e.target.value)} />
                </label>
                <button className="btn btn-primary add-item-submit" type="button" onClick={createMaterial} disabled={!materialName.trim()}>
                  Add Material
                </button>
              </div>
            </div>
          </div>

          <div className="add-item-card materials-feature-card">
            <div className="add-item-card-head materials-feature-head">
              <strong>Recent Price Lists</strong>
            </div>
            <div className="materials-feature-body">
              <p className="materials-feature-copy">
                Recent uploads are listed here so you can confirm which supplier file was imported last.
              </p>
              <div className="materials-supplier-list">
              {recentImports.map((row) => (
                <div className="materials-supplier-row" key={row.id}>
                  <div>
                    <strong>{row.supplier_name}</strong>
                    <div className="section-note">{row.source_filename}</div>
                  </div>
                  <div className="materials-import-meta">
                    <span>{row.imported_count || 0} rows</span>
                    <span>{formatDateTime(row.created_at)}</span>
                  </div>
                </div>
              ))}
              {!recentImports.length && !loading && <div className="section-note">No imports recorded yet.</div>}
              </div>
            </div>
          </div>
        </div>

        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}
        {loading && <p className="section-note">Loading materials...</p>}

        <div className="materials-table-toolbar">
          <div>
            <strong>Active Material Prices</strong>
            <span>Search the catalog used by quotes and templates.</span>
          </div>
          <input
            className="input"
            placeholder="Search material name, unit, subgroup, supplier..."
            value={materialFilter}
            onChange={(e) => setMaterialFilter(e.target.value)}
          />
        </div>

        <div className="materials-table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Unit</th>
                <th>Base Price</th>
                <th>Active Source</th>
                <th>Category</th>
                <th>Subgroup</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleMaterials.map((row) => {
                const match = comparisonByMaterialId[row.id];
                return (
                  <tr key={row.id}>
                    <td>{editingId === row.id ? <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} /> : row.material_name}</td>
                    <td>{editingId === row.id ? <input className="input" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} /> : row.unit || "-"}</td>
                    <td>
                      {editingId === row.id ? (
                        <input className="input" type="number" min="0" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                      ) : (
                        <div className="materials-price-cell">
                          <strong>{formatMoney(row.base_price)}</strong>
                          <span>{row.price_selection_mode || "catalog_auto"}</span>
                        </div>
                      )}
                    </td>
                    <td>{match?.activeSupplierName || "Manual catalog"}</td>
                    <td>
                      {editingId === row.id ? (
                        <select className="select" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                          {CATEGORY_OPTIONS.map((opt) => (
                            <option value={opt} key={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        row.category || "other"
                      )}
                    </td>
                    <td>{editingId === row.id ? <input className="input" value={editSubgroup} onChange={(e) => setEditSubgroup(e.target.value)} /> : row.subgroup || "-"}</td>
                    <td>
                      <div className="materials-actions">
                        {editingId === row.id ? (
                          <>
                            <button className="btn btn-secondary" type="button" onClick={saveEdit}>Save</button>
                            <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-ghost" type="button" onClick={() => startEdit(row)}>Edit</button>
                            <button className="btn btn-ghost" type="button" onClick={() => removeMaterial(row.id)}>Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visibleMaterials.length && !loading && (
                <tr>
                  <td colSpan={7} className="section-note">No material prices yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="materials-table-toolbar">
          <div>
            <strong>Supplier Comparison</strong>
            <span>Compare supplier prices and choose which one becomes active.</span>
          </div>
          <input
            className="input"
            placeholder="Search supplier comparison"
            value={comparisonFilter}
            onChange={(e) => setComparisonFilter(e.target.value)}
          />
        </div>

        <div className="materials-table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Active Price</th>
                <th>Active Supplier</th>
                <th>Best Supplier Price</th>
                <th>Supplier Price List</th>
              </tr>
            </thead>
            <tbody>
              {visibleComparisonRows.map((row) => (
                <tr key={row.normalizedName}>
                  <td>
                    <strong>{row.materialName}</strong>
                    <div className="section-note">{row.subgroup || row.category || "other"}</div>
                  </td>
                  <td>{row.inCatalog ? formatMoney(row.activePrice) : "Not in catalog"}</td>
                  <td>{row.activeSupplierName || "Manual catalog"}</td>
                  <td>{row.bestPrice == null ? "-" : formatMoney(row.bestPrice)}</td>
                  <td>
                    <div className="materials-supplier-price-list">
                      {row.supplierPrices.map((price) => {
                        const actionKey = `${row.materialId}:${price.supplierPriceId}`;
                        return (
                          <div className={`materials-supplier-price-pill${price.isActive ? " active" : ""}`} key={price.supplierPriceId}>
                            <div>
                              <strong>{price.supplierName}</strong>
                              <div className="section-note">
                                PHP {formatMoney(price.basePrice)}
                                {price.isPreferred ? " - Preferred" : ""}
                              </div>
                            </div>
                            {row.materialId ? (
                              <button
                                className="btn btn-ghost"
                                type="button"
                                disabled={price.isActive || selectingPriceKey === actionKey}
                                onClick={() => selectSupplierPrice(row, price)}
                              >
                                {price.isActive ? "Active" : selectingPriceKey === actionKey ? "Saving..." : "Use"}
                              </button>
                            ) : (
                              <span className="section-note">Sync to catalog</span>
                            )}
                          </div>
                        );
                      })}
                      {!row.supplierPrices.length && <span className="section-note">No supplier prices yet.</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleComparisonRows.length && !loading && (
                <tr>
                  <td colSpan={5} className="section-note">No supplier comparison data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
