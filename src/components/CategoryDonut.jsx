import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const RAD = Math.PI / 180;
// Подпись не рисуем, если сегмент слишком мал для текста: по доле или по
// длине дуги / толщине кольца (на маленьком донате кольцо тонкое).
const MIN_PERCENT = 0.04;

// Процент доли прямо на сегменте кольца (тёмный текст — палитра светлая).
function renderPercent({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  const thickness = outerRadius - innerRadius;
  const r = innerRadius + thickness / 2;
  const fontSize = Math.min(13, Math.max(9, thickness * 0.42));
  const text = `${Math.round(percent * 100)}%`;
  const arc = percent * 2 * Math.PI * r;
  if (percent < MIN_PERCENT || thickness < 14 || arc < text.length * fontSize * 0.62 + 4) return null;
  return (
    <text
      x={cx + r * Math.cos(-midAngle * RAD)}
      y={cy + r * Math.sin(-midAngle * RAD)}
      fill="#0f172a"
      fontSize={fontSize}
      fontWeight={700}
      textAnchor="middle"
      dominantBaseline="central"
      pointerEvents="none"
    >
      {text}
    </text>
  );
}

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
            innerRadius={fill ? '68%' : 68}
            outerRadius={fill ? '100%' : 100}
            paddingAngle={2}
            label={renderPercent}
            labelLine={false}
            // recharts рисует подписи только после окончания анимации, а при
            // перерисовке (подгрузка курсов и т.п.) она «не заканчивается» —
            // проценты пропадают. Без анимации подписи видны всегда.
            isAnimationActive={false}
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
          <span className="donut__label donut__label--income">Доходы</span>
          <span className="donut__income">{formatValue(center.income)}</span>
        </div>
      )}
    </div>
  );
}
