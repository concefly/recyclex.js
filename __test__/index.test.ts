import { Component, Host, VNode } from '../src';

it('simple', () => {
  const _setupList: string[] = [];
  const _destroyList: string[] = [];

  class Child extends Component {
    onInit(): void {
      _setupList.push('child');
    }

    onDestroy(): void {
      _destroyList.push('child');
    }
  }

  class App extends Component {
    onInit(): void {
      _setupList.push('app');
    }

    onDestroy(): void {
      _destroyList.push('app');
    }

    process() {
      return VNode.of(Child, { name: this.props.name + '_to' });
    }
  }

  const host = new Host();
  host.update(VNode.of(App, { name: 'Jam' }));
  expect(_setupList).toEqual(['app', 'child']);

  host.destroy();
  expect(_destroyList).toEqual(['child', 'app']);
});

it('simple2', () => {
  let appRef: App = null as any;
  const _renderList1: string[] = [];
  const _renderList2: string[] = [];

  class Header extends Component {
    process() {
      _renderList1.push(this.props.name);
      return [];
    }
  }

  class App extends Component {
    state = { name: '' };

    onInit(): void {
      appRef = this;
    }

    process() {
      _renderList2.push(this.state.name);
      return VNode.of(Header, { name: '_p_' + this.state.name });
    }
  }

  const host = new Host();
  host.update(VNode.of(App));

  if (!appRef) throw new Error('appRef is null');

  appRef.setState({ name: 'Jam' });

  expect(_renderList1).toEqual(['_p_', '_p_Jam']);
  expect(_renderList2).toEqual(['', 'Jam']);
});
