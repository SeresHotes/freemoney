import { useRef } from 'react';
import CategoryIcon from './CategoryIcon';
import { formatAmount } from '../utils/currencies';

// Полоса шаблонов расхода над кнопками «Расход / Доход»: одна строка чипов,
// листается вбок. Тап — записать, удержание — меню шаблона.
export default function TemplateStrip({ templates, categories, onTap, onHold }) {
  const timer = useRef(null);
  const held = useRef(false);
  const catOf = new Map(categories.map((c) => [c.name, c]));
  const start = (t) => {
    held.current = false;
    timer.current = setTimeout(() => { held.current = true; onHold(t); }, 450);
  };
  const stop = () => clearTimeout(timer.current);
  return (
    <section className="tpl-strip" aria-label="Шаблоны">
      {templates.map((t) => {
        const cat = catOf.get(t.category);
        return (
          <button
            key={t.id}
            className="tpl-chip"
            data-id={t.id}
            style={cat?.color ? { '--tpl-color': cat.color } : undefined}
            onPointerDown={() => start(t)}
            onPointerUp={stop}
            onPointerLeave={stop}
            onContextMenu={(e) => { e.preventDefault(); stop(); held.current = true; onHold(t); }}
            onClick={() => { if (!held.current) onTap(t); }}
          >
            <span className="tpl-chip__icon"><CategoryIcon icon={cat?.icon} color={cat?.color} /></span>
            <span className="tpl-chip__name">{t.name}</span>
            {t.amount > 0 && <span className="tpl-chip__amount">{formatAmount(t.amount, t.currency)}</span>}
          </button>
        );
      })}
    </section>
  );
}
