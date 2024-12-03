import { it, expect } from 'vitest';
import { blueprint, defineComponent, defineContext } from '../src/next';
import { combineLatest } from 'rxjs';

it('Single Component Lifecycle', () => {
  const timelines: string[] = [];

  const A = defineComponent({
    defaultProps: { n: 1 },
    setup: ctx => {
      timelines.push(`a init`);

      const sub = combineLatest([ctx.P.n$]).subscribe(([n]) => {
        timelines.push(`a update: n=${n}`);
      });

      return () => {
        timelines.push('a dispose');
        sub.unsubscribe();
      };
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
      "a update: n=2",
      "a update: n=3",
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

      const sub = combineLatest([ctx.P.n$]).subscribe(([n]) => {
        timelines.push(`a update: n=${n}`);
      });

      return () => {
        timelines.push('a dispose');
        sub.unsubscribe();
      };
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
    setup: () => {
      return () => {};
    },
  });

  const a = A.create('root');

  a.dispose();

  expect(() => a.dispose()).toThrow('Already disposed');
});

it('Cannot update after dispose', () => {
  const A = defineComponent({
    defaultProps: { n: 1 },
    setup: () => {
      return () => {};
    },
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

      const sub = combineLatest([ctx.P.b$]).subscribe(([n]) => {
        timelines.push(`b<${ctx.key}> update: b=${n}`);
      });

      return () => {
        timelines.push(`b<${ctx.key}> dispose`);
        sub.unsubscribe();
      };
    },
  });

  const A = defineComponent({
    defaultProps: { a: 1 },
    setup: ctx => {
      timelines.push(`a<${ctx.key}> init`);

      const sub = combineLatest([ctx.P.a$]).subscribe(([a]) => {
        timelines.push(`a<${ctx.key}> update: a=${a}`);

        if (a === 1) ctx.blueprints$.next([blueprint(B, { b: 1 }, '1')]);
        if (a === 2) ctx.blueprints$.next([blueprint(B, { b: 1.1 }, '1'), blueprint(B, { b: 2 }, '2')]);
        if (a === 3) ctx.blueprints$.next([blueprint(B, { b: 2.1 }, '2')]);
      });

      return () => {
        timelines.push(`a<${ctx.key}> dispose`);
        sub.unsubscribe();
      };
    },
  });

  const root = A.create('root', A.defaultProps);

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

  const userContext = defineContext('user', () => 'default');

  const B = defineComponent({
    defaultProps: { b: 1 },
    setup: ctx => {
      timelines.push(`b<${ctx.key}> init`);

      const userContextVal = ctx.getContext(userContext);
      timelines.push(`b<${ctx.key}> user: ${userContextVal.value}`);

      const sub = combineLatest([ctx.P.b$]).subscribe(() => {
        timelines.push(`b<${ctx.key}> update user: ${userContextVal.value}`);
      });

      return () => {
        sub.unsubscribe();
      };
    },
  });

  const A = defineComponent({
    defaultProps: { a: 1 },
    setup: ctx => {
      timelines.push(`a<${ctx.key}> init`);

      const userContextVal = ctx.createContext(userContext);
      timelines.push(`a<${ctx.key}> user: ${userContextVal.value}`);

      userContextVal.value = 'user_1';

      const sub = combineLatest([ctx.P.a$]).subscribe(([a]) => {
        if (a === 2) {
          userContextVal.value = 'user_2';
        }

        ctx.blueprints$.next([blueprint(B, { b: a }, '1')]);
      });

      return () => {
        sub.unsubscribe();
      };
    },
  });

  const root = A.create('root', A.defaultProps);

  root.update({ a: 2 });
  root.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a<root> init",
      "a<root> user: default",
      "b<1> init",
      "b<1> user: user_1",
      "b<1> update user: user_1",
      "b<1> update user: user_2",
    ]
  `);
});
