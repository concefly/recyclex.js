import { it, expect } from 'vitest';
import { combineLatest, concatMap, from, lastValueFrom, of, toArray, zip } from 'rxjs';
import { incremental, incrementalList } from '../src/core';

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

it('list', async () => {
  const data$ = from([
    [1, 1.1],
    [2, 2.1],
    [3, 3.1, 4],
  ]).pipe(
    incrementalList(d => d + ''),
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
      "[1,1.1]",
      "[2,2.1]",
      "[3,3.1,4]",
      "complete",
    ]
  `);
});

it('object list', async () => {
  type IDat = { key: string; v: number };

  const data$ = from<IDat[][]>([
    [
      { key: 'a', v: 1 },
      { key: 'b', v: 1 },
    ],
    [
      { key: 'a', v: 2 },
      { key: 'b', v: 2 },
    ],
    [
      { key: 'a', v: 3 },
      { key: 'b', v: 3 },
    ],
  ]).pipe(
    incrementalList(d => d.key),
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
      "[{"key":"a","v":1},{"key":"b","v":1}]",
      "[{"key":"a","v":2},{"key":"b","v":1}]",
      "[{"key":"a","v":2},{"key":"b","v":2}]",
      "[{"key":"a","v":3},{"key":"b","v":2}]",
      "[{"key":"a","v":3},{"key":"b","v":3}]",
      "complete",
    ]
  `);
});
