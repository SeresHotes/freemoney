import { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import AddTransaction from './pages/AddTransaction';
import Categories from './pages/Categories';
import Wallets from './pages/Wallets';
import Transfer from './pages/Transfer';
import Settings from './pages/Settings';
import {
  LoadingScreen,
  NoConfigScreen,
  SignInScreen,
  NoSheetScreen,
  ModeSelectScreen,
} from './pages/Gate';

// Статистика тянет recharts — грузим её отдельным чанком по требованию.
const Stats = lazy(() => import('./pages/Stats'));

function Shell() {
  const { status } = useApp();

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'select-mode') return <ModeSelectScreen />;
  if (status === 'no-config') return <NoConfigScreen />;
  if (status === 'signed-out') return <SignInScreen />;
  if (status === 'no-sheet') return <NoSheetScreen />;

  return (
    <div className="app">
      <main className="app__main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/add/:type" element={<AddTransaction />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/wallets" element={<Wallets />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route
            path="/stats"
            element={
              <Suspense fallback={<div className="page"><div className="spinner" /></div>}>
                <Stats />
              </Suspense>
            }
          />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <NavBar />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </HashRouter>
  );
}
