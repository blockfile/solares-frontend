import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import ConfirmModal from "../components/ConfirmModal";
import { getSupplierTextStyle } from "../constants/supplierColors";

const CATEGORY_DEFS = [
  { key: "main_system", label: "A. Main System Components" },
  { key: "dc_pv", label: "B. DC Protection / PV Side" },
  { key: "ac_distribution", label: "C. AC Protection / Distribution" },
  { key: "mounting_structural", label: "D. Mounting / Structural" },
  { key: "cabling_conduits", label: "E. Cabling / Conduits" },
  { key: "grounding", label: "F. Grounding System" },
  { key: "consumables", label: "G. Termination / Consumables" }
];

const VALID_SECTION_KEYS = new Set(CATEGORY_DEFS.map((def) => def.key));
const TEMPLATE_VAT_RATE = 0.12;
const TEMPLATE_VAT_LABEL = `${Math.round(TEMPLATE_VAT_RATE * 100)}% VAT Included`;
const TEMPLATE_BRAND_STYLES = {
  DEYE: { color: "#1f5f9e", fontWeight: 700 },
  SOLIS: { color: "#b04712", fontWeight: 700 },
  GROWATT: { color: "#2f6f3e", fontWeight: 700 }
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toVatInclusivePrice(value) {
  const base = Math.max(0, toNumber(value, 0));
  return base * (1 + TEMPLATE_VAT_RATE);
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function parseKW(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*kw/i);
  return match ? Number(match[1]) : null;
}

function parseAh(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*ah/i);
  return match ? Number(match[1]) : null;
}

function parseWatt(text) {
  const match = String(text || "").match(/(\d{3,4})\s*w/i);
  return match ? Number(match[1]) : null;
}

function parseTemplateBatteryAh(name) {
  const match = String(name || "").match(/(\d+(?:\.\d+)?)\s*ah/i);
  return match ? Number(match[1]) : null;
}

function getTemplateBundleFilename(name) {
  const batteryAh = parseTemplateBatteryAh(name);
  if (batteryAh != null) return `${batteryAh}Ah-packages-all-tabs.xlsx`;
  return `${stripTemplateBatteryVariant(name)}-all-tabs.xlsx`;
}

function stripTemplateBatteryVariant(name) {
  const cleaned = String(name || "")
    .replace(/[-/,\s]*\(?\d+(?:\.\d+)?\s*ah(?:\s*battery)?\)?/gi, " ")
    .replace(/\bno battery\b/gi, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || String(name || "template").trim() || "template";
}

function getTemplateGroupLabel(name) {
  const text = normalizeText(name);
  const batteryAh = parseTemplateBatteryAh(name);

  if (text.includes("hybrid")) {
    if (batteryAh != null) return `Hybrid - ${batteryAh}Ah`;
    return "Hybrid - No Battery";
  }

  if (text.includes("grid tie") || text.includes("grid-tie") || text.includes("grid tied")) {
    return "Grid Tie";
  }

  if (batteryAh != null) return `Other - ${batteryAh}Ah`;
  return "Other";
}

function inferTemplateBrand(name) {
  const text = normalizeText(name);
  if (text.includes("deye")) return "DEYE";
  if (text.includes("solis")) return "SOLIS";
  if (text.includes("growatt")) return "GROWATT";
  return "OTHER";
}

function getTemplateBrandOrder(brand) {
  if (brand === "DEYE") return 0;
  if (brand === "SOLIS") return 1;
  if (brand === "GROWATT") return 2;
  return 9;
}

function getTemplateBrandStyle(brand) {
  return TEMPLATE_BRAND_STYLES[String(brand || "").toUpperCase()] || undefined;
}

function getTemplateSystemRank(name) {
  const text = normalizeText(name);
  if (text.includes("hybrid")) return 0;
  if (text.includes("grid tie") || text.includes("grid-tie") || text.includes("grid tied")) return 1;
  return 2;
}

function compareTemplatesBySize(a, b) {
  const systemRankDiff = getTemplateSystemRank(a.name) - getTemplateSystemRank(b.name);
  if (systemRankDiff !== 0) return systemRankDiff;

  const kwA = parseKW(a.name);
  const kwB = parseKW(b.name);
  if (kwA != null || kwB != null) {
    if (kwA == null) return 1;
    if (kwB == null) return -1;
    if (kwA !== kwB) return kwA - kwB;
  }

  const ahA = parseTemplateBatteryAh(a.name);
  const ahB = parseTemplateBatteryAh(b.name);
  if (ahA != null || ahB != null) {
    if (ahA == null) return 1;
    if (ahB == null) return -1;
    if (ahA !== ahB) return ahA - ahB;
  }

  return String(a.name || "").localeCompare(String(b.name || ""));
}

function inferMaterialBrand(material) {
  const text = normalizeText(`${material?.material_name || ""} ${material?.source_section || ""}`);
  if (text.includes("deye") || /\bsun-\d/i.test(material?.material_name || "")) return "DEYE";
  if (text.includes("solis") || /\bs[56]-[a-z0-9-]+/i.test(material?.material_name || "")) return "SOLIS";
  if (text.includes("snre") || /\bsr-[a-z0-9-]+/i.test(material?.material_name || "")) return "SNRE";
  if (text.includes("menred") || text.includes("mendred")) return "MENRED";
  if (text.includes("feeo")) return "FEEO";
  if (text.includes("taixi")) return "TAIXI";
  if (text.includes("sunree")) return "SUNREE";
  return null;
}

function inferMaterialFamily(material) {
  const subgroup = normalizeText(material?.subgroup);
  const text = normalizeText(`${material?.material_name || ""} ${material?.source_section || ""}`);

  if (subgroup) return subgroup;
  if (text.includes("battery")) return "battery";
  if (text.includes("inverter")) return "inverter";
  if (text.includes("panel")) return "panel";
  if (text.includes("mccb")) return "mccb";
  if (text.includes("mcb")) return "mcb";
  if (text.includes("spd")) return "spd";
  if (text.includes("ats") || text.includes("mts")) return "ats_mts";
  if (text.includes("enclosure") || text.includes("junction box")) return "enclosure";
  if (text.includes("cable") || text.includes("wire")) return "cable";
  if (text.includes("rail") || text.includes("clamp")) return "mounting";
  if (text.includes("mc4") || text.includes("connector")) return "connector";
  return "other";
}

function shouldHideMaterial(material) {
  const text = normalizeText(`${material?.material_name || ""} ${material?.source_section || ""}`);
  if (text.includes("street light") || text.includes("streetlight")) return true;
  return false;
}

function getMaterialGroupLabel(material) {
  const family = inferMaterialFamily(material);
  const brand = inferMaterialBrand(material);

  if (family === "inverter") {
    const kw = parseKW(material?.material_name || "");
    if (kw != null) return `INVERTER - ${kw}KW`;
    return brand ? `INVERTER - ${brand}` : "INVERTER";
  }

  if (family === "battery") {
    const ah = parseAh(material?.material_name || "");
    if (brand && ah != null) return `BATTERY - ${brand} - ${ah}AH`;
    if (brand) return `BATTERY - ${brand}`;
    if (ah != null) return `BATTERY - ${ah}AH`;
    return "BATTERY";
  }

  if (family === "panel") {
    const watt = parseWatt(material?.material_name || "");
    return watt != null ? `SOLAR PANEL - ${watt}W` : "SOLAR PANEL";
  }

  if (family === "mcb") return brand ? `MCB - ${brand}` : "MCB";
  if (family === "mccb") return brand ? `MCCB - ${brand}` : "MCCB";
  if (family === "spd") return brand ? `SPD - ${brand}` : "SPD";
  if (family === "ats_mts") return brand ? `ATS/MTS - ${brand}` : "ATS/MTS";
  if (family === "protection") return brand ? `PROTECTION - ${brand}` : "PROTECTION";
  if (family === "enclosure") return "ENCLOSURE";
  if (family === "mounting") return "MOUNTING";
  if (family === "connector") return "CONNECTOR";
  if (family === "cable") return "CABLE / WIRE";

  return String(material?.source_section || material?.category || "OTHER").toUpperCase();
}

function sortMaterialsInGroup(a, b) {
  const kwA = parseKW(a.material_name);
  const kwB = parseKW(b.material_name);
  if (kwA != null && kwB != null && kwA !== kwB) return kwA - kwB;

  const ahA = parseAh(a.material_name);
  const ahB = parseAh(b.material_name);
  if (ahA != null && ahB != null && ahA !== ahB) return ahA - ahB;

  const wattA = parseWatt(a.material_name);
  const wattB = parseWatt(b.material_name);
  if (wattA != null && wattB != null && wattA !== wattB) return wattA - wattB;

  return String(a.material_name || "").localeCompare(String(b.material_name || ""));
}

function getMaterialSupplierName(material) {
  const supplier = String(material?.active_supplier_name || "").trim();
  return supplier || "Manual catalog";
}

function buildMaterialGroups(source) {
  const grouped = new Map();
  for (const material of source) {
    const supplierName = getMaterialSupplierName(material);
    const groupLabel = getMaterialGroupLabel(material);
    const groupKey = `${supplierName}||${groupLabel}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        supplierName,
        groupLabel,
        options: []
      });
    }
    grouped.get(groupKey).options.push(material);
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      const supplierOrderA =
        String(a.supplierName || "").toLowerCase() === "manual catalog"
          ? "zzz-manual catalog"
          : String(a.supplierName || "").toLowerCase();
      const supplierOrderB =
        String(b.supplierName || "").toLowerCase() === "manual catalog"
          ? "zzz-manual catalog"
          : String(b.supplierName || "").toLowerCase();
      const supplierDiff = supplierOrderA.localeCompare(supplierOrderB);
      if (supplierDiff !== 0) return supplierDiff;
      return String(a.groupLabel || "").localeCompare(String(b.groupLabel || ""));
    })
    .map((group) => ({
      label: `${group.supplierName} • ${group.groupLabel}`,
      options: [...group.options].sort(sortMaterialsInGroup)
    }));
}

function resolveSectionKey(sectionKey, description, subgroup, category) {
  const direct = String(sectionKey || "").trim().toLowerCase();
  if (VALID_SECTION_KEYS.has(direct)) return direct;

  const text = normalizeText(description);
  const sg = normalizeText(subgroup);
  const coarse = normalizeText(category);

  if (sg === "inverter" || sg === "panel" || sg === "battery") return "main_system";
  if (sg === "mounting") return "mounting_structural";
  if (sg === "mcb" || sg === "mccb" || sg === "spd" || sg === "ats_mts" || sg === "protection") {
    if (text.includes("ac ") || text.includes(" ac") || text.includes("ats") || text.includes("breaker box")) {
      return "ac_distribution";
    }
    return "dc_pv";
  }
  if (text.includes("junction box") || text.includes("pv cable tray") || text.includes("cable gland")) {
    return "dc_pv";
  }
  if (text.includes("grounding") || text.includes("ground wire") || text.includes("grounding rod")) {
    return "grounding";
  }
  if (sg === "cable" || sg === "cable_support" || sg === "connector") {
    if (text.includes("ground")) return "grounding";
    if (text.includes("mc4")) return "mounting_structural";
    return "cabling_conduits";
  }
  if (
    text.includes("ferrules") ||
    text.includes("shrink tube") ||
    text.includes("copper pin") ||
    text.includes("cable tie") ||
    text.includes("stainless")
  ) {
    return "consumables";
  }
  if (coarse === "mounting") return "mounting_structural";
  if (coarse === "pv") return "cabling_conduits";
  if (coarse === "battery_ac") return "ac_distribution";
  return "consumables";
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function buildEmptyItemForm() {
  return {
    itemNo: "",
    catalogMaterialId: "",
    description: "",
    unit: "",
    qty: "1",
    basePrice: "0"
  };
}

function SearchableSelect({
  groups,
  selectedOption,
  onSelectOption,
  getOptionLabel,
  getOptionKey,
  getOptionSearchText,
  getOptionStyle,
  placeholder = "Select option",
  searchPlaceholder = "Search inside dropdown...",
  emptyMessage = "No options found.",
  allowClear = false,
  clearLabel = "Clear selection",
  showGroupLabels = true
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const resolveOptionKey = (option) => {
    if (typeof getOptionKey === "function") return String(getOptionKey(option));
    if (option && typeof option === "object") {
      if (option.id != null) return String(option.id);
      if (option.value != null) return String(option.value);
    }
    return String(getOptionLabel(option));
  };

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current || rootRef.current.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  const filteredGroups = useMemo(() => {
    const q = normalizeText(query).trim();
    if (!q) return groups;

    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          normalizeText(
            `${getOptionLabel(option)} ${getOptionSearchText ? getOptionSearchText(option) : ""}`
          ).includes(q)
        )
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, query, getOptionLabel, getOptionSearchText]);

  const selectedKey = selectedOption ? resolveOptionKey(selectedOption) : "";
  const selectedLabel = selectedOption ? getOptionLabel(selectedOption) : placeholder;
  const selectedStyle = selectedOption ? getOptionStyle?.(selectedOption) : undefined;
  const hasAnyOption = filteredGroups.some((group) => group.options.length > 0);
  const showClear = allowClear && (!query.trim() || normalizeText(clearLabel).includes(normalizeText(query).trim()));

  return (
    <div className={`searchable-picker${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="searchable-picker-trigger"
        onClick={() => {
          setOpen((prev) => !prev);
          if (open) setQuery("");
        }}
        style={selectedStyle}
      >
        <span>{selectedLabel}</span>
        <svg
          className="searchable-picker-caret"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 7.5 10 12.5 15 7.5" />
        </svg>
      </button>

      {open && (
        <div className="searchable-picker-menu">
          <input
            className="input searchable-picker-input"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            autoFocus
          />

          <div className="searchable-picker-options">
            {showClear && (
              <button
                type="button"
                className={`searchable-picker-option searchable-picker-clear${!selectedOption ? " selected" : ""}`}
                onClick={() => {
                  onSelectOption(null);
                  setOpen(false);
                }}
              >
                {clearLabel}
              </button>
            )}
            {hasAnyOption ? (
              filteredGroups.map((group) => (
                <div className="searchable-picker-group" key={group.key || group.label}>
                  {showGroupLabels && (
                    <div className="searchable-picker-group-label" style={group.style}>
                      {group.label}
                    </div>
                  )}
                  {group.options.map((option) => {
                    const optionKey = resolveOptionKey(option);
                    const isSelected = selectedKey !== "" && selectedKey === optionKey;
                    return (
                      <button
                        type="button"
                        className={`searchable-picker-option${isSelected ? " selected" : ""}`}
                        key={optionKey}
                        style={getOptionStyle?.(option)}
                        onClick={() => {
                          onSelectOption(option);
                          setOpen(false);
                        }}
                      >
                        {getOptionLabel(option)}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="searchable-picker-empty">{emptyMessage}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableMaterialPicker({
  groups,
  selectedMaterial,
  onSelectMaterial,
  getOptionLabel,
  getOptionStyle,
  placeholder = "Pick From Materials Database"
}) {
  return (
    <SearchableSelect
      groups={groups}
      selectedOption={selectedMaterial}
      onSelectOption={onSelectMaterial}
      getOptionLabel={getOptionLabel}
      getOptionSearchText={(material) =>
        `${material.material_name || ""} ${material.source_section || ""} ${material.subgroup || ""} ${
          material.category || ""
        } ${material.active_supplier_name || ""}`
      }
      getOptionStyle={getOptionStyle}
      placeholder={placeholder}
      searchPlaceholder="Search materials inside dropdown..."
      emptyMessage="No materials found."
    />
  );
}

export default function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [items, setItems] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");

  const [newTemplateName, setNewTemplateName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [duplicatingTemplate, setDuplicatingTemplate] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [exportingTemplate, setExportingTemplate] = useState(false);
  const [exportingAllTemplates, setExportingAllTemplates] = useState(false);
  const [templateExportVatMode, setTemplateExportVatMode] = useState("incl");
  const [duplicateTemplateName, setDuplicateTemplateName] = useState("");

  const [newItem, setNewItem] = useState(buildEmptyItemForm());
  const [newItemSupplierFilter, setNewItemSupplierFilter] = useState("all");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editItem, setEditItem] = useState(buildEmptyItemForm());
  const [editItemSupplierFilter, setEditItemSupplierFilter] = useState("all");
  const [activeSectionKey, setActiveSectionKey] = useState(CATEGORY_DEFS[0].key);
  const [confirmModal, setConfirmModal] = useState(null);
  const [modalBusy, setModalBusy] = useState(false);

  const loadTemplates = async (nextTemplateId = null) => {
    setLoadingTemplates(true);
    setError("");
    try {
      const res = await api.get("/templates?includeAll=1");
      const rows = Array.isArray(res.data) ? res.data : [];
      setTemplates(rows);

      const preferredId = nextTemplateId == null ? templateId : String(nextTemplateId);
      const stillExists = rows.some((row) => String(row.id) === String(preferredId));
      if (preferredId && stillExists) {
        setTemplateId(String(preferredId));
      } else if (!rows.length) {
        setTemplateId("");
      }
    } catch (err) {
      setTemplates([]);
      setError(err?.response?.data?.message || "Failed to load templates");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadMaterials = async () => {
    try {
      const res = await api.get("/materials");
      setMaterials(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setMaterials([]);
      setError(err?.response?.data?.message || "Failed to load materials");
    }
  };

  const loadItems = async (selectedTemplateId) => {
    if (!selectedTemplateId) {
      setItems([]);
      return;
    }

    setLoadingItems(true);
    setError("");
    try {
      const res = await api.get(`/templates/${selectedTemplateId}/items`);
      const rows = (Array.isArray(res.data) ? res.data : []).map((row) => ({
        ...row,
        section_key: resolveSectionKey(
          row.section_key,
          row.description,
          row.catalog_subgroup,
          row.catalog_category
        ),
        catalog_material_id: Number(row.catalog_material_id || 0) || null,
        catalog_base_price: Number(row.base_price || 0),
        base_price:
          row.original_base_price != null
            ? Number(row.original_base_price || 0)
            : Number(row.base_price || 0)
      }));
      setItems(rows);
    } catch (err) {
      setItems([]);
      setError(err?.response?.data?.message || "Failed to load template items");
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    // Initial management data load.
    loadTemplates();
    loadMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const selected = templates.find((row) => String(row.id) === String(templateId));
    setTemplateName(selected?.name || "");
  }, [templates, templateId]);

  useEffect(() => {
    setEditingItemId(null);
    setEditItem(buildEmptyItemForm());
    setEditItemSupplierFilter("all");
    setActiveSectionKey(CATEGORY_DEFS[0].key);
    loadItems(templateId);
  }, [templateId]);

  const selectedTemplate = useMemo(
    () => templates.find((row) => String(row.id) === String(templateId)) || null,
    [templates, templateId]
  );

  const templatePickerGroups = useMemo(() => {
    const groups = new Map();

    for (const row of templates) {
      const brand = inferTemplateBrand(row.name);
      const sectionLabel = getTemplateGroupLabel(row.name);
      const groupKey = `${brand}||${sectionLabel}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          brand,
          sectionLabel,
          options: []
        });
      }
      groups.get(groupKey).options.push(row);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        label: `${group.brand} - ${group.sectionLabel}`,
        options: [...group.options].sort(compareTemplatesBySize),
        style: getTemplateBrandStyle(group.brand)
      }))
      .sort((a, b) => {
        const brandDiff = getTemplateBrandOrder(a.brand) - getTemplateBrandOrder(b.brand);
        if (brandDiff !== 0) return brandDiff;

        const systemDiff =
          getTemplateSystemRank(a.options[0]?.name || "") - getTemplateSystemRank(b.options[0]?.name || "");
        if (systemDiff !== 0) return systemDiff;

        const ahA = parseTemplateBatteryAh(a.options[0]?.name || "");
        const ahB = parseTemplateBatteryAh(b.options[0]?.name || "");
        if (ahA != null || ahB != null) {
          if (ahA == null) return 1;
          if (ahB == null) return -1;
          if (ahA !== ahB) return ahA - ahB;
        }

        return String(a.label || "").localeCompare(String(b.label || ""));
      });
  }, [templates]);

  const templateVatModeOptions = useMemo(
    () => [
      { value: "incl", label: "With VAT (12%)" },
      { value: "excl", label: "Without VAT" }
    ],
    []
  );
  const selectedTemplateVatModeOption = useMemo(
    () => templateVatModeOptions.find((option) => option.value === templateExportVatMode) || null,
    [templateVatModeOptions, templateExportVatMode]
  );

  const steps = useMemo(
    () =>
      CATEGORY_DEFS.map((def) => ({
        ...def,
        items: items.filter((row) => String(row.section_key || "") === def.key)
      })),
    [items]
  );

  const activeStep = useMemo(
    () => steps.find((step) => step.key === activeSectionKey) || steps[0] || null,
    [steps, activeSectionKey]
  );

  const visibleMaterials = useMemo(
    () => materials.filter((material) => !shouldHideMaterial(material)),
    [materials]
  );

  const filterMaterialsBySupplier = (source, supplierFilter = "all") => {
    const scopedSource =
      supplierFilter && supplierFilter !== "all"
        ? source.filter((material) => getMaterialSupplierName(material) === supplierFilter)
        : source;
    return scopedSource;
  };

  const getFilenameFromDisposition = (contentDisposition, fallback) => {
    const text = String(contentDisposition || "");
    const match = text.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
    if (!match) return fallback;
    try {
      return decodeURIComponent(match[1].replace(/"/g, ""));
    } catch {
      return match[1].replace(/"/g, "");
    }
  };

  const filteredCreateMaterials = useMemo(
    () => filterMaterialsBySupplier(visibleMaterials, newItemSupplierFilter),
    [visibleMaterials, newItemSupplierFilter]
  );

  const filteredEditMaterials = useMemo(
    () => filterMaterialsBySupplier(visibleMaterials, editItemSupplierFilter),
    [visibleMaterials, editItemSupplierFilter]
  );

  const createMatchCount = filteredCreateMaterials.length;
  const editMatchCount = filteredEditMaterials.length;

  const supplierFilterOptions = useMemo(() => {
    const suppliers = new Set(visibleMaterials.map((material) => getMaterialSupplierName(material)));
    return Array.from(suppliers).sort((a, b) => {
      const left = String(a || "").toLowerCase();
      const right = String(b || "").toLowerCase();
      if (left === "manual catalog") return 1;
      if (right === "manual catalog") return -1;
      return left.localeCompare(right);
    });
  }, [visibleMaterials]);

  const supplierPickerGroups = useMemo(
    () => [
      {
        key: "supplier-group",
        label: "Suppliers",
        options: [
          { value: "all", label: "All suppliers" },
          ...supplierFilterOptions.map((supplier) => ({
            value: supplier,
            label: supplier
          }))
        ]
      }
    ],
    [supplierFilterOptions]
  );

  const selectedNewSupplierOption = useMemo(
    () =>
      supplierPickerGroups[0]?.options.find((option) => option.value === newItemSupplierFilter) ||
      supplierPickerGroups[0]?.options[0] ||
      null,
    [supplierPickerGroups, newItemSupplierFilter]
  );

  const selectedEditSupplierOption = useMemo(
    () =>
      supplierPickerGroups[0]?.options.find((option) => option.value === editItemSupplierFilter) ||
      supplierPickerGroups[0]?.options[0] ||
      null,
    [supplierPickerGroups, editItemSupplierFilter]
  );

  const sectionPickerGroups = useMemo(
    () => [
      {
        key: "section-group",
        label: "Template Sections",
        options: CATEGORY_DEFS.map((def) => ({ value: def.key, label: def.label }))
      }
    ],
    []
  );

  const selectedSectionOption = useMemo(
    () =>
      sectionPickerGroups[0]?.options.find((option) => option.value === editItem.sectionKey) ||
      sectionPickerGroups[0]?.options[0] ||
      null,
    [sectionPickerGroups, editItem.sectionKey]
  );

  const materialsById = useMemo(() => {
    const map = new Map();
    for (const row of materials) {
      map.set(Number(row.id), row);
    }
    return map;
  }, [materials]);

  const createMaterialGroups = useMemo(
    () => buildMaterialGroups(filteredCreateMaterials),
    [filteredCreateMaterials]
  );

  const selectedCreateMaterial = useMemo(
    () => materials.find((row) => Number(row.id) === Number(newItem.catalogMaterialId || 0)) || null,
    [materials, newItem.catalogMaterialId]
  );

  const selectedEditMaterial = useMemo(
    () => materials.find((row) => Number(row.id) === Number(editItem.catalogMaterialId || 0)) || null,
    [materials, editItem.catalogMaterialId]
  );

  const templateOptionLabel = (template) =>
    `${template.name} (${template.item_count || 0} item${Number(template.item_count || 0) === 1 ? "" : "s"})`;

  const templateOptionSearchText = (template) =>
    `${template.name || ""} ${inferTemplateBrand(template.name)} ${getTemplateGroupLabel(template.name)}`;

  const templateOptionStyle = (template) => getTemplateBrandStyle(inferTemplateBrand(template.name));

  const materialOptionLabel = (material) =>
    `${material.material_name} | Base ${formatMoney(material.base_price || 0)} -> VAT Incl. ${formatMoney(
      toVatInclusivePrice(material.base_price || 0)
    )}${material.unit ? ` / ${material.unit}` : ""} | Supplier: ${
      String(material.active_supplier_name || "").trim() || "Manual catalog"
    }${
      material.source_section ? ` | ${material.source_section}` : ""
    }`;

  const resolveVatInclusivePayloadPrice = (catalogMaterialId, enteredPrice) => {
    const material = materialsById.get(Number(catalogMaterialId || 0));
    if (!material) return Math.max(0, toNumber(enteredPrice, 0));
    return toVatInclusivePrice(material.base_price || 0);
  };

  const resolveRowPriceReference = (row) => {
    const catalogMaterial = materialsById.get(Number(row.catalog_material_id || 0));
    if (catalogMaterial) {
      const base = Number(catalogMaterial.base_price || 0);
      return {
        fromCatalog: true,
        basePrice: base,
        vatInclusivePrice: toVatInclusivePrice(base)
      };
    }

    const fallbackBase = Number(row.catalog_base_price || row.base_price || 0);
    return {
      fromCatalog: false,
      basePrice: fallbackBase,
      vatInclusivePrice: toVatInclusivePrice(fallbackBase)
    };
  };

  const applyMaterialToForm = (material, prev = {}) => ({
    ...prev,
    catalogMaterialId: String(material?.id || ""),
    description: String(material?.material_name || ""),
    unit: String(material?.unit || ""),
    basePrice: String(toVatInclusivePrice(material?.base_price ?? 0))
  });

  const vatReferenceLabel = (material) =>
    material
      ? `Base: ${formatMoney(material.base_price || 0)} | VAT incl. (used): ${formatMoney(
          toVatInclusivePrice(material.base_price || 0)
        )}`
      : "Base price is manual.";

  const editMaterialGroups = useMemo(
    () => buildMaterialGroups(filteredEditMaterials),
    [filteredEditMaterials]
  );

  const createTemplate = async () => {
    if (!newTemplateName.trim()) return;

    setSavingTemplate(true);
    setError("");
    try {
      const res = await api.post("/templates", {
        name: newTemplateName.trim()
      });
      const createdId = String(res.data?.id || "");
      setNewTemplateName("");
      await loadTemplates(createdId);
      if (createdId) setTemplateId(createdId);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create template");
    } finally {
      setSavingTemplate(false);
    }
  };

  const saveTemplateName = async () => {
    if (!templateId || !templateName.trim()) return;

    setSavingTemplate(true);
    setError("");
    try {
      await api.put(`/templates/${templateId}`, {
        name: templateName.trim()
      });
      await loadTemplates(templateId);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update template");
    } finally {
      setSavingTemplate(false);
    }
  };

  const duplicateTemplate = async () => {
    if (!templateId || !duplicateTemplateName.trim()) return;

    setDuplicatingTemplate(true);
    setError("");
    try {
      const res = await api.post(`/templates/${templateId}/duplicate`, {
        name: duplicateTemplateName.trim()
      });
      const createdId = String(res.data?.id || "");
      setConfirmModal(null);
      setDuplicateTemplateName("");
      await loadTemplates(createdId);
      if (createdId) setTemplateId(createdId);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to duplicate template");
    } finally {
      setDuplicatingTemplate(false);
    }
  };

  const exportTemplateExcel = async () => {
    if (!templateId) return;

    setExportingTemplate(true);
    setError("");
    try {
      const res = await api.get(`/templates/${templateId}/export/excel`, {
        responseType: "blob",
        params: {
          vatMode: templateExportVatMode
        }
      });

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const filename = getFilenameFromDisposition(
        res.headers["content-disposition"],
        `${selectedTemplate?.name || `template-${templateId}`}-costing.xlsx`
      );

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to export template workbook");
    } finally {
      setExportingTemplate(false);
    }
  };

  const exportAllTemplatesExcel = async () => {
    if (!templateId) return;

    setExportingAllTemplates(true);
    setError("");
    try {
      const res = await api.get(`/templates/${templateId}/export/excel-all`, {
        responseType: "blob",
        params: {
          vatMode: templateExportVatMode
        }
      });

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const filename = getFilenameFromDisposition(
        res.headers["content-disposition"],
        getTemplateBundleFilename(selectedTemplate?.name || `template-${templateId}`)
      );

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to export all related templates");
    } finally {
      setExportingAllTemplates(false);
    }
  };

  const deleteTemplate = async () => {
    if (!templateId || !selectedTemplate) return;
    setDeletingTemplate(true);
    setError("");
    try {
      await api.delete(`/templates/${templateId}`);
      setTemplateId("");
      setItems([]);
      await loadTemplates();
    } catch (err) {
      if (err?.response?.status === 409) {
        setConfirmModal({
          type: "force-delete-template",
          title: "Delete Template And Saved Quotes",
          message:
            "This template already has saved quotes. Deleting it will permanently remove the template, related quote items, saved quotes, and package scenarios.",
          confirmLabel: "Delete Everything",
          tone: "danger"
        });
        return;
      }

      setError(err?.response?.data?.message || "Failed to delete template");
    } finally {
      setDeletingTemplate(false);
    }
  };

  const createItem = async () => {
    if (!templateId || !newItem.description.trim()) return;

    setError("");
    try {
      await api.post(`/templates/${templateId}/items`, {
        itemNo: newItem.itemNo ? Math.max(1, Math.floor(toNumber(newItem.itemNo, 1))) : undefined,
        description: newItem.description.trim(),
        unit: newItem.unit.trim(),
        qty: Math.max(0, toNumber(newItem.qty, 1)),
        basePrice: resolveVatInclusivePayloadPrice(newItem.catalogMaterialId, newItem.basePrice),
        sectionKey: activeSectionKey,
        catalogMaterialId: newItem.catalogMaterialId || null
      });
      setNewItem(buildEmptyItemForm());
      setNewItemSupplierFilter("all");
      await Promise.all([loadItems(templateId), loadTemplates(templateId)]);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create template item");
    }
  };

  const startEditItem = (row) => {
    const selectedMaterial =
      materials.find((entry) => Number(entry.id) === Number(row.catalog_material_id || 0)) || null;
    setEditingItemId(Number(row.id));
    setEditItem({
      itemNo: String(row.item_no ?? ""),
      catalogMaterialId: String(row.catalog_material_id || ""),
      description: String(row.description || ""),
      unit: String(row.unit || ""),
      qty: String(row.qty ?? 0),
      basePrice: String(row.base_price ?? 0),
      sectionKey: String(row.section_key || CATEGORY_DEFS[0].key)
    });
    setEditItemSupplierFilter(selectedMaterial ? getMaterialSupplierName(selectedMaterial) : "all");
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditItem(buildEmptyItemForm());
    setEditItemSupplierFilter("all");
  };

  const saveItem = async (itemId) => {
    if (!templateId || !itemId || !editItem.description.trim()) return;

    setError("");
    try {
      await api.put(`/templates/${templateId}/items/${itemId}`, {
        itemNo: Math.max(1, Math.floor(toNumber(editItem.itemNo, 1))),
        description: editItem.description.trim(),
        unit: editItem.unit.trim(),
        qty: Math.max(0, toNumber(editItem.qty, 0)),
        basePrice: resolveVatInclusivePayloadPrice(editItem.catalogMaterialId, editItem.basePrice),
        sectionKey: editItem.sectionKey,
        catalogMaterialId: editItem.catalogMaterialId || null
      });
      cancelEditItem();
      await loadItems(templateId);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update template item");
    }
  };

  const removeItem = async (itemId) => {
    if (!templateId || !itemId) return;

    setError("");
    try {
      await api.delete(`/templates/${templateId}/items/${itemId}`);
      if (editingItemId === itemId) cancelEditItem();
      await Promise.all([loadItems(templateId), loadTemplates(templateId)]);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete template item");
    }
  };

  const openDeleteTemplateModal = () => {
    if (!templateId || !selectedTemplate) return;
    setConfirmModal({
      type: "delete-template",
      title: "Delete Template",
      message: `Delete template "${selectedTemplate.name}"?`,
      confirmLabel: "Delete Template",
      tone: "danger"
    });
  };

  const openDuplicateTemplateModal = () => {
    if (!templateId || !selectedTemplate) return;
    setDuplicateTemplateName(`${selectedTemplate.name} Copy`);
    setConfirmModal({
      type: "duplicate-template",
      title: "Duplicate Template",
      message: "Create a full copy of this template, including its items and package scenarios.",
      confirmLabel: "Create Copy",
      tone: "default"
    });
  };

  const openDeleteItemModal = (itemId) => {
    setConfirmModal({
      type: "delete-item",
      itemId,
      title: "Delete Template Item",
      message: "Delete this template item from the current section?",
      confirmLabel: "Delete Item",
      tone: "danger"
    });
  };

  const closeConfirmModal = () => {
    if (modalBusy) return;
    setConfirmModal(null);
  };

  const handleConfirmModal = async () => {
    if (!confirmModal) return;

    setModalBusy(true);
    try {
      if (confirmModal.type === "delete-template") {
        setConfirmModal(null);
        await deleteTemplate();
        return;
      }

      if (confirmModal.type === "duplicate-template") {
        await duplicateTemplate();
        return;
      }

      if (confirmModal.type === "force-delete-template") {
        setDeletingTemplate(true);
        setError("");
        try {
          await api.delete(`/templates/${templateId}?force=1`);
          setTemplateId("");
          setItems([]);
          setConfirmModal(null);
          await loadTemplates();
        } catch (err) {
          setError(err?.response?.data?.message || "Failed to delete template and related data");
        } finally {
          setDeletingTemplate(false);
        }
        return;
      }

      if (confirmModal.type === "delete-item" && confirmModal.itemId) {
        setConfirmModal(null);
        await removeItem(confirmModal.itemId);
      }
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <div>
      <div className="materials-card">
        <div className="module-card-head">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
          </svg>
          <div className="module-card-head-text">
            <strong>Template Manager</strong>
            <span>Build reusable bill-of-materials templates. Select an existing template or create a new one to start editing.</span>
          </div>
        </div>

        <div className="template-header-grid">
          <div className="template-zone">
            <div className="template-zone-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              Create New Template
            </div>
            <div className="template-inline-actions">
              <input
                id="newTemplateName"
                className="input"
                placeholder="Template name…"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
              />
              <button
                className="btn btn-primary"
                type="button"
                disabled={!newTemplateName.trim() || savingTemplate}
                onClick={createTemplate}
              >
                {savingTemplate ? "Creating…" : "Create Template"}
              </button>
            </div>
          </div>

          <div className="template-zone-or">OR</div>

          <div className="template-zone">
            <div className="template-zone-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              Open Existing Template
            </div>
            <SearchableSelect
              groups={templatePickerGroups}
              selectedOption={selectedTemplate}
              onSelectOption={(template) => setTemplateId(template ? String(template.id) : "")}
              getOptionKey={(template) => String(template.id)}
              getOptionLabel={templateOptionLabel}
              getOptionSearchText={templateOptionSearchText}
              getOptionStyle={templateOptionStyle}
              placeholder="-- Select a template --"
              searchPlaceholder="Search templates..."
              emptyMessage="No templates found."
              allowClear
              clearLabel="-- Select a template --"
            />
          </div>
        </div>

        {error && <div className="error-text">{error}</div>}
        {loadingTemplates && <p className="section-note">Loading templates...</p>}

        {!templateId && !loadingTemplates && (
          <div className="template-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
            </svg>
            <strong>No template selected</strong>
            <p>
              Create a new template using the panel above, or select an existing one to start
              editing its sections and items.
            </p>
            {templates.length > 0 && (
              <p className="template-empty-count">
                {templates.length} template{templates.length !== 1 ? "s" : ""} available — pick one from the dropdown above.
              </p>
            )}
          </div>
        )}

        {selectedTemplate && (
          <>
            <div className="template-toolbar">
              <div className="template-inline-actions">
                <input
                  className="input"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!templateName.trim() || savingTemplate}
                  onClick={saveTemplateName}
                >
                  Save Name
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={exportingTemplate}
                  onClick={exportTemplateExcel}
                >
                  {exportingTemplate ? "Exporting..." : "Export Excel"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={exportingAllTemplates}
                  onClick={exportAllTemplatesExcel}
                >
                  {exportingAllTemplates ? "Bundling..." : "Export All Tabs"}
                </button>
                <label className="field template-export-vat-field">
                  <span>Export VAT</span>
                  <SearchableSelect
                    groups={[
                      {
                        key: "template-vat-mode",
                        label: "Export VAT",
                        options: templateVatModeOptions
                      }
                    ]}
                    selectedOption={selectedTemplateVatModeOption}
                    onSelectOption={(option) => setTemplateExportVatMode(option?.value || "incl")}
                    getOptionKey={(option) => option.value}
                    getOptionLabel={(option) => option.label}
                    getOptionSearchText={(option) => option.label}
                    placeholder="Select VAT mode"
                    searchPlaceholder="Search VAT mode..."
                    emptyMessage="No VAT mode found."
                    showGroupLabels={false}
                  />
                </label>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={duplicatingTemplate}
                  onClick={openDuplicateTemplateModal}
                >
                  {duplicatingTemplate ? "Duplicating..." : "Duplicate Template"}
                </button>
              </div>
              <button
                className="btn btn-danger"
                type="button"
                disabled={deletingTemplate}
                onClick={openDeleteTemplateModal}
              >
                {deletingTemplate ? "Deleting..." : "Delete Template"}
              </button>
            </div>

            <p className="section-note">
              Selected template has {selectedTemplate.item_count || 0} saved item
              {Number(selectedTemplate.item_count || 0) === 1 ? "" : "s"}.
            </p>

            <div className="items-editor template-sections-card">
              <div className="items-editor-title">Template Sections</div>
              <div className="quote-stepper">
                {steps.map((step) => (
                  <button
                    key={step.key}
                    type="button"
                    className={`step-pill ${activeSectionKey === step.key ? "active" : ""}`}
                    onClick={() => setActiveSectionKey(step.key)}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
              {activeStep && (
                <div className="items-editor-note">
                  {activeStep.label} ({activeStep.items.length} items)
                </div>
              )}
            </div>

            <div className="add-item-card">
              <div className="add-item-card-head">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M10 6v8M6 10h8"/></svg>
                <strong>Add Item to Section</strong>
                <span className="add-item-card-sub">{TEMPLATE_VAT_LABEL}</span>
              </div>

              <div className="add-item-picker-row">
                <label className="field">
                  <span>Supplier Filter</span>
                  <SearchableSelect
                    groups={supplierPickerGroups}
                    selectedOption={selectedNewSupplierOption}
                    onSelectOption={(option) => setNewItemSupplierFilter(option?.value || "all")}
                    getOptionKey={(option) => option.value}
                    getOptionLabel={(option) => option.label}
                    getOptionSearchText={(option) => option.label}
                    getOptionStyle={(option) =>
                      option.value === "all" ? undefined : getSupplierTextStyle(option.label)
                    }
                    placeholder="All suppliers"
                    searchPlaceholder="Search supplier..."
                    emptyMessage="No supplier found."
                    showGroupLabels={false}
                  />
                </label>
                <label className="field">
                  <span>Pick from Materials Database ({createMatchCount} match{createMatchCount === 1 ? "" : "es"})</span>
                  <SearchableMaterialPicker
                    groups={createMaterialGroups}
                    selectedMaterial={selectedCreateMaterial}
                    onSelectMaterial={(material) => {
                      setNewItem((prev) => applyMaterialToForm(material, prev));
                      setNewItemSupplierFilter(getMaterialSupplierName(material));
                    }}
                    getOptionLabel={materialOptionLabel}
                    getOptionStyle={(material) => getSupplierTextStyle(material.active_supplier_name)}
                    placeholder="— Select material —"
                  />
                </label>
                <label className="field add-item-desc-field">
                  <span>Manual Description</span>
                  <input
                    className="input"
                    placeholder="Or type a custom description..."
                    value={newItem.description}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        description: e.target.value,
                        catalogMaterialId: ""
                      }))
                    }
                  />
                </label>
              </div>

              <div className="add-item-details-row">
                <label className="field">
                  <span>No.</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="—"
                    value={newItem.itemNo}
                    onChange={(e) => setNewItem((prev) => ({ ...prev, itemNo: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Unit</span>
                  <input
                    className="input"
                    placeholder="PCS"
                    value={newItem.unit}
                    onChange={(e) => setNewItem((prev) => ({ ...prev, unit: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Qty</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="1"
                    value={newItem.qty}
                    onChange={(e) => setNewItem((prev) => ({ ...prev, qty: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Price (VAT Incl. Used)</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newItem.basePrice}
                    onChange={(e) => setNewItem((prev) => ({ ...prev, basePrice: e.target.value }))}
                  />
                </label>
                <button
                  className="btn btn-primary add-item-submit"
                  type="button"
                  disabled={!newItem.description.trim()}
                  onClick={createItem}
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M10 6v8M6 10h8"/></svg>
                  Add to Section
                </button>
              </div>
              <p className="template-vat-row-note">{vatReferenceLabel(selectedCreateMaterial)}</p>
            </div>

            {loadingItems && <p className="section-note">Loading template items...</p>}

            <div className="materials-table-wrap">
              <table className="materials-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Description</th>
                    <th>Unit</th>
                    <th>Qty</th>
                    <th>Price Reference</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeStep?.items || []).map((row) => {
                    const priceRef = resolveRowPriceReference(row);
                    return (
                    <tr
                      key={row.id}
                      className={editingItemId === row.id ? "template-item-row editing" : "template-item-row"}
                    >
                      <td>
                        {editingItemId === row.id ? (
                          <input
                            className="input"
                            type="number"
                            min="1"
                            step="1"
                            value={editItem.itemNo}
                            onChange={(e) =>
                              setEditItem((prev) => ({ ...prev, itemNo: e.target.value }))
                            }
                          />
                        ) : (
                          row.item_no
                        )}
                      </td>
                      <td>
                        {editingItemId === row.id ? (
                          <div className="template-edit-stack">
                            <SearchableSelect
                              groups={supplierPickerGroups}
                              selectedOption={selectedEditSupplierOption}
                              onSelectOption={(option) => setEditItemSupplierFilter(option?.value || "all")}
                              getOptionKey={(option) => option.value}
                              getOptionLabel={(option) => option.label}
                              getOptionSearchText={(option) => option.label}
                              getOptionStyle={(option) =>
                                option.value === "all" ? undefined : getSupplierTextStyle(option.label)
                              }
                              placeholder="All suppliers"
                              searchPlaceholder="Search supplier..."
                              emptyMessage="No supplier found."
                              showGroupLabels={false}
                            />
                            <div className="template-picker-separator">
                              <span>Pick From Materials Database ({editMatchCount} match{editMatchCount === 1 ? "" : "es"})</span>
                            </div>
                            <SearchableMaterialPicker
                              groups={editMaterialGroups}
                              selectedMaterial={selectedEditMaterial}
                              onSelectMaterial={(material) => {
                                setEditItem((prev) => applyMaterialToForm(material, prev));
                                setEditItemSupplierFilter(getMaterialSupplierName(material));
                              }}
                              getOptionLabel={materialOptionLabel}
                              getOptionStyle={(material) => getSupplierTextStyle(material.active_supplier_name)}
                              placeholder="Pick From Materials Database"
                            />
                            <div className="template-picker-separator">
                              <span>Or Manual Description</span>
                            </div>
                            <SearchableSelect
                              groups={sectionPickerGroups}
                              selectedOption={selectedSectionOption}
                              onSelectOption={(option) =>
                                setEditItem((prev) => ({ ...prev, sectionKey: option?.value || prev.sectionKey }))
                              }
                              getOptionKey={(option) => option.value}
                              getOptionLabel={(option) => option.label}
                              getOptionSearchText={(option) => option.label}
                              placeholder="Select section"
                              searchPlaceholder="Search section..."
                              emptyMessage="No section found."
                              showGroupLabels={false}
                            />
                            <input
                              className="input"
                              value={editItem.description}
                              onChange={(e) =>
                                setEditItem((prev) => ({
                                  ...prev,
                                  description: e.target.value,
                                  catalogMaterialId: ""
                                }))
                              }
                            />
                            <span className="template-vat-reference">{vatReferenceLabel(selectedEditMaterial)}</span>
                          </div>
                        ) : (
                          <div className="template-row-description">
                            <strong>{row.description}</strong>
                            <span>
                              {
                                CATEGORY_DEFS.find((def) => def.key === String(row.section_key || ""))?.label
                              }
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        {editingItemId === row.id ? (
                          <input
                            className="input"
                            value={editItem.unit}
                            onChange={(e) =>
                              setEditItem((prev) => ({ ...prev, unit: e.target.value }))
                            }
                          />
                        ) : (
                          row.unit || "-"
                        )}
                      </td>
                      <td>
                        {editingItemId === row.id ? (
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={editItem.qty}
                            onChange={(e) =>
                              setEditItem((prev) => ({ ...prev, qty: e.target.value }))
                            }
                          />
                        ) : (
                          row.qty
                        )}
                      </td>
                      <td>
                        {editingItemId === row.id ? (
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={editItem.basePrice}
                            onChange={(e) =>
                              setEditItem((prev) => ({ ...prev, basePrice: e.target.value }))
                            }
                          />
                        ) : (
                          <div className="template-vat-price">
                            {priceRef.fromCatalog ? (
                              <>
                                <strong>Base: {formatMoney(priceRef.basePrice)}</strong>
                                <span>VAT incl. used: {formatMoney(priceRef.vatInclusivePrice)}</span>
                              </>
                            ) : (
                              <>
                                <strong>Used: {formatMoney(row.base_price)}</strong>
                                <span>Manual item</span>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="materials-actions">
                          {editingItemId === row.id ? (
                            <>
                              <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={() => saveItem(row.id)}
                              >
                                Save
                              </button>
                              <button className="btn btn-ghost" type="button" onClick={cancelEditItem}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => startEditItem(row)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => openDeleteItemModal(row.id)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}

                  {!(activeStep?.items || []).length && !loadingItems && (
                    <tr>
                      <td colSpan={6} className="section-note">
                        No items yet in this section.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        open={Boolean(confirmModal)}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel={confirmModal?.confirmLabel || "Confirm"}
        tone={confirmModal?.tone || "default"}
        busy={modalBusy || duplicatingTemplate}
        confirmDisabled={
          confirmModal?.type === "duplicate-template" && !duplicateTemplateName.trim()
        }
        onCancel={closeConfirmModal}
        onConfirm={handleConfirmModal}
      >
        {confirmModal?.type === "duplicate-template" && (
          <input
            className="input"
            placeholder="New template name"
            value={duplicateTemplateName}
            onChange={(e) => setDuplicateTemplateName(e.target.value)}
          />
        )}
      </ConfirmModal>
    </div>
  );
}
