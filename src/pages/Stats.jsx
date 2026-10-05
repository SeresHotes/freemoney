import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { monthLabel, dayLabel, compactNumber, rangeLabel } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import {
  isIncome, isExpense, matchesFilters,
  buildCategoryTimeSeries, totalsByCategory,
} from '../utils/finance';
import { useBaseRates } from '../hooks/useBaseRates';
import { usePeriod } from '../hooks/usePeriod';
import ChipMultiSelect from '../components/ChipMultiSelect';
import PeriodPicker from '../components/PeriodPicker';
import CategoryTrendChart from '../components/CategoryTrendChart';
import CategoryDonut from '../components/CategoryDonut';
import { buildCategorySeries, categoryColor } from '../utils/chartColors';
import { DEFAULT_ICON } from '../api/defaults';
import CategoryIcon from '../components/CategoryIcon';

export default function Stats() {
  const { transactions, categories, wallets, tags, baseCurrency } = useApp();
  const { toBase } = useBaseRates(baseCurrency);
  const navigate = useNavigate();
  // Фильтры и период храним в URL — так они сохраняются при переходе к операциям и возврате назад.
  const [searchParams, setSearchParams] = useSearchParams();

  const cats = searchParams.getAll('category');
  const tagSel = searchParams.getAll('tag');
  const wals = searchParams.getAll('wallet');
  // Что показывать в разбивке по категориям и динамике: расходы (по умолчанию) или доходы.
  const kind = searchParams.get('kind') === 'income' ? 'income' : 'expense';
  const matchKind = kind === 'income' ? isIncome : isExpense;
  const kindLabel = kind === 'income' ? 'Доходы' : 'Расходы';
  const kindGen = kind === 'income' ? 'доходов' : 'расходов';

  // Период по умолчанию — текущий месяц.
  const period = usePeriod({ searchParams, setSearchParams, transactions, defaultMode: 'month' });
  const { from, to } = period;

  // Гранулярность нижнего графика по умолчанию подбираем по периоду;
  // «всё время» -> по годам, длинный диапазон -> по месяцам, короткий -> по дням.
  // Явный выбор пользователя (?granularity=) всегда в приоритете.
  const spanDays = from && to ? Math.round((new Date(to) - new Date(from)) / 86400000) + 1 : Infinity;
  const autoGranularity = period.mode === 'all' ? 'year' : spanDays > 92 ? 'month' : 'day';
  const granularity = searchParams.get('granularity') || autoGranularity;

  const update = (mutate) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace: true });
  };
  const setArr = (key, arr) => update((n) => { n.delete(key); arr.forEach((v) => n.append(key, v)); });
  const setSingle = (key, val) => update((n) => { if (val) n.set(key, val); else n.delete(key); });

  // Категории и теги спрятаны под кнопкой «Фильтры»; раскрываем сразу, если что-то уже выбрано.
  const [showFilters, setShowFilters] = useState(() => cats.length + tagSel.length > 0);
  const hiddenCount = cats.length + tagSel.length;
  const clearHidden = () => update((n) => { n.delete('category'); n.delete('tag'); });
  // Смена вида: категории другого вида снимаем с выбора, чтобы не остался «невидимый» фильтр.
  const setKind = (next) => update((n) => {
    if (next === 'income') n.set('kind', 'income'); else n.delete('kind');
    const allowed = new Set(activeCategories.filter((c) => c.kind === next || c.kind === 'both').map((c) => c.name));
    const keep = cats.filter((c) => allowed.has(c));
    n.delete('category');
    keep.forEach((c) => n.append('category', c));
  });

  // Переход к операциям: категория + активные фильтры и период статистики.
  const openCategory = (name) => {
    const p = new URLSearchParams();
    p.append('category', name);
    p.append('type', kind);
    wals.forEach((w) => p.append('wallet', w));
    tagSel.forEach((t) => p.append('tag', t));
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    navigate(`/transactions?${p.toString()}`);
  };

  const activeWallets = useMemo(() => wallets.filter((w) => !w.archived), [wallets]);
  const activeCategories = useMemo(() => categories.filter((c) => !c.archived), [categories]);
  // В фильтре показываем только категории выбранного вида (расходные или доходные; «оба» — всегда).
  const kindCategories = useMemo(
    () => activeCategories.filter((c) => c.kind === kind || c.kind === 'both'),
    [activeCategories, kind],
  );
  const catOptions = useMemo(() => kindCategories.map((c) => ({ value: c.name, label: <><CategoryIcon icon={c.icon} color={c.color} /> {c.name}</> })), [kindCategories]);
  const walletOptions = useMemo(() => activeWallets.map((w) => ({ value: w.name, label: w.name })), [activeWallets]);
  const tagOptions = useMemo(() => {
    const set = new Set(tags.filter((t) => !t.archived).map((t) => t.name));
    return [...set].sort().map((t) => ({ value: t, label: t }));
  }, [tags]);

  const singleWallet = wals.length === 1 ? activeWallets.find((w) => w.name === wals[0]) : null;
  const displayCurrency = singleWallet ? singleWallet.currency : baseCurrency;
  // Для сумм и графиков нужна ВЕЛИЧИНА (amount теперь знаковый: расход < 0).
  // Доход/расход разводятся по типу, поэтому по модулю — корректно для всех агрегатов.
  const toDisplay = (t) => {
    const v = singleWallet ? t.amount : toBase(t.amount, t.currency);
    return v == null ? null : Math.abs(v);
  };

  // Все операции, попадающие под фильтры и выбранный диапазон дат.
  const scoped = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (isIncome(t) || isExpense(t)) &&
          matchesFilters(t, { categories: cats, tags: tagSel, wallets: wals, from, to }),
      ),
    [transactions, cats, tagSel, wals, from, to],
  );

  const income = scoped.filter(isIncome).reduce((s, t) => s + (toDisplay(t) || 0), 0);
  const expense = scoped.filter(isExpense).reduce((s, t) => s + (toDisplay(t) || 0), 0);

  // Суммы по категориям выбранного вида (расходы или доходы).
  const byCategory = useMemo(() => totalsByCategory(scoped, toDisplay, matchKind), [scoped, matchKind, singleWallet, toBase]);
  const iconByCategory = useMemo(() => new Map(categories.map((c) => [c.name, c.icon])), [categories]);
  const colorByCategory = useMemo(
    () => new Map(categories.filter((c) => c.color).map((c) => [c.name, c.color])),
    [categories],
  );
  const catColors = useMemo(() => byCategory.map((c, i) => categoryColor(colorByCategory, c.name, i)), [byCategory, colorByCategory]);

  // Топ категорий за период (для цветов и стек-графика).
  const { series, catTrend } = useMemo(() => {
    const { top, series: seriesList } = buildCategorySeries(byCategory, colorByCategory);

    const raw = buildCategoryTimeSeries(scoped, granularity, toDisplay, top, matchKind);
    // Ограничение числа столбцов, чтобы график не разрастался на больших диапазонах.
    const maxBars = granularity === 'day' ? 62 : 24;
    const sliced = raw.length > maxBars ? raw.slice(-maxBars) : raw;
    const data = sliced.map((b) => ({
      ...b,
      label: granularity === 'day' ? dayLabel(b.key)
        : granularity === 'year' ? b.key
        : monthLabel(b.key).replace(/ \d{4}$/, ''),
    }));
    return { series: seriesList, catTrend: data };
  }, [scoped, byCategory, colorByCategory, granularity, matchKind, singleWallet, toBase]);

  const fmt = (v) => formatAmount(v, displayCurrency);
  const periodLabel = rangeLabel(from, to);

  return (
    <div className="page">
      <div className="filters">
        <div className="seg">
          <button className={`seg__btn${kind === 'expense' ? ' seg__btn--active' : ''}`} onClick={() => setKind('expense')}>Расходы</button>
          <button className={`seg__btn${kind === 'income' ? ' seg__btn--active' : ''}`} onClick={() => setKind('income')}>Доходы</button>
        </div>
        <ChipMultiSelect label="Кошельки" options={walletOptions} selected={wals} onChange={(a) => setArr('wallet', a)} />
        <PeriodPicker period={period} />
        <button className="link-btn-inline" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? 'Скрыть фильтры' : `Фильтры${hiddenCount ? ` (${hiddenCount})` : ''}`}
        </button>
        {showFilters && (
          <>
            <ChipMultiSelect label={`Категории ${kindGen}`} options={catOptions} selected={cats} onChange={(a) => setArr('category', a)} />
            {tagOptions.length > 0 && (
              <ChipMultiSelect label="Теги" options={tagOptions} selected={tagSel} onChange={(a) => setArr('tag', a)} />
            )}
            {hiddenCount > 0 && <button className="link-btn-inline" onClick={clearHidden}>Сбросить фильтры</button>}
          </>
        )}
      </div>

      <section>
        <h2 className="section-title">Сводка · {periodLabel}</h2>
        <div className="stats-summary" style={{ marginTop: '0.75rem' }}>
          <div className="stats-summary__cell"><span className="muted">Доходы</span><strong className="tx-item__amount--income">{fmt(income)}</strong></div>
          <div className="stats-summary__cell"><span className="muted">Расходы</span><strong className="tx-item__amount--expense">{fmt(expense)}</strong></div>
          <div className="stats-summary__cell"><span className="muted">Баланс</span><strong>{fmt(income - expense)}</strong></div>
        </div>
      </section>

      <section>
        <h2 className="section-title">{kindLabel} по категориям · {periodLabel}</h2>
        {byCategory.length === 0 ? (
          <p className="muted empty">Нет {kindGen} за период</p>
        ) : (
          <>
            <CategoryDonut
              data={byCategory}
              colors={catColors}
              center={{ expense, income }}
              formatValue={(v) => fmt(v)}
            />
            <ul className="legend">
              {byCategory.map((c, i) => (
                <li key={c.name} className="legend__item legend__item--clickable" onClick={() => openCategory(c.name)}>
                  <span className="legend__dot" style={{ background: catColors[i] }} />
                  <span className="legend__name">
                    <CategoryIcon icon={iconByCategory.get(c.name) || DEFAULT_ICON} color={catColors[i]} /> {c.name}
                  </span>
                  <span className="legend__value">{fmt(c.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <div className="seg">
          <button className={`seg__btn${granularity === 'day' ? ' seg__btn--active' : ''}`} onClick={() => setSingle('granularity', 'day')}>По дням</button>
          <button className={`seg__btn${granularity === 'month' ? ' seg__btn--active' : ''}`} onClick={() => setSingle('granularity', 'month')}>По месяцам</button>
          <button className={`seg__btn${granularity === 'year' ? ' seg__btn--active' : ''}`} onClick={() => setSingle('granularity', 'year')}>По годам</button>
        </div>
        <h2 className="section-title">
          Динамика {kindGen} · {periodLabel} · {displayCurrency}
        </h2>
        {catTrend.length === 0 ? (
          <p className="muted empty">Нет данных за период</p>
        ) : (
          <>
            <CategoryTrendChart data={catTrend} series={series} formatValue={(v) => fmt(v)} formatAxis={compactNumber} />
            <ul className="legend">
              {series.map((s) => {
                const clickable = s.name !== 'Другое';
                return (
                  <li
                    key={s.name}
                    className={`legend__item${clickable ? ' legend__item--clickable' : ''}`}
                    onClick={clickable ? () => openCategory(s.name) : undefined}
                  >
                    <span className="legend__dot" style={{ background: s.color }} />
                    <span className="legend__name">{s.name}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
