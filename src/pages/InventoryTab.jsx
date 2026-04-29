import { useDeferredValue, useEffect, useMemo, useState } from "react";
import api from "../api/client";

const EMPTY_ITEM_FORM = {
  itemName: "",
  sku: "",
  category: "general",
  unit: "pcs",
  location: "",
  minimumQuantity: "",
  openingQuantity: "",
  notes: ""
};

const EMPTY_MOVEMENT_FORM = {
  itemId: "",
  movementType: "stock_in",
  quantity: "",
  unitCost: "",
  referenceNo: "",
  movementDate: localDateInput(),
  notes: ""
};

const DEFAULT_CATEGORIES = ["general", "panel", "inverter", "battery", "mounting", "cable", "breaker", "tool"];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function localDateInput(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function formatQuantity(value) {
  return toNumber(value, 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function formatMoney(value) {
  if (value == null || value === "") return "-";
  return toNumber(value, 0).toLocaleString(undefined, {
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

function stockStatus(row) {
  if (Number(row.is_active) !== 1) return "inactive";
  const current = toNumber(row.current_quantity, 0);
  const minimum = toNumber(row.minimum_quantity, 0);
  if (current <= 0) return "out";
  if (minimum > 0 && current <= minimum) return "low";
  return "in_stock";
}

function stockStatusLabel(status) {
  switch (status) {
    case "in_stock":
      return "In Stock";
    case "low":
      return "Low Stock";
    case "out":
      return "Out";
    case "inactive":
      return "Inactive";
    default:
      return status || "-";
  }
}

function movementLabel(type) {
  switch (type) {
    case "stock_in":
      return "Received";
    case "stock_out":
      return "Used";
    case "adjustment":
      return "Adjustment";
    default:
      return type || "-";
  }
}

function signedMovement(row) {
  if (row.signed_quantity != null) return toNumber(row.signed_quantity, 0);
  const qty = toNumber(row.quantity, 0);
  return row.movement_type === "stock_out" ? -Math.abs(qty) : qty;
}

export default function InventoryTab() {
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [movementForm, setMovementForm] = useState(EMPTY_MOVEMENT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_ITEM_FORM);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const deferredSearch = useDeferredValue(search);

  const loadAll = async ({ background = false } = {}) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [itemsRes, movementsRes] = await Promise.all([
        api.get("/inventory?active=all"),
        api.get("/inventory/movements?limit=80")
      ]);
      const nextItems = Array.isArray(itemsRes.data) ? itemsRes.data : [];
      setItems(nextItems);
      setMovements(Array.isArray(movementsRes.data) ? movementsRes.data : []);
      setMovementForm((prev) => {
        if (prev.itemId && nextItems.some((item) => String(item.id) === String(prev.itemId))) return prev;
        const firstActive = nextItems.find((item) => Number(item.is_active) === 1);
        return { ...prev, itemId: firstActive ? String(firstActive.id) : "" };
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load inventory");
      setItems([]);
      setMovements([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set([
        ...DEFAULT_CATEGORIES,
        ...items.map((item) => String(item.category || "").trim()).filter(Boolean)
      ])
    ).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visibleItems = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter === "active" && Number(item.is_active) !== 1) return false;
      if (statusFilter === "inactive" && Number(item.is_active) === 1) return false;
      if (statusFilter === "low" && stockStatus(item) !== "low") return false;
      if (statusFilter === "out" && stockStatus(item) !== "out") return false;
      if (categoryFilter !== "all" && String(item.category || "general") !== categoryFilter) return false;
      if (!needle) return true;
      return [
        item.item_name,
        item.sku,
        item.category,
        item.unit,
        item.location,
        item.notes
      ].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [categoryFilter, deferredSearch, items, statusFilter]);

  const summary = useMemo(() => {
    const activeItems = items.filter((item) => Number(item.is_active) === 1);
    return {
      activeItems: activeItems.length,
      lowItems: activeItems.filter((item) => stockStatus(item) === "low").length,
      outItems: activeItems.filter((item) => stockStatus(item) === "out").length,
      totalOnHand: activeItems.reduce((sum, item) => sum + toNumber(item.current_quantity, 0), 0)
    };
  }, [items]);

  const selectedItem = useMemo(
    () => items.find((item) => String(item.id) === String(movementForm.itemId)) || null,
    [items, movementForm.itemId]
  );

  const updateItemForm = (field, value) => {
    setItemForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateMovementForm = (field, value) => {
    setMovementForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateEditForm = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const createItem = async () => {
    if (!itemForm.itemName.trim()) return;
    setError("");
    setSuccess("");

    try {
      await api.post("/inventory", {
        itemName: itemForm.itemName,
        sku: itemForm.sku,
        category: itemForm.category,
        unit: itemForm.unit,
        location: itemForm.location,
        minimumQuantity: toNumber(itemForm.minimumQuantity, 0),
        openingQuantity: toNumber(itemForm.openingQuantity, 0),
        notes: itemForm.notes
      });
      setItemForm(EMPTY_ITEM_FORM);
      setSuccess("Inventory item added.");
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to add inventory item");
    }
  };

  const recordMovement = async () => {
    if (!movementForm.itemId || !movementForm.quantity) return;
    setError("");
    setSuccess("");

    try {
      const res = await api.post(`/inventory/${movementForm.itemId}/movements`, {
        movementType: movementForm.movementType,
        quantity: toNumber(movementForm.quantity, 0),
        unitCost: movementForm.unitCost === "" ? undefined : toNumber(movementForm.unitCost, 0),
        referenceNo: movementForm.referenceNo,
        movementDate: movementForm.movementDate,
        notes: movementForm.notes
      });
      const itemName = res.data?.item?.item_name || selectedItem?.item_name || "Item";
      setMovementForm((prev) => ({
        ...EMPTY_MOVEMENT_FORM,
        itemId: prev.itemId,
        movementType: prev.movementType,
        movementDate: localDateInput()
      }));
      setSuccess(`${itemName} movement recorded.`);
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to record inventory movement");
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      itemName: item.item_name || "",
      sku: item.sku || "",
      category: item.category || "general",
      unit: item.unit || "",
      location: item.location || "",
      minimumQuantity: String(item.minimum_quantity ?? ""),
      openingQuantity: "",
      notes: item.notes || "",
      isActive: Number(item.is_active) === 1
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(EMPTY_ITEM_FORM);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError("");
    setSuccess("");

    try {
      await api.put(`/inventory/${editingId}`, {
        itemName: editForm.itemName,
        sku: editForm.sku,
        category: editForm.category,
        unit: editForm.unit,
        location: editForm.location,
        minimumQuantity: toNumber(editForm.minimumQuantity, 0),
        notes: editForm.notes,
        isActive: Boolean(editForm.isActive)
      });
      cancelEdit();
      setSuccess("Inventory item updated.");
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update inventory item");
    }
  };

  const deactivateItem = async (item) => {
    if (!window.confirm(`Deactivate ${item.item_name}? Movement history will stay available.`)) return;
    setError("");
    setSuccess("");

    try {
      await api.delete(`/inventory/${item.id}`);
      setSuccess(`${item.item_name} deactivated.`);
      await loadAll({ background: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to deactivate inventory item");
    }
  };

  return (
    <div className="materials-page-grid inventory-page">
      <div className="materials-card">
        <div className="module-card-head">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3.8 19 7.7v8.6L12 20.2 5 16.3V7.7L12 3.8Z" />
            <path d="M5.6 7.9 12 11.5l6.4-3.6" />
            <path d="M12 11.5v8.1" />
          </svg>
          <div className="module-card-head-text">
            <strong>Inventory Flow</strong>
            <span>Add materials, record received stock, record used stock, and keep on-hand balances current.</span>
          </div>
          <div className="module-card-head-filter materials-head-actions">
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="active">Active Items</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
              <option value="inactive">Inactive Items</option>
              <option value="all">All Items</option>
            </select>
          </div>
        </div>

        <div className="materials-dashboard-grid">
          <div className="materials-summary-card">
            <strong>{summary.activeItems}</strong>
            <span>Active items</span>
          </div>
          <div className="materials-summary-card">
            <strong>{summary.lowItems}</strong>
            <span>Low stock</span>
          </div>
          <div className="materials-summary-card">
            <strong>{summary.outItems}</strong>
            <span>Out of stock</span>
          </div>
          <div className="materials-summary-card">
            <strong>{formatQuantity(summary.totalOnHand)}</strong>
            <span>Total quantity on hand</span>
          </div>
        </div>

        <div className="materials-layout-grid inventory-entry-grid">
          <div className="add-item-card materials-feature-card">
            <div className="add-item-card-head materials-feature-head">
              <strong>Add Inventory Item</strong>
            </div>
            <div className="materials-feature-body">
              <div className="inventory-form-grid">
                <label className="field inventory-field-wide">
                  <span>Material / Item Name</span>
                  <input
                    className="input"
                    placeholder="e.g. PV Cable 6mm"
                    value={itemForm.itemName}
                    onChange={(e) => updateItemForm("itemName", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>SKU</span>
                  <input
                    className="input"
                    placeholder="Optional"
                    value={itemForm.sku}
                    onChange={(e) => updateItemForm("sku", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Category</span>
                  <input
                    className="input"
                    list="inventory-category-options"
                    value={itemForm.category}
                    onChange={(e) => updateItemForm("category", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Unit</span>
                  <input
                    className="input"
                    placeholder="pcs, m, roll..."
                    value={itemForm.unit}
                    onChange={(e) => updateItemForm("unit", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Location</span>
                  <input
                    className="input"
                    placeholder="Warehouse, truck..."
                    value={itemForm.location}
                    onChange={(e) => updateItemForm("location", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Minimum Stock</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.001"
                    value={itemForm.minimumQuantity}
                    onChange={(e) => updateItemForm("minimumQuantity", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Opening Stock</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.001"
                    value={itemForm.openingQuantity}
                    onChange={(e) => updateItemForm("openingQuantity", e.target.value)}
                  />
                </label>
                <label className="field inventory-field-wide">
                  <span>Notes</span>
                  <input
                    className="input"
                    placeholder="Optional notes"
                    value={itemForm.notes}
                    onChange={(e) => updateItemForm("notes", e.target.value)}
                  />
                </label>
              </div>
              <div className="materials-inline-actions">
                <button className="btn btn-primary" type="button" onClick={createItem} disabled={!itemForm.itemName.trim()}>
                  Add Item
                </button>
                <span className="section-note">Opening stock creates the first received-stock record.</span>
              </div>
            </div>
          </div>

          <div className="add-item-card materials-feature-card">
            <div className="add-item-card-head materials-feature-head">
              <strong>Record Stock Movement</strong>
            </div>
            <div className="materials-feature-body">
              <div className="inventory-form-grid">
                <label className="field inventory-field-wide">
                  <span>Item</span>
                  <select
                    className="select"
                    value={movementForm.itemId}
                    onChange={(e) => updateMovementForm("itemId", e.target.value)}
                  >
                    <option value="">Choose an item</option>
                    {items.filter((item) => Number(item.is_active) === 1).map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.item_name} ({formatQuantity(item.current_quantity)} {item.unit || "units"})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Flow</span>
                  <select
                    className="select"
                    value={movementForm.movementType}
                    onChange={(e) => updateMovementForm("movementType", e.target.value)}
                  >
                    <option value="stock_in">Received</option>
                    <option value="stock_out">Used</option>
                    <option value="adjustment">Adjustment (+/-)</option>
                  </select>
                </label>
                <label className="field">
                  <span>Quantity</span>
                  <input
                    className="input"
                    type="number"
                    step="0.001"
                    value={movementForm.quantity}
                    onChange={(e) => updateMovementForm("quantity", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Date</span>
                  <input
                    className="input"
                    type="date"
                    value={movementForm.movementDate}
                    onChange={(e) => updateMovementForm("movementDate", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Unit Cost</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={movementForm.unitCost}
                    onChange={(e) => updateMovementForm("unitCost", e.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>Reference</span>
                  <input
                    className="input"
                    placeholder="DR, invoice, job..."
                    value={movementForm.referenceNo}
                    onChange={(e) => updateMovementForm("referenceNo", e.target.value)}
                  />
                </label>
                <label className="field inventory-field-wide">
                  <span>Notes</span>
                  <input
                    className="input"
                    placeholder="Where it came from or where it was used"
                    value={movementForm.notes}
                    onChange={(e) => updateMovementForm("notes", e.target.value)}
                  />
                </label>
              </div>
              <div className="inventory-selected-stock">
                <span>Current stock</span>
                <strong>
                  {selectedItem ? `${formatQuantity(selectedItem.current_quantity)} ${selectedItem.unit || "units"}` : "-"}
                </strong>
              </div>
              <div className="materials-inline-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={recordMovement}
                  disabled={!movementForm.itemId || !movementForm.quantity}
                >
                  Record Movement
                </button>
                <span className="section-note">
                  Used stock subtracts from the on-hand balance.
                </span>
              </div>
            </div>
          </div>
        </div>

        <datalist id="inventory-category-options">
          {categoryOptions.map((category) => (
            <option value={category} key={category} />
          ))}
        </datalist>

        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}
        {loading && <p className="section-note">Loading inventory...</p>}

        <div className="materials-table-toolbar">
          <div>
            <strong>Inventory Items</strong>
            <span>{refreshing ? "Refreshing..." : "Search and edit stock details. Quantities change through movements."}</span>
          </div>
          <div className="materials-active-filters inventory-filters">
            <label className="materials-filter-field">
              <span>Category</span>
              <select className="select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">All Categories</option>
                {categoryOptions.map((category) => (
                  <option value={category} key={category}>{category}</option>
                ))}
              </select>
            </label>
            <input
              className="input materials-filter-search"
              placeholder="Search item, SKU, location, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="materials-table-wrap inventory-table-wrap">
          <table className="materials-table inventory-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Category</th>
                <th>Location</th>
                <th>Minimum</th>
                <th>Last Movement</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => {
                const status = stockStatus(item);
                const isEditing = editingId === item.id;
                return (
                  <tr key={item.id}>
                    <td>
                      {isEditing ? (
                        <div className="inventory-edit-stack">
                          <input className="input" value={editForm.itemName} onChange={(e) => updateEditForm("itemName", e.target.value)} />
                          <input className="input" placeholder="SKU" value={editForm.sku} onChange={(e) => updateEditForm("sku", e.target.value)} />
                        </div>
                      ) : (
                        <div>
                          <strong>{item.item_name}</strong>
                          <span className="table-subtext">{item.sku || "No SKU"}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="inventory-stock-cell">
                        <strong>{formatQuantity(item.current_quantity)}</strong>
                        <span>{item.unit || "units"}</span>
                      </div>
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          className="select"
                          value={editForm.isActive ? "1" : "0"}
                          onChange={(e) => updateEditForm("isActive", e.target.value === "1")}
                        >
                          <option value="1">Active</option>
                          <option value="0">Inactive</option>
                        </select>
                      ) : (
                        <span className={`inventory-status-pill inventory-status-${status}`}>
                          {stockStatusLabel(status)}
                        </span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input className="input" list="inventory-category-options" value={editForm.category} onChange={(e) => updateEditForm("category", e.target.value)} />
                      ) : (
                        item.category || "general"
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input className="input" value={editForm.location} onChange={(e) => updateEditForm("location", e.target.value)} />
                      ) : (
                        item.location || "-"
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="inventory-edit-stack">
                          <input className="input" value={editForm.unit} onChange={(e) => updateEditForm("unit", e.target.value)} placeholder="Unit" />
                          <input className="input" type="number" min="0" step="0.001" value={editForm.minimumQuantity} onChange={(e) => updateEditForm("minimumQuantity", e.target.value)} />
                        </div>
                      ) : (
                        `${formatQuantity(item.minimum_quantity)} ${item.unit || ""}`
                      )}
                    </td>
                    <td>{formatDateTime(item.last_movement_at)}</td>
                    <td>
                      <div className="materials-actions inventory-actions">
                        {isEditing ? (
                          <>
                            <button className="btn btn-secondary" type="button" onClick={saveEdit}>Save</button>
                            <button className="btn btn-ghost" type="button" onClick={cancelEdit}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-ghost" type="button" onClick={() => startEdit(item)}>Edit</button>
                            {Number(item.is_active) === 1 ? (
                              <button className="btn btn-ghost" type="button" onClick={() => deactivateItem(item)}>Deactivate</button>
                            ) : (
                              <button className="btn btn-ghost" type="button" onClick={() => startEdit(item)}>Reactivate</button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!visibleItems.length && !loading && (
                <tr>
                  <td colSpan={8} className="section-note">No inventory items match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="materials-table-toolbar">
          <div>
            <strong>Recent Material Flow</strong>
            <span>Every receipt, usage record, and adjustment is listed here.</span>
          </div>
        </div>

        <div className="materials-table-wrap inventory-table-wrap">
          <table className="materials-table inventory-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Flow</th>
                <th>Item</th>
                <th>Quantity</th>
                <th>Unit Cost</th>
                <th>Reference</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => {
                const signed = signedMovement(movement);
                return (
                  <tr key={movement.id}>
                    <td>{formatDateTime(movement.movement_date)}</td>
                    <td>
                      <span className={`inventory-flow-pill inventory-flow-${movement.movement_type}`}>
                        {movementLabel(movement.movement_type)}
                      </span>
                    </td>
                    <td>
                      <strong>{movement.item_name}</strong>
                      <span className="table-subtext">{movement.sku || movement.unit || "-"}</span>
                    </td>
                    <td className={signed < 0 ? "inventory-negative" : "inventory-positive"}>
                      {signed > 0 ? "+" : ""}{formatQuantity(signed)} {movement.unit || ""}
                    </td>
                    <td>{formatMoney(movement.unit_cost)}</td>
                    <td>{movement.reference_no || "-"}</td>
                    <td>{movement.notes || "-"}</td>
                  </tr>
                );
              })}

              {!movements.length && !loading && (
                <tr>
                  <td colSpan={7} className="section-note">No inventory movement has been recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
