import { useState } from 'react';
import EmojiPicker from './EmojiPicker';
import CategoryIcon from './CategoryIcon';
import { LUCIDE_PALETTE, isLucide, loadLucideData } from '../utils/icons';

const LUCIDE_SOURCE = {
  popular: { name: 'Популярные', icon: 'lucide:star', items: LUCIDE_PALETTE.map((i) => [i, '']) },
  load: loadLucideData,
  render: (icon) => <CategoryIcon icon={icon} />,
  placeholder: 'Поиск иконки: кофе, такси, car…',
  typed: false,
};

// Выбор иконки категории: аутлайн-иконки (по умолчанию) или эмодзи.
export default function IconPicker({ value, onChange, className = '' }) {
  const [mode, setMode] = useState(value && !isLucide(value) ? 'emoji' : 'line');
  return (
    <div className={`icon-picker ${className}`.trim()}>
      <div className="seg">
        <button type="button" className={`seg__btn${mode === 'line' ? ' seg__btn--active' : ''}`} onClick={() => setMode('line')}>Иконки</button>
        <button type="button" className={`seg__btn${mode === 'emoji' ? ' seg__btn--active' : ''}`} onClick={() => setMode('emoji')}>Эмодзи</button>
      </div>
      {mode === 'line'
        ? <EmojiPicker key="line" value={value} onChange={onChange} source={LUCIDE_SOURCE} className="icon-picker__body" />
        : <EmojiPicker key="emoji" value={value} onChange={onChange} className="icon-picker__body" />}
    </div>
  );
}
