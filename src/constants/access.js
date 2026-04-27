export const MODULE_DEFINITIONS = [
  {
    key: "calendar",
    label: "Calendar",
    description: "View and manage calendar events."
  },
  {
    key: "quotes",
    label: "Quotes",
    description: "Create and export customer quotations."
  },
  {
    key: "templates",
    label: "Template Manager",
    description: "Maintain costing templates and items."
  },
  {
    key: "materials",
    label: "Material Prices",
    description: "Manage the material catalog and pricing."
  },
  {
    key: "packages",
    label: "Package Prices",
    description: "Manage package price presets."
  },
  {
    key: "margins",
    label: "Margin Setup",
    description: "Manage reusable pricing margin templates."
  },
  {
    key: "users",
    label: "Users",
    description: "Create users and assign roles."
  },
  {
    key: "roles",
    label: "Roles",
    description: "Create and edit role permissions."
  },
  {
    key: "audit",
    label: "Audit",
    description: "Review activity logs and history."
  }
];

export const SYSTEM_ROLE_KEYS = {
  ADMIN: "admin",
  FIELD_WORK: "field_work"
};

const MODULE_KEY_SET = new Set(MODULE_DEFINITIONS.map((definition) => definition.key));

export function normalizeRoleKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || SYSTEM_ROLE_KEYS.FIELD_WORK;
}

export function normalizeModules(value, fallback = []) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = source
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(source)) {
    source = Array.isArray(fallback) ? fallback : [];
  }

  const seen = new Set();
  const modules = [];
  for (const item of source) {
    const key = String(item || "").trim().toLowerCase();
    if (!MODULE_KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    modules.push(key);
  }
  return modules;
}

export function roleLabel(roleKey, explicitLabel = "") {
  const named = String(explicitLabel || "").trim();
  if (named) return named;

  const key = normalizeRoleKey(roleKey);
  if (key === SYSTEM_ROLE_KEYS.ADMIN) return "Admin";
  if (key === SYSTEM_ROLE_KEYS.FIELD_WORK) return "Field Work";

  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isAdminRole(value) {
  return normalizeRoleKey(value) === SYSTEM_ROLE_KEYS.ADMIN;
}

export function getRoleBadgeClass(roleKey) {
  const normalized = normalizeRoleKey(roleKey);
  if (normalized === SYSTEM_ROLE_KEYS.ADMIN) return "role-pill-admin";
  if (normalized === SYSTEM_ROLE_KEYS.FIELD_WORK) return "role-pill-field_work";
  return "role-pill-generic";
}
