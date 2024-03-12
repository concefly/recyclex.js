import { Component, Host, Prop, ComponentRegistry, State, VNode } from '../src';

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
    @Prop()
    name = 'A';

    @State()
    color = 'red';
  }

  class B extends A {
    @Prop()
    name2 = 'B';

    @State()
    color2 = 'blue';
  }

  const a = new A(ComponentRegistry.Default);
  const b = new B(ComponentRegistry.Default);

  const aMeta = a.meta;
  const bMeta = b.meta;

  expect(aMeta).toEqual({
    properties: new Map([
      ['name', { type: 'prop' }],
      ['color', { type: 'state' }],
    ]),
  });

  expect(bMeta).toEqual({
    properties: new Map([
      ['name', { type: 'prop' }],
      ['color', { type: 'state' }],
      ['name2', { type: 'prop' }],
      ['color2', { type: 'state' }],
    ]),
  });
});

it('life cycle', () => {
  const registry = new ComponentRegistry();
  const timelines: string[] = [];

  class B extends TestComp {
    @Prop()
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

    onUpdate(): VNode[] {
      timelines.push('  ' + this.stringify('onUpdate'));
      return [];
    }

    onDestroy(): void {
      timelines.push('  ' + this.stringify('onDestroy'));
    }
  }

  class A extends TestComp {
    @Prop()
    name = 'Jam';

    @State()
    color = 'red';

    onInit(): void {
      timelines.push(this.stringify('onInit'));
    }

    onUpdate(): VNode[] {
      timelines.push(this.stringify('onUpdate'));
      return [VNode.of('B', { text: [this.name, this.color].join('-') })];
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
  host.flush({});
  expect(timelines).toMatchSnapshot('with initial values');

  host.flush({ name: 'Tom' });
  host.flush({ name: 'Jane' });
  host.destroy();

  expect(timelines).toMatchSnapshot();
});

it('equals check', () => {
  const registry = new ComponentRegistry();
  const timelines: string[] = [];

  class A extends TestComp {
    @Prop()
    name = 'TOM';

    onBeforeUpdate(): void {
      timelines.push(this.stringify('receive:'));
    }
  }

  registry.register('A', A);
  const host = new Host('A', registry);

  host.flush({ name: 'TOM' });
  host.flush({ name: 'JANE' });
  host.flush({ name: 'JANE' });

  expect(timelines).toMatchSnapshot();
});
