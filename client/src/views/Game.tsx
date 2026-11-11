import { useState } from 'react';
import { colorToSign, opponentOf, type Color, type PlayerInfo } from '@multigo/shared';
import { Avatar } from '../components/Avatar';
import { Clock } from '../components/Clock';
import { GoBoard } from '../components/GoBoard';
import { useStore, type TimedGameState } from '../store';

export function GameView() {
  const { me, game, actions } = useStore();
  const [confirmResign, setConfirmResign] = useState(false);

  if (!me || !game) {
    return (
      <main className="centered">
        <p className="muted">Setting up the board…</p>
      </main>
    );
  }

  const { state } = game;
  const myColor: Color | null =
    state.players.black.id === me.id ? 'black' : state.players.white.id === me.id ? 'white' : null;
  const perspective: Color = myColor ?? 'black';
  const opponentColor = opponentOf(perspective);
  const isSpectator = myColor === null;
  const isMyTurn = state.phase === 'playing' && myColor === state.turn;
  const flipped = perspective === 'white';

  const statusText = (() => {
    if (state.phase === 'finished' && state.result) return resultText(state, me.id);
    if (isSpectator) {
      return `Watching · ${state.turn === 'black' ? 'Black' : 'White'} to play.`;
    }
    if (state.lastMove === 'pass') {
      const passer = opponentOf(state.turn);
      return `${nameOf(state.players[passer], me.id)} passed. ${isMyTurn ? 'Pass again to end the game, or keep playing.' : ''}`;
    }
    return isMyTurn ? 'Your move.' : `Waiting for ${nameOf(state.players[state.turn], me.id)}…`;
  })();

  return (
    <main className="game">
      <header className="topbar topbar--compact">
        <h1 className="brand brand--small">
          multi<span>GO</span>
        </h1>
        <div className="game__meta">
          {state.size}×{state.size} · komi {state.komi} · {Math.round(state.timeControl.mainTimeMs / 60000)} min +{' '}
          {Math.round(state.timeControl.incrementMs / 1000)}s
        </div>
        <div className="game__status" data-testid="game-status" aria-live="polite">
          {statusText}
        </div>
      </header>

      <section className="game__layout">
        <PlayerCard game={game} color={opponentColor} meId={me.id} position="top" />

        <div className="board-wrap">
          <GoBoard
            size={state.size}
            board={state.board}
            hoverSign={isMyTurn && myColor && !isSpectator ? colorToSign(myColor) : null}
            flipped={flipped}
            lastMove={Array.isArray(state.lastMove) ? state.lastMove : null}
            koPoint={state.koPoint}
            territory={state.territory}
            onPlace={isSpectator ? undefined : actions.place}
          />
        </div>

        <PlayerCard game={game} color={perspective} meId={me.id} position="bottom" />

        <div className="game__controls">
          {state.phase === 'playing' && myColor && !isSpectator ? (
            <>
              <button className="btn btn--secondary" onClick={actions.pass} disabled={!isMyTurn} data-testid="pass-button">
                Pass
              </button>
              {confirmResign ? (
                <span className="confirm">
                  Resign?
                  <button
                    className="btn btn--danger"
                    onClick={() => {
                      actions.resign();
                      setConfirmResign(false);
                    }}
                    data-testid="confirm-resign"
                  >
                    Yes, resign
                  </button>
                  <button className="btn btn--ghost" onClick={() => setConfirmResign(false)}>
                    No
                  </button>
                </span>
              ) : (
                <button className="btn btn--ghost" onClick={() => setConfirmResign(true)} data-testid="resign-button">
                  Resign
                </button>
              )}
            </>
          ) : (
            <button className="btn btn--primary" onClick={actions.leaveGame} data-testid="back-to-salon">
              Back to the salon
            </button>
          )}
        </div>
      </section>

      {state.phase === 'finished' && state.result && (
        <div className="result" role="dialog" aria-label="Game over" data-testid="result-panel">
          <h2>{state.result.summary}</h2>
          <p>{resultText(state, me.id)}</p>
          {state.result.score && (
            <table className="score">
              <thead>
                <tr>
                  <th />
                  <th>Black</th>
                  <th>White</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Stones</td>
                  <td>{state.result.score.blackStones}</td>
                  <td>{state.result.score.whiteStones}</td>
                </tr>
                <tr>
                  <td>Territory</td>
                  <td>{state.result.score.blackTerritory}</td>
                  <td>{state.result.score.whiteTerritory}</td>
                </tr>
                <tr>
                  <td>Komi</td>
                  <td>–</td>
                  <td>{state.result.score.komi}</td>
                </tr>
                <tr className="score__total">
                  <td>Total</td>
                  <td>{state.result.score.black}</td>
                  <td>{state.result.score.white}</td>
                </tr>
              </tbody>
            </table>
          )}
          <button className="btn btn--primary" onClick={actions.leaveGame}>
            Back to the salon
          </button>
        </div>
      )}
    </main>
  );
}

function nameOf(p: PlayerInfo, meId: string) {
  return p.id === meId ? 'you' : p.name;
}

function resultText(state: TimedGameState['state'], meId: string): string {
  const r = state.result!;
  const reason: Record<string, string> = {
    resign: 'by resignation',
    timeout: 'on time',
    score: 'on points',
    repetition: 'by triple repetition',
    abandon: 'because the opponent left',
  };
  if (r.winner === null) return `Draw ${reason[r.reason]}.`;
  const winner = state.players[r.winner];
  const isMe = winner.id === meId;
  return `${isMe ? 'You win' : `${winner.name} wins`} ${reason[r.reason]}.`;
}

function PlayerCard({ game, color, meId, position }: { game: TimedGameState; color: Color; meId: string; position: 'top' | 'bottom' }) {
  const { state } = game;
  const player = state.players[color];
  const active = state.phase === 'playing' && state.turn === color;
  return (
    <div className={['player-card', `player-card--${position}`, active ? 'player-card--active' : ''].join(' ')} data-testid={`player-card-${color}`}>
      <Avatar character={player.character} size={52} />
      <div className="player-card__info">
        <div className="player-card__name">
          <span className={`stone-dot stone-dot--${color}`} />
          <strong>{player.name}</strong>
          {player.id === meId && <small>(you)</small>}
        </div>
        <small className="player-card__rank">
          {player.rank} · {player.rating} · captures {state.captures[color]}
        </small>
      </div>
      <Clock game={game} color={color} />
    </div>
  );
}
