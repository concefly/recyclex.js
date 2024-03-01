export type IProp = Record<string, any>;

export class VNode {
  static of<P extends IProp>(Type: ComponentType<P>, props: P = {} as any, ...children: VNode[]): VNode {
    return new VNode(Type as any, props, children);
  }

  static cast(arg: any): VNode[] {
    if (arg instanceof VNode) return [arg];

    if (Array.isArray(arg)) {
      const list: VNode[] = [];
      for (const _cur of arg) {
        list.push(...VNode.cast(_cur));
      }

      return list;
    }

    return [];
  }

  static walk(node: VNode, cb1?: (cur: VNode) => any, cb2?: (cur: VNode) => any) {
    cb1?.(node);

    for (const child of node.children) {
      VNode.walk(child, cb1, cb2);
    }

    cb2?.(node);
  }

  _ins: Component | null = null;
  _parent: VNode | null = null;

  constructor(
    readonly Type: ComponentType,
    readonly props: IProp,
    readonly children: VNode[]
  ) {}
}

export interface ComponentType<P extends IProp = any> {
  new (host: Host, props: P, context: any): Component;
}

export class Component<P extends IProp = any, S extends Record<string, any> = any> {
  readonly props: P;
  readonly context: any;
  readonly state: S = {} as any;

  _host: Host;
  _vnode: VNode | null = null;
  _lastState: S = {} as any;

  constructor(host: Host, props: P, context: any) {
    this._host = host;
    this.props = props;
    this.context = context;
  }

  forceUpdate() {
    if (!this._vnode) throw new Error('this._vnode not exists');
    this._host.incrementalUpdate(this._vnode);
  }

  setState(next: Partial<S>) {
    this._lastState = this.state;

    // @ts-expect-error
    this.state = { ...this.state, ...next };

    this.forceUpdate();
  }

  onInit() {}
  onDestroy() {}

  onUpdate(_prevProp: Partial<P>, _prevState: Partial<S>) {}

  process(): any {
    return [];
  }
}

export class Host {
  root: VNode | null = null;

  private _doInitRecursively(node: VNode) {
    if (node._ins) throw new Error('instance already exists');

    node._ins = new node.Type(this, node.props, null);

    const _comp = node._ins;
    _comp._vnode = node;

    _comp.onInit();
    _comp.onUpdate({}, _comp._lastState);

    for (const _child of VNode.cast(_comp.process())) {
      _child._parent = node;
      node.children.push(_child);

      this._doInitRecursively(_child);
    }
  }

  private _doDestroyRecursively(node: VNode) {
    if (!node._ins) return;

    for (const _child of node.children) {
      this._doDestroyRecursively(_child);
    }

    node._ins.onDestroy();
    node._ins._vnode = null;
    node._ins = null;
    node._parent = null;
    node.children.length = 0;
  }

  update(node: VNode) {
    // 递归卸载
    if (this.root) {
      this._doDestroyRecursively(this.root);
      this.root = null;
    }

    // 递归创建
    this.root = node;
    this._doInitRecursively(this.root);
  }

  incrementalUpdate(node: VNode) {
    if (!this.root) throw new Error('root not exists');
    if (!node._ins) throw new Error('node._ins not exists');

    const newChildren = VNode.cast(node._ins.process());

    this._diff(node.children, newChildren);
  }

  destroy() {
    if (!this.root) return;
    this._doDestroyRecursively(this.root);
  }

  private _diff(prevList: VNode[], nextList: VNode[]) {
    const maxLength = Math.max(prevList.length, nextList.length);

    for (let i = 0; i < maxLength; i++) {
      const prev = prevList[i];
      const next = nextList[i];

      if (prev && next) {
        // 类型相同，递归更新
        if (prev.Type === next.Type) {
          if (!prev._ins) throw new Error('prev._ins not exists');
          if (!next._ins) next._ins = prev._ins; // 传递实例

          const _comp = next._ins;

          // 更新 props
          // @ts-expect-error
          _comp.props = next.props;

          // rerender children
          _comp.onUpdate(prev.props, _comp._lastState);

          next.children.length = 0;
          for (const _child of VNode.cast(_comp.process())) {
            _child._parent = next;
            next.children.push(_child);
          }

          this._diff(prev.children, next.children);
        }

        // 类型不同，递归卸载 a，递归创建 b
        else {
          this._doDestroyRecursively(prev);
          this._doInitRecursively(next);
        }
      }

      // 递归卸载
      else if (prev) {
        this._doDestroyRecursively(prev);
      }

      // 递归创建
      else if (next) {
        this._doInitRecursively(next);
      }
    }
  }
}
