import { monthLabel } from '../utils/format';

// Выбор периода: селектор режима (месяц/год/произвольно/всё время) и нужный
// под каждый режим пикер. Всю логику и хранение в URL держит хук usePeriod;
// сюда передаём его результат через проп period.
export default function PeriodPicker({ period }) {
  const {
    mode, from, to, monthSel, yearSel, yearOptions,
    setMode, stepMonth, stepYear, pickMonth, pickYear, setBound,
  } = period;

  return (
    <div className="chipms">
      <span className="chipms__label">Период</span>
      <div className="seg seg--period">
        <button className={`seg__btn${mode === 'month' ? ' seg__btn--active' : ''}`} onClick={() => setMode('month')}>Месяц</button>
        <button className={`seg__btn${mode === 'year' ? ' seg__btn--active' : ''}`} onClick={() => setMode('year')}>Год</button>
        <button className={`seg__btn${mode === 'custom' ? ' seg__btn--active' : ''}`} onClick={() => setMode('custom')}>Произвольно</button>
        <button className={`seg__btn${mode === 'all' ? ' seg__btn--active' : ''}`} onClick={() => setMode('all')}>Всё время</button>
      </div>
      {mode === 'month' && (
        <div className="stepper">
          <button className="stepper__btn" onClick={() => stepMonth(-1)} aria-label="Предыдущий месяц">‹</button>
          <label className="stepper__pick">
            <span className="stepper__label">{monthLabel(monthSel)}</span>
            <input
              className="stepper__native"
              type="month"
              value={monthSel}
              onChange={(e) => e.target.value && pickMonth(e.target.value)}
              aria-label="Выбрать месяц"
            />
          </label>
          <button className="stepper__btn" onClick={() => stepMonth(1)} aria-label="Следующий месяц">›</button>
        </div>
      )}
      {mode === 'year' && (
        <div className="stepper">
          <button className="stepper__btn" onClick={() => stepYear(-1)} aria-label="Предыдущий год">‹</button>
          <label className="stepper__pick">
            <span className="stepper__label">{yearSel}</span>
            <select
              className="stepper__native"
              value={yearSel}
              onChange={(e) => pickYear(e.target.value)}
              aria-label="Выбрать год"
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button className="stepper__btn" onClick={() => stepYear(1)} aria-label="Следующий год">›</button>
        </div>
      )}
      {mode === 'custom' && (
        <div className="filters__dates">
          <input className="field__input" type="date" value={from} onChange={(e) => setBound('from', e.target.value)} />
          <span className="muted">—</span>
          <input className="field__input" type="date" value={to} onChange={(e) => setBound('to', e.target.value)} />
        </div>
      )}
    </div>
  );
}
