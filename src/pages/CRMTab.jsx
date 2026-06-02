import { useEffect, useMemo, useState } from "react";
import { isAdminRole } from "../constants/access";
import QuotesTab from "./QuotesTab";
import SalesTab from "./SalesTab";

function IconUsers() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 20v-1.2a3.8 3.8 0 0 0-3.8-3.8H7.8A3.8 3.8 0 0 0 4 18.8V20" />
      <circle cx="10.2" cy="8" r="3.2" />
      <path d="M19.5 20v-1a3 3 0 0 0-2.2-2.9" />
      <path d="M15.7 5.1a3.1 3.1 0 0 1 0 5.9" />
    </svg>
  );
}

function IconQuote() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4.5h8l3 3V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z" />
      <path d="M15 4.5V8h3" />
      <path d="M8.5 12h7" />
      <path d="M8.5 16h4.5" />
    </svg>
  );
}

export default function CRMTab({ currentUser }) {
  const permissions = useMemo(() => new Set(currentUser?.permissions || []), [currentUser?.permissions]);
  const isAdmin = isAdminRole(currentUser?.role);
  const canManageClients = isAdmin || permissions.has("crm");
  const canUseQuotations = canManageClients || permissions.has("quotes");
  const [view, setView] = useState(canManageClients ? "clients" : "quotations");

  useEffect(() => {
    if (!canManageClients && view === "clients") setView("quotations");
    if (!canUseQuotations && view === "quotations") setView("clients");
  }, [canManageClients, canUseQuotations, view]);

  return (
    <div className="crm-module">
      <div className="bgt-toolbar crm-toolbar">
        <div className="bgt-seg">
          {canManageClients && (
            <button className={`bgt-seg-btn${view === "clients" ? " bgt-seg-btn--on" : ""}`} type="button" onClick={() => setView("clients")}>
              <IconUsers /> Clients & Projects
            </button>
          )}
          {canUseQuotations && (
            <button className={`bgt-seg-btn${view === "quotations" ? " bgt-seg-btn--on" : ""}`} type="button" onClick={() => setView("quotations")}>
              <IconQuote /> Quotations
            </button>
          )}
        </div>
      </div>

      {view === "clients" ? <SalesTab /> : <QuotesTab />}
    </div>
  );
}
