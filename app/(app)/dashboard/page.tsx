import { TrendingUp, Banknote, AlertCircle, Package } from 'lucide-react';

const STAT_CARDS = [
  { label: "Today's Sales",    icon: TrendingUp,  color: 'text-blue-600',  bg: 'bg-blue-50' },
  { label: "Today's Cash",     icon: Banknote,    color: 'text-green-600', bg: 'bg-green-50' },
  { label: 'Outstanding',      icon: AlertCircle, color: 'text-orange-600',bg: 'bg-orange-50' },
  { label: 'Low Stock Items',  icon: Package,     color: 'text-red-600',   bg: 'bg-red-50' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className={`inline-flex p-2 rounded-xl ${card.bg} mb-3`}>
                <Icon size={18} className={card.color} />
              </div>
              <p className="text-2xl font-bold text-gray-900">—</p>
              <p className="text-xs text-gray-500 mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
