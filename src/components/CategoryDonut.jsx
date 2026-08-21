import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// Кольцевая диаграмма расходов по категориям с суммами в центре.
// data: [{ name, value }]; center: { expense, income }.
export default function CategoryDonut({ data, colors, formatValue, center, height = 240 }) {
  return (
    <div className="donut">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={72} outerRadius={100} paddingAngle={2}>
            {data.map((entry, i) => <Cell key={entry.name} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip formatter={formatValue} />
        </PieChart>
      </ResponsiveContainer>
      {center && (
        <div className="donut__center">
          <span className="donut__label">Расходы</span>
          <span className="donut__expense">{formatValue(center.expense)}</span>
          <span className="donut__label">Доходы</span>
          <span className="donut__income">{formatValue(center.income)}</span>
        </div>
      )}
    </div>
  );
}
