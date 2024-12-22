import { it, expect } from 'vitest';
import { combineLatest, concatMap, from, lastValueFrom, of, toArray, zip } from 'rxjs';
import { incremental } from '../src/core';

it('default', async () => {
  const data$ = from([
    { a: 1, b: 'x' },
    { a: 2, b: 'y' },
    { a: 3, b: 'z' },
  ]).pipe(
    incremental(
      d =>
        [
          ['a', d.a],
          ['b', d.b],
        ] as const
    ),
    concatMap(obs => {
      return combineLatest(obs);
    })
  );

  const timeline: string[] = [];

  data$.subscribe({
    next: v => timeline.push(JSON.stringify(v)),
    complete: () => timeline.push('complete'),
    error: err => timeline.push('error: ' + err),
  });

  expect(timeline).toMatchInlineSnapshot(`
    [
      "[1,"x"]",
      "[2,"x"]",
      "[2,"y"]",
      "[3,"y"]",
      "[3,"z"]",
      "complete",
    ]
  `);
});
