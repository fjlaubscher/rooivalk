import { describe, it, expect } from 'vitest';

import {
  cooldownFor,
  pickFromPool,
  selectMotdCombo,
  type MotdPools,
  type MotdSelection,
} from './motd-rotation.ts';

/** Deterministic rng cycling through the given 0..1 values. */
const seq = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('cooldownFor', () => {
  it('derives the cooldown from the pool size', () => {
    expect(cooldownFor(6)).toBe(4); // round(6 * 0.7)
    expect(cooldownFor(29)).toBe(20); // round(29 * 0.7)
    expect(cooldownFor(40)).toBe(28); // round(40 * 0.7)
  });

  it('never exceeds poolSize - 1 so at least one value stays eligible', () => {
    expect(cooldownFor(2)).toBe(1);
    expect(cooldownFor(3)).toBe(2);
  });

  it('returns 0 for a degenerate pool', () => {
    expect(cooldownFor(1)).toBe(0);
    expect(cooldownFor(0)).toBe(0);
  });
});

describe('pickFromPool', () => {
  const pool = ['A', 'B', 'C', 'D', 'E', 'F']; // cooldown = 4

  it('excludes the most-recently-used values and picks an eligible one', () => {
    // newest-first recent uses the 4 freshest, leaving E and F eligible.
    expect(pickFromPool(pool, ['A', 'B', 'C', 'D'], seq([0]))).toBe('E');
    expect(pickFromPool(pool, ['A', 'B', 'C', 'D'], seq([0.99]))).toBe('F');
  });

  it('ignores recent values that are not in the pool', () => {
    expect(pickFromPool(pool, ['Z', 'Y', 'X'], seq([0]))).toBe('A');
  });

  it('never deadlocks when every value is on cooldown', () => {
    // 3-value pool → cooldown 2, so one value is always eligible.
    const small = ['A', 'B', 'C'];
    const pick = pickFromPool(small, ['A', 'B', 'C'], seq([0]));
    expect(small).toContain(pick);
    expect(['A', 'B']).not.toContain(pick); // the two freshest are excluded
  });

  it('always returns the only value of a single-element pool', () => {
    expect(pickFromPool(['Solo'], ['Solo', 'Solo'], seq([0]))).toBe('Solo');
  });

  it('throws on an empty pool', () => {
    expect(() => pickFromPool([], [], seq([0]))).toThrow(/empty pool/);
  });
});

describe('selectMotdCombo', () => {
  const pools: MotdPools = {
    cities: ['Cape Town', 'Gdańsk', 'Dubai', 'Tamarin', 'Lakeside', 'Table'],
    styles: ['watercolour', 'oil', 'pixel art', 'pop art'],
    aspects: ['landmark', 'cuisine', 'wildlife', 'skyline'],
  };

  it('returns values drawn from each pool', () => {
    const sel = selectMotdCombo(pools, [], seq([0]));
    expect(pools.cities).toContain(sel.city);
    expect(pools.styles).toContain(sel.style);
    expect(pools.aspects).toContain(sel.aspect);
  });

  it('steers each dimension away from its recent history', () => {
    const history: MotdSelection[] = [
      { city: 'Cape Town', style: 'watercolour', aspect: 'landmark' },
      { city: 'Gdańsk', style: 'oil', aspect: 'cuisine' },
      { city: 'Dubai', style: 'pixel art', aspect: 'wildlife' },
      { city: 'Tamarin', style: 'pop art', aspect: 'skyline' },
    ];
    const sel = selectMotdCombo(pools, history, seq([0]));
    // styles/aspects pools are size 4 → cooldown 3, so only the single
    // least-recently-used (oldest) value of each remains eligible. History is
    // newest-first, so the oldest entry is the last one.
    expect(sel.style).toBe('pop art');
    expect(sel.aspect).toBe('skyline');
    // cities pool is size 6 → cooldown 4, the 4 freshest are excluded.
    expect(['Cape Town', 'Gdańsk', 'Dubai', 'Tamarin']).not.toContain(sel.city);
  });

  it('re-rolls to avoid repeating a recent exact combo', () => {
    // Two styles, two aspects, one city, but cooldown leaves room to re-roll.
    const tiny: MotdPools = {
      cities: ['Solo'],
      styles: ['s1', 's2'],
      aspects: ['a1', 'a2'],
    };
    // Recent combo Solo|s1|a1; per-pool cooldown already forces s2/a2 here, so
    // the result must differ from the recent combo.
    const history: MotdSelection[] = [
      { city: 'Solo', style: 's1', aspect: 'a1' },
    ];
    const sel = selectMotdCombo(tiny, history, seq([0]));
    expect(`${sel.city} ${sel.style} ${sel.aspect}`).not.toBe('Solo s1 a1');
  });

  it('terminates even when no fresh combo is possible', () => {
    const onlyCombo: MotdPools = {
      cities: ['Solo'],
      styles: ['s1'],
      aspects: ['a1'],
    };
    const history: MotdSelection[] = [
      { city: 'Solo', style: 's1', aspect: 'a1' },
    ];
    expect(selectMotdCombo(onlyCombo, history, seq([0]))).toEqual({
      city: 'Solo',
      style: 's1',
      aspect: 'a1',
    });
  });

  it('throws when any pool is empty', () => {
    expect(() =>
      selectMotdCombo(
        { cities: [], styles: ['s'], aspects: ['a'] },
        [],
        seq([0]),
      ),
    ).toThrow(/empty pool/);
  });
});
