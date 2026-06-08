import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import CalendarTab from "./CalendarTab";
import CRMTab from "./CRMTab";
import MaterialsTab from "./MaterialsTab";
import InventoryTab from "./InventoryTab";
import PayrollTab from "./PayrollTab";
import PackagePricesTab from "./PackagePricesTab";
import MarginTemplatesTab from "./MarginTemplatesTab";
import TemplatesTab from "./TemplatesTab";
import UsersTab from "./UsersTab";
import RolesTab from "./RolesTab";
import AuditTab from "./AuditTab";
import FinancialManagementTab from "./FinancialManagementTab";
import AccountingManagementTab from "./AccountingManagementTab";
import solaresLogo from "../components/assets/SOLARES.png";
import { clearAuthToken } from "../auth/tokenStorage";
import { isAdminRole, normalizeModules, roleLabel } from "../constants/access";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

const TAB_CONFIG = [
  { key: "calendar", label: "Calendar Dashboard", group: "Workspace", icon: "calendar" },
  { key: "crm", label: "Customer Relationship Management", group: "Workspace", icon: "crm", accessKeys: ["crm", "quotes"] },
  { key: "payroll", label: "Payroll", group: "Workspace", icon: "payroll" },
  { key: "templates", label: "Template Manager", group: "System Configuration", icon: "templates" },
  { key: "materials", label: "Material Cost", group: "System Configuration", icon: "materials" },
  { key: "inventory", label: "Inventory", group: "System Configuration", icon: "inventory" },
  { key: "packages", label: "Package Prices", group: "System Configuration", icon: "packages" },
  { key: "margins", label: "Margin Setup", group: "System Configuration", icon: "margins" },
  { key: "finance", label: "Financial Management", group: "Workspace", icon: "finance" },
  { key: "accounting", label: "Accounting Management", group: "Workspace", icon: "accounting" },
  { key: "users", label: "Users", group: "System Administration", icon: "users" },
  { key: "roles", label: "Roles", group: "System Administration", icon: "roles" },
  { key: "audit", label: "Audit", group: "System Administration", icon: "audit" }
];

function toCount(data) {
  return Array.isArray(data) ? data.length : 0;
}

function SidebarIcon({ icon }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  };

  switch (icon) {
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M7.5 3.5v3" />
          <path d="M16.5 3.5v3" />
          <path d="M3.5 9.5h17" />
          <path d="M8 13h3" />
          <path d="M13 13h3" />
          <path d="M8 17h3" />
        </svg>
      );
    case "quotes":
      return (
        <svg {...common}>
          <path d="M7 4.5h8l3 3V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z" />
          <path d="M15 4.5V8h3" />
          <path d="M8.5 11h7" />
          <path d="M8.5 14.5h7" />
          <path d="M8.5 18h4" />
        </svg>
      );
    case "crm":
      return (
        <svg {...common}>
          <path d="M16.5 20v-1.2a3.8 3.8 0 0 0-3.8-3.8H7.8A3.8 3.8 0 0 0 4 18.8V20" />
          <circle cx="10.2" cy="8" r="3.2" />
          <path d="M19.5 20v-1a3 3 0 0 0-2.2-2.9" />
          <path d="M15.7 5.1a3.1 3.1 0 0 1 0 5.9" />
          <path d="M3.5 5.5h4" />
          <path d="M5.5 3.5v4" />
        </svg>
      );
    case "payroll":
      return (
        <svg {...common}>
          <rect x="4" y="5.5" width="16" height="13" rx="2.2" />
          <path d="M7.5 9.5h9" />
          <path d="M7.5 13h4" />
          <path d="M15 14.8c.4.4 1 .6 1.7.6 1 0 1.8-.5 1.8-1.3 0-.7-.5-1.1-1.7-1.4-1.1-.3-1.7-.7-1.7-1.4 0-.8.7-1.3 1.6-1.3.7 0 1.2.2 1.6.6" />
        </svg>
      );
    case "templates":
      return (
        <svg {...common}>
          <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
          <path d="M8 8.5h8" />
          <path d="M8 12h8" />
          <path d="M8 15.5h4.5" />
          <path d="M15.5 15.5h.01" />
        </svg>
      );
    case "materials":
      return (
        <svg {...common}>
          <path d="M6 8.5h12" />
          <path d="M6 12h12" />
          <path d="M6 15.5h7" />
          <path d="M18 6.5H6A1.5 1.5 0 0 0 4.5 8v8A1.5 1.5 0 0 0 6 17.5h12a1.5 1.5 0 0 0 1.5-1.5V8A1.5 1.5 0 0 0 18 6.5Z" />
          <path d="M8 3.5v3" />
          <path d="M16 3.5v3" />
        </svg>
      );
    case "packages":
      return (
        <svg {...common}>
          <path d="M12 3.8 19 7.7v8.6L12 20.2 5 16.3V7.7L12 3.8Z" />
          <path d="M5.6 7.9 12 11.5l6.4-3.6" />
          <path d="M12 11.5v8.1" />
        </svg>
      );
    case "inventory":
      return (
        <svg {...common}>
          <path d="M4.5 7.5 12 3.5l7.5 4-7.5 4-7.5-4Z" />
          <path d="M4.5 7.5v8.8l7.5 4.2 7.5-4.2V7.5" />
          <path d="M12 11.5v8.8" />
          <path d="M8.2 14.2h2.1" />
        </svg>
      );
    case "margins":
      return (
        <svg {...common}>
          <path d="M4 18h16" />
          <path d="M7 18V9" />
          <path d="M12 18V6" />
          <path d="M17 18v-4" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16.5 20v-1.2a3.8 3.8 0 0 0-3.8-3.8H7.8A3.8 3.8 0 0 0 4 18.8V20" />
          <circle cx="10.2" cy="8" r="3.2" />
          <path d="M19.5 20v-1a3 3 0 0 0-2.2-2.9" />
          <path d="M15.7 5.1a3.1 3.1 0 0 1 0 5.9" />
        </svg>
      );
    case "roles":
      return (
        <svg {...common}>
          <path d="M7 11.5 4.5 14l2.5 2.5" />
          <path d="M17 11.5 19.5 14 17 16.5" />
          <path d="M14 6.5h-4a2.5 2.5 0 0 0-2.5 2.5v10" />
          <path d="M14 6.5v5h5" />
          <path d="M14 6.5 19 11.5" />
        </svg>
      );
    case "audit":
      return (
        <svg {...common}>
          <path d="M12 6.5v5l3 1.8" />
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 2.5v2" />
          <path d="M21.5 12h-2" />
        </svg>
      );
    case "finance":
      return (
        <svg {...common}>
          <rect x="3.5" y="6" width="17" height="13" rx="2" />
          <path d="M3.5 10h17" />
          <path d="M7.2 15.5h2.4" />
          <path d="M12 15.5h1.8" />
          <path d="M16.4 15.5h.6" />
          <path d="M7.5 3.5v2.5" />
          <path d="M16.5 3.5v2.5" />
        </svg>
      );
    case "accounting":
      return (
        <svg {...common}>
          <path d="M6 3.8h12a1.5 1.5 0 0 1 1.5 1.5v15l-2.3-1.2-2.3 1.2-2.3-1.2-2.3 1.2-2.3-1.2L4.5 20.3V5.3A1.5 1.5 0 0 1 6 3.8Z" />
          <path d="M8 8.5h8" />
          <path d="M8 12h8" />
          <path d="M8 15.5h4.5" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Dashboard({ theme = "light", onToggleTheme }) {
  const [tab, setTab] = useState("calendar");
  const [now, setNow] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summary, setSummary] = useState({
    events: 0,
    templates: 0,
    materials: 0,
    inventory: 0,
    payroll: 0,
    packages: 0,
    margins: 0,
    crmProjects: 0
  });
  const [user, setUser] = useState({
    id: null,
    name: "User",
    username: "",
    email: "",
    role: "field_work",
    roleLabel: "Field Work",
    permissions: ["calendar"]
  });

  useBodyScrollLock(sidebarOpen);

  const dateLabel = useMemo(
    () =>
      now.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }),
    [now]
  );

  const timeLabel = useMemo(
    () =>
      now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit"
      }),
    [now]
  );

  const visibleTabs = useMemo(() => {
    const allowedKeys = normalizeModules(user.permissions, ["calendar"]);
    if (isAdminRole(user.role)) return TAB_CONFIG;
    return TAB_CONFIG.filter((item) => (item.accessKeys || [item.key]).some((key) => allowedKeys.includes(key)));
  }, [user.permissions, user.role]);

  const activeTab = useMemo(
    () => visibleTabs.find((item) => item.key === tab) || visibleTabs[0] || TAB_CONFIG[0],
    [tab, visibleTabs]
  );
  const isDarkTheme = theme === "dark";

  const showDashboardMetrics = activeTab?.key === "calendar";
  const pageEyebrow = showDashboardMetrics ? "Dashboard" : activeTab?.group || "Workspace";

  const groupedTabs = useMemo(() => {
    return visibleTabs.reduce((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, [visibleTabs]);

  const loadSummary = async () => {
    const meRes = await api.get("/auth/me");
    const nextUser = meRes?.data || {};
    const nextRole = String(nextUser.role || "field_work");
    const nextPermissions = normalizeModules(nextUser.permissions, ["calendar"]);
    const canAccessModule = (key) => isAdminRole(nextRole) || nextPermissions.includes(key);

    setUser({
      id: nextUser.id || null,
      name: nextUser.name || "User",
      username: nextUser.username || "",
      email: nextUser.email || "",
      role: nextRole,
      roleLabel: nextUser.roleLabel || roleLabel(nextRole),
      permissions: nextPermissions.length ? nextPermissions : ["calendar"]
    });

    const [eventsRes, templatesRes, materialsRes, inventoryRes, payrollRes, packagesRes, marginsRes, crmRes] = await Promise.allSettled([
      canAccessModule("calendar") ? api.get("/events") : Promise.resolve({ data: [] }),
      canAccessModule("templates") ? api.get("/templates?includeAll=1") : Promise.resolve({ data: [] }),
      canAccessModule("materials") ? api.get("/materials") : Promise.resolve({ data: [] }),
      canAccessModule("inventory") ? api.get("/inventory") : Promise.resolve({ data: [] }),
      canAccessModule("payroll") ? api.get("/payroll/employees") : Promise.resolve({ data: [] }),
      canAccessModule("packages") ? api.get("/package-prices?activeOnly=1") : Promise.resolve({ data: [] }),
      canAccessModule("margins") ? api.get("/margin-templates?activeOnly=1") : Promise.resolve({ data: [] }),
      canAccessModule("crm") ? api.get("/customers/summary") : Promise.resolve({ data: {} })
    ]);

    setSummary({
      events: eventsRes.status === "fulfilled" ? toCount(eventsRes.value.data) : 0,
      templates: templatesRes?.status === "fulfilled" ? toCount(templatesRes.value.data) : 0,
      materials: materialsRes?.status === "fulfilled" ? toCount(materialsRes.value.data) : 0,
      inventory: inventoryRes?.status === "fulfilled" ? toCount(inventoryRes.value.data) : 0,
      payroll: payrollRes?.status === "fulfilled" ? toCount(payrollRes.value.data) : 0,
      packages: packagesRes?.status === "fulfilled" ? toCount(packagesRes.value.data) : 0,
      margins: marginsRes?.status === "fulfilled" ? toCount(marginsRes.value.data) : 0,
      crmProjects: crmRes?.status === "fulfilled" ? Number(crmRes.value.data?.totalProjects || 0) : 0
    });
  };

  useEffect(() => {
    loadSummary();
    const syncId = window.setInterval(loadSummary, 60000);
    return () => window.clearInterval(syncId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!visibleTabs.some((item) => item.key === tab)) {
      setTab(visibleTabs[0]?.key || "calendar");
    }
  }, [tab, visibleTabs]);

  const stats = useMemo(() => {
    const items = [];
    const canAccessModule = (key) => isAdminRole(user.role) || user.permissions.includes(key);
    if (canAccessModule("calendar")) {
      items.push({ label: "Scheduled Events", value: summary.events });
    }
    if (canAccessModule("templates")) {
      items.push({ label: "Quote Templates", value: summary.templates });
    }
    if (canAccessModule("materials")) {
      items.push({ label: "Materials", value: summary.materials });
    }
    if (canAccessModule("inventory")) {
      items.push({ label: "Inventory Items", value: summary.inventory });
    }
    if (canAccessModule("payroll")) {
      items.push({ label: "Payroll Employees", value: summary.payroll });
    }
    if (canAccessModule("crm")) {
      items.push({ label: "CRM Projects", value: summary.crmProjects });
    }
    if (canAccessModule("packages")) {
      items.push({ label: "Active Packages", value: summary.packages });
    }
    if (canAccessModule("margins")) {
      items.push({ label: "Margin Templates", value: summary.margins });
    }
    return items;
  }, [summary, user.permissions, user.role]);

  return (
    <div className={`workspace-shell page-animate${sidebarOpen ? " sidebar-active" : ""}`}>
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`workspace-sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <img src={solaresLogo} alt="Solares" className="sidebar-brand-logo" />
          <div className="sidebar-brand-text" aria-label="Solares Energy Solution">
            <strong>Solares</strong>
            <span>Energy Solution</span>
          </div>
        </div>

        <div className="sidebar-groups">
          {Object.entries(groupedTabs).map(([groupName, items]) => (
            <div className="sidebar-group" key={groupName}>
              <p className="sidebar-group-title">{groupName}</p>
              <div className="sidebar-links">
                {items.map((item) => (
                  <button
                    key={item.key}
                    className={`sidebar-link ${tab === item.key ? "active" : ""}`}
                    onClick={() => { setTab(item.key); setSidebarOpen(false); }}
                  >
                    <span className="sidebar-link-icon">
                      <SidebarIcon icon={item.icon} />
                    </span>
                    <span className="sidebar-link-label">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {(user.name || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="sidebar-user-meta">
              <strong>{user.name || "User"}</strong>
              <p>{user.roleLabel || roleLabel(user.role)}</p>
              <span>{user.username || user.email || "Authenticated user"}</span>
            </div>
          </div>
          <button
            className="theme-switch"
            type="button"
            role="switch"
            aria-checked={isDarkTheme}
            aria-label={`Switch to ${isDarkTheme ? "light" : "dark"} mode`}
            onClick={onToggleTheme}
          >
            <span className="theme-switch-copy">
              <span>{isDarkTheme ? "Dark mode" : "Light mode"}</span>
              <small>{isDarkTheme ? "Night workspace" : "Day workspace"}</small>
            </span>
            <span className="theme-switch-track" aria-hidden="true">
              <span className="theme-switch-thumb" />
            </span>
          </button>
          <button
            className="btn btn-ghost sidebar-logout-btn"
            onClick={() => {
              clearAuthToken();
              window.location.href = "/login";
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Log Out
          </button>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-topbar-left">
            <button
              className="sidebar-hamburger"
              type="button"
              aria-label="Toggle menu"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <span /><span /><span />
            </button>
            <div>
              <p className="eyebrow">{pageEyebrow}</p>
              <h1 className="workspace-title">{activeTab.label}</h1>
            </div>
          </div>
          <div className="workspace-datetime">
            <span>{dateLabel}</span>
            <strong>{timeLabel}</strong>
          </div>
        </header>

        {showDashboardMetrics && (
          <div className="workspace-metrics">
            {stats.map((stat) => (
              <article className="metric-card" key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </article>
            ))}
          </div>
        )}

        <section className={`panel workspace-panel ${tab === "crm" ? "workspace-panel-fill" : ""}`}>
          {tab === "calendar" && <CalendarTab currentUser={user} onActivityChange={loadSummary} />}
          {tab === "crm" && <CRMTab currentUser={user} />}
          {tab === "payroll" && <PayrollTab />}
          {tab === "templates" && <TemplatesTab />}
          {tab === "materials" && <MaterialsTab />}
          {tab === "inventory" && <InventoryTab />}
          {tab === "packages" && <PackagePricesTab />}
          {tab === "margins" && <MarginTemplatesTab />}
          {tab === "finance" && <FinancialManagementTab />}
          {tab === "accounting" && <AccountingManagementTab />}
          {tab === "users" && <UsersTab currentUser={user} />}
          {tab === "roles" && <RolesTab />}
          {tab === "audit" && <AuditTab />}
        </section>
      </main>
    </div>
  );
}
