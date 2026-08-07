'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { useExpenseSummary } from '@/lib/queries/expense-assets';
import { expenseCategories, expenseTypes, type ExpenseType } from '@/lib/validators/expense';
import {
  buildAssetBreakdown, buildSubTypeShares, buildMonthlyTrend, buildHeadline,
  capShares,
  PERIOD_LABELS, type PeriodKey, type AssetBreakdownRow,
} from '@/lib/expense-analytics';
import { formatPKR } from '@/lib/money';
import { KPICard, ExportButtons } from './shared';
import {
  exportExpenseAnalyticsPdf, exportExpenseAnalyticsExcel,
} from '@/lib/actions/expense-reports';

// Validated categorical palette (dataviz skill, light mode, 4 slots pass
// adjacent-pair checks; aqua/yellow sit under 3:1 contrast so every chart
// here also carries direct labels or a table — the relief rule).
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const;
const SERIES_GRAY = '#9ca3af';

type RangePreset = 'month' | '3m' | '6m' | 'year';

const RANGE_MONTHS: Record<RangePreset, number> = { month: 1, '3m': 3, '6m': 6, year: 0 };
const RANGE_LABELS: Record<RangePreset, string> = {
  month: 'This Month', '3m': 'Last 3 Months', '6m': 'Last 6 Months', year: 'This Year',
};

const TABLE_PERIODS: PeriodKey[] = ['thisMonth', 'lastMonth', 'threeMonths', 'sixMonths', 'year', 'total'];

export function ExpenseAnalytics() {
  const now = useMemo(() => new Date(), []);
  const [range, setRange] = useState<RangePreset>('month');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'' | ExpenseType>('');
  const [sortBy, setSortBy] = useState<PeriodKey>('total');
  const [sortDesc, setSortDesc] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Asset multi-select for the comparison chart (first two get charted).
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [donutAssetKey, setDonutAssetKey] = useState<string>('');

  // One all-time fetch; every widget derives from it client-side.
  const { data: allRows = [], isLoading } = useExpenseSummary({
    category: category || undefined,
    type: type || undefined,
  });

  const monthsBack =
    range === 'year' ? now.getMonth() + 1 : RANGE_MONTHS[range];

  const headline = useMemo(
    () => buildHeadline(allRows, now, monthsBack),
    [allRows, now, monthsBack],
  );

  const breakdown = useMemo(() => {
    const rows = buildAssetBreakdown(allRows, now);
    return [...rows].sort((a, b) => {
      const d = a.periods[sortBy] - b.periods[sortBy];
      return sortDesc ? -d : d;
    });
  }, [allRows, now, sortBy, sortDesc]);

  const trendAsset = compareIds.length === 1 ? compareIds[0] : undefined;
  const trend = useMemo(
    () => buildMonthlyTrend(allRows, now, 12, trendAsset),
    [allRows, now, trendAsset],
  );

  const donutKey = donutAssetKey || breakdown.find((r) => r.key !== 'untracked')?.key || '';
  const donutShares = useMemo(
    () => (donutKey ? capShares(buildSubTypeShares(allRows, donutKey, now), 5) : []),
    [allRows, donutKey, now],
  );
  const donutName = breakdown.find((r) => r.key === donutKey)?.assetName ?? '';

  const compare = useMemo(() => {
    if (compareIds.length < 2) return null;
    const [a, b] = compareIds;
    const ta = buildMonthlyTrend(allRows, now, 6, a);
    const tb = buildMonthlyTrend(allRows, now, 6, b);
    const nameOf = (k: string) => breakdown.find((r) => r.key === k)?.assetName ?? k;
    return {
      aName: nameOf(a),
      bName: nameOf(b),
      points: ta.map((p, i) => ({ label: p.label, a: p.paisa, b: tb[i]?.paisa ?? 0 })),
    };
  }, [compareIds, allRows, now, breakdown]);

  function toggleSort(p: PeriodKey) {
    if (sortBy === p) setSortDesc((d) => !d);
    else { setSortBy(p); setSortDesc(true); }
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCompare(key: string) {
    setCompareIds((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].slice(-2),
    );
  }

  const rupees = (paisa: number) => paisa / 100;
  const tooltipMoney = (v: unknown) => formatPKR(Math.round(Number(v) * 100));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="space-y-2.5">
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((r) => (
            <Chip key={r} label={RANGE_LABELS[r]} active={range === r} onClick={() => setRange(r)} />
          ))}
          <span className="w-px bg-gray-200 shrink-0" />
          <Chip label="All Categories" active={category === ''} onClick={() => setCategory('')} />
          {expenseCategories.map((c) => (
            <Chip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs font-medium text-gray-500">Type:</span>
          <Chip label="All" active={type === ''} onClick={() => setType('')} small />
          {expenseTypes.map((t) => (
            <Chip
              key={t}
              label={t === 'business' ? 'Business' : 'Home'}
              active={type === t}
              onClick={() => setType(type === t ? '' : t)}
              small
            />
          ))}
          <div className="flex-1" />
          <ExportButtons
            onExportPdf={() => exportExpenseAnalyticsPdf({ category, type })}
            onExportExcel={() => exportExpenseAnalyticsExcel({ category, type })}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label={`Total (${RANGE_LABELS[range]})`}
          value={formatPKR(headline.totalPaisa)}
        />
        <KPICard
          label="Top Category"
          value={headline.topCategory?.name ?? '—'}
          sub={headline.topCategory ? formatPKR(headline.topCategory.paisa) : undefined}
        />
        <KPICard
          label="Top Item"
          value={headline.topAsset?.name ?? '—'}
          sub={headline.topAsset ? formatPKR(headline.topAsset.paisa) : undefined}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">vs Previous Period</p>
          {headline.vsPreviousPct === null ? (
            <p className="text-xl font-mono font-semibold mt-1 text-gray-400">—</p>
          ) : (
            <p
              className={[
                'text-xl font-mono font-semibold mt-1 inline-flex items-center gap-1',
                headline.vsPreviousPct > 0 ? 'text-red-600' : 'text-green-600',
              ].join(' ')}
            >
              {headline.vsPreviousPct > 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
              {Math.abs(headline.vsPreviousPct)}%
            </p>
          )}
          <p className="text-xs text-gray-500 mt-0.5">
            was {formatPKR(headline.previousPaisa)}
          </p>
        </div>
      </div>

      {/* Asset breakdown table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm min-w-208">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-8" />
              <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
              {TABLE_PERIODS.map((p) => (
                <th
                  key={p}
                  onClick={() => toggleSort(p)}
                  className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap hover:text-gray-900"
                >
                  {PERIOD_LABELS[p]}
                  {sortBy === p && (sortDesc ? ' ↓' : ' ↑')}
                </th>
              ))}
              <th className="text-center px-3 py-3 font-medium text-gray-600">Compare</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {breakdown.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-10 text-gray-400 text-sm">
                  No expenses recorded yet.
                </td>
              </tr>
            )}
            {breakdown.map((row) => (
              <BreakdownRow
                key={row.key}
                row={row}
                expanded={expanded.has(row.key)}
                onToggle={() => toggleExpanded(row.key)}
                shares={
                  expanded.has(row.key)
                    ? buildSubTypeShares(allRows, row.key, now)
                    : []
                }
                compared={compareIds.includes(row.key)}
                onCompare={() => toggleCompare(row.key)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Tap a row to see its breakdown by expense type. Tick Compare on two items to chart them side by side.
      </p>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Monthly trend — single series, sequential blue */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Monthly Trend{trendAsset ? ` — ${breakdown.find((r) => r.key === trendAsset)?.assetName}` : ''}
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Last 12 months{category ? ` · ${category}` : ''}
          </p>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={trend.map((p) => ({ ...p, rupees: rupees(p.paisa) }))} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip formatter={tooltipMoney} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="rupees" name="Expenses" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sub-type donut for one asset — part-to-whole, ≤6 segments, with
            a labelled side list so identity never rides on color alone */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900">Breakdown by Type</h3>
            <select
              value={donutKey}
              onChange={(e) => setDonutAssetKey(e.target.value)}
              className="h-8 px-2 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-40"
            >
              {breakdown.map((r) => (
                <option key={r.key} value={r.key}>{r.assetName}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500 mb-3">{donutName} · all time</p>
          {donutShares.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-14">No data for this item.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-44 w-44 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={donutShares.map((s) => ({ name: s.name, value: rupees(s.paisa) }))}
                      dataKey="value"
                      innerRadius="55%"
                      outerRadius="90%"
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {donutShares.map((s, i) => (
                        <Cell
                          key={s.name}
                          fill={s.name === 'Other' ? SERIES_GRAY : SERIES[i % SERIES.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={tooltipMoney} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-1.5 min-w-0">
                {donutShares.map((s, i) => (
                  <li key={s.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.name === 'Other' ? SERIES_GRAY : SERIES[i % SERIES.length] }}
                    />
                    <span className="text-gray-700 truncate flex-1">{s.name}</span>
                    <span className="font-mono text-xs text-gray-500 shrink-0">{s.pct}%</span>
                    <span className="font-mono text-xs text-gray-900 shrink-0">
                      {formatPKR(s.paisa, { showSymbol: false })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Comparison — appears once two items are ticked */}
      {compare && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            {compare.aName} vs {compare.bName}
          </h3>
          <p className="text-xs text-gray-500 mb-3">Monthly cost, last 6 months</p>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart
                data={compare.points.map((p) => ({ label: p.label, [compare.aName]: rupees(p.a), [compare.bName]: rupees(p.b) }))}
                barCategoryGap="20%"
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip formatter={tooltipMoney} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={compare.aName} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey={compare.bName} fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownRow({
  row, expanded, onToggle, shares, compared, onCompare,
}: {
  row: AssetBreakdownRow;
  expanded: boolean;
  onToggle: () => void;
  shares: ReturnType<typeof buildSubTypeShares>;
  compared: boolean;
  onCompare: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3 text-gray-400">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="px-4 py-3 font-medium text-gray-900">{row.assetName}</td>
        <td className="px-4 py-3 text-gray-500 text-xs">{row.category}</td>
        {TABLE_PERIODS.map((p) => (
          <td key={p} className="px-4 py-3 text-right font-mono tabular-nums">
            {row.periods[p] === 0 ? (
              <span className="text-gray-300">—</span>
            ) : (
              formatPKR(row.periods[p], { showSymbol: false })
            )}
          </td>
        ))}
        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={compared}
            onChange={onCompare}
            aria-label={`Compare ${row.assetName}`}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/60">
          <td />
          <td colSpan={9} className="px-4 py-3">
            {shares.length === 0 ? (
              <p className="text-xs text-gray-400">No expense types recorded for this item.</p>
            ) : (
              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                {shares.map((s) => (
                  <span key={s.name} className="text-xs text-gray-700">
                    <span className="font-medium">{s.name}</span>{' '}
                    <span className="text-gray-500">{s.pct}%</span>{' '}
                    <span className="font-mono">{formatPKR(s.paisa, { showSymbol: false })}</span>
                  </span>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Chip({
  label, active, onClick, small,
}: { label: string; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        small ? 'h-7 px-3 text-xs' : 'h-9 px-3.5 text-sm',
        'rounded-full border font-medium whitespace-nowrap transition-colors shrink-0',
        active
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
