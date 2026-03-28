import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import ConfirmModal from "../components/ConfirmModal";

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

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function compareTemplateGroups(a, b) {
  const aFirst = a.rows[0];
  const bFirst = b.rows[0];
  const systemRankDiff = getTemplateSystemRank(aFirst?.name) - getTemplateSystemRank(bFirst?.name);
  if (systemRankDiff !== 0) return systemRankDiff;

  const ahA = parseTemplateBatteryAh(aFirst?.name || "");
  const ahB = parseTemplateBatteryAh(bFirst?.name || "");
  if (ahA != null || ahB != null) {
    if (ahA == null) return 1;
    if (ahB == null) return -1;
    if (ahA !== ahB) return ahA - ahB;
  }

  return String(a.label || "").localeCompare(String(b.label || ""));
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

function buildMaterialGroups(source) {
  const grouped = new Map();
  for (const material of source) {
    const label = getMaterialGroupLabel(material);
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(material);
  }

  return Array.from(grouped.entries())
    .map(([label, options]) => ({
      label,
      options: [...options].sort(sortMaterialsInGroup)
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
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
  const [duplicateTemplateName, setDuplicateTemplateName] = useState("");

  const [newItem, setNewItem] = useState(buildEmptyItemForm());
  const [newItemMaterialSearch, setNewItemMaterialSearch] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editItem, setEditItem] = useState(buildEmptyItemForm());
  const [editItemMaterialSearch, setEditItemMaterialSearch] = useState("");
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
    setEditItemMaterialSearch("");
    setActiveSectionKey(CATEGORY_DEFS[0].key);
    loadItems(templateId);
  }, [templateId]);

  const selectedTemplate = useMemo(
    () => templates.find((row) => String(row.id) === String(templateId)) || null,
    [templates, templateId]
  );

  const groupedTemplates = useMemo(() => {
    const groups = new Map();

    for (const row of templates) {
      const label = getTemplateGroupLabel(row.name);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    }

    return Array.from(groups.entries())
      .map(([label, rows]) => ({
        label,
        rows: [...rows].sort(compareTemplatesBySize)
      }))
      .sort(compareTemplateGroups);
  }, [templates]);

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

  const filterMaterialsBySearch = (source, query) => {
    const q = normalizeText(query).trim();
    if (!q) return source;

    return source.filter((material) => {
      const haystack = normalizeText(
        `${material.material_name || ""} ${material.source_section || ""} ${material.subgroup || ""} ${
          material.category || ""
        } ${getMaterialGroupLabel(material)}`
      );
      return haystack.includes(q);
    });
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
    () => filterMaterialsBySearch(visibleMaterials, newItemMaterialSearch),
    [visibleMaterials, newItemMaterialSearch]
  );

  const filteredEditMaterials = useMemo(
    () => filterMaterialsBySearch(visibleMaterials, editItemMaterialSearch),
    [visibleMaterials, editItemMaterialSearch]
  );

  const createMaterialGroups = useMemo(
    () => buildMaterialGroups(filteredCreateMaterials),
    [filteredCreateMaterials]
  );

  const materialOptionLabel = (material) =>
    `${material.material_name} | ${Number(material.base_price || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}${material.unit ? ` / ${material.unit}` : ""}${
      material.source_section ? ` | ${material.source_section}` : ""
    }`;

  const applyMaterialToForm = (material, prev = {}) => ({
    ...prev,
    catalogMaterialId: String(material?.id || ""),
    description: String(material?.material_name || ""),
    unit: String(material?.unit || ""),
    basePrice: String(material?.base_price ?? 0)
  });

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
        responseType: "blob"
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
        responseType: "blob"
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
        basePrice: Math.max(0, toNumber(newItem.basePrice, 0)),
        sectionKey: activeSectionKey,
        catalogMaterialId: newItem.catalogMaterialId || null
      });
      setNewItem(buildEmptyItemForm());
      setNewItemMaterialSearch("");
      await Promise.all([loadItems(templateId), loadTemplates(templateId)]);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create template item");
    }
  };

  const startEditItem = (row) => {
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
    setEditItemMaterialSearch("");
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditItem(buildEmptyItemForm());
    setEditItemMaterialSearch("");
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
        basePrice: Math.max(0, toNumber(editItem.basePrice, 0)),
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
            <select
              id="manageTemplate"
              className="select template-group-select"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">— Select a template —</option>
              {groupedTemplates.map((group) => (
                <optgroup label={`---- ${group.label} ----`} key={group.label}>
                  {group.rows.map((row) => (
                    <option value={row.id} key={row.id}>
                      {`${row.name} (${row.item_count || 0} items)`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
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
              </div>

              <div className="add-item-picker-row">
                <label className="field">
                  <span>Search & Filter</span>
                  <input
                    className="input"
                    placeholder="Type to filter materials..."
                    value={newItemMaterialSearch}
                    onChange={(e) => setNewItemMaterialSearch(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Pick from Materials Database</span>
                  <select
                    className="select"
                    value={newItem.catalogMaterialId}
                    onChange={(e) => {
                      const selectedId = Number(e.target.value || 0);
                      const material = materials.find((row) => Number(row.id) === selectedId);
                      if (!material) {
                        setNewItem((prev) => ({ ...prev, catalogMaterialId: "" }));
                        return;
                      }
                      setNewItem((prev) => applyMaterialToForm(material, prev));
                      setNewItemMaterialSearch(material.material_name || "");
                    }}
                  >
                    <option value="">— Select material —</option>
                    {createMaterialGroups.map((group) => (
                      <optgroup label={group.label} key={group.label}>
                        {group.options.map((material) => (
                          <option value={material.id} key={material.id}>
                            {materialOptionLabel(material)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
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
                  <span>Base Price</span>
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
                    <th>Base Price</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeStep?.items || []).map((row) => (
                    <tr key={row.id}>
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
                            <input
                              className="input"
                              placeholder="Search materials"
                              value={editItemMaterialSearch}
                              onChange={(e) => setEditItemMaterialSearch(e.target.value)}
                            />
                            <div className="template-picker-separator">
                              <span>Pick From Materials Database</span>
                            </div>
                            <select
                              className="select"
                              value={editItem.catalogMaterialId || ""}
                              onChange={(e) => {
                                const selectedId = Number(e.target.value || 0);
                                const material = materials.find((entry) => Number(entry.id) === selectedId);
                                if (!material) {
                                  setEditItem((prev) => ({ ...prev, catalogMaterialId: "" }));
                                  return;
                                }
                                setEditItem((prev) => applyMaterialToForm(material, prev));
                                setEditItemMaterialSearch(material.material_name || "");
                              }}
                            >
                              <option value="">Pick From Materials Database</option>
                              {editMaterialGroups.map((group) => (
                                <optgroup label={group.label} key={group.label}>
                                  {group.options.map((material) => (
                                    <option value={material.id} key={material.id}>
                                      {materialOptionLabel(material)}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <div className="template-picker-separator">
                              <span>Or Manual Description</span>
                            </div>
                            <select
                              className="select"
                              value={editItem.sectionKey}
                              onChange={(e) =>
                                setEditItem((prev) => ({ ...prev, sectionKey: e.target.value }))
                              }
                            >
                              {CATEGORY_DEFS.map((def) => (
                                <option value={def.key} key={def.key}>
                                  {def.label}
                                </option>
                              ))}
                            </select>
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
                          formatMoney(row.base_price)
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
                  ))}

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
