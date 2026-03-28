import { useEffect, useMemo, useState } from "react";
import api from "../api/client";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

export default function AuditTab() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({
    q: "",
    module: "",
    action: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadLogs = async (nextFilters = filters) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/audit", {
        params: {
          q: nextFilters.q || undefined,
          module: nextFilters.module || undefined,
          action: nextFilters.action || undefined
        }
      });
      setLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setLogs([]);
      setError(err?.response?.data?.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moduleOptions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.module).filter(Boolean))).sort(),
    [logs]
  );

  const actionOptions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.action).filter(Boolean))).sort(),
    [logs]
  );

  return (
    <div>
      <div className="materials-card">
        <div className="module-card-head">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
          <div className="module-card-head-text">
            <strong>Audit Log</strong>
            <span>Review recent sign-ins, calendar updates, and user administration activity.</span>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="admin-toolbar-filters">
            <input
              className="input"
              placeholder="Search user, action, or details"
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            />
            <select
              className="select"
              value={filters.module}
              onChange={(e) => setFilters((prev) => ({ ...prev, module: e.target.value }))}
            >
              <option value="">All Modules</option>
              {moduleOptions.map((moduleName) => (
                <option value={moduleName} key={moduleName}>
                  {moduleName}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={filters.action}
              onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
            >
              <option value="">All Actions</option>
              {actionOptions.map((action) => (
                <option value={action} key={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-toolbar-actions">
            <button className="btn btn-secondary" type="button" onClick={() => loadLogs(filters)}>
              Apply Filters
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => loadLogs()}>
              Refresh
            </button>
          </div>
        </div>

        {error && <div className="error-text">{error}</div>}

        <div className="materials-table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>User</th>
                <th>Module</th>
                <th>Action</th>
                <th>IP Address</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>
                    <strong>{log.actor_name || "System"}</strong>
                    {log.email ? <span className="table-subtext">{log.email}</span> : null}
                  </td>
                  <td>{log.module}</td>
                  <td>
                    <span className="permission-pill">{log.action}</span>
                  </td>
                  <td>{log.ip_address || "-"}</td>
                  <td className="audit-detail">{log.details || "-"}</td>
                </tr>
              ))}

              {!logs.length && !loading && (
                <tr>
                  <td colSpan={6} className="empty-state-cell">
                    No audit logs matched the current filters.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={6} className="empty-state-cell">
                    Loading audit logs...
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
