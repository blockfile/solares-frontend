export default function SidebarIcon({ icon }) {
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
    case "overview":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" rx="1.8" />
          <rect x="13" y="4" width="7" height="7" rx="1.8" />
          <rect x="4" y="13" width="7" height="7" rx="1.8" />
          <rect x="13" y="13" width="7" height="7" rx="1.8" />
        </svg>
      );
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
