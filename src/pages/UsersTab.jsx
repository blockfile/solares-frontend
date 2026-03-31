import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { getRoleBadgeClass, normalizeRoleKey, roleLabel } from "../constants/access";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

const EMPTY_FORM = {
  firstName: "",
  middleName: "",
  lastName: "",
  username: "",
  email: "",
  generatedPassword: "",
  role: "",
  status: "active"
};

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function generateTemporaryPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function splitNameParts(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return {
      firstName: "",
      middleName: "",
      lastName: ""
    };
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      middleName: "",
      lastName: ""
    };
  }

  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1]
  };
}

export default function UsersTab({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [filters, setFilters] = useState({
    q: "",
    role: "",
    status: ""
  });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingUserId, setEditingUserId] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("");
  const [confirmState, setConfirmState] = useState(null);
  const [deleteBlockers, setDeleteBlockers] = useState(null);

  useBodyScrollLock(showEditor || Boolean(confirmState) || Boolean(deleteBlockers));

  const loadRoles = async () => {
    setLoadingRoles(true);
    try {
      const res = await api.get("/roles");
      setRoles(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setRoles([]);
      setError(err?.response?.data?.message || "Failed to load roles");
    } finally {
      setLoadingRoles(false);
    }
  };

  const loadUsers = async (nextFilters = filters) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/users", {
        params: {
          q: nextFilters.q || undefined,
          role: nextFilters.role || undefined,
          status: nextFilters.status || undefined
        }
      });
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setUsers([]);
      setError(err?.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeRoles = useMemo(
    () => roles.filter((role) => role.status === "active"),
    [roles]
  );

  const assignableRoles = useMemo(() => {
    if (!editingUserId) return activeRoles;
    const currentRole = users.find((user) => Number(user.id) === Number(editingUserId))?.role;
    return roles.filter(
      (role) => role.status === "active" || normalizeRoleKey(role.key) === normalizeRoleKey(currentRole)
    );
  }, [activeRoles, editingUserId, roles, users]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((user) => user.status === "active").length;
    const admins = users.filter((user) => normalizeRoleKey(user.role) === "admin").length;
    return [
      { label: "Total Users", value: total, accent: "blue" },
      { label: "Active Users", value: active, accent: "green" },
      { label: "Admin Accounts", value: admins, accent: "purple" }
    ];
  }, [users]);

  const openCreate = () => {
    setEditingUserId(null);
    setForm({
      ...EMPTY_FORM,
      role: activeRoles[0]?.key || ""
    });
    setShowEditor(true);
    setError("");
    setCopyState("");
  };

  const openEdit = (user) => {
    const nameParts = splitNameParts(user.name);
    setEditingUserId(user.id);
    setForm({
      firstName: nameParts.firstName,
      middleName: nameParts.middleName,
      lastName: nameParts.lastName,
      username: user.username || "",
      email: user.email || "",
      generatedPassword: "",
      role: normalizeRoleKey(user.role),
      status: user.status === "inactive" ? "inactive" : "active"
    });
    setShowEditor(true);
    setError("");
    setCopyState("");
  };

  const closeEditor = () => {
    setEditingUserId(null);
    setForm(EMPTY_FORM);
    setShowEditor(false);
    setCopyState("");
  };

  const handleGeneratePassword = () => {
    setForm((prev) => ({ ...prev, generatedPassword: generateTemporaryPassword() }));
    setCopyState("");
  };

  const handleCopyPassword = async () => {
    if (!form.generatedPassword) return;
    try {
      await navigator.clipboard.writeText(form.generatedPassword);
      setCopyState("copied");
      window.setTimeout(() => setCopyState(""), 1500);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState(""), 1500);
    }
  };

  const saveUser = async (e) => {
    e.preventDefault();
    const fullName = [form.firstName, form.middleName, form.lastName]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");

    const payload = {
      name: fullName,
      username: form.username.trim(),
      email: form.email.trim(),
      role: normalizeRoleKey(form.role),
      status: form.status === "inactive" ? "inactive" : "active"
    };

    if (!form.firstName.trim() || !form.lastName.trim() || !payload.username || !payload.email) {
      setError("First name, last name, username, and email are required");
      return;
    }

    if (!payload.role) {
      setError("Please assign a role");
      return;
    }

    if (!editingUserId && !form.generatedPassword.trim()) {
      setError("Generate a temporary password for the new user");
      return;
    }

    if (form.generatedPassword.trim()) {
      payload.password = form.generatedPassword;
      payload.mustChangePassword = true;
    }

    setSaving(true);
    setError("");
    try {
      if (editingUserId) {
        await api.put(`/users/${editingUserId}`, payload);
      } else {
        await api.post("/users", payload);
      }
      closeEditor();
      await loadUsers();
      await loadRoles();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user) => {
    const nextStatus = user.status === "active" ? "inactive" : "active";
    const label = nextStatus === "active" ? "activate" : "deactivate";
    setConfirmState({
      title: `${nextStatus === "active" ? "Activate" : "Deactivate"} User`,
      message: `Do you want to ${label} ${user.name} (${user.username})?`,
      confirmLabel: nextStatus === "active" ? "Activate" : "Deactivate",
      confirmClassName: "btn btn-secondary",
      onConfirm: async () => {
        setSaving(true);
        setError("");
        try {
          await api.put(`/users/${user.id}`, { status: nextStatus });
          await loadUsers();
        } catch (err) {
          setError(err?.response?.data?.message || "Failed to update user status");
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const deleteUser = async (user) => {
    setConfirmState({
      title: "Delete User",
      message: `Delete ${user.name} (${user.username})? This cannot be undone.`,
      confirmLabel: "Delete User",
      confirmClassName: "btn btn-danger",
      onConfirm: async () => {
        setSaving(true);
        setError("");
        try {
          await api.delete(`/users/${user.id}`);
          await loadUsers();
          await loadRoles();
        } catch (err) {
          const details = err?.response?.data;
          if (Number(details?.linkedEvents || 0) > 0 || Number(details?.linkedQuotes || 0) > 0) {
            setDeleteBlockers({
              name: user.name,
              username: user.username,
              message: details?.message || "This user still has related records in the system.",
              linkedEvents: Number(details?.linkedEvents || 0),
              linkedQuotes: Number(details?.linkedQuotes || 0),
              previewLimit: Number(details?.previewLimit || 10),
              linkedEventItems: Array.isArray(details?.linkedEventItems) ? details.linkedEventItems : [],
              linkedQuoteItems: Array.isArray(details?.linkedQuoteItems) ? details.linkedQuoteItems : []
            });
            return;
          }
          setError(err?.response?.data?.message || "Failed to delete user");
        } finally {
          setSaving(false);
        }
      }
    });
  };

  return (
    <div>
      <div className="admin-summary-grid">
        {stats.map((stat) => (
          <article className={`admin-summary-card accent-${stat.accent}`} key={stat.label}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </article>
        ))}
      </div>

      <div className="materials-card">
        <div className="module-card-head">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <div className="module-card-head-text">
            <strong>User Accounts</strong>
            <span>Manage login accounts, assign saved roles, and issue generated temporary passwords.</span>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="admin-toolbar-filters">
            <input
              className="input"
              placeholder="Search users"
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            />
            <select
              className="select"
              value={filters.role}
              onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value }))}
            >
              <option value="">All Roles</option>
              {roles.map((role) => (
                <option value={role.key} key={role.key}>
                  {role.label}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="admin-toolbar-actions">
            <button className="btn btn-ghost" type="button" onClick={() => loadUsers()}>
              Refresh
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => loadUsers(filters)}>
              Apply Filters
            </button>
            <button className="btn btn-primary" type="button" onClick={openCreate} disabled={loadingRoles}>
              Add User
            </button>
          </div>
        </div>

        {error && <div className="error-text">{error}</div>}

        <div className="materials-table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = Number(currentUser?.id || 0) === Number(user.id || 0);
                const toggleLabel = user.status === "active" ? "Deactivate" : "Activate";

                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.username || "-"}</strong>
                    </td>
                    <td>
                      <strong>{user.name}</strong>
                      {isSelf ? <span className="table-subtext">You</span> : null}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <span className={`role-pill ${getRoleBadgeClass(user.role)}`}>
                        {user.roleLabel || roleLabel(user.role)}
                      </span>
                      {user.roleStatus === "inactive" ? (
                        <span className="table-subtext">Assigned role is inactive</span>
                      ) : null}
                      {user.mustChangePassword ? (
                        <span className="table-subtext">Waiting for first password change</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`status-pill status-pill-${user.status}`}>{user.status}</span>
                    </td>
                    <td>{formatDateTime(user.createdAt)}</td>
                    <td>
                      <div className="materials-actions">
                        <button className="btn btn-ghost" type="button" onClick={() => openEdit(user)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => toggleStatus(user)}
                          disabled={saving || (isSelf && user.status === "active")}
                        >
                          {toggleLabel}
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => deleteUser(user)}
                          disabled={saving || isSelf}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!users.length && !loading && (
                <tr>
                  <td colSpan={7} className="empty-state-cell">
                    No users matched the current filters.
                  </td>
                </tr>
              )}

              {(loading || loadingRoles) && (
                <tr>
                  <td colSpan={7} className="empty-state-cell">
                    Loading users...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showEditor && (
        <div
          className="modal-backdrop"
          role="presentation"
        >
          <div
            className="modal-card user-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-editor-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-copy user-modal-header">
              <h4 id="user-editor-title">{editingUserId ? "Edit User" : "Add User"}</h4>
              <p>
                {editingUserId
                  ? "Update user details and generate a new temporary password only when needed."
                  : "Create a user account and generate a temporary password for first login."}
              </p>
            </div>

            <form className="user-modal-form" onSubmit={saveUser}>
              <div className="user-modal-section">
                <div className="user-modal-section-head">
                  <strong>User Details</strong>
                  <span>Fill in the account identity and access information.</span>
                </div>
                <div className="user-modal-fields">
                  <label className="field">
                    <span>First Name</span>
                    <input
                      className="input"
                      placeholder="Enter first name"
                      value={form.firstName}
                      onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Middle Name</span>
                    <input
                      className="input"
                      placeholder="Optional"
                      value={form.middleName}
                      onChange={(e) => setForm((prev) => ({ ...prev, middleName: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Last Name</span>
                    <input
                      className="input"
                      placeholder="Enter last name"
                      value={form.lastName}
                      onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Username</span>
                    <input
                      className="input"
                      placeholder="Enter username"
                      value={form.username}
                      onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                    />
                  </label>
                  <label className="field user-field-span-2">
                    <span>Email Address</span>
                    <input
                      className="input"
                      placeholder="user@example.com"
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Role</span>
                    <select
                      className="select"
                      value={form.role}
                      onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                    >
                      <option value="">Select Role</option>
                      {assignableRoles.map((role) => (
                        <option value={role.key} key={role.key}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      className="select"
                      value={form.status}
                      onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="generated-password-card">
                <div className="generated-password-label">
                  <strong>{editingUserId ? "Reset Password" : "Temporary Password"}</strong>
                  <span>
                    {editingUserId
                      ? "Generate a new temporary password only if you want to reset this account."
                      : "Generate a secure password. The user will be required to change it on first login."}
                  </span>
                </div>
                <div className="generated-password-row">
                  <input
                    className="input"
                    readOnly
                    placeholder="Click Generate to create password"
                    value={form.generatedPassword}
                  />
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={handleCopyPassword}
                    disabled={!form.generatedPassword}
                  >
                    {copyState === "copied" ? "Copied" : copyState === "failed" ? "Retry Copy" : "Copy"}
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={handleGeneratePassword}>
                    Generate
                  </button>
                </div>
              </div>

              {error && <div className="error-text">{error}</div>}

              <div className="modal-actions">
                <button className="btn btn-ghost" type="button" onClick={closeEditor} disabled={saving}>
                  Close
                </button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving..." : editingUserId ? "Save User" : "Add User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmState && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card user-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-copy">
              <h4 id="user-confirm-title">{confirmState.title}</h4>
              <p>{confirmState.message}</p>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setConfirmState(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={confirmState.confirmClassName}
                type="button"
                disabled={saving}
                onClick={async () => {
                  await confirmState.onConfirm();
                  setConfirmState(null);
                }}
              >
                {saving ? "Working..." : confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteBlockers && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card user-blocker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-blocker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-copy">
              <h4 id="user-blocker-title">Cannot Delete User</h4>
              <p>{deleteBlockers.message}</p>
            </div>

            <div className="user-blocker-groups">
              {deleteBlockers.linkedQuoteItems.length > 0 && (
                <div className="user-blocker-group">
                  <strong>Linked Quotes</strong>
                  <div className="user-blocker-list">
                    {deleteBlockers.linkedQuoteItems.map((quote) => (
                      <div className="user-blocker-item" key={`quote-${quote.id}`}>
                        <div className="user-blocker-item-title">{quote.quoteRef || `Quote #${quote.id}`}</div>
                        <div className="user-blocker-item-meta">
                          <span>{quote.customerName || "No customer name"}</span>
                          <span>{formatDateTime(quote.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {deleteBlockers.linkedQuotes > deleteBlockers.linkedQuoteItems.length ? (
                    <div className="section-note">
                      Showing the latest {deleteBlockers.linkedQuoteItems.length} of{" "}
                      {deleteBlockers.linkedQuotes} linked quotes.
                    </div>
                  ) : null}
                </div>
              )}

              {deleteBlockers.linkedEventItems.length > 0 && (
                <div className="user-blocker-group">
                  <strong>Linked Calendar Events</strong>
                  <div className="user-blocker-list">
                    {deleteBlockers.linkedEventItems.map((event) => (
                      <div className="user-blocker-item" key={`event-${event.id}`}>
                        <div className="user-blocker-item-title">{event.title || `Event #${event.id}`}</div>
                        <div className="user-blocker-item-meta">
                          <span>{formatDateTime(event.startDatetime)}</span>
                          {event.endDatetime ? <span>{formatDateTime(event.endDatetime)}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  {deleteBlockers.linkedEvents > deleteBlockers.linkedEventItems.length ? (
                    <div className="section-note">
                      Showing the latest {deleteBlockers.linkedEventItems.length} of{" "}
                      {deleteBlockers.linkedEvents} linked calendar events.
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setDeleteBlockers(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
