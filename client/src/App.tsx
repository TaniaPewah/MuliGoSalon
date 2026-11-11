import { useStore } from './store';
import { LoginView } from './views/Login';
import { SalonView } from './views/Salon';
import { GameView } from './views/Game';
import { PracticeView } from './views/Practice';

export function App() {
  const { view, toasts, actions } = useStore();

  return (
    <div className="app">
      {view === 'login' && <LoginView />}
      {view === 'salon' && <SalonView />}
      {view === 'game' && <GameView />}
      {view === 'practice' && <PracticeView />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <button key={t.id} className={`toast toast--${t.tone}`} onClick={() => actions.dismissToast(t.id)}>
            {t.text}
          </button>
        ))}
      </div>
    </div>
  );
}
