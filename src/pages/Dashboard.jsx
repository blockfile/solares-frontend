import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import OverviewTab from "./OverviewTab";
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
import SidebarIcon from "../components/shell/SidebarIcon";
import CommandPalette from "../components/shell/CommandPalette";
import { clearAuthToken } from "../auth/tokenStorage";
import { isAdminRole, normalizeModules, roleLabel } from "../constants/access";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import "../styles/shell.css";

const TAB_CONFIG = [
  { key: "overview", label: "Overview", group: "Workspace", icon: "overview" },
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

const COLLAPSE_STORAGE_KEY = "solaresSideCollapsed";

function toCount(data) {
  return Array.isArray(data) ? data.length : 0;
}

function handleLogout() {
  clearAuthToken();
  window.location.href = "/login";
}

export default function Dashboard({ theme = "light", onToggleTheme }) {
  const [tab, setTab] = useState("overview");
  const [now, setNow] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1"
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [, setSummary] = useState({
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

  useEffect(() => {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const dateLabel = useMemo(
    () =>
      now.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric"
      }),
    [now]
  );

  const timeLabel = useMemo(
    () =>
      now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }),
    [now]
  );

  const visibleTabs = useMemo(() => {
    const allowedKeys = normalizeModules(user.permissions, ["calendar"]);
    if (isAdminRole(user.role)) return TAB_CONFIG;
    return TAB_CONFIG.filter(
      (item) =>
        item.key === "overview" ||
        (item.accessKeys || [item.key]).some((key) => allowedKeys.includes(key))
    );
  }, [user.permissions, user.role]);

  const activeTab = useMemo(
    () => visibleTabs.find((item) => item.key === tab) || visibleTabs[0] || TAB_CONFIG[0],
    [tab, visibleTabs]
  );
  const isDarkTheme = theme === "dark";
  const userInitial = (user.name || "U").slice(0, 1).toUpperCase();

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
      setTab(visibleTabs[0]?.key || "overview");
    }
  }, [tab, visibleTabs]);

  // Global Ctrl/Cmd+K toggles the command palette.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // User menu: click-outside + Esc close.
  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  const selectTab = (key) => {
    setTab(key);
    setSidebarOpen(false);
    setPaletteOpen(false);
  };

  const groupEntries = Object.entries(groupedTabs);
  const shellClass = [
    "hx-shell",
    "page-animate",
    collapsed ? "hx-side-collapsed" : "",
    sidebarOpen ? "hx-drawer-open" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      {sidebarOpen && <div className="hx-drawer-scrim" onClick={() => setSidebarOpen(false)} />}

      <aside className="hx-side">
        <div className="hx-side-head">
          <div className="hx-brand">
            <img src={solaresLogo} alt="Solares" className="hx-brand-logo" />
            <span className="hx-brand-lockup" aria-label="Solares Energy Solution">
              <strong>SOLARES</strong>
              <small>Helios Console</small>
            </span>
          </div>
          <button
            type="button"
            className="hx-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m14 6-6 6 6 6" />
            </svg>
          </button>
        </div>

        <div className="hx-side-scroll">
          {groupEntries.map(([groupName, items]) => (
            <div className="hx-nav-group" key={groupName} role="group" aria-label={groupName}>
              <p className="hx-nav-label">{groupName}</p>
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`hx-nav-item${tab === item.key ? " active" : ""}`}
                  aria-current={tab === item.key ? "page" : undefined}
                  onClick={() => selectTab(item.key)}
                >
                  <SidebarIcon icon={item.icon} />
                  <span className="hx-nav-text">{item.label}</span>
                  <span className="hx-flyout" role="tooltip">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="hx-side-foot">
          <button
            className="hx-theme"
            type="button"
            role="switch"
            aria-checked={isDarkTheme}
            aria-label={`Switch to ${isDarkTheme ? "light" : "dark"} mode`}
            onClick={onToggleTheme}
          >
            <span className="hx-theme-copy">
              <span>{isDarkTheme ? "Night ops" : "Daylight"}</span>
              <small>{isDarkTheme ? "Dark stage" : "Light stage"}</small>
            </span>
            <span className="hx-theme-track" aria-hidden="true">
              <span className="hx-theme-thumb" />
            </span>
          </button>

          <div className="hx-user">
            <div className="hx-avatar">{userInitial}</div>
            <div className="hx-user-meta">
              <strong>{user.name || "User"}</strong>
              <small>{user.roleLabel || roleLabel(user.role)}</small>
            </div>
          </div>

          <button className="hx-logout" onClick={handleLogout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="hx-main">
        <header className="hx-top">
          <div className="hx-top-left">
            <button
              className="hx-burger"
              type="button"
              aria-label="Toggle menu"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <span /><span /><span />
            </button>
            <div className="hx-module" aria-label="Current module">
              <span className="hx-module-group">{activeTab.group}</span>
              <strong className="hx-module-title">{activeTab.label}</strong>
            </div>
          </div>

          <div className="hx-top-right">
            <button
              type="button"
              className="hx-search"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search modules (Ctrl+K)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.6-3.6" />
              </svg>
              <span className="hx-search-label">Search…</span>
              <kbd className="kbd">Ctrl K</kbd>
            </button>

            <div className="hx-clock" aria-hidden="true">
              <span className="hx-clock-time">
                <span className="hx-clock-dot" />
                {timeLabel}
              </span>
              <span className="hx-clock-date">{dateLabel}</span>
            </div>

            <div className="hx-usermenu" ref={userMenuRef}>
              <button
                type="button"
                className="hx-usermenu-btn"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="User menu"
                onClick={() => setUserMenuOpen((open) => !open)}
              >
                {userInitial}
              </button>
              {userMenuOpen && (
                <div className="hx-usermenu-pop" role="menu" aria-label="User menu">
                  <div className="hx-usermenu-id">
                    <strong>{user.name || "User"}</strong>
                    <span className="hx-usermenu-role">{user.roleLabel || roleLabel(user.role)}</span>
                    <span className="hx-usermenu-name">{user.username || user.email || "Authenticated user"}</span>
                  </div>
                  <div className="hx-usermenu-divider" aria-hidden="true" />
                  <button type="button" className="hx-usermenu-logout" role="menuitem" onClick={handleLogout}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="hx-stage">
          <section
            className={
              tab === "overview"
                ? "workspace-panel workspace-panel-plain"
                : `workspace-panel${tab === "crm" ? " workspace-panel-fill" : ""}`
            }
          >
            {tab === "overview" && <OverviewTab currentUser={user} theme={theme} />}
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
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={visibleTabs}
        onSelect={selectTab}
      />
    </div>
  );
}
