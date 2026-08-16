import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import api from "../api/client";
import { isAdminRole, normalizeModules } from "../constants/access";
import "../styles/overview.css";

/* ---------- helpers ---------- */

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value, fractionDigits = 2) {
  return toNumber(value, 0).toLocaleString("en-PH", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
}

function php(value) {
  return `₱${formatMoney(value)}`;
}

function phpCompact(value) {
  const n = toNumber(value, 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}₱${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}₱${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}₱${abs.toFixed(0)}`;
}

/* HELIOS chart palette — dataviz-validated per theme surface.
   `in` = photon cyan (chart-2), `out` = solar orange (chart-1) — a CVD-safe
   adjacent pair; `single` = blue (chart-5) for lone-series categories. */
const CHART_PALETTES = {
  light: { in: "#0891b2", out: "#c2410c", single: "#1d4ed8" },
  dark: { in: "#0891b2", out: "#ea580c", single: "#3b82f6" }
};

const ACCOUNT_TYPE_DIRECTIONS = {
  expense: "out",
  income: "in",
  investment: "in",
  withdrawal: "out"
};

function transactionDirection(tx) {
  const raw = String(tx?.account_type || tx?.type || "").toLowerCase();
  if (raw === "in" || raw === "out") return raw;
  return ACCOUNT_TYPE_DIRECTIONS[raw] || "out";
}

function monthKeyOf(value) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}/.test(text)) return text.slice(0, 7);
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(count) {
  const now = new Date();
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const showYear = i === count - 1 || d.getMonth() === 0;
    const label = `${d.toLocaleDateString(undefined, { month: "short" })}${showYear ? ` '${String(d.getFullYear()).slice(2)}` : ""}`;
    months.push({ key, label });
  }
  return months;
}

const EVENT_STATUS_META = [
  { key: "planned", label: "Planned", varName: "--info" },
  { key: "in_progress", label: "In Progress", varName: "--warn" },
  { key: "completed", label: "Completed", varName: "--success" },
  { key: "cancelled", label: "Cancelled", varName: "--text-faint" }
];

/* ---------- chart chrome ---------- */

function ChartTooltip({ active, payload, label, money = true }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="ov-tooltip" role="presentation">
      {label != null && label !== "" && <div className="ov-tooltip-label">{label}</div>}
      {payload.map((entry) => (
        <div className="ov-tooltip-row" key={entry.dataKey || entry.name}>
          <span className="ov-tooltip-dot" style={{ background: entry.color || entry.fill }} aria-hidden="true" />
          <span className="ov-tooltip-name">{entry.name}</span>
          <span className="ov-tooltip-value">{money ? php(entry.value) : toNumber(entry.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function LegendChips({ items }) {
  return (
    <div className="ov-legend">
      {items.map((item) => (
        <span className="ov-legend-chip" key={item.label}>
          <span className="ov-legend-dot" style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({ title, caption, legend, children }) {
  return (
    <section className="ov-card">
      <header className="ov-card-head">
        <div>
          <h3 className="ov-card-title">{title}</h3>
          {caption && <p className="ov-card-caption">{caption}</p>}
        </div>
        {legend || null}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ message, hint }) {
  return (
    <div className="ov-empty">
      <p className="ov-empty-message">{message}</p>
      {hint && <p className="ov-empty-hint">{hint}</p>}
    </div>
  );
}

/* Horizontal category bar: rounded 4px on the data end, square at the baseline. */
function SignedBarShape(props) {
  const negative = toNumber(props?.payload?.value) < 0;
  return <Rectangle {...props} radius={negative ? [4, 0, 0, 4] : [0, 4, 4, 0]} />;
}

function CategoryValueLabel({ x, y, width, height, value }) {
  const negative = toNumber(value) < 0;
  // Positive bars: label right of the data end. Negative bars extend left from
  // the zero baseline (x + width), which sits close to the axis when the
  // negative extent is small — so anchor the label just right of the baseline
  // where there is always clear space, instead of colliding with axis names.
  const endX = negative ? x + width + 6 : x + width + 6;
  return (
    <text
      x={endX}
      y={y + height / 2}
      textAnchor="start"
      dominantBaseline="central"
      className="ov-bar-label"
    >
      {phpCompact(value)}
    </text>
  );
}

const AXIS_TICK = { fill: "var(--text-soft)", fontSize: 11 };
const AXIS_TICK_MONO = { fill: "var(--text-soft)", fontSize: 11, fontFamily: "var(--font-mono)" };

/* ---------- page ---------- */

export default function OverviewTab({ currentUser, theme = "light" }) {
  const palette = CHART_PALETTES[theme === "dark" ? "dark" : "light"];

  const modules = useMemo(
    () => normalizeModules(currentUser?.permissions, ["calendar"]),
    [currentUser?.permissions]
  );
  const admin = isAdminRole(currentUser?.role);
  const can = useMemo(() => {
    return (key) => admin || modules.includes(key);
  }, [admin, modules]);

  const canFinance = can("finance");
  const canCrm = can("crm");
  const canCalendar = can("calendar");
  const canInventory = can("inventory");
  const canPayroll = can("payroll");

  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState({});

  useEffect(() => {
    let cancelled = false;

    const requests = [];
    if (canFinance) {
      requests.push(["budgetSummary", "/budget/summary"]);
      requests.push(["transactions", "/budget"]);
    }
    if (canFinance || canCrm) requests.push(["customers", "/customers/summary"]);
    if (canCalendar) requests.push(["events", "/events"]);
    if (canInventory) requests.push(["inventory", "/inventory?active=all"]);
    if (canPayroll) requests.push(["employees", "/payroll/employees?active=all"]);

    if (!requests.length) {
      setSections({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    Promise.allSettled(requests.map(([, url]) => api.get(url))).then((results) => {
      if (cancelled) return;
      const next = {};
      results.forEach((result, index) => {
        const key = requests[index][0];
        next[key] =
          result.status === "fulfilled"
            ? { ok: true, value: result.value?.data }
            : { ok: false, value: null };
      });
      setSections(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [canFinance, canCrm, canCalendar, canInventory, canPayroll]);

  const budgetSummary = sections.budgetSummary?.ok ? sections.budgetSummary.value || {} : null;
  const transactions = sections.transactions?.ok
    ? Array.isArray(sections.transactions.value)
      ? sections.transactions.value
      : []
    : null;
  const customersSummary = sections.customers?.ok ? sections.customers.value || {} : null;
  const events = sections.events?.ok
    ? Array.isArray(sections.events.value)
      ? sections.events.value
      : []
    : null;
  const inventoryItems = sections.inventory?.ok
    ? Array.isArray(sections.inventory.value)
      ? sections.inventory.value
      : []
    : null;
  const employees = sections.employees?.ok
    ? Array.isArray(sections.employees.value)
      ? sections.employees.value
      : []
    : null;

  /* ----- aggregations ----- */

  const months = useMemo(() => lastMonths(12), []);

  const cashFlowData = useMemo(() => {
    if (!transactions) return [];
    const byMonth = new Map(months.map((m) => [m.key, { label: m.label, moneyIn: 0, moneyOut: 0 }]));
    for (const tx of transactions) {
      const key = monthKeyOf(tx?.transaction_date || tx?.date);
      const bucket = byMonth.get(key);
      if (!bucket) continue;
      const amount = toNumber(tx?.amount, 0);
      if (transactionDirection(tx) === "in") bucket.moneyIn += amount;
      else bucket.moneyOut += amount;
    }
    return months.map((m) => byMonth.get(m.key));
  }, [transactions, months]);

  const hasCashFlow = useMemo(
    () => cashFlowData.some((row) => row.moneyIn > 0 || row.moneyOut > 0),
    [cashFlowData]
  );

  const cumulativeData = useMemo(() => {
    let running = 0;
    return cashFlowData.map((row) => {
      running += row.moneyIn;
      return { label: row.label, collected: running };
    });
  }, [cashFlowData]);

  const categoryData = useMemo(() => {
    if (!transactions) return [];
    const byAccount = new Map();
    for (const tx of transactions) {
      const name = String(tx?.account_name || "Uncategorized");
      const amount = toNumber(tx?.amount, 0);
      const signed = transactionDirection(tx) === "in" ? amount : -amount;
      byAccount.set(name, (byAccount.get(name) || 0) + signed);
    }
    const ranked = Array.from(byAccount.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((row) => row.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const top = ranked.slice(0, 6);
    const rest = ranked.slice(6);
    if (rest.length) {
      const other = rest.reduce((sum, row) => sum + row.value, 0);
      if (other !== 0) top.push({ name: "Other", value: other });
    }
    return top;
  }, [transactions]);

  const statusCounts = useMemo(() => {
    if (!events) return null;
    const counts = { planned: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const event of events) {
      const status = String(event?.status || "planned");
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
      else counts.planned += 1;
    }
    return counts;
  }, [events]);

  const totalEvents = events ? events.length : 0;

  /* ----- KPI row ----- */

  const financeKpis = useMemo(() => {
    if (!canFinance) return null;
    const collected = budgetSummary ? toNumber(budgetSummary.collectedIncome ?? budgetSummary.totalIn) : null;
    const expenses = budgetSummary ? toNumber(budgetSummary.totalOut) : null;
    const net = budgetSummary ? toNumber(budgetSummary.netBalance) : null;
    const sales = customersSummary ? toNumber(customersSummary.totalSales) : null;
    return [
      {
        label: "All-time Sales",
        accent: "metric-accent-green",
        value: sales,
        caption: customersSummary
          ? `${toNumber(customersSummary.totalProjects)} project${toNumber(customersSummary.totalProjects) === 1 ? "" : "s"}`
          : "Unavailable"
      },
      {
        label: "Total Collected",
        accent: "metric-accent-blue",
        value: collected,
        caption: budgetSummary ? `${toNumber(budgetSummary.transactionCount)} transactions` : "Unavailable"
      },
      {
        label: "Total Expenses",
        accent: "metric-accent-orange",
        value: expenses,
        caption: budgetSummary ? `${toNumber(budgetSummary.activeAccounts)} active categories` : "Unavailable"
      },
      {
        label: "Net Balance",
        accent: net != null && net < 0 ? "metric-accent-red" : "metric-accent-purple",
        value: net,
        caption: net == null ? "Unavailable" : net >= 0 ? "Positive" : "Negative"
      }
    ];
  }, [canFinance, budgetSummary, customersSummary]);

  const fallbackKpis = useMemo(() => {
    if (canFinance) return null;
    const cards = [];
    if (canCrm) {
      cards.push({
        label: "Customers",
        accent: "metric-accent-blue",
        count: customersSummary ? toNumber(customersSummary.totalCustomers) : null,
        caption: customersSummary
          ? `${toNumber(customersSummary.totalProjects)} project${toNumber(customersSummary.totalProjects) === 1 ? "" : "s"}`
          : "Unavailable"
      });
    }
    if (canCalendar) {
      const open = events
        ? events.filter((event) => event.status !== "completed" && event.status !== "cancelled").length
        : null;
      cards.push({
        label: "Activities",
        accent: "metric-accent-green",
        count: events ? events.length : null,
        caption: open == null ? "Unavailable" : `${open} open`
      });
    }
    if (canInventory) {
      const active = inventoryItems
        ? inventoryItems.filter((item) => Number(item?.is_active) === 1).length
        : null;
      cards.push({
        label: "Inventory Items",
        accent: "metric-accent-orange",
        count: active,
        caption: inventoryItems ? `${inventoryItems.length} tracked` : "Unavailable"
      });
    }
    if (canPayroll) {
      const active = employees ? employees.filter((employee) => employee?.status !== "inactive").length : null;
      cards.push({
        label: "Employees",
        accent: "metric-accent-purple",
        count: active,
        caption: employees ? `${employees.length} on record` : "Unavailable"
      });
    }
    return cards.slice(0, 4);
  }, [canFinance, canCrm, canCalendar, canInventory, canPayroll, customersSummary, events, inventoryItems, employees]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }),
    []
  );

  /* ----- render ----- */

  const showFinanceCharts = canFinance;
  const showActivityChart = canCalendar;

  return (
    <div className="overview-page">
      <header className="page-head">
        <div className="page-head-main">
          <span className="page-head-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2.5" y="2.5" width="6" height="8" rx="1.2" />
              <rect x="11.5" y="2.5" width="6" height="5" rx="1.2" />
              <rect x="11.5" y="10.5" width="6" height="7" rx="1.2" />
              <rect x="2.5" y="13.5" width="6" height="4" rx="1.2" />
            </svg>
          </span>
          <div className="page-head-copy">
            <h2 className="page-head-title">Overview</h2>
            <p className="page-head-desc">{todayLabel}</p>
          </div>
        </div>
      </header>

      {loading ? (
        <>
          <div className="ov-kpis" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div className="ov-skeleton ov-skeleton-kpi" key={i} />
            ))}
          </div>
          <div className="ov-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div className="ov-skeleton ov-skeleton-chart" key={i} />
            ))}
          </div>
          <p className="ov-loading-note" role="status">
            Loading overview…
          </p>
        </>
      ) : (
        <>
          {financeKpis && (
            <div className="ov-kpis">
              {financeKpis.map((kpi) => (
                <article className={`metric-card ${kpi.accent}`} key={kpi.label}>
                  <strong className="ov-kpi-value">{kpi.value == null ? "—" : php(kpi.value)}</strong>
                  <span>{kpi.label}</span>
                  <span className="metric-caption">{kpi.caption}</span>
                </article>
              ))}
            </div>
          )}

          {fallbackKpis && fallbackKpis.length > 0 && (
            <div className="ov-kpis">
              {fallbackKpis.map((kpi) => (
                <article className={`metric-card ${kpi.accent}`} key={kpi.label}>
                  <strong className="ov-kpi-value">
                    {kpi.count == null ? "—" : kpi.count.toLocaleString()}
                  </strong>
                  <span>{kpi.label}</span>
                  <span className="metric-caption">{kpi.caption}</span>
                </article>
              ))}
            </div>
          )}

          {(showFinanceCharts || showActivityChart) && (
            <div className="ov-grid">
              {showFinanceCharts && (
                <ChartCard
                  title="Monthly cash flow"
                  caption="Money in vs money out · last 12 months"
                  legend={
                    <LegendChips
                      items={[
                        { label: "Money in", color: palette.in },
                        { label: "Money out", color: palette.out }
                      ]}
                    />
                  }
                >
                  {transactions == null ? (
                    <EmptyState
                      message="Couldn't load transactions."
                      hint="Refresh the page or check Financial Management."
                    />
                  ) : !hasCashFlow ? (
                    <EmptyState
                      message="No cash movement in the last 12 months."
                      hint="Record income and expenses in Financial Management to see cash flow here."
                    />
                  ) : (
                    <div className="ov-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={cashFlowData} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke="var(--border-soft)" strokeWidth={1} />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} minTickGap={12} />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            width={52}
                            tick={AXIS_TICK_MONO}
                            tickFormatter={phpCompact}
                          />
                          <Tooltip
                            content={<ChartTooltip />}
                            cursor={{ fill: "var(--border-soft)", opacity: 0.5 }}
                            isAnimationActive={false}
                          />
                          <Bar
                            dataKey="moneyIn"
                            name="Money in"
                            fill={palette.in}
                            stroke="var(--surface)"
                            strokeWidth={1}
                            maxBarSize={22}
                            radius={[4, 4, 0, 0]}
                            isAnimationActive={false}
                          />
                          <Bar
                            dataKey="moneyOut"
                            name="Money out"
                            fill={palette.out}
                            stroke="var(--surface)"
                            strokeWidth={1}
                            maxBarSize={22}
                            radius={[4, 4, 0, 0]}
                            isAnimationActive={false}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartCard>
              )}

              {showFinanceCharts && (
                <ChartCard title="Cumulative collections" caption="Running total of money in · last 12 months">
                  {transactions == null ? (
                    <EmptyState
                      message="Couldn't load transactions."
                      hint="Refresh the page or check Financial Management."
                    />
                  ) : !hasCashFlow ? (
                    <EmptyState
                      message="Nothing collected yet."
                      hint="Collections recorded in Financial Management build this trend."
                    />
                  ) : (
                    <div className="ov-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cumulativeData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke="var(--border-soft)" strokeWidth={1} />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} minTickGap={12} />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            width={52}
                            tick={AXIS_TICK_MONO}
                            tickFormatter={phpCompact}
                          />
                          <Tooltip
                            content={<ChartTooltip />}
                            cursor={{ stroke: "var(--text-faint)", strokeWidth: 1 }}
                            isAnimationActive={false}
                          />
                          <Area
                            type="monotone"
                            dataKey="collected"
                            name="Collected"
                            stroke={palette.in}
                            strokeWidth={2}
                            fill={palette.in}
                            fillOpacity={0.08}
                            dot={false}
                            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartCard>
              )}

              {showFinanceCharts && (
                <ChartCard title="Category balances" caption="Top categories by net balance · all time">
                  {transactions == null ? (
                    <EmptyState
                      message="Couldn't load transactions."
                      hint="Refresh the page or check Financial Management."
                    />
                  ) : categoryData.length === 0 ? (
                    <EmptyState
                      message="No category activity yet."
                      hint="Assign transactions to categories in Financial Management to compare balances."
                    />
                  ) : (
                    <div
                      className="ov-chart"
                      style={{ height: Math.min(224, Math.max(120, categoryData.length * 44 + 24)) }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={categoryData}
                          layout="vertical"
                          barCategoryGap="30%"
                          margin={{ top: 4, right: 64, left: 4, bottom: 4 }}
                        >
                          <XAxis
                            type="number"
                            hide
                            domain={[
                              (dataMin) => (dataMin < 0 ? dataMin * 1.25 : 0),
                              (dataMax) => (dataMax > 0 ? dataMax * 1.25 : 0)
                            ]}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            width={118}
                            tick={AXIS_TICK}
                            tickFormatter={(name) =>
                              String(name).length > 15 ? `${String(name).slice(0, 14)}…` : name
                            }
                          />
                          <Tooltip
                            content={<ChartTooltip />}
                            cursor={{ fill: "var(--border-soft)", opacity: 0.5 }}
                            isAnimationActive={false}
                          />
                          <Bar
                            dataKey="value"
                            name="Net balance"
                            fill={palette.single}
                            maxBarSize={16}
                            shape={<SignedBarShape />}
                            isAnimationActive={false}
                          >
                            <LabelList dataKey="value" content={<CategoryValueLabel />} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartCard>
              )}

              {showActivityChart && (
                <ChartCard title="Activity status" caption="Calendar activities by current status">
                  {statusCounts == null ? (
                    <EmptyState message="Couldn't load activities." hint="Refresh the page or check the Calendar." />
                  ) : totalEvents === 0 ? (
                    <EmptyState
                      message="No activities scheduled."
                      hint="Create activities in the Calendar to track their progress here."
                    />
                  ) : (
                    <div className="ov-status">
                      <div
                        className="ov-status-bar"
                        role="img"
                        aria-label={EVENT_STATUS_META.map(
                          (meta) => `${meta.label}: ${statusCounts[meta.key]}`
                        ).join(", ")}
                      >
                        {EVENT_STATUS_META.filter((meta) => statusCounts[meta.key] > 0).map((meta) => (
                          <span
                            key={meta.key}
                            className="ov-status-segment"
                            style={{
                              flexGrow: statusCounts[meta.key],
                              background: `var(${meta.varName})`
                            }}
                          />
                        ))}
                      </div>
                      <ul className="ov-status-legend">
                        {EVENT_STATUS_META.map((meta) => (
                          <li className="ov-status-row" key={meta.key}>
                            <span className="ov-legend-dot" style={{ background: `var(${meta.varName})` }} aria-hidden="true" />
                            <span className="ov-status-label">{meta.label}</span>
                            <span className="ov-status-count">{statusCounts[meta.key].toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </ChartCard>
              )}
            </div>
          )}

          {!financeKpis && (!fallbackKpis || fallbackKpis.length === 0) && !showFinanceCharts && !showActivityChart && (
            <EmptyState
              message="Nothing to show yet."
              hint="Ask an administrator to grant module access to populate this overview."
            />
          )}
        </>
      )}
    </div>
  );
}
