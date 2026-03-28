import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import {
  getRoleBadgeClass,
  MODULE_DEFINITIONS,
  normalizeModules,
  normalizeRoleKey,
  roleLabel
} from "../constants/access";

const EMPTY_FORM = {
  label: "",
  description: "",
  status: "active",
  modules: []
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
      { label: "Total Roles", value: roles.length, accent: "blue" },
      { label: "System Roles", value: roles.filter((role) => role.isSystem).length, accent: "amber" },
      { label: "Active Roles", value: roles.filter((role) => role.status === "active").length, accent: "green" }
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
    <div>
      <div className="admin-summary-grid">
        {roleStats.map((stat) => (
          <article className={`admin-summary-card accent-${stat.accent}`} key={stat.label}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </article>
        ))}
      </div>

      <div className="materials-card">
        <div className="module-card-head">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <div className="module-card-head-text">
            <strong>Role Management</strong>
            <span>Create roles, choose the modules they can access, and assign them from the Users screen.</span>
          </div>
        </div>
        <div className="admin-toolbar">
          <div>
            <p className="section-note">
              `Admin` always keeps full access. Other roles can be tailored module by module.
            </p>
          </div>

          <div className="admin-toolbar-actions">
            <button className="btn btn-ghost" type="button" onClick={loadRoles}>
              Refresh
            </button>
            <button className="btn btn-primary" type="button" onClick={openCreate}>
              Add Role
            </button>
          </div>
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

        <div className="admin-summary-grid">
          {roles.map((role) => (
            <article className="admin-summary-card role-card" key={role.key}>
              <div className="role-card-head">
                <div>
                  <h4>{role.label || roleLabel(role.key)}</h4>
                  <span className="table-subtext">{role.key}</span>
                </div>
                <span className={`role-pill ${getRoleBadgeClass(role.key)}`}>
                  {role.activeUsers} active
                </span>
              </div>
              <p className="section-note">{role.description || "No description provided."}</p>
              <div className="role-counts">
                <strong>{role.totalUsers}</strong>
                <span>Total users assigned</span>
              </div>
              <div className="permissions-list">
                {(role.modules || []).map((moduleKey) => {
                  const module = MODULE_DEFINITIONS.find((item) => item.key === moduleKey);
                  return (
                    <span className="permission-pill" key={moduleKey}>
                      {module?.label || moduleKey}
                    </span>
                  );
                })}
              </div>
              <div className="materials-actions">
                <button className="btn btn-ghost" type="button" onClick={() => openEdit(role)}>
                  Edit
                </button>
                <span className={`status-pill status-pill-${role.status}`}>{role.status}</span>
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
    </div>
  );
}
