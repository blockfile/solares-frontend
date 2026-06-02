import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

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

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function isPanelDescription(description) {
  const text = normalizeText(description);
  return (
    text.includes("solar panel") ||
    (text.includes("panel") && text.includes("mono")) ||
    (text.includes("mono") && /\d{3,4}\s*w/.test(text)) ||
    /\b\d{3,4}\s*w\b/.test(text)
  );
}

function isPanelDependentDescription(description) {
  const text = normalizeText(description);
  return (
    text.includes("railing") ||
    text.includes("roof rail") ||
    text.includes("lfoot") ||
    text.includes("l-foot") ||
    text.includes("l foot") ||
    text.includes("mid clamp") ||
    text.includes("end clamp") ||
    text.includes("grounding lug") ||
    text.includes("splice kit") ||
    text.includes("fittings connector")
  );
}

function detectMountingFormulaKey(description) {
  const text = normalizeText(description);
  if (text.includes("solar roof rail") || text.includes("solar railing") || text.includes("railing")) {
    return "rail";
  }
  if (text.includes("l-foot") || text.includes("lfoot") || text.includes("l foot")) {
    return "lfoot";
  }
  if (text.includes("mid clamp")) return "mid_clamp";
  if (text.includes("end clamp")) return "end_clamp";
  if (text.includes("splice kit")) return "splice_kit";
  if (text.includes("mc4")) return "mc4";
  return null;
}

function detectCategory(description) {
  const text = normalizeText(description);
  if (
    text.includes("ac ") ||
    text.includes("dc ") ||
    text.includes("breaker") ||
    text.includes("mcb") ||
    text.includes("mccb") ||
    text.includes("spd") ||
    text.includes("ats") ||
    text.includes("mts") ||
    text.includes("ip65") ||
    text.includes("metal enclosure") ||
    text.includes("din rail")
  ) {
    return "battery_ac";
  }
  if (
    text.includes("pv cable") ||
    text.includes("single core") ||
    text.includes("wire") ||
    text.includes("cable") ||
    text.includes("hdpe") ||
    text.includes("conduit") ||
    text.includes("grounding")
  ) {
    return "pv";
  }
  if (
    text.includes("mounting") ||
    text.includes("rail") ||
    text.includes("lfoot") ||
    text.includes("clamp") ||
    text.includes("splice") ||
    text.includes("roof")
  ) {
    return "mounting";
  }
  return "main";
}

function detectSection(description, subgroup, legacyCategory) {
  const text = normalizeText(description);
  const sg = String(subgroup || "").toLowerCase();
  const coarse = String(legacyCategory || "").toLowerCase();

  if (sg === "inverter" || sg === "panel" || sg === "battery") return "main_system";
  if (sg === "mounting") return "mounting_structural";

  if (sg === "mcb" || sg === "mccb" || sg === "spd" || sg === "ats_mts" || sg === "protection") {
    if (
      text.includes("ac ") ||
      text.includes(" ac") ||
      text.includes("ats") ||
      text.includes("ip65") ||
      text.includes("metal enclosure") ||
      text.includes("din rail") ||
      text.includes("breaker box")
    ) {
      return "ac_distribution";
    }
    return "dc_pv";
  }

  if (
    text.includes("junction box") ||
    text.includes("pv cable tray") ||
    text.includes("pg21") ||
    text.includes("cable gland")
  ) {
    return "dc_pv";
  }

  if (sg === "enclosure") {
    if (text.includes("junction box")) return "dc_pv";
    return "ac_distribution";
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
    text.includes("elastoseal") ||
    text.includes("stainless")
  ) {
    return "consumables";
  }

  if (coarse === "mounting") return "mounting_structural";
  if (coarse === "pv") return "cabling_conduits";
  if (coarse === "battery_ac") return "ac_distribution";
  return "consumables";
}

function resolveStoredSectionKey(sectionKey) {
  const key = String(sectionKey || "").trim().toLowerCase();
  return VALID_SECTION_KEYS.has(key) ? key : null;
}

function detectItemSubgroup(description) {
  const text = normalizeText(description);
  if (
    text.includes("breaker box") ||
    text.includes("junction box") ||
    text.includes("metal enclosure") ||
    text.includes("enclosure") ||
    text.includes("ip65")
  ) {
    return "enclosure";
  }
  if (text.includes("battery") || text.includes("ah") || text.includes("lifepo") || text.includes("lipo4")) {
    return "battery";
  }
  if (
    text.includes("inverter") ||
    text.includes("deye") ||
    text.includes("solis") ||
    text.includes("sofar") ||
    text.includes("srne") ||
    text.includes("goodwe")
  ) {
    return "inverter";
  }
  if (isPanelDescription(description)) return "panel";
  if (/\b(?:dc|ac)\s*\d+p\b/.test(text) && /\b\d{2,4}\s*v\b/.test(text)) return "mcb";
  if (text.includes("mccb")) return "mccb";
  if (text.includes("mcb") || text.includes("breaker")) return "mcb";
  if (text.includes("spd")) return "spd";
  if (text.includes("ats") || text.includes("mts")) return "ats_mts";
  if (
    text.includes("rail") ||
    text.includes("clamp") ||
    text.includes("lfoot") ||
    text.includes("l foot") ||
    text.includes("splice")
  ) {
    return "mounting";
  }
  if (
    text.includes("wire") ||
    text.includes("cable") ||
    text.includes("thwn") ||
    text.includes("awg") ||
    text.includes("single core")
  ) {
    return "cable";
  }
  if (text.includes("fuse") || text.includes("isolator")) return "protection";
  if (text.includes("mc4") || text.includes("connector") || text.includes("pg")) {
    return "connector";
  }
  if (text.includes("box") || text.includes("enclosure") || text.includes("junction")) {
    return "enclosure";
  }
  return "accessory";
}

function isStrictSubgroup(value) {
  return new Set([
    "panel",
    "inverter",
    "battery",
    "mcb",
    "mccb",
    "spd",
    "ats_mts",
    "protection",
    "enclosure",
    "cable",
    "mounting",
    "connector"
  ]).has(String(value || "").toLowerCase());
}

function resolveItemSubgroup(catalogSubgroup, description) {
  const inferred = detectItemSubgroup(description);
  const catalog = String(catalogSubgroup || "").toLowerCase().trim();
  const text = normalizeText(description);

  if (!catalog) return inferred;
  if (!isStrictSubgroup(catalog)) return inferred;
  if (
    catalog === "enclosure" &&
    (text.includes("box") || text.includes("enclosure") || text.includes("ip65"))
  ) {
    return "enclosure";
  }

  if (inferred === "panel" || inferred === "inverter" || inferred === "battery") return inferred;
  if (inferred === "ats_mts" || inferred === "spd" || inferred === "mcb" || inferred === "mccb") {
    return inferred;
  }

  return catalog;
}

function defaultCategoryBySection(sectionKey) {
  if (sectionKey === "main_system") return "main";
  if (sectionKey === "mounting_structural") return "mounting";
  if (sectionKey === "dc_pv") return "battery_ac";
  if (sectionKey === "ac_distribution") return "battery_ac";
  if (sectionKey === "cabling_conduits") return "pv";
  if (sectionKey === "grounding") return "pv";
  if (sectionKey === "consumables") return "pv";
  return "main";
}

function toStepCategory(catalogCategory, fallbackDescription) {
  const c = normalizeText(catalogCategory);
  if (c === "main" || c === "mounting" || c === "pv" || c === "battery_ac") return c;
  return detectCategory(fallbackDescription);
}

function parseAh(text) {
  const m = String(text || "").match(/(\d+(?:\.\d+)?)\s*ah/i);
  return m ? Number(m[1]) : null;
}

function parseKW(text) {
  const m = String(text || "").match(/(\d+(?:\.\d+)?)\s*kw/i);
  return m ? Number(m[1]) : null;
}

function sortMaterialOptions(a, b, subgroup) {
  if (subgroup === "battery") {
    const ahA = parseAh(a.material_name);
    const ahB = parseAh(b.material_name);
    if (ahA != null && ahB != null && ahA !== ahB) return ahA - ahB;
  }

  if (subgroup === "inverter") {
    const kwA = parseKW(a.material_name);
    const kwB = parseKW(b.material_name);
    if (kwA != null && kwB != null && kwA !== kwB) return kwA - kwB;
  }

  return String(a.material_name || "").localeCompare(String(b.material_name || ""));
}

function inferMaterialBrand(material) {
  const name = normalizeText(material?.material_name || "");
  const section = normalizeText(material?.source_section || "");
  const text = `${name} ${section}`;

  if (text.includes("deye") || /\bsun-\d/i.test(material?.material_name || "")) return "deye";
  if (text.includes("solis") || /\bs[56]-[a-z0-9-]+/i.test(material?.material_name || "")) return "solis";
  if (text.includes("snre") || /\bsr-[a-z0-9-]+/i.test(material?.material_name || "")) return "snre";
  if (text.includes("menred") || text.includes("mendred")) return "menred";
  if (text.includes("feeo")) return "feeo";
  if (text.includes("taixi")) return "taixi";
  if (text.includes("sunree")) return "sunree";
  return null;
}

function isPreferredEnclosure(material) {
  const name = normalizeText(material?.material_name || "");
  const sec = normalizeText(material?.source_section || "");
  if (name.includes("ip65")) return true;
  if (name.includes("breaker box")) return true;
  if (name.includes("outdoor")) return true;
  if (name.includes("metal enclosure")) return true;
  if (name.includes("junction box") || name.includes("junction")) return true;
  if (sec.includes("box (outdoor)")) return true;
  if (sec.includes("metal enclosure")) return true;
  if (sec.includes("junction box")) return true;
  return false;
}

function isAllowedByPreferredBrand(itemSubgroup, material) {
  const sg = String(itemSubgroup || "").toLowerCase();
  const brand = inferMaterialBrand(material);

  if (sg === "inverter") return brand === "deye" || brand === "solis";
  if (sg === "battery") return brand === "snre" || brand === "menred";
  if (["mcb", "mccb", "spd", "ats_mts", "protection"].includes(sg)) {
    return brand === "feeo" || brand === "taixi" || brand === "sunree";
  }
  if (sg === "enclosure") return isPreferredEnclosure(material);

  return true;
}

function isThreePhaseInverter(material) {
  const text = normalizeText(`${material?.material_name || ""} ${material?.source_section || ""}`);
  if (text.includes("3phase") || text.includes("3 phase")) return true;
  if (/\b3p\b/.test(text)) return true;
  if (text.includes("hp3") || text.includes("lp3")) return true;
  return false;
}

function getOptionGroupLabel(itemSubgroup, material) {
  const sg = String(itemSubgroup || "").toLowerCase();
  const brand = inferMaterialBrand(material);

  if (sg === "inverter") {
    if (brand === "solis") return "SOLIS";
    if (brand === "deye" && isThreePhaseInverter(material)) return "DEYE 3PHASE";
    if (brand === "deye") return "DEYE";
    return "INVERTER";
  }

  if (sg === "battery") {
    if (brand === "snre") return "SNRE BATTERY";
    if (brand === "menred") return "MENRED BATTERY";
    return "BATTERY";
  }

  if (["mcb", "mccb", "spd", "ats_mts", "protection"].includes(sg)) {
    if (brand === "feeo") return "FEEO";
    if (brand === "taixi") return "TAIXI";
    if (brand === "sunree") return "SUNREE";
    return "PROTECTION";
  }

  if (sg === "panel") return "SOLAR PANEL";
  if (sg === "enclosure") return "ENCLOSURE";
  return String(sg || "OTHER").toUpperCase();
}

function sortGroupLabels(itemSubgroup, labels) {
  const sg = String(itemSubgroup || "").toLowerCase();
  let order = [];

  if (sg === "inverter") order = ["SOLIS", "DEYE", "DEYE 3PHASE", "INVERTER"];
  if (sg === "battery") order = ["SNRE BATTERY", "MENRED BATTERY", "BATTERY"];
  if (["mcb", "mccb", "spd", "ats_mts", "protection"].includes(sg)) {
    order = ["FEEO", "TAIXI", "SUNREE", "PROTECTION"];
  }

  return [...labels].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.localeCompare(b);
  });
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2
  }).format(amount);
}

function roundPeso(value) {
  return Math.round(Number(value || 0));
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatPlainMoney(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizeRate(rate, fallback) {
  const parsed = Number(rate);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function applyMarkup(basePrice, markupRate) {
  return roundPeso(Number(basePrice || 0) * (1 + normalizeRate(markupRate, 0)));
}

function parsePanelWatt(text) {
  const match = String(text || "").match(/(\d{3,4})\s*w\b/i);
  return match ? Number(match[1]) : 0;
}

function isPanelItemLike(item) {
  const description = String(item?.description || item?.material_name || "");
  const subgroup = String(item?.subgroup || item?.catalog_subgroup || "").trim().toLowerCase();
  return item?.isPanel === true || subgroup === "panel" || isPanelDescription(description) || parsePanelWatt(description) > 0;
}

const QUOTE_VAT_RATE = 0.12;

function toVatInclusivePrice(value) {
  const base = Math.max(0, Number(value || 0));
  return base * (1 + QUOTE_VAT_RATE);
}

function normalizeVatMode(value) {
  return String(value || "").trim().toLowerCase() === "excl" ? "excl" : "incl";
}

function resolveCatalogDisplayPrice(value, vatMode = "incl") {
  return normalizeVatMode(vatMode) === "incl" ? toVatInclusivePrice(value) : Number(value || 0);
}

function resolveMarginBucket(item) {
  const description = String(item?.description || "");
  const subgroup = String(item?.subgroup || "").toLowerCase();
  const section = String(item?.section || "").toLowerCase();
  const category = String(item?.category || "").toLowerCase();

  if (isPanelDescription(description) || subgroup === "panel") return "panel";
  if (subgroup === "inverter") return "inverter";
  if (subgroup === "battery") return "battery";
  if (section === "mounting_structural" || subgroup === "mounting" || category === "mounting") {
    return "mounting";
  }
  return "safety";
}

function getMarginRateForBucket(bucket, marginTemplate, fallbackRate) {
  if (!marginTemplate) return normalizeRate(fallbackRate, 0);
  if (bucket === "inverter") return normalizeRate(marginTemplate.inverterMargin, fallbackRate);
  if (bucket === "panel") return normalizeRate(marginTemplate.panelMargin, fallbackRate);
  if (bucket === "battery") return normalizeRate(marginTemplate.batteryMargin, fallbackRate);
  if (bucket === "mounting") return normalizeRate(marginTemplate.mountingMargin, fallbackRate);
  return normalizeRate(marginTemplate.safetyMargin, fallbackRate);
}

function applyMarginTemplateToItems(items, marginTemplate, fallbackRate) {
  return items.map((item) => ({
    ...item,
    marginRate: getMarginRateForBucket(resolveMarginBucket(item), marginTemplate, fallbackRate)
  }));
}

function formatDateLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function formatDateTimeLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function detectTemplateSystemType(name) {
  const text = normalizeText(name);
  if (text.includes("hybrid")) return "hybrid";
  if (text.includes("grid tie") || text.includes("grid tied") || text.includes("grid-tie")) {
    return "grid_tie";
  }
  return "other";
}

function parseTemplateBatteryAh(name) {
  return parseAh(name);
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

function detectMaterialSystemType(material) {
  const text = normalizeText(`${material?.material_name || ""} ${material?.source_section || ""}`);
  if (text.includes("hybrid")) return "hybrid";
  if (text.includes("grid tie") || text.includes("single phase inverter")) return "grid_tie";
  return "other";
}

function isMaterialCompatibleWithTemplate(itemSubgroup, material, templateSystemType) {
  const sg = String(itemSubgroup || "").toLowerCase();
  if (sg !== "inverter") return true;

  const materialType = detectMaterialSystemType(material);
  if (templateSystemType === "hybrid") return materialType === "hybrid";
  if (templateSystemType === "grid_tie") return materialType === "grid_tie";
  return true;
}

function filterInverterCandidatesByKw(description, candidates) {
  const targetKw = parseKW(description);
  if (targetKw == null || !candidates.length) return candidates;

  const exact = candidates.filter((m) => {
    const kw = parseKW(m.material_name);
    return kw != null && Math.abs(kw - targetKw) <= 0.05;
  });
  if (exact.length) return exact;

  const near = candidates.filter((m) => {
    const kw = parseKW(m.material_name);
    return kw != null && Math.abs(kw - targetKw) <= 0.5;
  });
  if (near.length) return near;

  return candidates;
}

function recomputePanelDependent(items) {
  const panelQty = items
    .filter((it) => isPanelItemLike(it))
    .reduce((sum, it) => sum + Number(it.qty || 0), 0);
  if (!Number.isFinite(panelQty)) return items;
  if (panelQty <= 0) {
    return items.map((it) => (it.autoFromPanel ? { ...it, qty: 0 } : it));
  }

  const calcRail = (n) => Math.ceil((n / 2) * 3 * 1.1);
  const calcLFoot = (n) => Math.ceil((n / 2) * 9 * 1.1);
  const calcMid = (n) => Math.ceil((n / 2) * 3 * 1.1);
  // Matches current workbook behavior used by your team.
  const calcEnd = (n) => Math.ceil((n / 2) * 6 + 1.1);

  return items.map((it) => {
    if (!it.autoFromPanel) return it;

    let nextQty = null;
    if (it.formulaKey === "rail") nextQty = calcRail(panelQty);
    if (it.formulaKey === "lfoot") nextQty = calcLFoot(panelQty);
    if (it.formulaKey === "mid_clamp") nextQty = calcMid(panelQty);
    if (it.formulaKey === "end_clamp") nextQty = calcEnd(panelQty);

    if (nextQty == null) {
      const ratio = Number(it.formulaFactor ?? it.panelRatio ?? 0);
      nextQty = Math.ceil(panelQty * ratio);
    }

    nextQty = Math.max(0, Number(nextQty || 0));
    return { ...it, qty: nextQty };
  });
}

function previewSearchText(item) {
  return String(
    [
      item?.description,
      item?.template_description,
      item?.catalog_material_name,
      item?.catalog_source_section
    ]
      .filter(Boolean)
      .join(" ")
  ).trim();
}

function isPreviewBatteryItem(item) {
  const text = normalizeText(previewSearchText(item));
  return (
    (text.includes("battery") || text.includes("lifepo") || text.includes("lipo4") || /\bah\b/.test(text)) &&
    !text.includes("battery cable")
  );
}

function isPreviewInverterItem(item) {
  const text = normalizeText(previewSearchText(item));
  return (
    text.includes("inverter") ||
    text.includes("deye") ||
    text.includes("solis") ||
    text.includes("hybrid") ||
    text.includes("grid tie")
  );
}

function isPreviewMountingItem(item) {
  const text = normalizeText(previewSearchText(item));
  if (text.includes("din rail")) return false;
  return (
    text.includes("mounting") ||
    text.includes("rail") ||
    text.includes("l-foot") ||
    text.includes("lfoot") ||
    text.includes("l foot") ||
    text.includes("clamp") ||
    text.includes("splice") ||
    text.includes("mc4") ||
    text.includes("conduit") ||
    text.includes("fittings connector") ||
    text.includes("grounding lug") ||
    text.includes("clip/plate")
  );
}

function buildPreviewLine(rows, description, qty, unit) {
  if (!rows.length) return null;
  const lineTotal = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.unit_price || 0) * Number(row.qty || 0), 0)
  );
  const parsedQty = Number(qty || 0);
  const unitPrice = parsedQty > 0 ? lineTotal / parsedQty : lineTotal;
  return {
    description,
    qtyDisplay: parsedQty > 0 ? parsedQty : qty,
    unit: unit || "",
    unitPrice,
    lineTotal
  };
}

function getFirstDescription(rows, fallback) {
  return String(rows[0]?.description || rows[0]?.catalog_material_name || rows[0]?.template_description || fallback || "");
}

function parsePreviewDiscountItems(quote) {
  if (quote?.discount_items) {
    try {
      const parsed = typeof quote.discount_items === "string" ? JSON.parse(quote.discount_items) : quote.discount_items;
      if (Array.isArray(parsed) && parsed.length) {
        return parsed
          .map((row) => ({ label: row.label || "Discount", amount: Math.max(0, Number(row.amount || 0)) }))
          .filter((row) => row.amount > 0);
      }
    } catch {}
  }
  const amount = Math.max(0, Number(quote?.discount_amount || 0));
  return amount > 0 ? [{ label: "Promotional Discount", amount }] : [];
}

function normalizeQuotePrintPreviewData(quote, meta, preview) {
  if (!preview || !Array.isArray(preview.lines)) return null;

  const discountTotal = Number(preview.discountTotal ?? preview.discountAmount ?? 0);
  const subtotal = Number(preview.subtotal || 0);
  return {
    lines: preview.lines.map((line, index) => ({
      itemNo: Number(line.itemNo || line.item_no || index + 1),
      description: line.description || "",
      qtyDisplay: line.qtyDisplay ?? line.qty ?? "",
      unit: line.unit || "",
      unitPrice: Number(line.unitPrice ?? line.unit_price ?? 0),
      lineTotal: Number(line.lineTotal ?? line.line_total ?? 0)
    })),
    subtotal,
    discountTotal,
    total: Number(preview.total ?? roundMoney(subtotal - discountTotal)),
    discountItems: Array.isArray(preview.discountItems) ? preview.discountItems : [],
    suggestedSetup: preview.suggestedSetup || "",
    specs: {
      panel: preview.specs?.panel || "",
      inverter: preview.specs?.inverter || "",
      battery: preview.specs?.battery || ""
    },
    quoteRef: preview.quoteRef || quote?.quote_ref || meta?.quoteRef || "",
    customerName: preview.customerName || quote?.customer_name || meta?.customerName || "",
    quoteDate: preview.quoteDate || quote?.quote_date || meta?.quoteDate || "",
    validUntil: preview.validUntil || quote?.valid_until || meta?.validUntil || ""
  };
}

function buildQuotePrintPreviewData(quote, meta, items, preview) {
  const backendPreview = normalizeQuotePrintPreviewData(quote, meta, preview);
  if (backendPreview) return backendPreview;

  const sourceItems = Array.isArray(items) ? items : [];
  const nonInstallation = sourceItems.filter((item) => Number(item.is_installation) !== 1);
  const installationItems = sourceItems.filter((item) => Number(item.is_installation) === 1);
  const inverterItems = nonInstallation.filter(isPreviewInverterItem);
  const panelItems = nonInstallation.filter((item) => isPanelDescription(previewSearchText(item)));
  const batteryItems = nonInstallation.filter(isPreviewBatteryItem);
  const taken = new Set([...inverterItems, ...panelItems, ...batteryItems].map((item) => item.id));
  const remaining = nonInstallation.filter((item) => !taken.has(item.id));
  const mountingItems = remaining.filter(isPreviewMountingItem);
  const safetyItems = remaining.filter((item) => !isPreviewMountingItem(item));

  const lines = [];
  const inverterQty = inverterItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const panelQty = panelItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const batteryQty = batteryItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  const inverterLine = buildPreviewLine(inverterItems, getFirstDescription(inverterItems, "Inverter"), inverterQty, inverterItems[0]?.unit || "PCS");
  if (inverterLine) lines.push(inverterLine);
  const panelLine = buildPreviewLine(panelItems, getFirstDescription(panelItems, "Solar Panel"), panelQty, panelItems[0]?.unit || "PCS");
  if (panelLine) lines.push(panelLine);
  const batteryLine = buildPreviewLine(batteryItems, getFirstDescription(batteryItems, "Battery"), batteryQty, batteryItems[0]?.unit || "PCS");
  if (batteryLine) lines.push(batteryLine);
  const safetyLine = buildPreviewLine(safetyItems, "Complete Safety Breakers/SPD", 1, "SET");
  if (safetyLine && safetyLine.lineTotal > 0) lines.push(safetyLine);
  const mountingLine = buildPreviewLine(mountingItems, "Complete Mounting Fixtures", 1, "SET");
  if (mountingLine && mountingLine.lineTotal > 0) lines.push(mountingLine);

  const materialTotal = roundMoney(lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0));
  const packagePriceTarget = Number(quote?.package_price_target || 0);
  const isFixedPackage = String(quote?.pricing_mode || "").trim() === "fixed_package" && packagePriceTarget > 0;
  const storedLineSubtotal = roundMoney(
    sourceItems.reduce((sum, row) => sum + Number(row.unit_price || 0) * Number(row.qty || 0), 0)
  );
  const storedSubtotal = roundMoney(Number(quote?.subtotal || 0));
  const installationStored = roundMoney(
    installationItems.reduce((sum, row) => sum + Number(row.line_total || 0), 0)
  );
  const totalTarget = isFixedPackage
    ? roundMoney(packagePriceTarget)
    : storedLineSubtotal > 0
      ? storedLineSubtotal
      : storedSubtotal > 0
      ? roundMoney(storedSubtotal)
      : Number.isFinite(Number(quote?.total))
        ? roundMoney(quote.total)
        : roundMoney(materialTotal + installationStored);
  const resolvedInstallation = totalTarget > 0 ? roundMoney(totalTarget - materialTotal) : installationStored;
  const installationTotal = Math.max(0, resolvedInstallation);
  if (installationItems.length || installationTotal > 0) {
    lines.push({
      description: "Complete Installation",
      qtyDisplay: "1 JOB",
      unit: "JOB",
      unitPrice: installationTotal,
      lineTotal: installationTotal
    });
  }

  const numberedLines = lines.map((line, index) => ({ ...line, itemNo: index + 1 }));
  const subtotal = roundMoney(numberedLines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0));
  const discountItems = parsePreviewDiscountItems(quote);
  const discountTotal = roundMoney(discountItems.reduce((sum, item) => sum + Number(item.amount || 0), 0));

  const panelKw = panelItems.reduce((sum, item) => {
    const watt = parsePanelWatt(previewSearchText(item));
    return sum + (watt > 0 ? watt * Number(item.qty || 0) : 0);
  }, 0) / 1000;
  const inverterKw = inverterItems.reduce((max, item) => Math.max(max, Number(parseKW(previewSearchText(item)) || 0)), 0);
  const suggestedKw = panelKw > 0 ? panelKw : inverterKw;

  return {
    lines: numberedLines,
    subtotal,
    discountTotal,
    total: roundMoney(subtotal - discountTotal),
    discountItems,
    suggestedSetup: suggestedKw > 0 ? `${suggestedKw.toFixed(1).replace(/\.0$/, "")}KW` : "",
    specs: {
      panel: getFirstDescription(panelItems, ""),
      inverter: getFirstDescription(inverterItems, ""),
      battery: getFirstDescription(batteryItems, "")
    },
    quoteRef: quote?.quote_ref || meta?.quoteRef || "",
    customerName: quote?.customer_name || meta?.customerName || "",
    quoteDate: quote?.quote_date || meta?.quoteDate || "",
    validUntil: quote?.valid_until || meta?.validUntil || ""
  };
}

function QuotePrintPreview({ quote, meta, items, preview, loading, exporting, onClose, onPrint, onExportPdf }) {
  const data = buildQuotePrintPreviewData(quote, meta, items, preview);

  return (
    <div className="quote-print-preview-backdrop" role="presentation" onClick={onClose}>
      <div className="quote-print-preview-shell" role="dialog" aria-modal="true" aria-labelledby="quote-print-preview-title" onClick={(e) => e.stopPropagation()}>
        <div className="quote-print-preview-head">
          <div>
            <p className="eyebrow">Print Preview</p>
            <h3 id="quote-print-preview-title">Customer Quotation</h3>
          </div>
          <div className="quote-print-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>Close</button>
            <button className="btn btn-secondary" type="button" onClick={onExportPdf} disabled={exporting || !meta?.id}>
              {exporting ? "Exporting..." : "Export PDF"}
            </button>
            <button className="btn btn-primary" type="button" onClick={onPrint} disabled={loading || !quote}>
              Print
            </button>
          </div>
        </div>

        {loading && <div className="quote-print-loading">Loading quotation preview...</div>}
        {!loading && !quote && <div className="quote-print-loading">No quote selected.</div>}

        {!loading && quote && (
          <div className="quote-print-document">
            <div className="quote-print-header">
              <img src="/SOLARES.png" alt="SOLARES" className="quote-print-logo" />
              <div className="quote-print-company">
                <h2>SOLARES Energy Solutions</h2>
                <p>Sumacab Norte, Cabanatuan City</p>
                <p>Nueva Ecija, 3100</p>
                <div className="quote-print-contact"><strong>Email Address:</strong> <span>solares.energysolutions@gmail.com</span></div>
                <div className="quote-print-contact"><strong>Cellphone No.:</strong> 0967-886-7909</div>
              </div>
              <div className="quote-print-setup">
                <strong>Suggested Solar SET-UP:</strong>
                <span>{data.suggestedSetup || "-"}</span>
              </div>
            </div>

            <table className="quote-print-table quote-print-info-table">
              <tbody>
                <tr><th colSpan={5}>Quotation</th></tr>
                <tr>
                  <td colSpan={2}><strong>Customer Name:</strong> {data.customerName}</td>
                  <td><strong>Quotation Ref:</strong></td>
                  <td colSpan={2}>{data.quoteRef}</td>
                </tr>
                <tr>
                  <td colSpan={2}></td>
                  <td><strong>Date</strong></td>
                  <td colSpan={2}>{formatDateLabel(data.quoteDate)}</td>
                </tr>
                <tr>
                  <td colSpan={2}></td>
                  <td><strong>Valid Until</strong></td>
                  <td colSpan={2}>{formatDateLabel(data.validUntil)}</td>
                </tr>
              </tbody>
            </table>

            <table className="quote-print-table quote-print-items-table">
              <colgroup>
                <col className="quote-print-col-no" />
                <col className="quote-print-col-item" />
                <col className="quote-print-col-qty" />
                <col className="quote-print-col-money" />
                <col className="quote-print-col-money" />
              </colgroup>
              <thead>
                <tr>
                  <th>ITEM</th>
                  <th>ITEM</th>
                  <th>QTY</th>
                  <th>U.P.<br />PESO</th>
                  <th>T.P<br />PESO</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.itemNo}>
                    <td className="quote-print-center">{line.itemNo}</td>
                    <td>{line.description}</td>
                    <td className="quote-print-center">{line.qtyDisplay}</td>
                    <td className="quote-print-money">{formatPlainMoney(line.unitPrice)}</td>
                    <td className="quote-print-money">{formatPlainMoney(line.lineTotal)}</td>
                  </tr>
                ))}
                <tr className="quote-print-total-row">
                  <td colSpan={4}>TOTAL PRICE IN PHILIPPINE PESO</td>
                  <td className="quote-print-money">{formatPlainMoney(data.subtotal)}</td>
                </tr>
                {data.discountTotal > 0 && (
                  <>
                    <tr className="quote-print-total-row quote-print-discount-row">
                      <td colSpan={4}>PROMOTIONAL DISCOUNT</td>
                      <td className="quote-print-money">-{formatPlainMoney(data.discountTotal)}</td>
                    </tr>
                    <tr className="quote-print-total-row">
                      <td colSpan={4}>TOTAL PRICE (Php) after DISCOUNT</td>
                      <td className="quote-print-money">{formatPlainMoney(data.total)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            <table className="quote-print-table quote-print-spec-table">
              <tbody>
                <tr><td><strong>Solar Panel Type</strong></td><td>{data.specs.panel}</td></tr>
                <tr><td><strong>Inverter Type</strong></td><td>{data.specs.inverter}</td></tr>
                <tr><td><strong>Battery Type</strong></td><td>{data.specs.battery}</td></tr>
                <tr><td><strong>Warranty on Panels</strong></td><td>12 years</td></tr>
                <tr><td><strong>Warranty on Inverter</strong></td><td>5 years</td></tr>
                <tr><td><strong>Workmanship Warranty</strong></td><td>1 year</td></tr>
                <tr className="quote-print-note-row"><td colSpan={2}>Note: Prices above are VAT exclusive</td></tr>
              </tbody>
            </table>

            <table className="quote-print-table quote-print-footer-table">
              <tbody>
                <tr><th colSpan={2}>Delivery &amp; Installation Timeline</th></tr>
                <tr><td><strong>Material Delivery</strong></td><td>: Day after the delivery of Materials (or depends on availability of stocks)</td></tr>
                <tr><td><strong>Installation Completion</strong></td><td>: 3-5 days from delivery</td></tr>
                <tr className="quote-print-gap"><td colSpan={2}></td></tr>
                <tr><th colSpan={2}>Payment Terms</th></tr>
                <tr><td colSpan={2}>: 40% Advance along with Work Order</td></tr>
                <tr><td colSpan={2}>: 40% After Material Delivery</td></tr>
                <tr><td colSpan={2}>: 20% After Installation &amp; Commissioning</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function QuotesTab() {
  const [quoteView, setQuoteView] = useState("create");
  const [templates, setTemplates] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [systemType, setSystemType] = useState("all");
  const [templateId, setTemplateId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [quoteDate, setQuoteDate] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [templateItems, setTemplateItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [packagePrices, setPackagePrices] = useState([]);
  const [packagePriceId, setPackagePriceId] = useState("");
  const [discountRows, setDiscountRows] = useState([]);
  const [quoteError, setQuoteError] = useState("");
  const [exportError, setExportError] = useState("");
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [quoteVatMode, setQuoteVatMode] = useState("incl");
  const [currentStep, setCurrentStep] = useState(0);
  const [created, setCreated] = useState(null);
  const [marginTemplates, setMarginTemplates] = useState([]);
  const [selectedMarginTemplateId, setSelectedMarginTemplateId] = useState("");
  const [recentSearch, setRecentSearch] = useState("");
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [loadingRecentQuotes, setLoadingRecentQuotes] = useState(false);
  const [selectedRecentQuoteId, setSelectedRecentQuoteId] = useState(null);
  const [selectedRecentQuote, setSelectedRecentQuote] = useState(null);
  const [loadingSelectedRecentQuote, setLoadingSelectedRecentQuote] = useState(false);
  const [recentQuoteError, setRecentQuoteError] = useState("");
  const [confirmState, setConfirmState] = useState(null);
  const [deletingQuoteId, setDeletingQuoteId] = useState(null);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [pricingConfig, setPricingConfig] = useState({
    materialMarkupRate: 0.1165,
    installationMarkupRate: 0.112,
    installationRatePerWatt: 9
  });
  const [installationMarginRate, setInstallationMarginRate] = useState(0.112);
  const [installationMultiplier, setInstallationMultiplier] = useState("9");

  useBodyScrollLock(Boolean(confirmState) || printPreviewOpen);
  const manualIdRef = useRef(-1);

  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t.id) === String(templateId)) || null,
    [templates, templateId]
  );

  const selectedTemplateSystemType = useMemo(
    () => detectTemplateSystemType(selectedTemplate?.name || ""),
    [selectedTemplate]
  );

  const selectedRecentQuoteMeta = useMemo(
    () => recentQuotes.find((quote) => Number(quote.id) === Number(selectedRecentQuoteId || 0)) || null,
    [recentQuotes, selectedRecentQuoteId]
  );
  const selectedMarginTemplate = useMemo(
    () => marginTemplates.find((row) => Number(row.id) === Number(selectedMarginTemplateId || 0)) || null,
    [marginTemplates, selectedMarginTemplateId]
  );

  const loadTemplates = async () => {
    try {
      const res = await api.get("/templates", { params: { includeAll: 1 } });
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setTemplates([]);
      setQuoteError(err?.response?.data?.message || "Failed to load templates");
    }
  };

  const loadMaterials = async () => {
    try {
      const res = await api.get("/materials");
      setMaterials(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setMaterials([]);
      setQuoteError(err?.response?.data?.message || "Failed to load materials");
    }
  };

  const loadPricingConfig = async () => {
    try {
      const res = await api.get("/quotes/config");
      setPricingConfig({
        materialMarkupRate: normalizeRate(res?.data?.materialMarkupRate, 0.1165),
        installationMarkupRate: normalizeRate(res?.data?.installationMarkupRate, 0.112),
        installationRatePerWatt: Number(res?.data?.installationRatePerWatt || 9) || 9
      });
      setInstallationMarginRate(normalizeRate(res?.data?.installationMarkupRate, 0.112));
      setInstallationMultiplier(String(Number(res?.data?.installationRatePerWatt || 9) || 9));
    } catch {
      setPricingConfig({
        materialMarkupRate: 0.1165,
        installationMarkupRate: 0.112,
        installationRatePerWatt: 9
      });
      setInstallationMarginRate(0.112);
      setInstallationMultiplier("9");
    }
  };

  const loadMarginTemplates = async () => {
    try {
      const res = await api.get("/margin-templates", { params: { activeOnly: 1 } });
      setMarginTemplates(Array.isArray(res.data) ? res.data : []);
    } catch {
      setMarginTemplates([]);
    }
  };

  const loadTemplateItems = async (selectedTemplateId) => {
    if (!selectedTemplateId) {
      setTemplateItems([]);
      return;
    }

    setLoadingItems(true);
    setQuoteError("");
    try {
      const res = await api.get(`/templates/${selectedTemplateId}/items`);
      let mapped = res.data
        .map((it, index) => {
          const description = String(it.description || "");
          const category = toStepCategory(it.catalog_category, description);
          const subgroup = resolveItemSubgroup(it.catalog_subgroup, description);
          const catalogBasePrice = Number(it.base_price || 0);
          const basePrice = Number(it.catalog_material_id || 0) > 0
            ? resolveCatalogDisplayPrice(catalogBasePrice, quoteVatMode)
            : Number(it.base_price || 0);
          const qty = Number(it.qty || 1);
          return {
            templateItemId: Number(it.id),
            itemNo: Number(it.item_no || index + 1),
            description,
            unit: String(it.unit || ""),
            qty,
            // Keep template/imported price even when no catalog match exists.
            basePrice,
            // Keep original template lines usable; user can still override via price list picker.
            included: qty > 0,
            category,
            section: resolveStoredSectionKey(it.section_key) || detectSection(description, subgroup, category),
            subgroup,
            catalogBasePrice,
            marginRate: pricingConfig.materialMarkupRate,
            catalogMaterialId: Number(it.catalog_material_id || 0) || null,
            isPanel: isPanelItemLike({ description, subgroup }),
            isManual: false,
            autoFromPanel: false,
            panelRatio: null,
            formulaKey: null,
            formulaFactor: null
          };
        })
        .sort((a, b) => a.itemNo - b.itemNo);

      const panel = mapped.find((it) => isPanelItemLike(it));
      if (panel && Number(panel.qty) > 0) {
        mapped = mapped.map((it) => {
          if (it.templateItemId === panel.templateItemId) return it;
          if (!isPanelDependentDescription(it.description)) return it;

          const autoFromPanel =
            it.category === "mounting" ||
            isPanelDependentDescription(it.description) ||
            ["rail", "lfoot", "mid_clamp", "end_clamp"].includes(
              detectMountingFormulaKey(it.description)
            );
          const formulaKey = detectMountingFormulaKey(it.description);
          const formulaFactor = Number(it.qty) / Number(panel.qty);

          return {
            ...it,
            autoFromPanel,
            panelRatio: Number(it.qty) / Number(panel.qty),
            formulaKey,
            formulaFactor: Number.isFinite(formulaFactor) ? formulaFactor : null
          };
        });
      }

      setTemplateItems(
        recomputePanelDependent(
          applyMarginTemplateToItems(mapped, selectedMarginTemplate, pricingConfig.materialMarkupRate)
        )
      );
    } catch (err) {
      setTemplateItems([]);
      setQuoteError(err?.response?.data?.message || "Failed to load template items");
    } finally {
      setLoadingItems(false);
    }
  };

  const loadPackagePrices = async (selectedTemplateId) => {
    if (!selectedTemplateId) {
      setPackagePrices([]);
      setPackagePriceId("");
      return;
    }

    try {
      const res = await api.get(
        `/package-prices?templateId=${Number(selectedTemplateId)}&activeOnly=1`
      );
      const rows = Array.isArray(res.data) ? res.data : [];
      setPackagePrices(rows);
      setPackagePriceId("");
    } catch {
      setPackagePrices([]);
      setPackagePriceId("");
    }
  };

  const loadRecentQuotes = async (query = recentSearch, preferredQuoteId = selectedRecentQuoteId) => {
    setLoadingRecentQuotes(true);
    setRecentQuoteError("");
    try {
      const res = await api.get("/quotes", {
        params: {
          q: query || undefined,
          limit: 50
        }
      });
      const rows = Array.isArray(res.data) ? res.data : [];
      setRecentQuotes(rows);

      const preferred = Number(preferredQuoteId || 0);
      const nextSelectedId = rows.some((row) => Number(row.id) === preferred)
        ? preferred
        : Number(rows[0]?.id || 0) || null;

      setSelectedRecentQuoteId(nextSelectedId);
      if (!nextSelectedId) setSelectedRecentQuote(null);
    } catch (err) {
      setRecentQuotes([]);
      setSelectedRecentQuoteId(null);
      setSelectedRecentQuote(null);
      setRecentQuoteError(err?.response?.data?.message || "Failed to load recent quotes");
    } finally {
      setLoadingRecentQuotes(false);
    }
  };

  const loadRecentQuoteDetail = async (quoteId) => {
    if (!quoteId) {
      setSelectedRecentQuote(null);
      return;
    }

    setLoadingSelectedRecentQuote(true);
    setRecentQuoteError("");
    try {
      const res = await api.get(`/quotes/${quoteId}`);
      setSelectedRecentQuote(res.data || null);
    } catch (err) {
      setSelectedRecentQuote(null);
      setRecentQuoteError(err?.response?.data?.message || "Failed to load quote details");
    } finally {
      setLoadingSelectedRecentQuote(false);
    }
  };

  const updateItemById = (templateItemId, patch) => {
    setTemplateItems((prev) => {
      const next = prev.map((item) =>
        item.templateItemId === templateItemId ? { ...item, ...patch } : item
      );
      return recomputePanelDependent(next);
    });
  };

  const addManualItemToSection = (sectionKey) => {
    setTemplateItems((prev) => {
      const maxItemNo = prev.reduce((mx, item) => Math.max(mx, Number(item.itemNo || 0)), 0);
      const id = manualIdRef.current;
      manualIdRef.current -= 1;

      const category = defaultCategoryBySection(sectionKey);
      const manual = {
        templateItemId: id,
        itemNo: maxItemNo + 1,
        description: "",
        unit: "PCS",
        qty: 1,
        basePrice: 0,
        included: true,
        category,
        section: sectionKey,
        subgroup: "accessory",
        marginRate: getMarginRateForBucket(
          resolveMarginBucket({ description: "", subgroup: "accessory", section: sectionKey, category }),
          selectedMarginTemplate,
          pricingConfig.materialMarkupRate
        ),
        catalogBasePrice: null,
        catalogMaterialId: null,
        isPanel: false,
        isManual: true,
        autoFromPanel: false,
        panelRatio: null,
        formulaKey: null,
        formulaFactor: null
      };

      return recomputePanelDependent([...prev, manual]);
    });
  };

  const removeManualItem = (templateItemId) => {
    setTemplateItems((prev) => prev.filter((item) => item.templateItemId !== templateItemId));
  };

  const getMaterialOptionGroupsForItem = (item) => {
    const itemSubgroup = isPanelDescription(item.description)
      ? "panel"
      : resolveItemSubgroup(item.subgroup, item.description);
    const itemCategory = itemSubgroup === "panel" ? "main" : item.category;

    const byCategory = materials.filter(
      (m) => String(m.category || "") === String(itemCategory || "")
    );
    const bySubgroupInCategory = byCategory.filter(
      (m) => String(m.subgroup || "") === String(itemSubgroup || "")
    );

    const strictSubgroups = new Set([
      "panel",
      "inverter",
      "battery",
      "mcb",
      "mccb",
      "spd",
      "ats_mts",
      "protection",
      "enclosure",
      "cable",
      "mounting",
      "connector"
    ]);

    // Prefer subgroup-first matching; category metadata can be inconsistent in imported catalogs.
    let pool = strictSubgroups.has(itemSubgroup)
      ? materials.filter((m) => String(m.subgroup || "") === String(itemSubgroup || ""))
      : bySubgroupInCategory;

    if (!pool.length) {
      pool = bySubgroupInCategory.length ? bySubgroupInCategory : byCategory;
    }

    const compatible = pool.filter((m) =>
      isMaterialCompatibleWithTemplate(itemSubgroup, m, selectedTemplateSystemType)
    );
    const scoped = compatible.length ? compatible : pool;

    const preferred = scoped.filter((m) => isAllowedByPreferredBrand(itemSubgroup, m));
    let filtered = preferred.length ? preferred : scoped;

    if (itemSubgroup === "inverter") {
      filtered = filterInverterCandidatesByKw(item.description, filtered);
    }

    filtered = filtered.sort((a, b) => sortMaterialOptions(a, b, itemSubgroup));

    const map = new Map();
    for (const mat of filtered) {
      const label = getOptionGroupLabel(itemSubgroup, mat);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(mat);
    }

    const labels = sortGroupLabels(itemSubgroup, Array.from(map.keys()));
    return labels.map((label) => ({ label, options: map.get(label) || [] }));
  };

  const applyMaterialSelection = (templateItemId, materialId) => {
    const id = Number(materialId);
    if (!id) return;
    const hit = materials.find((m) => Number(m.id) === id);
    if (!hit) return;

    updateItemById(templateItemId, {
      description: String(hit.material_name || ""),
      unit: String(hit.unit || ""),
      basePrice: Number(resolveCatalogDisplayPrice(hit.base_price || 0, quoteVatMode)),
      catalogBasePrice: Number(hit.base_price || 0),
      category: toStepCategory(hit.category, hit.material_name),
      subgroup: resolveItemSubgroup(hit.subgroup, hit.material_name),
      marginRate: getMarginRateForBucket(
        resolveMarginBucket({
          description: String(hit.material_name || ""),
          subgroup: resolveItemSubgroup(hit.subgroup, hit.material_name),
          section: null,
          category: toStepCategory(hit.category, hit.material_name)
        }),
        selectedMarginTemplate,
        pricingConfig.materialMarkupRate
      ),
      isPanel: isPanelItemLike({ description: String(hit.material_name || ""), subgroup: hit.subgroup }),
      formulaKey: detectMountingFormulaKey(String(hit.material_name || "")),
      catalogMaterialId: Number(hit.id)
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

  useEffect(() => {
    loadTemplates();
    loadMaterials();
    loadPricingConfig();
    loadMarginTemplates();
  }, []);

  useEffect(() => {
    setTemplateItems((prev) =>
      prev.map((item) => {
        if (!Number(item.catalogMaterialId || 0) || item.catalogBasePrice == null) return item;
        return {
          ...item,
          basePrice: resolveCatalogDisplayPrice(item.catalogBasePrice, quoteVatMode)
        };
      })
    );
  }, [quoteVatMode]);

  useEffect(() => {
    setTemplateItems((prev) =>
      recomputePanelDependent(
        applyMarginTemplateToItems(prev, selectedMarginTemplate, pricingConfig.materialMarkupRate)
      )
    );
    if (selectedMarginTemplate) {
      setInstallationMarginRate(
        normalizeRate(selectedMarginTemplate.installationMargin, pricingConfig.installationMarkupRate)
      );
    } else {
      setInstallationMarginRate(pricingConfig.installationMarkupRate);
    }
  }, [selectedMarginTemplate, pricingConfig.installationMarkupRate, pricingConfig.materialMarkupRate]);

  useEffect(() => {
    if (quoteView !== "recent") return;
    loadRecentQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteView]);

  const filteredTemplates = useMemo(() => {
    if (systemType === "all") return templates;
    return templates.filter((t) => detectTemplateSystemType(t.name) === systemType);
  }, [templates, systemType]);

  const groupedTemplates = useMemo(() => {
    const groups = new Map();

    for (const row of [...filteredTemplates].sort(compareTemplatesBySize)) {
      const label = getTemplateGroupLabel(row.name);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    }

    return Array.from(groups.entries())
      .map(([label, rows]) => ({ label, rows }))
      .sort(compareTemplateGroups);
  }, [filteredTemplates]);

  useEffect(() => {
    if (!templateId) return;
    const stillVisible = filteredTemplates.some((t) => String(t.id) === String(templateId));
    if (!stillVisible) setTemplateId("");
  }, [filteredTemplates, templateId]);

  useEffect(() => {
    setCreated(null);
    setExportError("");
    setCurrentStep(0);
    loadTemplateItems(templateId);
    loadPackagePrices(templateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  useEffect(() => {
    if (quoteView !== "recent") return;
    if (!selectedRecentQuoteId) {
      setSelectedRecentQuote(null);
      return;
    }
    loadRecentQuoteDetail(selectedRecentQuoteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteView, selectedRecentQuoteId]);

  const steps = useMemo(() => {
    const packageSteps = CATEGORY_DEFS.map((def) => {
      const items = templateItems.filter((item) => item.section === def.key);
      return { ...def, items };
    });
    return [
      ...packageSteps,
      {
        key: "others",
        label: "Others",
        items: templateItems.length
          ? [{ templateItemId: "others-complete-installation" }]
          : []
      }
    ];
  }, [templateItems]);

  const prevStepIndex = useMemo(() => {
    for (let i = currentStep - 1; i >= 0; i -= 1) {
      if ((steps[i]?.items?.length || 0) > 0) return i;
    }
    return -1;
  }, [steps, currentStep]);

  const nextStepIndex = useMemo(() => {
    for (let i = currentStep + 1; i < steps.length; i += 1) {
      if ((steps[i]?.items?.length || 0) > 0) return i;
    }
    return -1;
  }, [steps, currentStep]);

  useEffect(() => {
    if (!steps.length) {
      setCurrentStep(0);
      return;
    }
    if (currentStep > steps.length - 1) {
      setCurrentStep(steps.length - 1);
      return;
    }
    if ((steps[currentStep]?.items?.length || 0) > 0) return;

    const firstNonEmpty = steps.findIndex((s) => (s.items?.length || 0) > 0);
    if (firstNonEmpty >= 0 && firstNonEmpty !== currentStep) {
      setCurrentStep(firstNonEmpty);
    }
  }, [steps, currentStep]);

  const activeStep = steps[currentStep] || null;
  const isOthersStep = activeStep?.key === "others";

  const createQuote = async () => {
    setCreating(true);
    setQuoteError("");
    try {
      const selectedItems = templateItems
        .filter((item) => item.included)
        .map((item) => ({
          templateItemId: item.templateItemId,
          itemNo: Number(item.itemNo || 0),
          description: item.description,
          unit: item.unit,
          qty: Number(item.qty || 0),
          basePrice: Number(item.basePrice || 0),
          marginRate: normalizeRate(item.marginRate, pricingConfig.materialMarkupRate),
          included: item.included,
          autoFromPanel: item.autoFromPanel,
          panelRatio: item.panelRatio,
          catalogMaterialId: item.catalogMaterialId || null,
          isPanel: isPanelItemLike(item),
          subgroup: item.subgroup || null,
          panelWatt: parsePanelWatt(item.description),
          isManual: item.isManual === true
        }));

      const res = await api.post("/quotes", {
        templateId: Number(templateId),
        customerName,
        quoteDate,
        validUntil,
        items: selectedItems,
        packagePriceId: packagePriceId ? Number(packagePriceId) : null,
        discountItems: discountRows.filter((d) => Number(d.amount) > 0).map((d) => ({ label: d.label || "Discount", amount: Number(d.amount) })),
        installationMarginRate,
        installationMultiplier: installationMultiplierValue,
        quoteVatMode
      });
      setCreated(res.data);
      await loadRecentQuotes("", res.data?.quoteId || null);
    } catch (err) {
      setQuoteError(err?.response?.data?.message || "Failed to create quote");
    } finally {
      setCreating(false);
    }
  };

  const exportQuote = async ({ endpoint, fallbackExt, quoteId = created?.quoteId, quoteRef = created?.quoteRef }) => {
    if (!quoteId) return;

    setExporting(true);
    setExportError("");
    try {
      const res = await api.get(`/quotes/${quoteId}/export/${endpoint}`, {
        responseType: "blob"
      });

      const blob = new Blob([res.data], {
        type:
          fallbackExt === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const filename = getFilenameFromDisposition(
        res.headers["content-disposition"],
        `${quoteRef || `quote-${quoteId}`}.${fallbackExt}`
      );

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err?.response?.data?.message || "Failed to export quote");
    } finally {
      setExporting(false);
    }
  };

  const printSelectedQuote = () => {
    if (!selectedRecentQuote?.quote) return;

    const cleanup = () => document.body.classList.remove("quote-print-mode");
    document.body.classList.add("quote-print-mode");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 800);
  };

  const openRecentQuotePreview = (quoteId) => {
    const nextQuoteId = Number(quoteId);
    if (Number(selectedRecentQuoteId || 0) !== nextQuoteId) {
      setSelectedRecentQuote(null);
      setLoadingSelectedRecentQuote(true);
    }
    setSelectedRecentQuoteId(nextQuoteId);
    setPrintPreviewOpen(true);
  };

  const deleteQuote = (quote) => {
    if (!quote?.id) return;

    setConfirmState({
      title: "Delete Quote",
      message: `Delete ${quote.quoteRef}? This will remove the saved quote and its items.`,
      confirmLabel: "Delete Quote",
      confirmClassName: "btn btn-danger",
      onConfirm: async () => {
        setDeletingQuoteId(Number(quote.id));
        setRecentQuoteError("");
        setExportError("");
        try {
          await api.delete(`/quotes/${quote.id}`);
          const preferredQuoteId =
            Number(selectedRecentQuoteId || 0) === Number(quote.id) ? null : selectedRecentQuoteId;
          await loadRecentQuotes(recentSearch, preferredQuoteId);
        } catch (err) {
          setRecentQuoteError(err?.response?.data?.message || "Failed to delete quote");
        } finally {
          setDeletingQuoteId(null);
        }
      }
    });
  };

  const hasIncludedItems = templateItems.some((item) => item.included);
  const selectedPackagePrice = useMemo(
    () => packagePrices.find((p) => Number(p.id) === Number(packagePriceId || 0)) || null,
    [packagePrices, packagePriceId]
  );
  const includedItems = useMemo(
    () => templateItems.filter((item) => item.included),
    [templateItems]
  );
  const selectedPanelItems = useMemo(
    () => includedItems.filter((item) => isPanelItemLike(item)),
    [includedItems]
  );
  const selectedPanelQty = useMemo(
    () => selectedPanelItems.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    [selectedPanelItems]
  );
  const selectedPanelWatt = useMemo(() => {
    const panelWithWatt = selectedPanelItems.find((item) => parsePanelWatt(item.description) > 0);
    return parsePanelWatt(panelWithWatt?.description, 620) || 620;
  }, [selectedPanelItems]);
  const installationMultiplierValue = Math.max(
    0,
    Number(installationMultiplier || pricingConfig.installationRatePerWatt || 9) || 0
  );
  const estimatedMaterialSubtotal = useMemo(
    () =>
      includedItems.reduce(
        (sum, item) =>
          sum +
          applyMarkup(Number(item.basePrice || 0), normalizeRate(item.marginRate, pricingConfig.materialMarkupRate)) *
          Number(item.qty || 0),
        0
      ),
    [includedItems, pricingConfig.materialMarkupRate]
  );
  const estimatedInstallationBaseTotal = useMemo(
    () => roundPeso(selectedPanelQty * selectedPanelWatt * installationMultiplierValue),
    [installationMultiplierValue, selectedPanelQty, selectedPanelWatt]
  );
  const estimatedInstallationTotal = useMemo(() => {
    if (selectedPackagePrice) {
      return Math.max(0, roundPeso(Number(selectedPackagePrice.package_price || 0) - estimatedMaterialSubtotal));
    }

    return applyMarkup(estimatedInstallationBaseTotal, installationMarginRate);
  }, [
    estimatedInstallationBaseTotal,
    estimatedMaterialSubtotal,
    installationMarginRate,
    selectedPackagePrice
  ]);
  const estimatedSubtotal = useMemo(
    () =>
      selectedPackagePrice
        ? roundPeso(Number(selectedPackagePrice.package_price || 0))
        : roundPeso(estimatedMaterialSubtotal + estimatedInstallationTotal),
    [estimatedInstallationTotal, estimatedMaterialSubtotal, selectedPackagePrice]
  );
  const estimatedDiscountTotal = useMemo(
    () => discountRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [discountRows]
  );
  const estimatedTotalAfterDiscount = useMemo(
    () => Math.max(0, roundPeso(estimatedSubtotal - estimatedDiscountTotal)),
    [estimatedDiscountTotal, estimatedSubtotal]
  );
  const canCreate = Boolean(
    templateId &&
    customerName &&
    quoteDate &&
    validUntil &&
    !loadingItems &&
    templateItems.length > 0 &&
    hasIncludedItems &&
    !creating
  );
  const reviewedQuote = selectedRecentQuote?.quote || null;
  const reviewedQuoteItems = Array.isArray(selectedRecentQuote?.items) ? selectedRecentQuote.items : [];
  const reviewedQuotePreview = selectedRecentQuote?.preview || null;

  return (
    <div className={`quotes-page ${quoteView === "recent" ? "quotes-page-recent" : ""}`}>
      <div className="quote-mode-tabs">
        <button
          type="button"
          className={`step-pill ${quoteView === "create" ? "active" : ""}`}
          onClick={() => setQuoteView("create")}
        >
          Create Quote
        </button>
        <button
          type="button"
          className={`step-pill ${quoteView === "recent" ? "active" : ""}`}
          onClick={() => setQuoteView("recent")}
        >
          Recent Quotes
        </button>
      </div>

      {quoteView === "create" ? (
        <div className="quotes-layout">
          <div className="quote-form-stack">
            <div className="quote-section-card">
              <div className="quote-section-head">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
                </svg>
                <strong>System Configuration</strong>
                <span className="quote-section-head-sub">Select template and package scenario</span>
              </div>
              <div className="quote-section-fields">
                <div className="field">
                  <label htmlFor="systemType">System Type</label>
                  <select
                    id="systemType"
                    className="select"
                    value={systemType}
                    onChange={(e) => setSystemType(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="grid_tie">Grid Tie</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="template">Template</label>
                  <select
                    id="template"
                    className="select template-group-select"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    <option value="">Select Template</option>
                    {groupedTemplates.map((group) => (
                      <optgroup label={`---- ${group.label} ----`} key={group.label}>
                        {group.rows.map((row) => (
                          <option value={row.id} key={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="packagePrice">Package Scenario</label>
                  <select
                    id="packagePrice"
                    className="select"
                    value={packagePriceId}
                    onChange={(e) => setPackagePriceId(e.target.value)}
                  >
                    <option value="">Auto Installation Formula</option>
                    {packagePrices.map((p) => (
                      <option value={p.id} key={p.id}>
                        {`${p.scenario_label} - ${formatCurrency(p.package_price)}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="marginTemplate">Margin Template</label>
                  <select
                    id="marginTemplate"
                    className="select"
                    value={selectedMarginTemplateId}
                    onChange={(e) => setSelectedMarginTemplateId(e.target.value)}
                  >
                    <option value="">Default Margins</option>
                    {marginTemplates.map((row) => (
                      <option value={row.id} key={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="quoteVatMode">Material VAT</label>
                  <select
                    id="quoteVatMode"
                    className="select"
                    value={quoteVatMode}
                    onChange={(e) => setQuoteVatMode(e.target.value)}
                  >
                    <option value="incl">With VAT (12%)</option>
                    <option value="excl">Without VAT</option>
                  </select>
                </div>

                {loadingItems && <p className="section-note">Loading package items...</p>}
              </div>
            </div>

            <div className="quote-section-card">
              <div className="quote-section-head">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                <strong>Customer Details</strong>
                <span className="quote-section-head-sub">Name and validity period</span>
              </div>
              <div className="quote-section-fields">
                <div className="field">
                  <label htmlFor="customerName">Customer Name</label>
                  <input
                    id="customerName"
                    className="input"
                    placeholder="Customer Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="quoteDate">Quote Date</label>
                  <input
                    id="quoteDate"
                    className="input"
                    type="date"
                    value={quoteDate}
                    onChange={(e) => setQuoteDate(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="validUntil">Valid Until</label>
                  <input
                    id="validUntil"
                    className="input"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                </div>

              </div>

              {discountRows.length > 0 && (
                <div className="discount-rows">
                  {discountRows.map((row) => (
                    <div className="discount-row-item" key={row.id}>
                      <input
                        className="input"
                        placeholder="e.g. Promotional Discount"
                        value={row.label}
                        onChange={(e) => setDiscountRows((prev) => prev.map((r) => r.id === row.id ? { ...r, label: e.target.value } : r))}
                      />
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={row.amount}
                        onChange={(e) => setDiscountRows((prev) => prev.map((r) => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost discount-row-remove"
                        onClick={() => setDiscountRows((prev) => prev.filter((r) => r.id !== row.id))}
                        aria-label="Remove discount"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="btn btn-ghost discount-add-btn"
                onClick={() => setDiscountRows((prev) => [...prev, { id: Date.now(), label: "Promotional Discount", amount: "" }])}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                Add Discount
              </button>
            </div>

            {steps.length > 0 && (
              <div className="items-editor">
                <div className="items-editor-head">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  <strong>Customize Package Items</strong>
                  <span>Review and adjust quantities and prices per section</span>
                </div>
                <div className="quote-stepper">
                  {steps.map((step, idx) => (
                    <button
                      key={step.key}
                      type="button"
                      className={`step-pill ${idx === currentStep ? "active" : ""}`}
                      disabled={!step.items.length}
                      title={step.items.length ? "" : "No items in this section for this package"}
                      onClick={() => {
                        if (!step.items.length) return;
                        setCurrentStep(idx);
                      }}
                    >
                      {idx + 1}. {step.label}
                    </button>
                  ))}
                </div>

                {activeStep && (
                  <>
                    <div className="items-editor-note">
                      {activeStep.label} ({isOthersStep ? 1 : activeStep.items.length} {isOthersStep || activeStep.items.length === 1 ? "item" : "items"})
                    </div>
                    {!isOthersStep && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => addManualItemToSection(activeStep.key)}
                      >
                        Add Item
                      </button>
                    )}

                    {isOthersStep ? (
                      <>
                        <div className="others-grid others-grid-head">
                          <div>Description Item</div>
                          <div>Qty</div>
                          <div>kW</div>
                          <div>Qty of Panels</div>
                          <div>Multiplier</div>
                          <div>Total</div>
                        </div>
                        <div className="others-grid others-grid-row">
                          <input className="input" value="Complete Installation" readOnly />
                          <input className="input" value="1 Job" readOnly />
                          <input className="input" value={`${selectedPanelWatt || 620}W`} readOnly />
                          <input className="input" value={selectedPanelQty} readOnly />
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={installationMultiplier}
                            onChange={(e) => setInstallationMultiplier(e.target.value)}
                          />
                          <input
                            className="input"
                            value={formatCurrency(estimatedInstallationTotal)}
                            readOnly
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="items-grid items-grid-head">
                          <div>Use</div>
                          <div>No.</div>
                          <div>Description</div>
                          <div>Qty</div>
                          <div>Unit</div>
                          <div>{normalizeVatMode(quoteVatMode) === "incl" ? "Base Cost (VAT Incl.)" : "Base Cost"}</div>
                          <div>Margin %</div>
                          <div>Quote Price</div>
                        </div>

                        {!activeStep.items.length && (
                          <p className="section-note">No items assigned to this section.</p>
                        )}

                        {activeStep.items.map((item) => (
                          <div className="items-grid items-grid-row" key={item.templateItemId}>
                            <div>
                              <input
                                type="checkbox"
                                checked={item.included}
                                onChange={(e) =>
                                  updateItemById(item.templateItemId, { included: e.target.checked })
                                }
                              />
                            </div>
                            <div className="item-no-col">
                              <span>{item.itemNo}</span>
                              {item.isManual && (
                                <button
                                  type="button"
                                  className="link-mini"
                                  onClick={() => removeManualItem(item.templateItemId)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div>
                              <select
                                className="select material-pick-select"
                                value={item.catalogMaterialId || ""}
                                onChange={(e) =>
                                  applyMaterialSelection(item.templateItemId, e.target.value)
                                }
                              >
                                <option value="">Pick from price list</option>
                                {getMaterialOptionGroupsForItem(item).map((group) => (
                                  <optgroup label={group.label} key={group.label}>
                                    {group.options.map((mat) => (
                                      <option value={mat.id} key={mat.id}>
                                        {`${mat.material_name} | Base ${formatCurrency(mat.base_price)} -> VAT Incl. ${formatCurrency(
                                          toVatInclusivePrice(mat.base_price)
                                        )} | Used ${formatCurrency(resolveCatalogDisplayPrice(mat.base_price, quoteVatMode))}${mat.unit ? ` / ${mat.unit}` : ""
                                          }${mat.source_section ? ` | ${mat.source_section}` : ""}`}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                              <input
                                className="input"
                                value={item.description}
                                onChange={(e) =>
                                  updateItemById(item.templateItemId, (() => {
                                    const nextDescription = e.target.value;
                                    const nextCategory = detectCategory(nextDescription);
                                    const nextSubgroup = detectItemSubgroup(nextDescription);
                                    return {
                                      description: nextDescription,
                                      category: nextCategory,
                                      subgroup: nextSubgroup,
                                      marginRate: getMarginRateForBucket(
                                        resolveMarginBucket({
                                          description: nextDescription,
                                          subgroup: nextSubgroup,
                                          section: item.section,
                                          category: nextCategory
                                        }),
                                        selectedMarginTemplate,
                                        pricingConfig.materialMarkupRate
                                      ),
                                      formulaKey: detectMountingFormulaKey(nextDescription),
                                      catalogMaterialId: null,
                                      isPanel: isPanelItemLike({ description: nextDescription, subgroup: nextSubgroup })
                                    };
                                  })())
                                }
                              />
                            </div>
                            <div>
                              <div className="qty-wrap">
                                <input
                                  className="input"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.qty}
                                  disabled={item.autoFromPanel}
                                  onChange={(e) =>
                                    updateItemById(item.templateItemId, {
                                      qty: Number(e.target.value || 0)
                                    })
                                  }
                                />
                                {item.autoFromPanel && <span className="auto-chip">Auto</span>}
                              </div>
                            </div>
                            <div>
                              <input
                                className="input"
                                value={item.unit}
                                onChange={(e) =>
                                  updateItemById(item.templateItemId, { unit: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <input
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.basePrice}
                                onChange={(e) =>
                                  updateItemById(item.templateItemId, {
                                    basePrice: Number(e.target.value || 0)
                                  })
                                }
                              />
                            </div>
                            <div>
                              <input
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={(Number(item.marginRate || 0) * 100).toFixed(2)}
                                onChange={(e) =>
                                  updateItemById(item.templateItemId, {
                                    marginRate: Math.max(0, Number(e.target.value || 0) / 100)
                                  })
                                }
                              />
                            </div>
                            <div>
                              <input
                                className="input"
                                value={applyMarkup(
                                  Number(item.basePrice || 0),
                                  normalizeRate(item.marginRate, pricingConfig.materialMarkupRate)
                                )}
                                readOnly
                              />
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    <div className="step-nav">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={prevStepIndex === -1}
                        onClick={() => {
                          if (prevStepIndex !== -1) setCurrentStep(prevStepIndex);
                        }}
                      >
                        Previous
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={nextStepIndex === -1}
                        onClick={() => {
                          if (nextStepIndex !== -1) setCurrentStep(nextStepIndex);
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="quote-section-card quote-create-card">
              {quoteError && <div className="error-text quote-create-error">{quoteError}</div>}
              <button className="btn btn-primary quote-create-btn" disabled={!canCreate} onClick={createQuote}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                {creating ? "Creating..." : "Create Quote"}
              </button>
            </div>
          </div>

          <aside className="result-card">
            <div className="module-card-head result-card-head">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <div className="module-card-head-text">
                <strong>Quote Summary</strong>
                <span>Generated output &amp; export options</span>
              </div>
            </div>
            {!created && (
              <>
                <div className="stat-row">
                  <span>Estimated Materials</span>
                  <strong>{formatCurrency(estimatedMaterialSubtotal)}</strong>
                </div>
                <div className="stat-row">
                  <span>Estimated Installation</span>
                  <strong>{formatCurrency(estimatedInstallationTotal)}</strong>
                </div>
                <label className="field quote-export-vat-field">
                  <span>Installation Margin %</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={(Number(installationMarginRate || 0) * 100).toFixed(2)}
                    disabled={Boolean(selectedPackagePrice)}
                    onChange={(e) =>
                      setInstallationMarginRate(Math.max(0, Number(e.target.value || 0) / 100))
                    }
                  />
                </label>
                <div className="stat-row">
                  <span>Estimated Subtotal</span>
                  <strong>{formatCurrency(estimatedSubtotal)}</strong>
                </div>
                {estimatedDiscountTotal > 0 && (
                  <div className="stat-row stat-row-discount">
                    <span>Estimated Discount</span>
                    <strong>-{formatCurrency(estimatedDiscountTotal)}</strong>
                  </div>
                )}
                <div className="stat-row stat-row-total">
                  <span>Estimated Total</span>
                  <strong>{formatCurrency(estimatedTotalAfterDiscount)}</strong>
                </div>
              </>
            )}

            {created && (
              <>
                <div className="stat-row">
                  <span>Reference</span>
                  <strong>{created.quoteRef}</strong>
                </div>
                {Number(created.discountAmount) > 0 ? (
                  <>
                    <div className="stat-row">
                      <span>Subtotal</span>
                      <strong>{formatCurrency(created.subtotal)}</strong>
                    </div>
                    {(Array.isArray(created.discountItems) && created.discountItems.length > 0
                      ? created.discountItems
                      : [{ label: "Promotional Discount", amount: created.discountAmount }]
                    ).map((d, i) => (
                      <div className="stat-row stat-row-discount" key={i}>
                        <span>{d.label}</span>
                        <strong>-{formatCurrency(d.amount)}</strong>
                      </div>
                    ))}
                    <div className="stat-row stat-row-total">
                      <span>Total after Discount</span>
                      <strong>{formatCurrency(created.total)}</strong>
                    </div>
                  </>
                ) : (
                  <div className="stat-row">
                    <span>Total</span>
                    <strong>{formatCurrency(created.total)}</strong>
                  </div>
                )}
                {exportError && <div className="error-text">{exportError}</div>}
                <button
                  className="btn btn-secondary"
                  onClick={() => exportQuote({ endpoint: "customer-excel", fallbackExt: "xlsx" })}
                  disabled={exporting}
                >
                  {exporting ? "Exporting..." : "1) Customer Quotation Excel"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => exportQuote({ endpoint: "customer-pdf", fallbackExt: "pdf" })}
                  disabled={exporting}
                >
                  {exporting ? "Exporting..." : "2) Customer Quotation PDF"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => exportQuote({ endpoint: "company-excel", fallbackExt: "xlsx" })}
                  disabled={exporting}
                >
                  {exporting ? "Exporting..." : "3) Company Quotation Excel"}
                </button>
              </>
            )}
          </aside>
        </div>
      ) : (
        <div className="quotes-layout quote-review-layout">
          <div className="materials-card quote-review-shell">
            <div className="quote-review-toolbar">
              <input
                className="input"
                placeholder="Search by quote ref, customer, or template"
                value={recentSearch}
                onChange={(e) => setRecentSearch(e.target.value)}
              />
              <button className="btn btn-secondary" type="button" onClick={() => loadRecentQuotes(recentSearch)}>
                Search
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => loadRecentQuotes()}>
                Refresh
              </button>
            </div>

            {recentQuoteError && <div className="error-text">{recentQuoteError}</div>}

            <div className="materials-table-wrap">
              <table className="materials-table">
                <thead>
                  <tr>
                    <th>Quote Ref</th>
                    <th>Customer</th>
                    <th>Template</th>
                    <th>Quote Date</th>
                    <th>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQuotes.map((quote) => (
                    <tr key={quote.id}>
                      <td>
                        <strong>{quote.quoteRef}</strong>
                        <span className="table-subtext">{formatDateTimeLabel(quote.createdAt)}</span>
                      </td>
                      <td>{quote.customerName}</td>
                      <td>{quote.templateName || "-"}</td>
                      <td>{formatDateLabel(quote.quoteDate)}</td>
                      <td>{formatCurrency(quote.total)}</td>
                      <td>
                        <div className="materials-actions quote-list-actions">
                          <button
                            className="btn btn-ghost"
                            type="button"
                            disabled={deletingQuoteId === Number(quote.id)}
                            onClick={() => openRecentQuotePreview(quote.id)}
                          >
                            Review
                          </button>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            disabled={exporting || deletingQuoteId === Number(quote.id)}
                            onClick={() =>
                              exportQuote({
                                endpoint: "customer-excel",
                                fallbackExt: "xlsx",
                                quoteId: quote.id,
                                quoteRef: quote.quoteRef
                              })
                            }
                          >
                            Excel
                          </button>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            disabled={exporting || deletingQuoteId === Number(quote.id)}
                            onClick={() =>
                              exportQuote({
                                endpoint: "customer-pdf",
                                fallbackExt: "pdf",
                                quoteId: quote.id,
                                quoteRef: quote.quoteRef
                              })
                            }
                          >
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!recentQuotes.length && !loadingRecentQuotes && (
                    <tr>
                      <td colSpan={6} className="empty-state-cell">
                        No saved quotes found.
                      </td>
                    </tr>
                  )}

                  {loadingRecentQuotes && (
                    <tr>
                      <td colSpan={6} className="empty-state-cell">
                        Loading recent quotes...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="result-card quote-review-card">
            <h4>Quote Review</h4>

            {!selectedRecentQuoteId && !loadingSelectedRecentQuote && (
              <p className="section-note">Select a saved quote to review it again.</p>
            )}

            {loadingSelectedRecentQuote && <p className="section-note">Loading quote details...</p>}

            {selectedRecentQuoteMeta && (
              <>
                <div className="stat-row">
                  <span>Reference</span>
                  <strong>{selectedRecentQuoteMeta.quoteRef}</strong>
                </div>
                <div className="stat-row">
                  <span>Customer</span>
                  <strong>{selectedRecentQuoteMeta.customerName}</strong>
                </div>
                <div className="stat-row">
                  <span>Template</span>
                  <strong>{selectedRecentQuoteMeta.templateName || "-"}</strong>
                </div>
                <div className="stat-row">
                  <span>Quote Date</span>
                  <strong>{formatDateLabel(selectedRecentQuoteMeta.quoteDate)}</strong>
                </div>
                <div className="stat-row">
                  <span>Valid Until</span>
                  <strong>{formatDateLabel(selectedRecentQuoteMeta.validUntil)}</strong>
                </div>
                <div className="stat-row">
                  <span>Total</span>
                  <strong>{formatCurrency(selectedRecentQuoteMeta.total)}</strong>
                </div>
                <div className="stat-row">
                  <span>Created By</span>
                  <strong>
                    {selectedRecentQuoteMeta.createdByName || selectedRecentQuoteMeta.createdByUsername || "-"}
                  </strong>
                </div>

                {exportError && <div className="error-text">{exportError}</div>}

                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setPrintPreviewOpen(true)}
                  disabled={loadingSelectedRecentQuote}
                >
                  Print Preview
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    exportQuote({
                      endpoint: "customer-excel",
                      fallbackExt: "xlsx",
                      quoteId: selectedRecentQuoteMeta.id,
                      quoteRef: selectedRecentQuoteMeta.quoteRef
                    })
                  }
                  disabled={exporting}
                >
                  {exporting ? "Exporting..." : "1) Customer Quotation Excel"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    exportQuote({
                      endpoint: "customer-pdf",
                      fallbackExt: "pdf",
                      quoteId: selectedRecentQuoteMeta.id,
                      quoteRef: selectedRecentQuoteMeta.quoteRef
                    })
                  }
                  disabled={exporting}
                >
                  {exporting ? "Exporting..." : "2) Customer Quotation PDF"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    exportQuote({
                      endpoint: "company-excel",
                      fallbackExt: "xlsx",
                      quoteId: selectedRecentQuoteMeta.id,
                      quoteRef: selectedRecentQuoteMeta.quoteRef
                    })
                  }
                  disabled={exporting}
                >
                  {exporting ? "Exporting..." : "3) Company Quotation Excel"}
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={exporting || deletingQuoteId === Number(selectedRecentQuoteMeta.id)}
                  onClick={() => deleteQuote(selectedRecentQuoteMeta)}
                >
                  {deletingQuoteId === Number(selectedRecentQuoteMeta.id) ? "Deleting..." : "Delete Quote"}
                </button>

                <div className="quote-review-items">
                  <div className="items-editor-title">
                    Items ({reviewedQuoteItems.length || Number(selectedRecentQuoteMeta.itemCount || 0)})
                  </div>
                  {!reviewedQuote && !loadingSelectedRecentQuote && (
                    <p className="section-note">No detailed item data loaded.</p>
                  )}
                  {reviewedQuoteItems.map((item) => (
                    <div className="quote-review-item" key={item.id}>
                      <div className="quote-review-item-top">
                        <strong>{item.description}</strong>
                        <span>{formatCurrency(item.line_total)}</span>
                      </div>
                      <div className="quote-review-item-meta">
                        <span>No. {item.item_no}</span>
                        <span>Qty: {item.qty}</span>
                        <span>{item.unit || "-"}</span>
                        <span>Unit Price: {formatCurrency(item.unit_price)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {printPreviewOpen && (
        <QuotePrintPreview
          quote={reviewedQuote}
          meta={selectedRecentQuoteMeta}
          items={reviewedQuoteItems}
          preview={reviewedQuotePreview}
          loading={loadingSelectedRecentQuote}
          exporting={exporting}
          onClose={() => setPrintPreviewOpen(false)}
          onPrint={printSelectedQuote}
          onExportPdf={() => {
            if (!selectedRecentQuoteMeta?.id) return;
            exportQuote({
              endpoint: "customer-pdf",
              fallbackExt: "pdf",
              quoteId: selectedRecentQuoteMeta.id,
              quoteRef: selectedRecentQuoteMeta.quoteRef
            });
          }}
        />
      )}

      {confirmState && (
        <div
          className="modal-backdrop"
          role="presentation"
        >
          <div
            className="modal-card quote-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quote-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-copy">
              <h4 id="quote-confirm-title">{confirmState.title}</h4>
              <p>{confirmState.message}</p>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setConfirmState(null)}
                disabled={Boolean(deletingQuoteId)}
              >
                Cancel
              </button>
              <button
                className={confirmState.confirmClassName}
                type="button"
                disabled={Boolean(deletingQuoteId)}
                onClick={async () => {
                  await confirmState.onConfirm();
                  setConfirmState(null);
                }}
              >
                {deletingQuoteId ? "Deleting..." : confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
