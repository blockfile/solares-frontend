const SUPPLIER_TEXT_COLORS = [
  "#0f6b78",
  "#9b2f56",
  "#2f6f3e",
  "#7a4b00",
  "#5b4bb2",
  "#b04712",
  "#1f5f9e",
  "#7a356d",
  "#4d6f00",
  "#8b3f1f",
  "#15615b",
  "#6f4a9e"
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
