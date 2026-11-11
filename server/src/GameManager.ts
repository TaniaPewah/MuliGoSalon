import {
  ratingToRank,
  type Color,
  type GameSettings,
  type GameState,
  type PlayerInfo,
} from '@multigo/shared';
import { GoGame } from './game/GoGame.js';
import { updateElo } from './game/rating.js';

interface ManagedGame {
  game: GoGame;
  timer: NodeJS.Timeout | null;
}

export interface GameManagerEvents {
  /** Called with the new state every time a game changes. */
  onState: (state: GameState) => void;
  /** Called once when a game finishes, after ratings were updated. */
  onFinish: (game: GoGame, updated: { black: PlayerInfo; white: PlayerInfo }) => void;
}

let nextGameId = 1;

/**
 * Owns every live game: creates them, routes player intents to the engine,
 * runs the authoritative timeout timers and updates ratings when games end.
 */
export class GameManager {
  private games = new Map<string, ManagedGame>();
  private playerGame = new Map<string, string>();

  constructor(private readonly events: GameManagerEvents) {}

  create(a: PlayerInfo, b: PlayerInfo, settings: GameSettings): GoGame {
    const blackFirst = Math.random() < 0.5;
    const black = blackFirst ? a : b;
    const white = blackFirst ? b : a;
    const game = new GoGame({
      id: `g${nextGameId++}`,
      size: settings.size,
      timeControl: settings.timeControl,
      players: { black: { ...black }, white: { ...white } },
    });
    this.games.set(game.id, { game, timer: null });
    this.playerGame.set(a.id, game.id);
    this.playerGame.set(b.id, game.id);
    this.armTimer(game.id);
    return game;
  }

  get(gameId: string): GoGame | undefined {
    return this.games.get(gameId)?.game;
  }

  gameOf(playerId: string): GoGame | undefined {
    const id = this.playerGame.get(playerId);
    return id ? this.games.get(id)?.game : undefined;
  }

  place(playerId: string, gameId: string, x: number, y: number) {
    return this.act(playerId, gameId, (game, color) => game.place(color, x, y));
  }

  pass(playerId: string, gameId: string) {
    return this.act(playerId, gameId, (game, color) => game.pass(color));
  }

  resign(playerId: string, gameId: string) {
    return this.act(playerId, gameId, (game, color) => game.resign(color));
  }

  /** A player disconnected: they forfeit any running game. */
  abandon(playerId: string) {
    const game = this.gameOf(playerId);
    if (!game) return;
    const color = game.colorOf(playerId);
    if (color && game.phase === 'playing') {
      game.abandon(color);
      this.afterChange(game);
    }
    this.playerGame.delete(playerId);
  }

  /** Player acknowledged the end of the game and went back to the salon. */
  leave(playerId: string, gameId: string) {
    const entry = this.games.get(gameId);
    if (!entry) return;
    if (entry.game.phase === 'playing') {
      this.abandon(playerId);
      return;
    }
    this.playerGame.delete(playerId);
    const { black, white } = entry.game.players;
    if (!this.playerGame.has(black.id) && !this.playerGame.has(white.id)) this.games.delete(gameId);
  }

  private act(
    playerId: string,
    gameId: string,
    fn: (game: GoGame, color: Color) => ReturnType<GoGame['place']>,
  ): ReturnType<GoGame['place']> {
    const entry = this.games.get(gameId);
    if (!entry) return { ok: false, error: { code: 'not-found', message: 'Game not found.' } };
    const color = entry.game.colorOf(playerId);
    if (!color) return { ok: false, error: { code: 'not-in-game', message: 'You are not a player in this game.' } };
    const wasPlaying = entry.game.phase === 'playing';
    const result = fn(entry.game, color);
    // Even a rejected intent may have ended the game (e.g. a move after the flag fell).
    if (result.ok || (wasPlaying && entry.game.phase === 'finished')) this.afterChange(entry.game);
    return result;
  }

  private afterChange(game: GoGame) {
    const entry = this.games.get(game.id);
    if (!entry) return;
    if (game.phase === 'finished') {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = null;
      const updated = this.applyRatings(game);
      this.events.onState(game.toState());
      this.events.onFinish(game, updated);
    } else {
      this.armTimer(game.id);
      this.events.onState(game.toState());
    }
  }

  private armTimer(gameId: string) {
    const entry = this.games.get(gameId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    const deadline = entry.game.deadlineAt();
    if (deadline === null) return;
    const delay = Math.max(0, deadline - Date.now()) + 5;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (entry.game.checkTimeout()) this.afterChange(entry.game);
      else this.armTimer(gameId);
    }, delay);
  }

  private applyRatings(game: GoGame): { black: PlayerInfo; white: PlayerInfo } {
    const { black, white } = game.players;
    const result = game.result;
    const scoreBlack = !result || result.winner === null ? 0.5 : result.winner === 'black' ? 1 : 0;
    const { a, b } = updateElo(black.rating, white.rating, scoreBlack);
    return {
      black: { ...black, rating: a, rank: ratingToRank(a) },
      white: { ...white, rating: b, rank: ratingToRank(b) },
    };
  }
}
