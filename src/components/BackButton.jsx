import { useLocation, useNavigate } from 'react-router-dom';

// Есть ли куда возвращаться внутри приложения. react-router кладёт в
// history.state индекс записи (idx); 0 — это первый экран сессии.
// На iOS в режиме PWA нет системной кнопки «назад» и свайпа от края,
// поэтому кнопка в шапке — единственный способ вернуться.
function canGoBack(location) {
  const idx = window.history.state?.idx;
  if (typeof idx === 'number') return idx > 0;
  return location.key !== 'default';
}

// Кнопка «Назад» в шапке экрана. Возвращает на предыдущий экран,
// а если истории нет (приложение открыли сразу на этом экране) —
// ведёт на fallback.
export default function BackButton({ fallback = '/' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const onClick = () => {
    if (canGoBack(location)) navigate(-1);
    else navigate(fallback, { replace: true });
  };
  return (
    <button type="button" className="back-btn" onClick={onClick} aria-label="Назад" title="Назад">
      ←
    </button>
  );
}
