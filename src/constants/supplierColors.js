/* HELIOS supplier identity hues — mid-lightness so they read on both the
   porcelain (light) and obsidian (dark) stages. Hash-assigned, stable. */
const SUPPLIER_TEXT_COLORS = [
  "#ea580c",
  "#0891b2",
  "#7c3aed",
  "#16a34a",
  "#2563eb",
  "#db2777",
  "#0d9488",
  "#b45309",
  "#4f46e5",
  "#4d7c0f",
  "#a21caf",
  "#0369a1"
];

function hashText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split("")
    .reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

export function getSupplierTextColor(supplierName) {
  const name = String(supplierName || "").trim();
  if (!name) return null;
  const index = Math.abs(hashText(name)) % SUPPLIER_TEXT_COLORS.length;
  return SUPPLIER_TEXT_COLORS[index];
}

export function getSupplierTextStyle(supplierName) {
  const color = getSupplierTextColor(supplierName);
  return color ? { color } : undefined;
}
