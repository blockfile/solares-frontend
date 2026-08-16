import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import {
  getRoleBadgeClass,
  MODULE_DEFINITIONS,
  normalizeModules,
  normalizeRoleKey,
  roleLabel
} from "../constants/access";
import "../styles/admin.css";

const EMPTY_FORM = {
  label: "",
  description: "",
  status: "active",
  modules: []
};

/* Presentational icons for the summary stat cards, keyed by accent. */
const STAT_ICONS = {
  blue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  gold: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  green: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
};

export default function RolesTab() {
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRoleKey, setEditingRoleKey] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadRoles = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/roles");
      setRoles(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setRoles([]);
      setError(err?.response?.data?.message || "Failed to load roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const roleStats = useMemo(
    () => [
      { label: "Total roles", value: roles.length, accent: "blue" },
      { label: "System roles", value: roles.filter((role) => role.isSystem).length, accent: "gold" },
      { label: "Active roles", value: roles.filter((role) => role.status === "active").length, accent: "green" }
    ],
    [roles]
  );

  const openCreate = () => {
    setEditingRoleKey("");
    setForm({
      ...EMPTY_FORM,
      modules: ["calendar"]
    });
    setShowEditor(true);
    setError("");
  };

  const openEdit = (role) => {
    setEditingRoleKey(role.key);
    setForm({
      label: role.label || "",
      description: role.description || "",
      status: role.status === "inactive" ? "inactive" : "active",
      modules: normalizeModules(role.modules, [])
    });
    setShowEditor(true);
    setError("");
  };

  const closeEditor = () => {
    setEditingRoleKey("");
    setForm(EMPTY_FORM);
    setShowEditor(false);
  };

  const toggleModule = (moduleKey) => {
    setForm((prev) => {
      const current = new Set(normalizeModules(prev.modules, []));
      if (current.has(moduleKey)) {
        current.delete(moduleKey);
      } else {
        current.add(moduleKey);
      }
      return { ...prev, modules: Array.from(current) };
    });
  };

  const saveRole = async (e) => {
    e.preventDefault();

    const payload = {
      label: form.label.trim(),
      description: form.description.trim(),
      status: form.status === "inactive" ? "inactive" : "active",
      modules: normalizeModules(form.modules, [])
    };

    if (!payload.label) {
      setError("Role name is required");
      return;
    }

    if (!payload.modules.length) {
      setError("Select at least one module");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (editingRoleKey) {
        await api.put(`/roles/${editingRoleKey}`, payload);
      } else {
        await api.post("/roles", payload);
      }
      closeEditor();
      await loadRoles();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <header className="page-head">
        <span className="page-head-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </span>
        <div className="page-head-text">
          <h2 className="page-head-title">Roles</h2>
          <p className="page-head-desc">Create roles, choose the modules they can access, and assign them from the Users screen.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" type="button" onClick={loadRoles}>
            Refresh
          </button>
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            Add Role
          </button>
        </div>
      </header>

      <div className="admin-summary-grid">
        {roleStats.map((stat) => (
          <article className={`admin-summary-card metric-accent-${stat.accent}`} key={stat.label}>
            <span className="admin-summary-icon" aria-hidden="true">{STAT_ICONS[stat.accent]}</span>
            <div className="admin-summary-copy">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          </article>
        ))}
      </div>

      {error && <div className="error-text">{error}</div>}

      {showEditor && (
        <form className="role-form-card" onSubmit={saveRole}>
          <div className="role-form-grid">
            <input
              className="input"
              placeholder="Role name"
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
            />
            <select
              className="select"
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              disabled={normalizeRoleKey(editingRoleKey) === "admin"}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <input
              className="input role-key-preview"
              value={
                editingRoleKey
                  ? normalizeRoleKey(editingRoleKey)
                  : normalizeRoleKey(form.label || "new_role")
              }
              readOnly
            />
          </div>

          <textarea
            className="input role-description-input"
            placeholder="Role description"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            rows={3}
          />

          <div className="role-modules-grid">
            {MODULE_DEFINITIONS.map((module) => {
              const checked = normalizeModules(form.modules, []).includes(module.key);
              const disableToggle =
                normalizeRoleKey(editingRoleKey) === "admin" || (!editingRoleKey && false);

              return (
                <label className="module-check-card" key={module.key}>
                  <input
                    type="checkbox"
                    checked={
                      normalizeRoleKey(editingRoleKey) === "admin" ? true : checked
                    }
                    disabled={disableToggle}
                    onChange={() => toggleModule(module.key)}
                  />
                  <div>
                    <strong>{module.label}</strong>
                    <span>{module.description}</span>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="admin-toolbar-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : editingRoleKey ? "Save Role" : "Create Role"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={closeEditor} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <p className="section-note admin-roles-note">
        Admin always keeps full access. Other roles can be tailored module by module.
      </p>

      <div className="admin-summary-grid">
        {roles.map((role) => (
          <article className="admin-summary-card role-card" key={role.key}>
            <div className="role-card-head">
              <div>
                <h4>{role.label || roleLabel(role.key)}</h4>
                <span className="table-subtext mono">{role.key}</span>
              </div>
              <span className={`chip role-pill ${getRoleBadgeClass(role.key)}`}>
                {role.activeUsers} active
              </span>
            </div>
            <p className="section-note">{role.description || "No description provided."}</p>
            <div className="role-counts">
              <strong className="mono">{role.totalUsers}</strong>
              <span>Total users assigned</span>
            </div>
            <div className="permissions-list">
              {(role.modules || []).map((moduleKey) => {
                const module = MODULE_DEFINITIONS.find((item) => item.key === moduleKey);
                return (
                  <span className="chip chip-neutral" key={moduleKey}>
                    {module?.label || moduleKey}
                  </span>
                );
              })}
            </div>
            <div className="materials-actions">
              <button className="btn btn-ghost" type="button" onClick={() => openEdit(role)}>
                Edit
              </button>
              <span className={`chip admin-status-chip ${role.status === "active" ? "chip-success" : "chip-danger"}`}>
                {role.status}
              </span>
            </div>
          </article>
        ))}

        {!roles.length && !loading && (
          <article className="admin-summary-card">
            <strong>0</strong>
            <span>No roles available</span>
          </article>
        )}

        {loading && (
          <article className="admin-summary-card">
            <strong>...</strong>
            <span>Loading roles...</span>
          </article>
        )}
      </div>
    </div>
  );
}
