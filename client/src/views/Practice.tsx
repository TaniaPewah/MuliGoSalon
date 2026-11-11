import { colorToSign } from '@multigo/shared';
import { GoBoard } from '../components/GoBoard';
import { useStore } from '../store';

export function PracticeView() {
  const { problems, practice, actions } = useStore();
  const currentIndex = practice ? problems.findIndex((p) => p.id === practice.problemId) : -1;
  const next = currentIndex >= 0 && currentIndex < problems.length - 1 ? problems[currentIndex + 1] : null;

  return (
    <main className="practice">
      <header className="topbar topbar--compact">
        <h1 className="brand brand--small">
          multi<span>GO</span>
        </h1>
        <div className="game__meta">Practice · life and death</div>
        <button className="btn btn--ghost" onClick={actions.closePractice} data-testid="practice-back">
          Back to the salon
        </button>
      </header>

      <section className="practice__layout">
        <aside className="problem-list" data-testid="problem-list">
          <h2>Tsumego</h2>
          <p className="muted">Black to play in every problem. Find the move that captures, lives or kills.</p>
          {problems.length === 0 && <p className="muted">Loading problems…</p>}
          <ol>
            {problems.map((p, i) => (
              <li key={p.id}>
                <button
                  className={['problem', practice?.problemId === p.id ? 'problem--active' : ''].join(' ')}
                  onClick={() => actions.startProblem(p.id)}
                  data-testid={`problem-${p.id}`}
                >
                  <span className="problem__index">{i + 1}</span>
                  <span className="problem__title">{p.title}</span>
                  <span className={`difficulty difficulty--${p.difficulty}`}>{p.difficulty}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <div className="practice__board">
          {practice ? (
            <>
              <div className="practice__header">
                <h2>{practice.title}</h2>
                <p>{practice.description}</p>
              </div>
              <div className="board-wrap board-wrap--practice">
                <GoBoard
                  size={practice.size}
                  board={practice.board}
                  hoverSign={practice.status === 'solving' ? colorToSign(practice.toPlay) : null}
                  lastMove={practice.lastMove}
                  onPlace={actions.practiceMove}
                />
              </div>
              <div className={`practice__message practice__message--${practice.status}`} data-testid="practice-message" aria-live="polite">
                {practice.status === 'solved' && <strong>Correct! </strong>}
                {practice.status === 'failed' && <strong>Not quite. </strong>}
                {practice.message}
              </div>
              <div className="game__controls">
                <button className="btn btn--secondary" onClick={actions.resetProblem} data-testid="practice-reset">
                  Reset
                </button>
                {next && (
                  <button className="btn btn--primary" onClick={() => actions.startProblem(next.id)} data-testid="practice-next">
                    Next problem →
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="practice__empty">
              <h2>Pick a problem</h2>
              <p className="muted">Choose one from the list to start. Click an intersection to play your answer; the server checks it and answers for White.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
