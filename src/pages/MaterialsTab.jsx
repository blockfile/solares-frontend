import { useEffect, useState } from "react";
import api from "../api/client";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function MaterialsTab() {
  const CATEGORY_OPTIONS = ["main", "mounting", "pv", "battery_ac", "other"];

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/materials");
      setMaterials(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load materials");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const subgroupOptions = Array.from(
    new Set(materials.map((m) => String(m.subgroup || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const visibleMaterials =
    subgroupFilter === "all"
      ? materials
      : materials.filter((m) => String(m.subgroup || "") === subgroupFilter);

  const createMaterial = async () => {
    setError("");
    try {
      await api.post("/materials", {
        materialName,
        unit,
        basePrice: toNumber(basePrice, 0),
        category,
        subgroup
      });
      setMaterialName("");
      setUnit("");
      setBasePrice("");
      setCategory("other");
      setSubgroup("");
      await load();
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
    try {
      await api.put(`/materials/${editingId}`, {
        materialName: editName,
        unit: editUnit,
        basePrice: toNumber(editPrice, 0),
        category: editCategory,
        subgroup: editSubgroup
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update material");
    }
  };

  const removeMaterial = async (id) => {
    setError("");
    try {
      await api.delete(`/materials/${id}`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete material");
    }
  };

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Material Base Prices</h3>
          <p className="section-note">
            Maintain material prices here. Quotes and template items will fetch prices from this
            catalog when names match.
          </p>
        </div>
      </div>

      <div className="materials-card">
        <div className="field">
          <label htmlFor="subgroupFilter">Filter by Type</label>
          <select
            id="subgroupFilter"
            className="select"
            value={subgroupFilter}
            onChange={(e) => setSubgroupFilter(e.target.value)}
          >
            <option value="all">All</option>
            {subgroupOptions.map((sg) => (
              <option value={sg} key={sg}>
                {sg}
              </option>
            ))}
          </select>
        </div>

        <div className="materials-form">
          <input
            className="input"
            placeholder="Material Name"
            value={materialName}
            onChange={(e) => setMaterialName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Unit (PCS, m, roll, etc.)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="Base Price"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
          />
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option value={opt} key={opt}>
                {opt}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Subgroup (battery, inverter, cable_wire, etc.)"
            value={subgroup}
            onChange={(e) => setSubgroup(e.target.value)}
          />
          <button
            className="btn btn-primary"
            type="button"
            onClick={createMaterial}
            disabled={!materialName.trim()}
          >
            Add Material
          </button>
        </div>

        {error && <div className="error-text">{error}</div>}
        {loading && <p className="section-note">Loading materials...</p>}

        <div className="materials-table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Unit</th>
                <th>Base Price</th>
                <th>Category</th>
                <th>Subgroup</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleMaterials.map((row) => (
                <tr key={row.id}>
                  <td>
                    {editingId === row.id ? (
                      <input
                        className="input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      row.material_name
                    )}
                  </td>
                  <td>
                    {editingId === row.id ? (
                      <input
                        className="input"
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                      />
                    ) : (
                      row.unit || "-"
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
                      Number(row.base_price || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })
                    )}
                  </td>
                  <td>
                    {editingId === row.id ? (
                      <select
                        className="select"
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                      >
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option value={opt} key={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.category || "other"
                    )}
                  </td>
                  <td>
                    {editingId === row.id ? (
                      <input
                        className="input"
                        value={editSubgroup}
                        onChange={(e) => setEditSubgroup(e.target.value)}
                      />
                    ) : (
                      row.subgroup || "-"
                    )}
                  </td>
                  <td>
                    <div className="materials-actions">
                      {editingId === row.id ? (
                        <>
                          <button className="btn btn-secondary" type="button" onClick={saveEdit}>
                            Save
                          </button>
                          <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-ghost" type="button" onClick={() => startEdit(row)}>
                            Edit
                          </button>
                          <button className="btn btn-ghost" type="button" onClick={() => removeMaterial(row.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleMaterials.length && !loading && (
                <tr>
                  <td colSpan={6} className="section-note">
                    No material prices yet.
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
