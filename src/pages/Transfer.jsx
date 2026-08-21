import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { todayIso } from '../utils/format';
import { getRate } from '../api/rates';

export default function Transfer() {
  const { wallets, addTransfer } = useApp();
  const navigate = useNavigate();

  const active = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);

  const [fromId, setFromId] = useState(active[0]?.id || '');
  const [toId, setToId] = useState(active[1]?.id || active[0]?.id || '');
  const [amountOut, setAmountOut] = useState('');
  const [amountIn, setAmountIn] = useState('');
  const [amountInTouched, setAmountInTouched] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const from = active.find((w) => w.id === fromId);
  const to = active.find((w) => w.id === toId);
  const different = from && to && from.currency !== to.currency;

  // Подсказка суммы получения по текущему курсу, если валюты разные.
  useEffect(() => {
    if (!different || !amountOut) return;
    let cancelled = false;
    getRate(from.currency, to.currency, date).then((rate) => {
      if (cancelled || rate == null || amountInTouched) return;
      const v = Number(String(amountOut).replace(',', '.')) * rate;
      setAmountIn(v ? v.toFixed(2) : '');
    });
    return () => { cancelled = true; };
  }, [different, amountOut, from, to, date, amountInTouched]);

  // Если валюты одинаковые и получение не трогали — приравниваем к списанию.
  useEffect(() => {
    if (!different && !amountInTouched) setAmountIn(amountOut);
  }, [different, amountOut, amountInTouched]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!fromId || !toId || fromId === toId) {
      setFormError('Выберите два разных кошелька');
      return;
    }
    const out = Number(String(amountOut).replace(',', '.'));
    const inc = Number(String(amountIn).replace(',', '.'));
    if (!out || out <= 0) { setFormError('Введите сумму списания'); return; }
    if (!inc || inc <= 0) { setFormError('Введите сумму зачисления'); return; }
    setSaving(true);
    try {
      await addTransfer({ fromWalletId: fromId, toWalletId: toId, amountOut: out, amountIn: inc, date, note: note.trim() });
      navigate('/');
    } catch {
      setFormError('Не удалось выполнить перевод');
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <button className="link-btn" onClick={() => navigate(-1)} aria-label="Назад">←</button>
        <h1>Перевод</h1>
      </header>

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">Откуда</span>
          <select className="field__input field__input--select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {active.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Списать{from ? `, ${from.currency}` : ''}</span>
          <input className="field__input field__input--amount" type="text" inputMode="decimal" placeholder="0" value={amountOut} onChange={(e) => setAmountOut(e.target.value)} autoFocus />
        </label>

        <label className="field">
          <span className="field__label">Куда</span>
          <select className="field__input field__input--select" value={toId} onChange={(e) => setToId(e.target.value)}>
            {active.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
          </select>
        </label>

        <label className="field">
          <span className="field__label">
            Зачислить{to ? `, ${to.currency}` : ''}
            {different && <span className="muted"> · можно поправить с учётом комиссии</span>}
          </span>
          <input className="field__input field__input--amount" type="text" inputMode="decimal" placeholder="0" value={amountIn} onChange={(e) => { setAmountIn(e.target.value); setAmountInTouched(true); }} />
        </label>

        <label className="field">
          <span className="field__label">Дата</span>
          <input className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Заметка (необязательно)</span>
          <input className="field__input" type="text" placeholder="Например: пополнение" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="btn btn--block btn--primary" disabled={saving}>{saving ? 'Перевожу…' : 'Перевести'}</button>
      </form>
    </div>
  );
}
