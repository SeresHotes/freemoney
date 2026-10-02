import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// Кольцевая диаграмма расходов по категориям с суммами в центре.
// data: [{ name, value }]; center: { expense, income }.
// fill — диаграмма тянется на всю высоту родителя (главный экран): радиусы
// в процентах, без собственной карточки-подложки.
export default function CategoryDonut({ data, colors, formatValue, center, height = 240, fill = false }) {
  return (
    <div className={`donut${fill ? ' donut--fill' : ''}`}>
      <ResponsiveContainer width="100%" height={fill ? '100%' : height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={fill ? '72%' : 72}
            outerRadius={fill ? '100%' : 100}
            paddingAngle={2}
          >
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
