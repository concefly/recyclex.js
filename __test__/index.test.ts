import { Component, Host, VNode } from '../src';

it('simple', () => {
  const _setupList: string[] = [];
  const _destroyList: string[] = [];

  class Child extends Component {
    setup(): void {
      _setupList.push('child');
    }

    destroy(): void {
      _destroyList.push('child');
    }
  }

  class App extends Component {
    setup(): void {
      _setupList.push('app');
    }

    destroy(): void {
      _destroyList.push('app');
    }

    render() {
      return [[Child, { name: this.props.name + '_to' }]];
    }
  }

  const host = new Host();

  host.render([App, { name: 'Jam' }]);
  expect(_setupList).toEqual(['app', 'child']);
  _setupList.length = 0;
  expect(_destroyList).toEqual([]);

  host.render([App, { name: 'Jam2' }]);
  expect(_setupList).toEqual(['app', 'child']);
  expect(_destroyList).toEqual(['child', 'app']);
});

it('simple2', () => {
  let appRef: App = null as any;
  const _renderList1: string[] = [];
  const _changedList1: string[] = [];

  const _renderList2: string[] = [];

  class Header extends Component {
    update(_changed: Partial<any>): void {
      _changedList1.push(Object.keys(_changed).join(','));
    }

    render() {
      _renderList1.push(this.props.name);
      return [];
    }
  }

  class App extends Component {
    state = { name: '' };

    setup(): void {
      appRef = this;
    }

    render() {
      _renderList2.push(this.state.name);
      return [[Header, { name: '_p_' + this.state.name }]];
    }
  }

  const host = new Host();
  host.render([App, {}]);

  if (!appRef) throw new Error('appRef is null');

  appRef.setState({ name: 'Jam' });

  expect(_changedList1).toEqual(['name']);
  expect(_renderList1).toEqual(['_p_', '_p_Jam']);
  expect(_renderList2).toEqual(['', 'Jam']);
});
