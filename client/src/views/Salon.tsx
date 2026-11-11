import { useEffect, useRef, useState } from 'react';
import { BOARD_SIZES, TIME_CONTROL_PRESETS, type BoardSize, type SalonPlayer, type SalonTable } from '@multigo/shared';
import { Avatar } from '../components/Avatar';
import { useStore } from '../store';
import { isMuted, setMuted } from '../sound';

const SEAT_OFFSETS: [number, number][] = [
  [-62, 0],
  [62, 0],
];
const STEP = 18;

export function SalonView() {
  const { me, salon, queue, actions } = useStore();
  const [size, setSize] = useState<BoardSize>(9);
  const [preset, setPreset] = useState(TIME_CONTROL_PRESETS[1].id);
  const [muted, setMutedState] = useState(isMuted());
  const roomRef = useRef<HTMLDivElement>(null);
  const lastSend = useRef(0);

  const self = salon?.players.find((p) => p.id === me?.id) ?? null;
  const selfRef = useRef(self);
  selfRef.current = self;

  // Arrow keys / WASD move the avatar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!salon) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const cur = selfRef.current;
      if (!cur) return;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft' || e.key === 'a') dx = -STEP;
      else if (e.key === 'ArrowRight' || e.key === 'd') dx = STEP;
      else if (e.key === 'ArrowUp' || e.key === 'w') dy = -STEP;
      else if (e.key === 'ArrowDown' || e.key === 's') dy = STEP;
      else return;
      e.preventDefault();
      const x = Math.min(salon.width - 24, Math.max(24, cur.x + dx));
      const y = Math.min(salon.height - 24, Math.max(24, cur.y + dy));
      const now = performance.now();
      if (now - lastSend.current < 40) return;
      lastSend.current = now;
      actions.moveTo(x, y);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [salon, actions]);

  if (!me || !salon) {
    return (
      <main className="centered">
        <p className="muted">Entering the salon…</p>
      </main>
    );
  }

  const onFloorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const room = roomRef.current;
    if (!room) return;
    const rect = room.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * salon.width;
    const y = ((e.clientY - rect.top) / rect.height) * salon.height;
    actions.moveTo(Math.round(x), Math.round(y));
  };

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const findGame = () => {
    const control = TIME_CONTROL_PRESETS.find((p) => p.id === preset)?.control ?? TIME_CONTROL_PRESETS[1].control;
    actions.joinQueue({ size, timeControl: control });
  };

  const others = salon.players.filter((p) => p.id !== me.id);

  return (
    <main className="salon">
      <header className="topbar">
        <h1 className="brand brand--small">
          multi<span>GO</span>
        </h1>
        <div className="me-chip" data-testid="me-chip">
          <Avatar character={me.character} size={40} />
          <div>
            <strong>{me.name}</strong>
            <small>
              {me.rank} · {me.rating}
            </small>
          </div>
        </div>
        <div className="topbar__actions">
          <label className="select-wrap">
            <span>Board</span>
            <select value={size} onChange={(e) => setSize(Number(e.target.value) as BoardSize)} disabled={queue.queued} data-testid="size-select">
              {BOARD_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}×{s}
                </option>
              ))}
            </select>
          </label>
          <label className="select-wrap">
            <span>Time</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value)} disabled={queue.queued} data-testid="time-select">
              {TIME_CONTROL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {queue.queued ? (
            <button className="btn btn--secondary" onClick={actions.leaveQueue} data-testid="find-game">
              <span className="spinner" /> Waiting for an opponent… cancel
            </button>
          ) : (
            <button className="btn btn--primary" onClick={findGame} data-testid="find-game">
              Find game
            </button>
          )}
          <button className="btn btn--ghost" onClick={actions.openPractice} data-testid="practice-button">
            Practice
          </button>
          <button className="btn btn--icon" onClick={toggleMute} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <section className="salon__body">
        <div
          ref={roomRef}
          className="room"
          style={{ aspectRatio: `${salon.width} / ${salon.height}` }}
          onClick={onFloorClick}
          data-testid="room"
        >
          <div className="room__rug" />
          <div className="room__plants" aria-hidden>
            <span>🪴</span>
            <span>🌿</span>
            <span>🪴</span>
          </div>
          {salon.tables.map((t) => (
            <Table
              key={t.id}
              table={t}
              salon={salon}
              players={salon.players}
              onSit={actions.sit}
              onWalkTo={actions.moveTo}
              meId={me.id}
            />
          ))}
          {salon.players.map((p) => (
            <PlayerSprite key={p.id} player={p} isMe={p.id === me.id} room={salon} />
          ))}
        </div>

        <aside className="sidebar">
          <h2>In the salon ({salon.players.length})</h2>
          <ul className="player-list" data-testid="player-list">
            {[self, ...others].filter(Boolean).map((p) => (
              <li key={p!.id}>
                <Avatar character={p!.character} size={28} />
                <span className="player-list__name">
                  {p!.name}
                  {p!.id === me.id ? ' (you)' : ''}
                </span>
                <span className="player-list__rank">{p!.rank}</span>
                <span className={`status status--${p!.status}`}>{statusLabel(p!.status)}</span>
              </li>
            ))}
          </ul>
          <div className="hint">
            <p>
              <strong>Move</strong> with the arrow keys or click anywhere on the floor.
            </p>
            <p>
              <strong>Sit</strong> at an empty chair; when a second player sits down at your table, the game begins.
            </p>
            <p>
              <strong>Watch</strong> by walking up to a table that already has a game; you will join as a spectator.
            </p>
            <p>
              <strong>Find game</strong> pairs you with the next player who is also waiting.
            </p>
            {salon.queueSize > 0 && !queue.queued && (
              <p className="hint__queue">
                {salon.queueSize} player{salon.queueSize > 1 ? 's are' : ' is'} waiting in the queue right now.
              </p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

function statusLabel(status: SalonPlayer['status']): string {
  switch (status) {
    case 'idle':
      return 'in salon';
    case 'queued':
      return 'looking for a game';
    case 'playing':
      return 'playing';
    case 'practice':
      return 'practising';
    case 'spectating':
      return 'watching';
  }
}

function pct(v: number, total: number) {
  return `${(v / total) * 100}%`;
}

function Table({
  table,
  salon,
  players,
  onSit,
  onWalkTo,
  meId,
}: {
  table: SalonTable;
  salon: { width: number; height: number };
  players: SalonPlayer[];
  onSit: (tableId: string, seat: 0 | 1) => void;
  onWalkTo: (x: number, y: number) => void;
  meId: string;
}) {
  return (
    <>
      <div
        className={['table', table.gameId ? 'table--live' : ''].join(' ')}
        style={{ left: pct(table.x, salon.width), top: pct(table.y, salon.height) }}
        onClick={(e) => {
          e.stopPropagation();
          if (table.gameId) onWalkTo(table.x, table.y);
        }}
        title={table.gameId ? 'Walk over to watch this game' : undefined}
        data-testid={`table-${table.id}`}
      >
        <div className="table__board">
          {Array.from({ length: 16 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <span className="table__label">{table.label}</span>
      </div>
      {SEAT_OFFSETS.map(([ox, oy], seat) => {
        const occupant = table.seats[seat] ? players.find((p) => p.id === table.seats[seat]) : null;
        const mine = occupant?.id === meId;
        return (
          <button
            key={seat}
            className={['seat', occupant ? 'seat--taken' : '', mine ? 'seat--mine' : ''].join(' ')}
            style={{ left: pct(table.x + ox, salon.width), top: pct(table.y + oy + 30, salon.height) }}
            onClick={(e) => {
              e.stopPropagation();
              if (!occupant) onSit(table.id, seat as 0 | 1);
            }}
            disabled={!!occupant}
            title={occupant ? `${occupant.name} is sitting here` : `Sit down at ${table.label}`}
            aria-label={occupant ? `${occupant.name} is sitting here` : `Sit at ${table.label}, seat ${seat + 1}`}
            data-testid={`seat-${table.id}-${seat}`}
          />
        );
      })}
    </>
  );
}

function PlayerSprite({ player, isMe, room }: { player: SalonPlayer; isMe: boolean; room: { width: number; height: number } }) {
  return (
    <div
      className={['sprite', isMe ? 'sprite--me' : '', player.status === 'playing' ? 'sprite--playing' : ''].join(' ')}
      style={{ left: pct(player.x, room.width), top: pct(player.y, room.height) }}
      data-testid={`sprite-${player.name}`}
    >
      <div className="sprite__tag">
        <span className="sprite__name">{player.name}</span>
        <span className="sprite__rank">{player.rank}</span>
      </div>
      <Avatar character={player.character} size={56} flip={player.seat === 1} />
      {player.status !== 'idle' && <span className={`sprite__status status--${player.status}`}>{statusLabel(player.status)}</span>}
    </div>
  );
}
