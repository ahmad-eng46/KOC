'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { formatPKR } from '@/lib/money';
import {
  trendSeries, trendSeriesByBrand, byProduct, byBrand,
  type SalesLine, type TrendPeriod,
} from '@/lib/sales-analytics';
import { formatQty } from './OverviewCards';

/**
 * One palette, indexed the same way everywhere, so a brand keeps its colour
 * between the pie and the trend lines on the same screen.
 */
const SERIES_COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#9333ea',
  '#dc2626', '#0d9488', '#4f46e5', '#ea580c',
];
const OTHERS_COLOR = '#9ca3af';

type Metric = 'amount' | 'quantity';

export function SalesCharts({
  lines,
  onSelectBrand,
}: {
  lines: SalesLine[];
  onSelectBrand?: (brandId: string | null) => void;
}) {
  const [period, setPeriod] = useState<TrendPeriod>('daily');
  const [metric, setMetric] = useState<Metric>('amount');
  const [splitByBrand, setSplitByBrand] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const brands = useMemo(() => byBrand(lines), [lines]);
  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    brands.forEach((b, i) => map.set(b.id, SERIES_COLORS[i % SERIES_COLORS.length]));
    return map;
  }, [brands]);

  if (lines.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">No sales in this period to chart.</p>;
  }

  return (
    <div className="space-y-4">
      <TrendChart
        lines={lines}
        period={period}
        metric={metric}
        splitByBrand={splitByBrand}
        colorOf={colorOf}
        onPeriodChange={setPeriod}
        onMetricChange={setMetric}
        onSplitChange={setSplitByBrand}
      />

      <TopProductsChart lines={lines} metric={metric} />

      <button
        onClick={() => setShowMore((v) => !v)}
        className="lg:hidden w-full h-11 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700"
      >
        {showMore ? 'Fewer charts' : 'More charts'}
      </button>

      <div className={showMore ? 'block' : 'hidden lg:block'}>
        <BrandShareChart brands={brands} colorOf={colorOf} onSelectBrand={onSelectBrand} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────
function TrendChart({
  lines, period, metric, splitByBrand, colorOf,
  onPeriodChange, onMetricChange, onSplitChange,
}: {
  lines: SalesLine[];
  period: TrendPeriod;
  metric: Metric;
  splitByBrand: boolean;
  colorOf: Map<string, string>;
  onPeriodChange: (p: TrendPeriod) => void;
  onMetricChange: (m: Metric) => void;
  onSplitChange: (v: boolean) => void;
}) {
  const value = (amountPaisa: number, quantity: number) =>
    metric === 'amount' ? amountPaisa / 100 : quantity;

  const single = useMemo(
    () => trendSeries(lines, period).map((p) => ({ date: p.date, value: value(p.amountPaisa, p.quantity) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, period, metric],
  );

  const perBrand = useMemo(() => {
    if (!splitByBrand) return [];
    const series = trendSeriesByBrand(lines, period);
    const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
    // Recharts wants one row per x value with a key per series, so the series
    // are pivoted here rather than rendered as separate charts.
    return dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const s of series) {
        const point = s.points.find((p) => p.date === date);
        row[s.brandName] = point ? value(point.amountPaisa, point.quantity) : 0;
      }
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, period, metric, splitByBrand]);

  const brandSeries = useMemo(
    () => (splitByBrand ? trendSeriesByBrand(lines, period) : []),
    [lines, period, splitByBrand],
  );

  return (
    <ChartCard
      title="Sales trend"
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <Toggle
            options={[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]}
            value={period}
            onChange={(v) => onPeriodChange(v as TrendPeriod)}
          />
          <Toggle
            options={[['amount', 'Amount'], ['quantity', 'Quantity']]}
            value={metric}
            onChange={(v) => onMetricChange(v as Metric)}
          />
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={splitByBrand}
              onChange={(e) => onSplitChange(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            Split by brand
          </label>
        </div>
      }
    >
      <div className="h-64 px-2 pb-2">
        <ResponsiveContainer>
          <LineChart data={splitByBrand ? perBrand : single}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tickFormatter={(d: string) => formatBucket(d, period)} fontSize={11} />
            <YAxis tickFormatter={(n: number) => tick(n, metric)} fontSize={11} width={48} />
            <Tooltip
              formatter={(v) => (metric === 'amount' ? formatPKR(Math.round(Number(v) * 100)) : formatQty(Number(v)))}
              labelFormatter={(d) => formatBucket(d as string, period)}
            />
            {splitByBrand ? (
              brandSeries.map((s) => (
                <Line
                  key={s.brandId}
                  type="monotone"
                  dataKey={s.brandName}
                  stroke={colorOf.get(s.brandId) ?? OTHERS_COLOR}
                  strokeWidth={2}
                  dot={false}
                />
              ))
            ) : (
              <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
            )}
            {splitByBrand && <Legend wrapperStyle={{ fontSize: 11 }} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ───────────────────────────────────────────────
function TopProductsChart({ lines, metric }: { lines: SalesLine[]; metric: Metric }) {
  const top = useMemo(
    () =>
      byProduct(lines)
        .slice(0, 10)
        .map((p) => ({
          name: p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name,
          value: metric === 'amount' ? p.salesPaisa / 100 : p.quantity,
        }))
        .reverse(),
    [lines, metric],
  );

  return (
    <ChartCard title={`Top 10 products by ${metric === 'amount' ? 'sales' : 'quantity'}`}>
      <div className="h-72 px-2 pb-2">
        <ResponsiveContainer>
          <BarChart data={top} layout="vertical" margin={{ left: 70 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis type="number" tickFormatter={(n: number) => tick(n, metric)} fontSize={11} />
            <YAxis type="category" dataKey="name" width={110} fontSize={11} />
            <Tooltip
              formatter={(v) => (metric === 'amount' ? formatPKR(Math.round(Number(v) * 100)) : formatQty(Number(v)))}
            />
            <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ───────────────────────────────────────────────
function BrandShareChart({
  brands, colorOf, onSelectBrand,
}: {
  brands: Array<{ id: string; name: string; salesPaisa: number }>;
  colorOf: Map<string, string>;
  onSelectBrand?: (brandId: string | null) => void;
}) {
  // Top 5 named, the tail folded into "Others" — a pie with twenty slivers
  // shows nothing. "Others" is not clickable because it is not one brand.
  const slices = useMemo(() => {
    const top = brands.slice(0, 5).map((b) => ({
      id: b.id, name: b.name, value: b.salesPaisa / 100, color: colorOf.get(b.id) ?? OTHERS_COLOR,
    }));
    const rest = brands.slice(5).reduce((sum, b) => sum + b.salesPaisa, 0);
    return rest > 0
      ? [...top, { id: '__others__', name: 'Others', value: rest / 100, color: OTHERS_COLOR }]
      : top;
  }, [brands, colorOf]);

  return (
    <ChartCard title="Share of sales by brand">
      <div className="h-72 px-2 pb-2">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="45%"
              outerRadius="75%"
              onClick={(_slice, index) => {
                const picked = slices[index];
                if (!onSelectBrand || !picked || picked.id === '__others__') return;
                onSelectBrand(picked.id === '' ? null : picked.id);
              }}
            >
              {slices.map((s) => (
                <Cell key={s.id} fill={s.color} cursor={s.id === '__others__' ? 'default' : 'pointer'} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatPKR(Math.round(Number(v) * 100))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {onSelectBrand && (
        <p className="px-4 pb-3 text-xs text-gray-400">Click a slice to filter to that brand.</p>
      )}
    </ChartCard>
  );
}

// ───────────────────────────────────────────────
function ChartCard({
  title, controls, children,
}: {
  title: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
        {controls}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  options, value, onChange,
}: {
  options: Array<[string, string]>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={[
            'px-2.5 h-8 text-xs font-medium',
            value === v ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-600 hover:bg-gray-50',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function formatBucket(date: string, period: TrendPeriod): string {
  if (!date) return '';
  const d = parseISO(date);
  if (period === 'monthly') return format(d, 'MMM yy');
  if (period === 'weekly') return `w/c ${format(d, 'dd MMM')}`;
  return format(d, 'dd MMM');
}

function tick(n: number, metric: Metric): string {
  if (metric === 'quantity') return formatQty(n);
  return n >= 100_000 ? `${(n / 100_000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}
