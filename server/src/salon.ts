import {
  TIME_CONTROL_PRESETS,
  type Character,
  type GameSettings,
  type PlayerInfo,
  type PlayerStatus,
  type SalonPlayer,
  type SalonState,
  type SalonTable,
} from '@multigo/shared';

export const SALON_WIDTH = 960;
export const SALON_HEIGHT = 560;

/** Offset of the two seats relative to a table centre. */
export const SEAT_OFFSETS: [number, number][] = [
  [-62, 0],
  [62, 0],
];

/** Walk this close to a table with a live game to start spectating. */
export const SPECTATE_RADIUS = 100;

function makeTables(): SalonTable[] {
  const blitz = TIME_CONTROL_PRESETS[0].control;
  const normal = TIME_CONTROL_PRESETS[1].control;
  const long = TIME_CONTROL_PRESETS[2].control;
  return [
    { id: 't1', label: '9×9 · Blitz', x: 230, y: 170, seats: [null, null], settings: { size: 9, timeControl: blitz }, gameId: null },
    { id: 't2', label: '9×9 · Normal', x: 730, y: 170, seats: [null, null], settings: { size: 9, timeControl: normal }, gameId: null },
    { id: 't3', label: '13×13 · Normal', x: 230, y: 400, seats: [null, null], settings: { size: 13, timeControl: normal }, gameId: null },
    { id: 't4', label: '19×19 · Long', x: 730, y: 400, seats: [null, null], settings: { size: 19, timeControl: long }, gameId: null },
  ];
}

export class Salon {
  private players = new Map<string, SalonPlayer>();
  readonly tables: SalonTable[] = makeTables();

  join(info: PlayerInfo): SalonPlayer {
    const player: SalonPlayer = {
      ...info,
      x: SALON_WIDTH / 2 + Math.round((Math.random() - 0.5) * 200),
      y: SALON_HEIGHT - 70,
      tableId: null,
      seat: null,
      status: 'idle',
    };
    this.players.set(info.id, player);
    return player;
  }

  get(id: string): SalonPlayer | undefined {
    return this.players.get(id);
  }

  has(id: string): boolean {
    return this.players.has(id);
  }

  updateInfo(info: PlayerInfo) {
    const p = this.players.get(info.id);
    if (p) Object.assign(p, { name: info.name, character: info.character, rating: info.rating, rank: info.rank });
  }

  setStatus(id: string, status: PlayerStatus) {
    const p = this.players.get(id);
    if (p) p.status = status;
  }

  move(id: string, x: number, y: number): SalonPlayer | null {
    const p = this.players.get(id);
    if (!p) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    // Moving stands the player up from a table.
    if (p.tableId) this.stand(id);
    p.x = Math.round(Math.min(SALON_WIDTH - 24, Math.max(24, x)));
    p.y = Math.round(Math.min(SALON_HEIGHT - 24, Math.max(24, y)));
    return p;
  }

  /** Seats a player. Returns the table and, if it is now full, the opponent's id. */
  sit(id: string, tableId: string, seat: 0 | 1): { table: SalonTable; opponentId: string | null } | { error: string } {
    const p = this.players.get(id);
    const table = this.tables.find((t) => t.id === tableId);
    if (!p || !table) return { error: 'Unknown table.' };
    if (seat !== 0 && seat !== 1) return { error: 'Unknown seat.' };
    if (p.status === 'playing') return { error: 'You are already in a game.' };
    if (p.status === 'spectating') return { error: 'Leave the game you are watching first.' };
    if (table.gameId) return { error: 'A game is already in progress at this table.' };
    if (table.seats[seat] && table.seats[seat] !== id) return { error: 'That seat is taken.' };

    this.stand(id);
    table.seats[seat] = id;
    p.tableId = table.id;
    p.seat = seat;
    p.x = table.x + SEAT_OFFSETS[seat][0];
    p.y = table.y + SEAT_OFFSETS[seat][1];

    const other = table.seats[seat === 0 ? 1 : 0];
    return { table, opponentId: other && other !== id ? other : null };
  }

  stand(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    for (const t of this.tables) {
      for (let i = 0; i < 2; i++) if (t.seats[i] === id) t.seats[i] = null;
    }
    p.tableId = null;
    p.seat = null;
  }

  leave(id: string) {
    this.stand(id);
    this.players.delete(id);
  }

  bindGame(tableId: string, gameId: string) {
    const table = this.tables.find((t) => t.id === tableId);
    if (table) table.gameId = gameId;
  }

  unbindGame(gameId: string) {
    for (const t of this.tables) if (t.gameId === gameId) t.gameId = null;
  }

  tableByGame(gameId: string): SalonTable | undefined {
    return this.tables.find((t) => t.gameId === gameId);
  }

  /** Closest table with a live game within SPECTATE_RADIUS, if any. */
  liveTableNear(x: number, y: number): SalonTable | null {
    let best: SalonTable | null = null;
    let bestDist = SPECTATE_RADIUS;
    for (const t of this.tables) {
      if (!t.gameId) continue;
      const dist = Math.hypot(t.x - x, t.y - y);
      if (dist <= bestDist) {
        best = t;
        bestDist = dist;
      }
    }
    return best;
  }

  findFreeTable(settings: GameSettings): SalonTable | undefined {
    const empty = (t: SalonTable) => !t.gameId && !t.seats[0] && !t.seats[1];
    const sameSettings = (t: SalonTable) =>
      t.settings.size === settings.size &&
      t.settings.timeControl.mainTimeMs === settings.timeControl.mainTimeMs &&
      t.settings.timeControl.incrementMs === settings.timeControl.incrementMs;
    return this.tables.find((t) => empty(t) && sameSettings(t)) ?? this.tables.find(empty);
  }

  /** Place the player just south of the table, outside the spectate radius. */
  nudgeAway(id: string, table: SalonTable): SalonPlayer | null {
    const p = this.players.get(id);
    if (!p) return null;
    p.x = Math.round(Math.min(SALON_WIDTH - 24, Math.max(24, table.x)));
    p.y = Math.round(Math.min(SALON_HEIGHT - 24, Math.max(24, table.y + SPECTATE_RADIUS + 28)));
    return p;
  }

  toState(queueSize: number): SalonState {
    return {
      width: SALON_WIDTH,
      height: SALON_HEIGHT,
      players: [...this.players.values()],
      tables: this.tables,
      queueSize,
    };
  }
}

export function sanitizeName(raw: unknown): string {
  const name = String(raw ?? '')
    .replace(/[^\p{L}\p{N} _\-.!?]/gu, '')
    .trim()
    .slice(0, 16);
  return name.length ? name : 'Anonymous';
}

export function sanitizeCharacter(raw: unknown): Character {
  return raw === 'shark' || raw === 'jellyfish' ? raw : 'sloth';
}
