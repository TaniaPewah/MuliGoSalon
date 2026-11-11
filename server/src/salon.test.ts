import { describe, expect, it } from 'vitest';
import { STARTING_RATING, ratingToRank, type PlayerInfo } from '@multigo/shared';
import { Salon, SPECTATE_RADIUS } from './salon.js';

function player(id: string, name: string): PlayerInfo {
  return { id, name, character: 'sloth', rating: STARTING_RATING, rank: ratingToRank(STARTING_RATING) };
}

describe('salon spectate proximity', () => {
  it('finds a live table within the radius and ignores empty ones', () => {
    const salon = new Salon();
    const t1 = salon.tables[0];
    expect(salon.liveTableNear(t1.x, t1.y)).toBeNull();
    salon.bindGame(t1.id, 'g1');
    expect(salon.liveTableNear(t1.x, t1.y)?.id).toBe(t1.id);
    expect(salon.liveTableNear(t1.x + SPECTATE_RADIUS, t1.y)?.id).toBe(t1.id);
    expect(salon.liveTableNear(t1.x + SPECTATE_RADIUS + 1, t1.y)).toBeNull();
  });

  it('nudges a watcher south of the table, outside the radius', () => {
    const salon = new Salon();
    salon.join(player('a', 'Ada'));
    const t1 = salon.tables[0];
    salon.bindGame(t1.id, 'g1');
    const moved = salon.nudgeAway('a', t1);
    expect(moved).not.toBeNull();
    expect(salon.liveTableNear(moved!.x, moved!.y)).toBeNull();
    expect(moved!.y).toBeGreaterThan(t1.y);
  });
});
