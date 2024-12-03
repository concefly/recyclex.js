import { it, expect } from 'vitest';
import { blueprint, defineComponent, defineContext } from '../src/next';

it('Single Component Lifecycle', () => {
  const timelines: string[] = [];

  const A = defineComponent({
    defaultProps: { n: 1 },
    setup: ctx => {
      timelines.push(`a init`);

      ctx.onBeforeUpdate = (props, changes) => {
        timelines.push(`a before: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      ctx.onUpdate = (props, changes) => {
        timelines.push(`a update: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      ctx.onAfterUpdate = (props, changes) => {
        timelines.push(`a after: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      return () => {
        timelines.push('a dispose');
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
      "a before: {"n":1}, changes: [["n",null]]",
      "a update: {"n":1}, changes: [["n",null]]",
      "a after: {"n":1}, changes: [["n",null]]",
      "a before: {"n":2}, changes: [["n",1]]",
      "a update: {"n":2}, changes: [["n",1]]",
      "a after: {"n":2}, changes: [["n",1]]",
      "a before: {"n":3}, changes: [["n",2]]",
      "a update: {"n":3}, changes: [["n",2]]",
      "a after: {"n":3}, changes: [["n",2]]",
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

      ctx.onBeforeUpdate = (props, changes) => {
        timelines.push(`a before: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      ctx.onUpdate = (props, changes) => {
        timelines.push(`a update: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      ctx.onAfterUpdate = (props, changes) => {
        timelines.push(`a after: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      return () => {
        timelines.push('a dispose');
      };
    },
  });

  const a = A.create('root', { n: 2 });
  a.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a init",
      "a before: {"n":2}, changes: [["n",null]]",
      "a update: {"n":2}, changes: [["n",null]]",
      "a after: {"n":2}, changes: [["n",null]]",
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

      ctx.onBeforeUpdate = (props, changes) => {
        timelines.push(`b<${ctx.key}> before: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      ctx.onUpdate = (props, changes) => {
        timelines.push(`b<${ctx.key}> update: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      ctx.onAfterUpdate = (props, changes) => {
        timelines.push(`b<${ctx.key}> after: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      return () => {
        timelines.push(`b<${ctx.key}> dispose`);
      };
    },
  });

  const A = defineComponent({
    defaultProps: { a: 1 },
    setup: ctx => {
      timelines.push(`a<${ctx.key}> init`);

      ctx.onBeforeUpdate = (props, changes) => {
        timelines.push(`a<${ctx.key}> before: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      ctx.onUpdate = (props, changes) => {
        timelines.push(`a<${ctx.key}> update: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);

        if (props.a === 1) return [blueprint(B, { b: 1 }, '1')];
        if (props.a === 2) return [blueprint(B, { b: 1.1 }, '1'), blueprint(B, { b: 2 }, '2')];
        if (props.a === 3) return [blueprint(B, { b: 2.1 }, '2')];
      };

      ctx.onAfterUpdate = (props, changes) => {
        timelines.push(`a<${ctx.key}> after: ${JSON.stringify(props)}, changes: ${JSON.stringify([...changes])}`);
      };

      return () => {
        timelines.push(`a<${ctx.key}> dispose`);
      };
    },
  });

  const root = A.create('root', A.defaultProps);

  root.update({ a: 2 });
  root.update({ a: 3 });
  root.update({ a: 4 });

  root.dispose();

  expect(timelines).toMatchInlineSnapshot(`
    [
      "a<root> init",
      "a<root> before: {"a":1}, changes: [["a",null]]",
      "a<root> update: {"a":1}, changes: [["a",null]]",
      "a<root> after: {"a":1}, changes: [["a",null]]",
      "b<1> init",
      "b<1> before: {"b":1}, changes: [["b",null]]",
      "b<1> update: {"b":1}, changes: [["b",null]]",
      "b<1> after: {"b":1}, changes: [["b",null]]",
      "a<root> before: {"a":2}, changes: [["a",1]]",
      "a<root> update: {"a":2}, changes: [["a",1]]",
      "a<root> after: {"a":2}, changes: [["a",1]]",
      "b<1> before: {"b":1.1}, changes: [["b",1]]",
      "b<1> update: {"b":1.1}, changes: [["b",1]]",
      "b<1> after: {"b":1.1}, changes: [["b",1]]",
      "b<2> init",
      "b<2> before: {"b":2}, changes: [["b",null]]",
      "b<2> update: {"b":2}, changes: [["b",null]]",
      "b<2> after: {"b":2}, changes: [["b",null]]",
      "a<root> before: {"a":3}, changes: [["a",2]]",
      "a<root> update: {"a":3}, changes: [["a",2]]",
      "a<root> after: {"a":3}, changes: [["a",2]]",
      "b<1> dispose",
      "b<2> before: {"b":2.1}, changes: [["b",2]]",
      "b<2> update: {"b":2.1}, changes: [["b",2]]",
      "b<2> after: {"b":2.1}, changes: [["b",2]]",
      "a<root> before: {"a":4}, changes: [["a",3]]",
      "a<root> update: {"a":4}, changes: [["a",3]]",
      "a<root> after: {"a":4}, changes: [["a",3]]",
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

      ctx.onUpdate = () => {
        timelines.push(`b<${ctx.key}> update user: ${userContextVal.value}`);
      };

      return () => {};
    },
  });

  const A = defineComponent({
    defaultProps: { a: 1 },
    setup: ctx => {
      timelines.push(`a<${ctx.key}> init`);

      const userContextVal = ctx.createContext(userContext);
      timelines.push(`a<${ctx.key}> user: ${userContextVal.value}`);

      userContextVal.value = 'user_1';

      ctx.onUpdate = props => {
        if (props.a === 2) {
          userContextVal.value = 'user_2';
        }

        return [blueprint(B, { b: props.a }, '1')];
      };

      return () => {};
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
