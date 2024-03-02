import { Component, Host, VNode } from '../src';

const descComp = (comp: Component, lifecycle: string, logPropAndState?: boolean): string => {
  let s = comp.constructor.name + '.' + lifecycle;
  if (logPropAndState) s += `.[${JSON.stringify(comp.props)}, ${JSON.stringify(comp.state)}]`;
  return s;
};

it('lifecycle', () => {
  let rootRef: Article = null as any;

  const timelines: string[] = [];

  class Tag extends Component {}

  class Header extends Component {
    onInit(): void {
      timelines.push(descComp(this, 'onInit'));
    }

    onUpdated(_prevProp: Partial<any>, _prevState: Partial<any>): void {
      timelines.push(descComp(this, 'onUpdated') + ` <<< [${JSON.stringify(_prevProp)}, ${JSON.stringify(_prevState)}]`);
    }

    onDestroy(): void {
      timelines.push(descComp(this, 'onDestroy'));
    }

    process() {
      timelines.push(descComp(this, 'process', true));
      return [];
    }
  }

  class Article extends Component {
    state = { color: 'red' };

    onInit(): void {
      rootRef = this;
      timelines.push(descComp(this, 'onInit'));
    }

    onUpdated(_prevProp: Partial<any>, _prevState: Partial<any>): void {
      timelines.push(descComp(this, 'onUpdated') + ` <<< [${JSON.stringify(_prevProp)}, ${JSON.stringify(_prevState)}]`);
    }

    onDestroy(): void {
      timelines.push(descComp(this, 'onDestroy'));
    }

    process() {
      timelines.push(descComp(this, 'process', true));

      return VNode.of(
        Header,
        {
          ...this.state,
          ...this.props,
          title: 'TODAY:' + this.props.title,
        },
        VNode.of(Tag),
        VNode.of(Tag)
      );
    }
  }

  const host = new Host();
  host.update(VNode.of(Article, { title: 'Say hi', content: 'Jam' }));
  host.update(VNode.of(Article, { title: 'Say hello', content: 'Tom' }));

  rootRef.setState({ color: 'blue' });

  expect(timelines).toMatchSnapshot();
});
