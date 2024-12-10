import { it, expect } from 'vitest';
import { blueprint, DefaultError$, defineComponent, defineContext, IInstanceType } from '../src';
import { BehaviorSubject, combineLatest, map, take } from 'rxjs';

it('Single Component Lifecycle', () => {
  const timelines: string[] = [];

  const A = defineComponent({
    defaultProps: { n: 1 },
    setup: ctx => {
      timelines.push(`a init`);

      ctx.afterUpdate$.subscribe(() => {
        timelines.push('a afterUpdate');
      });

      ctx.dispose$.subscribe(() => {
        timelines.push('a dispose');
      });

      return combineLatest([ctx.P.n$]).pipe(
        map(([n]) => {
          timelines.push(`a update: n=${n}`);
          return [];
        })
      );
    },
  });

  const a = A.create('root');

  a.update({ n: 2 });
  a.update({ n: 2 });

  a.update({ n: 3 });
  a.update({ n: 3 });

  a.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a init",
      "a update: n=1",
      "a afterUpdate",
      "a update: n=2",
      "a afterUpdate",
      "a update: n=3",
      "a afterUpdate",
      "a dispose",
    ]
  `);
});

it('Single Component Lifecycle with initProps', () => {
  const timelines: string[] = [];

  const A = defineComponent({
    defaultProps: { n: 1 },
    setup: ctx => {
      timelines.push(`a init`);

      ctx.dispose$.subscribe(() => {
        timelines.push('a dispose');
      });

      return combineLatest([ctx.P.n$]).pipe(
        map(([n]) => {
          timelines.push(`a update: n=${n}`);
          return [];
        })
      );
    },
  });

  const a = A.create('root', { n: 2 });
  a.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a init",
      "a update: n=2",
      "a dispose",
    ]
  `);
});

it('Cannot dispose twice', () => {
  const A = defineComponent({
    defaultProps: { n: 1 },
    setup: () => {},
  });

  const a = A.create('root');

  a.dispose();

  expect(() => a.dispose()).toThrow('Already disposed');
});

it('Cannot update after dispose', () => {
  const A = defineComponent({
    defaultProps: { n: 1 },
    setup: () => {},
  });

  const a = A.create('root');

  a.dispose();

  expect(() => a.update({ n: 2 })).toThrow('Already disposed');
});

it('Hierarchy Components Lifecycle', () => {
  const timelines: string[] = [];

  const B = defineComponent({
    defaultProps: { b: 1 },
    setup: ctx => {
      timelines.push(`b<${ctx.key}> init`);

      ctx.dispose$.subscribe(() => {
        timelines.push(`b<${ctx.key}> dispose`);
      });

      return combineLatest([ctx.P.b$]).pipe(
        map(([n]) => {
          timelines.push(`b<${ctx.key}> update: b=${n}`);
          return [];
        })
      );
    },
  });

  const A = defineComponent({
    defaultProps: { a: 1 },
    setup: ctx => {
      timelines.push(`a<${ctx.key}> init`);

      ctx.dispose$.subscribe(() => {
        timelines.push(`a<${ctx.key}> dispose`);
      });

      return combineLatest([ctx.P.a$]).pipe(
        map(([a]) => {
          timelines.push(`a<${ctx.key}> update: a=${a}`);

          if (a === 1) return [blueprint(B, { b: 1 }, '1')];
          if (a === 2) return [blueprint(B, { b: 1.1 }, '1'), blueprint(B, { b: 2 }, '2')];
          if (a === 3) return [blueprint(B, { b: 2.1 }, '2')];

          return [];
        })
      );
    },
  });

  const root = A.create('root');

  root.update({ a: 2 });
  root.update({ a: 3 });

  root.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a<root> init",
      "a<root> update: a=1",
      "b<1> init",
      "b<1> update: b=1",
      "a<root> update: a=2",
      "b<1> update: b=1.1",
      "b<2> init",
      "b<2> update: b=2",
      "a<root> update: a=3",
      "b<1> dispose",
      "b<2> update: b=2.1",
      "b<2> dispose",
      "a<root> dispose",
    ]
  `);
});

it('Hierarchy Components Context', () => {
  const timelines: string[] = [];

  const userContext = defineContext<BehaviorSubject<string>>('user');

  const B = defineComponent({
    defaultProps: { b: 1 },
    setup: ctx => {
      timelines.push(`b<${ctx.key}> init`);

      const user = ctx.getContext(userContext);
      timelines.push(`b<${ctx.key}> user: ${user.value}`);

      ctx.dispose$.subscribe(() => {
        timelines.push(`b<${ctx.key}> dispose`);
      });

      return combineLatest([ctx.P.b$]).pipe(
        map(() => {
          timelines.push(`b<${ctx.key}> update user: ${user.value}`);
          return [];
        })
      );
    },
  });

  const A = defineComponent({
    defaultProps: { a: 1 },
    setup: ctx => {
      timelines.push(`a<${ctx.key}> init`);

      const user = ctx.createContext(userContext, new BehaviorSubject('xxx'));
      timelines.push(`a<${ctx.key}> user: ${user.value}`);

      user.next('user_1');

      ctx.dispose$.subscribe(() => {
        timelines.push(`a<${ctx.key}> dispose`);
      });

      return combineLatest([ctx.P.a$]).pipe(
        map(([a]) => {
          if (a === 2) {
            user.next('user_2');
          }

          return [blueprint(B, { b: a }, '1')];
        })
      );
    },
  });

  const root = A.create('root');

  root.update({ a: 2 });
  root.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a<root> init",
      "a<root> user: xxx",
      "b<1> init",
      "b<1> user: user_1",
      "b<1> update user: user_1",
      "b<1> update user: user_2",
      "b<1> dispose",
      "a<root> dispose",
    ]
  `);
});

it('Hierarchy Components Context Subscribe', async () => {
  const timelines: string[] = [];

  const userContext = defineContext<BehaviorSubject<string>>('user');

  const B = defineComponent({
    defaultProps: {},
    setup: ctx => {
      const userContextVal$ = ctx.getContext(userContext);

      return userContextVal$.pipe(
        map(() => {
          timelines.push(`b<${ctx.key}> update user: ${userContextVal$.value}`);
          return [];
        })
      );
    },
  });

  const A = defineComponent({
    defaultProps: { a: 1 },
    setup: ctx => {
      const userContextVal = ctx.createContext(userContext, new BehaviorSubject('xxx'));

      setTimeout(() => {
        userContextVal.next('user_1');
        userContextVal.next('user_2');
      }, 0);

      return combineLatest([ctx.P.a$]).pipe(
        map(() => {
          return [blueprint(B, {}, '1')];
        })
      );
    },
  });

  const root = A.create('root');

  await new Promise<void>(resolve => setTimeout(resolve, 100));

  root.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "b<1> update user: xxx",
      "b<1> update user: user_1",
      "b<1> update user: user_2",
    ]
  `);
});

it('Missing Key', () => {
  const timelines: string[] = [];

  const A = defineComponent<{ n: number; k?: string }>({
    defaultProps: { n: 1, k: '_default_' },
    setup: ctx => {
      return combineLatest([ctx.P.n$, ctx.P.k$]).pipe(
        map(([n, k]) => {
          timelines.push(`a update: n=${n}, k=${k}`);
          return [];
        })
      );
    },
  });

  const a = A.create('root');

  a.update({ n: 2, k: 'a' });
  a.update({ n: 3 });
  a.update({ n: 4, k: 'b' });

  a.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a update: n=1, k=_default_",
      "a update: n=2, k=_default_",
      "a update: n=2, k=a",
      "a update: n=3, k=a",
      "a update: n=3, k=_default_",
      "a update: n=4, k=_default_",
      "a update: n=4, k=b",
    ]
  `);
});

it('bufferInput', () => {
  const timelines: string[] = [];

  const A = defineComponent<{ n: number; k?: string }>({
    defaultProps: { n: 1, k: '_default_' },
    setup: ctx => {
      return combineLatest([ctx.P.n$, ctx.P.k$]).pipe(
        ctx.bufferInput(),
        map(([n, k]) => {
          timelines.push(`a update: n=${n}, k=${k}`);
          return [];
        })
      );
    },
  });

  const a = A.create('root');

  a.update({ n: 2, k: 'a' });
  a.update({ n: 3 });
  a.update({ n: 4, k: 'b' });

  a.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a update: n=1, k=_default_",
      "a update: n=2, k=a",
      "a update: n=3, k=_default_",
      "a update: n=4, k=b",
    ]
  `);
});

it('props select', () => {
  const timelines: string[] = [];

  const A = defineComponent<{ n: number; k?: string }>({
    defaultProps: { n: 1, k: '_default_' },
    setup: ctx => {
      return ctx.select([ctx.P.n$, ctx.P.k$]).pipe(
        map(([n, k]) => {
          timelines.push(`a update: n=${n}, k=${k}`);
          return [];
        })
      );
    },
  });

  const a = A.create('root');

  a.update({ n: 2, k: 'a' });
  a.update({ n: 3 });
  a.update({ n: 4, k: 'b' });

  a.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a update: n=1, k=_default_",
      "a update: n=2, k=a",
      "a update: n=3, k=_default_",
      "a update: n=4, k=b",
    ]
  `);
});

it('Single Component Ref', () => {
  const A = defineComponent<{ n: number }, { name: string }>({
    defaultProps: { n: 1 },
    setup: ctx => {
      ctx.afterInput$.subscribe(() => {
        ctx.setRef({ name: ctx.P.n$.value + '' });
      });
    },
  });

  const a = A.create('root');
  expect(a.ref.name).toBe('1');

  a.update({ n: 2 });
  expect(a.ref.name).toBe('2');

  a.dispose();
});

it('Hierarchy Components Ref', () => {
  const timelines: string[] = [];

  const B = defineComponent<{ b: number }, { name: string }>({
    defaultProps: { b: 1 },
    setup: ctx => {
      ctx.P.b$.subscribe(b => {
        ctx.setRef({ name: b + '' });
      });
    },
  });

  const A = defineComponent({
    defaultProps: { a: 1 },
    setup: ctx => {
      let bIns: IInstanceType<typeof B> | null = null;

      ctx.afterUpdate$.subscribe(() => {
        timelines.push(`a afterUpdate: a=${ctx.P.a$.value}, bKey=${bIns?.key}, bRef=${bIns?.ref?.name}`);
      });

      return combineLatest([ctx.P.a$]).pipe(
        map(([a]) => {
          if (a <= 0) return [];
          return [blueprint(B, { b: a }, Math.floor(a) + '', ins => (bIns = ins))];
        })
      );
    },
  });

  const root = A.create('root');

  root.update({ a: 1.1 });
  root.update({ a: 2 });
  root.update({ a: 0 });
  root.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a afterUpdate: a=1, bKey=1, bRef=1",
      "a afterUpdate: a=1.1, bKey=1, bRef=1.1",
      "a afterUpdate: a=2, bKey=2, bRef=2",
      "a afterUpdate: a=0, bKey=undefined, bRef=undefined",
    ]
  `);
});

it('Infinity Loop', async () => {
  return new Promise<void>(resolve => {
    const A = defineComponent<{ n: number }, { name: string }>({
      defaultProps: { n: 1 },
      setup: ctx => {
        const tick$ = new BehaviorSubject(0);

        ctx.afterUpdate$.subscribe(() => {
          tick$.next(tick$.value + 1);
        });

        return tick$.pipe(
          map(() => {
            return [];
          })
        );
      },
    });

    DefaultError$.pipe(take(1)).subscribe(err => {
      expect(err.message).toContain('Infinity loop detected');
      resolve();
    });

    A.create('root');
  });
});
