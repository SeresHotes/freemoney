import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatAmount } from '../utils/currencies';
import { walletBalance } from '../utils/finance';

const fmt = (n) => (Number.isFinite(n) ? String(Number(n.toFixed(2))) : '');
const parse = (s) => Number(String(s).replace(',', '.'));

// Быстрая корректировка с главной. Два связанных поля — «итоговый баланс» и
// «изменение»: правка одного пересчитывает второе. Валюта берётся от кошелька.
export default function NewAdjustment() {
  const navigate = useNavigate();
  const { wallets, transactions, setWalletBalance } = useApp();

  const activeWallets = useMemo(() => wallets.filter((w) => w.status === 'active'), [wallets]);
  const [walletId, setWalletId] = useState(() => activeWallets[0]?.id || '');
  const wallet = wallets.find((w) => w.id === walletId);
  const currency = wallet?.currency || '';
  const base = wallet ? walletBalance(transactions, wallet.id) : 0;

  const [finalStr, setFinalStr] = useState('');
  const [changeStr, setChangeStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // При смене кошелька стартуем от его текущего баланса, изменение — ноль.
  useEffect(() => {
    if (!wallet) return;
    setFinalStr(fmt(base));
    setChangeStr('0');
  }, [walletId]);

  const onFinalChange = (v) => {
    setFinalStr(v);
    const n = parse(v);
    setChangeStr(v.trim() === '' || Number.isNaN(n) ? '' : fmt(n - base));
  };
  const onChangeChange = (v) => {
    setChangeStr(v);
    const n = parse(v);
    setFinalStr(v.trim() === '' || Number.isNaN(n) ? '' : fmt(base + n));
  };

  const change = parse(changeStr);
  const hasChange = changeStr.trim() !== '' && !Number.isNaN(change);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!wallet) { setFormError('Выберите кошелёк'); return; }
    const target = parse(finalStr);
    if (finalStr.trim() === '' || Number.isNaN(target)) { setFormError('Введите итоговый баланс'); return; }
    if (Math.abs(target - base) < 0.005) { setFormError('Баланс не изменился'); return; }

    setSaving(true);
    try {
      await setWalletBalance(wallet, target);
      navigate(-1);
    } catch {
      setFormError('Не удалось сохранить. Попробуйте снова.');
      setSaving(false);
    }
  };

  if (activeWallets.length === 0) {
    return (
      <div className="page">
        <header className="page__header page__header--with-back">
          <button className="link-btn" onClick={() => navigate(-1)} aria-label="Назад">←</button>
          <h1>Корректировка баланса</h1>
        </header>
        <p className="muted">
          Нет активных кошельков. <button type="button" className="link-btn-inline" onClick={() => navigate('/wallets')}>Добавить</button>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__header page__header--with-back">
        <button className="link-btn" onClick={() => navigate(-1)} aria-label="Назад">←</button>
        <h1>Корректировка баланса</h1>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Кошелёк</span>
          <select className="field__input field__input--select" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            {activeWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
          </select>
        </label>

        <div className="field">
          <span className="field__label">Сейчас в приложении</span>
          <p className="muted">{formatAmount(base, currency)}</p>
        </div>

        <label className="field">
          <span className="field__label">Итоговый баланс, {currency}</span>
          <input
            className="field__input field__input--amount"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={finalStr}
            onChange={(e) => onFinalChange(e.target.value)}
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field__label">
            Изменение баланса, {currency}
            {hasChange && Math.abs(change) >= 0.005 && (
              <span className="muted"> · {change > 0 ? 'пополнение' : 'списание'}</span>
            )}
          </span>
          <input
            className="field__input field__input--amount"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={changeStr}
            onChange={(e) => onChangeChange(e.target.value)}
          />
        </label>

        {formError && <p className="form-error">{formError}</p>}

        <button type="submit" className="btn btn--block btn--income" disabled={saving}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </form>
    </div>
  );
}
