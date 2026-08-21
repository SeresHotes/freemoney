import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

const TOOLTIP_STYLE = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
};

// Стек-график расходов по категориям во времени.
// data: [{ label, [catName]: value }]; series: [{ name, color }].
export default function CategoryTrendChart({ data, series, formatValue, formatAxis, height = 260 }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={48} tickFormatter={formatAxis} />
          <Tooltip
            formatter={formatValue}
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#f1f5f9' }}
            itemStyle={{ color: '#f1f5f9' }}
          />
          {series.map((s, i) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              stackId="e"
              fill={s.color}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
