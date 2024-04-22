// @ts-nocheck

import { Component, Host, Reactive, ComponentRegistry, State, Blueprint } from '../src';

class TestComp extends Component {
  stringify(desc: string): string {
    let text = `<${this.constructor.name}> ${desc}`;
    const meta = this.meta;

    for (const [key] of meta.properties) {
      text += ` ${key}=${(this as any)[key] + ''},`;
    }

    return text;
  }
}

it('meta data', () => {
  class A extends Component {
    @Reactive()
    name = 'A';

    @Reactive()
    color = 'red';
  }

  class B extends A {
    @Reactive()
    name2 = 'B';

    @Reactive()
    color2 = 'blue';
  }

  const a = new A(ComponentRegistry.Default);
  const b = new B(ComponentRegistry.Default);

  const aMeta = a.meta;
  const bMeta = b.meta;

  expect(aMeta).toEqual({
    properties: new Map([
      ['name', {}],
      ['color', {}],
    ]),
  });

  expect(bMeta).toEqual({
    properties: new Map([
      ['name', {}],
      ['color', {}],
      ['name2', {}],
      ['color2', {}],
    ]),
  });
});

it('life cycle', () => {
  const registry = new ComponentRegistry();
  const timelines: string[] = [];

  class B extends TestComp {
    @Reactive()
    text = 'x';

    onInit(): void {
      timelines.push('  ' + this.stringify('onInit'));
    }

    onBeforeUpdate(): void {
      timelines.push('  ' + this.stringify('onBeforeUpdate'));
    }

    onAfterUpdate(): void {
      timelines.push('  ' + this.stringify('onAfterUpdate'));
    }

    onUpdate(): Blueprint[] {
      timelines.push('  ' + this.stringify('onUpdate'));
      return [];
    }

    onDestroy(): void {
      timelines.push('  ' + this.stringify('onDestroy'));
    }
  }

  class A extends TestComp {
    @Reactive()
    name = 'Jam';

    @Reactive()
    color = 'red';

    onInit(): void {
      timelines.push(this.stringify('onInit'));
    }

    onUpdate(): Blueprint[] {
      timelines.push(this.stringify('onUpdate'));
      return [Blueprint.of('B', { text: [this.name, this.color].join('-') })];
    }

    onBeforeUpdate(): void {
      timelines.push(this.stringify('onBeforeUpdate'));
    }

    onAfterUpdate(): void {
      timelines.push(this.stringify('onAfterUpdate'));
    }

    onDestroy(): void {
      timelines.push(this.stringify('onDestroy'));
    }
  }

  registry.register('A', A);
  registry.register('B', B);

  const host = new Host('A', registry);
  host.dispatch({});
  expect(timelines).toMatchSnapshot('with initial values');

  host.dispatch({ name: 'Tom' });
  host.dispatch({ name: 'Jane' });
  host.destroy();

  expect(timelines).toMatchSnapshot();
});

it('equals check', () => {
  const registry = new ComponentRegistry();
  const timelines: string[] = [];

  class A extends TestComp {
    @Reactive()
    name = 'TOM';

    onBeforeUpdate(): void {
      timelines.push(this.stringify('receive:'));
    }
  }

  registry.register('A', A);
  const host = new Host('A', registry);

  host.dispatch({ name: 'TOM' });
  host.dispatch({ name: 'JANE' });
  host.dispatch({ name: 'JANE' });

  expect(timelines).toMatchSnapshot();
});

it('Cannot call requestUpdate in onUpdate', () => {
  const registry = new ComponentRegistry();

  class A extends TestComp {
    @Reactive()
    name = '';

    onUpdate(): Blueprint[] {
      this.dispatch({ name: 'JANE' });
    }
  }

  registry.register('A', A);
  const host = new Host('A', registry);

  expect(() => host.dispatch({ name: 'TOM' })).toThrow('Cannot requestUpdate onUpdate: key=name');
});

it('set props on lifecycle', () => {
  const registry = new ComponentRegistry();
  const timelines: string[] = [];

  class A extends TestComp {
    @Reactive()
    name = '';

    @Reactive()
    color = '';

    onInit(): void {
      this.dispatch({ name: 'JANE' });
      this.dispatch({ name: 'JANE2' });
      this.dispatch({ color: 'RED' });
    }

    onUpdate(): void {
      timelines.push(this.stringify('receive:'));
    }
  }

  registry.register('A', A);
  const host = new Host('A', registry);

  host.dispatch({});
  expect(timelines).toEqual(['<A> receive: name=JANE2, color=RED,']);
});

it('keys lifecycle', () => {
  const registry = new ComponentRegistry();
  const timelines: string[] = [];

  class A extends TestComp {
    @Reactive() datas!: { id: string; v: string }[];

    onUpdate() {
      return this.datas.map(({ id, v }) => Blueprint.of('B', { id, v }, id));
    }
  }

  class B extends TestComp {
    @Reactive() id!: string;
    @Reactive() v!: string;

    onInit(): void {
      timelines.push(`B_${this.id} init`);
    }

    onUpdate(): void {
      timelines.push(`B_${this.id} update`);
    }

    onDestroy(): void {
      timelines.push(`B_${this.id} destroy`);
    }
  }

  registry.register('A', A);
  registry.register('B', B);

  const host = new Host('A', registry);

  host.dispatch({
    datas: [
      { id: '1', v: 'a' },
      { id: '2', v: 'b' },
    ],
  });

  timelines.push('---');
  host.dispatch({
    datas: [
      { id: '2', v: 'x' },
      { id: '3', v: 'x' },
      { id: '4', v: 'x' },
    ],
  });

  expect(timelines).toEqual([
    'B_1 init',
    'B_1 update',
    'B_2 init',
    'B_2 update',
    '---',
    'B_1 destroy',
    'B_3 init',
    'B_3 update',
    'B_4 init',
    'B_4 update',
    'B_2 update',
  ]);
});

it('batch set props in async', done => {
  const registry = new ComponentRegistry();
  const timelines: string[] = [];

  class A extends TestComp {
    @Reactive() name = '';
    @Reactive() color = '';

    onInit(): void {
      setTimeout(() => {
        this.name = 'JANE';
        this.color = 'BLUE';
      }, 0);
    }

    onUpdate() {
      timelines.push(this.stringify('receive:'));
    }
  }

  registry.register('A', A);
  const host = new Host('A', registry);
  host.dispatch({});

  setTimeout(() => {
    expect(timelines).toEqual(['<A> receive: name=, color=,', '<A> receive: name=JANE, color=BLUE,']);
    done();
  }, 100);
});

it('standalone component', () => {
  const timelines: string[] = [];

  class Standalone {
    @Reactive({
      onChange(key, value, oldValue) {
        timelines.push(`Reactive.onChange: key=${key} value=${value} oldValue=${oldValue}`);
      },
    })
    name = 'TOM';

    requestUpdate(key: string, oldValue?: any) {
      timelines.push(`requestUpdate: key=${key} old=${oldValue}`);
    }
  }

  const standalone = new Standalone();
  standalone.name = 'J1';
  standalone.name = 'J2';

  expect(timelines).toEqual([
    'Reactive.onChange: key=name value=TOM oldValue=undefined',
    'requestUpdate: key=name old=undefined',
    'Reactive.onChange: key=name value=J1 oldValue=TOM',
    'requestUpdate: key=name old=TOM',
    'Reactive.onChange: key=name value=J2 oldValue=J1',
    'requestUpdate: key=name old=J1',
  ]);
});
