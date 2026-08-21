import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// data: [{ label, income, expense }]. formatValue — форматтер для тултипа.
export default function TrendChart({ data, formatValue, height = 240 }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis hide />
          <Tooltip formatter={formatValue} cursor={{ fill: 'rgba(255,255,255,0.05)' }} labelStyle={{ color: '#0f172a' }} />
          <Bar dataKey="income" fill="#34d399" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expense" fill="#f87171" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
