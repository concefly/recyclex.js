export type IProp = Record<string, any>;

const _log = (obj: any) => console.dir(obj, { depth: null, colors: true });

export class VNode {
  static of(list: Array<any[]>): VNode[] {
    return list.map(item => new VNode(item[0], item[1], item.slice(2)));
  }

  static walk(node: VNode, cb1?: (cur: VNode) => any, cb2?: (cur: VNode) => any) {
    cb1?.(node);

    for (const child of node.children) {
      VNode.walk(child, cb1, cb2);
    }

    cb2?.(node);
  }

  _instance: Component | null = null;
  _parent: VNode | null = null;

  constructor(
    readonly type: ComponentConstructor,
    readonly props: IProp,
    readonly children: VNode[]
  ) {}

  toString(indent = 0): string {
    const _t = '  '.repeat(indent);

    // prettier-ignore
    return `${_t}<${this.type.name}>
${Object.entries(this.props).map(([k, v]) => _t + `${k}: ${JSON.stringify(v)}`).join('\n')}
${this.children.map(c => _t + c.toString(indent + 1)).join('\n')}
`;
  }
}

export interface ComponentConstructor {
  new <P extends IProp = any>(host: Host, props: P, context: any): Component;
}

export class Component<P extends IProp = any, S extends Record<string, any> = any> {
  readonly props: P;
  readonly context: any;
  readonly state: S = {} as any;

  _host: Host;
  _vnode: VNode | null = null;

  constructor(host: Host, props: P, context: any) {
    this._host = host;
    this.props = props;
    this.context = context;
  }

  setup() {}
  update(_changed: Partial<P>) {}
  destroy() {}

  forceRender() {
    if (!this._vnode) throw new Error('vnode is not ready');
    this._host.incrementRender(this._vnode);
  }

  setState(next: Partial<S>) {
    Object.assign(this.state, next);
    this.forceRender();
  }

  render(): Array<any[]> {
    return [];
  }
}

export class Host {
  root: VNode | null = null;

  private _do_setup(node: VNode) {
    if (node._instance) throw new Error('instance already exists');

    const _comp = (node._instance = new node.type(this, node.props, null));
    _comp._vnode = node;

    _comp.setup();

    const _children = VNode.of(_comp.render());
    for (const _child of _children) {
      _child._parent = node;
      node.children.push(_child);
    }
  }

  private _do_destroy(node: VNode) {
    if (!node._instance) throw new Error('instance is null');

    node._instance.destroy();
    node._instance._vnode = null;
    node._instance = null;
  }

  // 全量构建
  render(node: any[]) {
    const [next] = VNode.of([node]);

    if (this.root) {
      // 全部卸载
      VNode.walk(this.root, undefined, _cur => this._do_destroy(_cur));
      this.root = null;
    }

    // 全部创建
    VNode.walk(next, _cur => this._do_setup(_cur));
    this.root = next;
  }

  // 增量构建
  incrementRender(current: VNode) {
    if (!this.root) throw new Error('root is null');

    const _comp = current._instance;
    if (!_comp) throw new Error('instance is null');

    const nodesA = current.children;
    const nodesB = VNode.of(_comp.render());

    this._incrementRenderList(nodesA, nodesB);
  }

  private _incrementRenderList(nodesA: VNode[], nodesB: VNode[]) {
    const maxLength = Math.max(nodesA.length, nodesB.length);

    for (let i = 0; i < maxLength; i++) {
      const a = nodesA[i];
      const b = nodesB[i];

      if (a && b) {
        // 类型相同，递归更新
        if (a.type === b.type) {
          if (!a._instance) throw new Error('instance is not ready');
          if (!b._instance) b._instance = a._instance;

          // diff props
          const _allPropKeys = new Set([...Object.keys(a.props), ...Object.keys(b.props)]);
          const _changedProp: IProp = {};
          for (const _k of _allPropKeys) {
            if (a.props[_k] !== b.props[_k]) _changedProp[_k] = b.props[_k];
          }

          // 更新 props
          if (Object.keys(_changedProp).length) {
            const _comp = b._instance;
            if (!_comp) throw new Error('instance is null');

            Object.assign(_comp.props, _changedProp);
            _comp.update(_changedProp);

            // rerender children
            b.children.length = 0;
            for (const __c of VNode.of(_comp.render())) {
              __c._parent = b;
              b.children.push(__c);
            }
          }

          this._incrementRenderList(a.children, b.children);
        }

        // 类型不同，递归卸载 a，递归创建 b
        else {
          VNode.walk(a, undefined, cur => this._do_destroy(cur));
          VNode.walk(b, _cur => this._do_setup(_cur));
        }
      }

      // 递归卸载
      else if (a) {
        VNode.walk(a, undefined, cur => this._do_destroy(cur));
      }

      // 递归创建
      else if (b) {
        VNode.walk(b, _cur => this._do_setup(_cur));
      }
    }
  }
}
