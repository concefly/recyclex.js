export type IProp = Record<string, any>;

export class VNode {
  static of<P extends IProp>(Type: ComponentType<P>, props: P = {} as any, ...children: VNode[]): VNode {
    return new VNode(Type as any, { ...props, children });
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

  _ins: Component | null = null;

  constructor(
    readonly Type: ComponentType,
    readonly props: IProp
  ) {}
}

export interface ComponentType<P extends IProp = any> {
  new (props: P, context: any): Component;
}

export class Component<P extends IProp = any, S extends Record<string, any> = any> {
  readonly props: P;
  readonly context: any;
  readonly state: S = {} as any;

  private _lastState: S = {} as any;
  private _children: VNode[] = [];

  constructor(props: P, context: any) {
    this.props = props;
    this.context = context;
  }

  forceUpdate() {}

  setState(next: Partial<S>) {
    this._lastState = this.state;

    // @ts-expect-error
    this.state = { ...this.state, ...next };

    this.forceUpdate();
  }

  onInit() {}
  onDestroy() {}

  onUpdated(_prevProp: Partial<P>, _prevState: Partial<S>) {}

  process(): any {
    return [];
  }

  private _doInit() {
    // 先初始化自己，再初始化孩子

    this.onInit();
    this._children = VNode.cast(this.process());

    for (const _child of this._children) {
      _child._ins = new _child.Type(_child.props, this.context);
      _child._ins._doInit();
    }
  }

  private _doDestroy() {
    // 先递归卸载孩子，再销毁自己
    for (const _child of this._children) {
      if (_child._ins) {
        _child._ins._doDestroy();
        _child._ins = null;
      }
    }

    this._children.length = 0;
    this.onDestroy();
  }

  private _doUpdate() {
    const prevList = this._children;
    const nextList = VNode.cast(this.process());

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
          const _lastState = _comp._lastState;

          _comp._doUpdate();
        }

        // 类型不同，递归卸载 a，递归创建 b
        else {
          if (prev._ins) {
            prev._ins._doDestroy();
            prev._ins = null;
          }

          next._ins = new next.Type(next.props, this.context);
          next._ins._doInit();
        }
      }

      // 卸载旧的
      else if (prev) {
        if (prev._ins) {
          prev._ins._doDestroy();
          prev._ins = null;
        }
      }

      // 创建新的
      else if (next) {
        next._ins = new next.Type(next.props, this.context);
        next._ins._doInit();
      }
    }

    this.onUpdated({}, {});
  }
}
