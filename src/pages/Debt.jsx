import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { todayIso } from '../utils/format';
import { formatAmount } from '../utils/currencies';
import { walletBalance, isDebtWallet } from '../utils/finance';
import { getRate } from '../api/rates';

const NEW = '__new__';

export default function Debt() {
  const { wallets, transactions, recordDebt, updateTransfer, deleteTransaction } = useApp();
  const navigate = useNavigate();
  const { transferId } = useParams();
  const editing = Boolean(transferId);

  const cashWallets = useMemo(
    () => wallets.filter((w) => w.status === 'active' && !isDebtWallet(w)),
    [wallets],
  );
  const debtWallets = useMemo(
    () => wallets.filter((w) => w.status === 'active' && isDebtWallet(w)),
    [wallets],
  );

  const legs = useMemo(
    () => (editing ? transactions.filter((t) => t.transferId === transferId) : []),
    [editing, transferId, transactions],
  );

  // 'out' — деньги ушли из кошелька (дал в долг / погасил свой);
  // 'in'  — деньги пришли в кошелёк (мне вернули / я занял).
  const [direction, setDirection] = useState('out');
  const [counterpartyId, setCounterpartyId] = useState(NEW);
  const [newName, setNewName] = useState('');
  const [workWalletId, setWorkWalletId] = useState('');
  const [amountWork, setAmountWork] = useState('');
  const [amountDebt, setAmountDebt] = useState('');
  const [amountDebtTouched, setAmountDebtTouched] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [ready, setReady] = useState(false);

  // Инициализация: из пары (правка) либо дефолтами (создание).
  useEffect(() => {
    if (ready) return;
    if (editing) {
      if (legs.length < 2) return; // ждём загрузки операций
      const outLeg = legs.find((t) => t.type === 'transfer_out');
      const inLeg = legs.find((t) => t.type === 'transfer_in');
      const outIsDebt = wallets.find((w) => w.id === outLeg.wallet)?.kind === 'debt';
      const debtLeg = outIsDebt ? outLeg : inLeg;
      const cashLeg = outIsDebt ? inLeg : outLeg;
      setDirection(outIsDebt ? 'in' : 'out'); // долг списывает → деньги пришли
      setCounterpartyId(debtLeg.wallet);
      setWorkWalletId(cashLeg.wallet);
      setAmountWork(String(cashLeg.amount));
      setAmountDebt(String(debtLeg.amount));
      setAmountDebtTouched(true);
      setDate(outLeg.date);
      setNote(outLeg.note || '');
    } else {
      setCounterpartyId(debtWallets[0]?.id || NEW);
      setWorkWalletId(cashWallets[0]?.id || '');
    }
    setReady(true);
  }, [editing, legs, wallets, debtWallets, cashWallets, ready]);

  const isNew = !editing && (counterpartyId === NEW || debtWallets.length === 0);
  const work = cashWallets.find((w) => w.id === workWalletId);
  const counterparty = wallets.find((w) => w.id === counterpartyId);
  const debtCurrency = isNew ? work?.currency : counterparty?.currency;
  const different = work && debtCurrency && work.currency !== debtCurrency;

  // Подсказка суммы в валюте долга по курсу, если валюты разные.
  useEffect(() => {
    if (!different || !amountWork || amountDebtTouched) return;
    let cancelled = false;
    getRate(work.currency, debtCurrency, date).then((rate) => {
      if (cancelled || rate == null || amountDebtTouched) return;
      const v = Number(String(amountWork).replace(',', '.')) * rate;
      setAmountDebt(v ? v.toFixed(2) : '');
    });
    return () => { cancelled = true; };
  }, [different, amountWork, work, debtCurrency, date, amountDebtTouched]);

  useEffect(() => {
    if (!different && !amountDebtTouched) setAmountDebt(amountWork);
  }, [different, amountWork, amountDebtTouched]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!workWalletId) { setFormError('Выберите кошелёк'); return; }
    if (isNew && !newName.trim()) { setFormError('Введите имя'); return; }
    const work_ = Number(String(amountWork).replace(',', '.'));
    if (!work_ || work_ <= 0) { setFormError('Введите сумму'); return; }
    const debt_ = Number(String(amountDebt).replace(',', '.')) || work_;
    setSaving(true);
    try {
      if (editing) {
        // out — кошелёк→долг; in — долг→кошелёк.
        const legsPayload = direction === 'out'
          ? { outWalletId: workWalletId, inWalletId: counterpartyId, amountOut: work_, amountIn: debt_ }
          : { outWalletId: counterpartyId, inWalletId: workWalletId, amountOut: debt_, amountIn: work_ };
        await updateTransfer({ transferId, ...legsPayload, date, note: note.trim() });
      } else {
        await recordDebt({
          counterpartyId: isNew ? null : counterpartyId,
          newCounterpartyName: isNew ? newName.trim() : null,
          cashDirection: direction,
          workWalletId,
          amountWork: work_,
          amountDebt: debt_,
          date,
          note: note.trim(),
        });
      }
      navigate('/');
    } catch {
      setFormError('Не удалось записать долг');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Удалить эту запись долга?')) return;
    setSaving(true);
    try {
      await deleteTransaction(legs[0]?.id);
      navigate('/');
    } catch {
      setFormError('Не удалось удалить');
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <button className="link-btn" onClick={() => navigate(-1)} aria-label="Назад">←</button>
        <h1>{editing ? 'Правка долга' : 'Долг'}</h1>
      </header>

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">Что произошло</span>
          <select className="field__input field__input--select" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="out">Деньги ушли — дал в долг / погасил свой</option>
            <option value="in">Деньги пришли — мне вернули / я занял</option>
          </select>
        </label>

        <label className="field">
          <span className="field__label">Кому / от кого</span>
          <select
            className="field__input field__input--select"
            value={isNew ? NEW : counterpartyId}
            onChange={(e) => { setCounterpartyId(e.target.value); setAmountDebtTouched(false); }}
            disabled={editing}
          >
            {debtWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {formatAmount(walletBalance(transactions, w.id), w.currency)}
              </option>
            ))}
            {!editing && <option value={NEW}>➕ Новый…</option>}
          </select>
        </label>

        {isNew && (
          <label className="field">
            <span className="field__label">Имя</span>
            <input className="field__input" type="text" placeholder="Например: Петя" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
        )}

        <label className="field">
          <span className="field__label">Кошелёк</span>
          <select className="field__input field__input--select" value={workWalletId} onChange={(e) => setWorkWalletId(e.target.value)}>
            {cashWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Сумма{work ? `, ${work.currency}` : ''}</span>
          <input className="field__input field__input--amount" type="text" inputMode="decimal" placeholder="0" value={amountWork} onChange={(e) => setAmountWork(e.target.value)} autoFocus />
        </label>

        {different && (
          <label className="field">
            <span className="field__label">
              Сумма в валюте долга, {debtCurrency}
              <span className="muted"> · можно поправить</span>
            </span>
            <input className="field__input field__input--amount" type="text" inputMode="decimal" placeholder="0" value={amountDebt} onChange={(e) => { setAmountDebt(e.target.value); setAmountDebtTouched(true); }} />
          </label>
        )}

        <label className="field">
          <span className="field__label">Дата</span>
          <input className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Заметка (необязательно)</span>
          <input className="field__input" type="text" placeholder="За что" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <p className="muted" style={{ fontSize: '0.8rem' }}>
          Общий капитал не меняется — деньги переходят между кошельком и долгом.
          Баланс: «+» вам должны, «−» должны вы.
        </p>

        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="btn btn--block btn--primary" disabled={saving}>{saving ? 'Сохраняю…' : editing ? 'Сохранить' : 'Записать'}</button>
        {editing && (
          <button type="button" className="btn btn--block" style={{ marginTop: '0.5rem' }} onClick={remove} disabled={saving}>
            🗑️ Удалить
          </button>
        )}
      </form>
    </div>
  );
}
