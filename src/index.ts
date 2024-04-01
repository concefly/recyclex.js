export type IProps = Record<string, any>;

export interface ComponentType {
  new (registry: ComponentRegistry, context?: any): Component;
}

export interface IPropertyMeta {
  isEquals?: (a: any, b: any) => boolean;
  onInit?(key: string): any;
  onDestroy?(key: string): any;
  onSet?(key: string, value: any, oldValue?: any): any;
  shouldRequestUpdate?(key: string, value: any, oldValue?: any): boolean;
  disableTransition?: boolean;
}

export interface IComponentMeta {
  properties: Map<string, IPropertyMeta>;
}

// property decorator
export function Reactive<T extends Component, K extends string>(def: IPropertyMeta = {}) {
  return function (prototype: T, key: K) {
    if (!Object.prototype.hasOwnProperty.call(prototype, '_meta')) {
      // inject meta data
      Object.defineProperty(prototype, '_meta', {
        value: { properties: new Map() } satisfies IComponentMeta,
        enumerable: false,
      });
    }

    // @ts-expect-error
    (prototype._meta as IComponentMeta).properties.set(key, def);

    // make it a getter and setter
    const _stashKey = `_${key}`;

    Object.defineProperties(prototype, {
      [key]: {
        get() {
          return this[_stashKey];
        },
        set(value) {
          const oldValue = this[_stashKey];
          this[_stashKey] = value;

          if (def.onSet) def.onSet.call(this, key, value, oldValue);

          const _sru = def.shouldRequestUpdate ? def.shouldRequestUpdate.call(this, key, value, oldValue) : true;
          if (_sru) {
            this.requestUpdate(key, oldValue);
          }
        },
      },
    });
  };
}

// class decorator
export function Register(name: keyof IComponentInfoMap, registry = ComponentRegistry.Default) {
  return function (constructor: ComponentType) {
    registry.register(name, constructor);
  };
}

function _getComponentMeta(Type: ComponentType): IComponentMeta | null {
  // 递归获取父类的 meta
  const _cur: IComponentMeta = Type.prototype._meta;
  if (!_cur) return null;

  const _parent = _getComponentMeta(Object.getPrototypeOf(Type.prototype).constructor);
  if (!_parent) return _cur;

  return {
    properties: new Map([..._parent.properties, ..._cur.properties]),
  };
}

export const Options: {
  isEqual: (a: any, b: any) => boolean;
} = {
  isEqual: (a, b) => a === b,
};

export class Blueprint {
  static of<C extends keyof IComponentInfoMap>(type: C, props: IComponentInfoMap[C], key?: string): Blueprint {
    return new Blueprint(type as any, props, key || '');
  }

  static cast(arg: any): Blueprint[] {
    if (arg instanceof Blueprint) return [arg];

    if (Array.isArray(arg)) {
      const list: Blueprint[] = [];
      for (const item of arg) {
        list.push(...Blueprint.cast(item));
      }
      return list;
    }

    return [];
  }

  _ins: Component | null = null;

  constructor(
    readonly type: string,
    readonly props: IProps,
    readonly key: string
  ) {
    if (key.startsWith('__$$')) throw new Error('Key cannot start with __$$: ' + key);
  }
}

export class Component<C = any, P extends IProps = any> {
  constructor(
    private _registry: ComponentRegistry,
    protected context: C = null as any
  ) {}

  protected _changes = new Map<keyof P, any>();

  onInit() {}
  onDestroy() {}

  onBeforeUpdate() {}
  onAfterUpdate() {}

  onUpdate(): any {
    return [];
  }

  get meta(): IComponentMeta {
    if (this._metaCache) return this._metaCache;

    // merge parent meta
    const meta = _getComponentMeta(this.constructor as any);
    if (!meta) throw new Error('meta not found');

    this._metaCache = meta;

    return meta;
  }

  get initted() {
    return this._initted;
  }

  private _metaCache: IComponentMeta | null = null;
  private _initted = false;
  private _lastNodes: Blueprint[] = [];
  private readonly _updateQueue: { key: string; oldValue?: any }[] = [];

  private _inLifecycle: null | 'onInit' | 'onBeforeUpdate' | 'onUpdate' | 'onAfterUpdate' | 'onDestroy' = null;
  private _pending: Promise<void> | null = null;

  protected requestUpdate(key: string, oldValue?: any) {
    if (this._inLifecycle === 'onDestroy') return; // do nothing

    if (this._inLifecycle === 'onAfterUpdate' || this._inLifecycle === 'onBeforeUpdate' || this._inLifecycle === 'onUpdate') {
      throw new Error(`Cannot requestUpdate ${this._inLifecycle}: key=${key}`);
    }

    const _def = this.meta.properties.get(key);
    if (!_def) throw new Error(`property "${key}" not found`);

    const _equals = _def.isEquals || Options.isEqual;
    const _curValue = (this as any)[key];

    if (_equals(oldValue, _curValue)) return; // no change

    this._updateQueue.push({ key, oldValue });
    this._schedule(!_def.disableTransition);
  }

  dispatch(datas: Partial<P>): void;
  dispatch(cb: () => any): void;
  dispatch(arg: any) {
    if (typeof arg === 'function') {
      arg.call(this);
    } else {
      for (const [key, value] of Object.entries(arg)) {
        // @ts-expect-error
        this[key] = value;
      }
    }

    this._schedule();
  }

  protected _schedule(transition?: boolean) {
    if (!this._initted || this._inLifecycle === 'onDestroy') return;
    if (this._updateQueue.length === 0) return;

    if (transition) {
      if (!this._pending) {
        this._pending = Promise.resolve().then(() => {
          this._pending = null;
          this._doUpdate();
        });
      }
    } else {
      this._pending = null;
      this._doUpdate();
    }
  }

  private _doUpdate() {
    if (this._inLifecycle) throw new Error('Cannot update in lifecycle: ' + this._inLifecycle);

    const queue = this._updateQueue.concat();
    this._updateQueue.length = 0;

    this._changes.clear();
    for (const { key, oldValue } of queue) {
      this._changes.set(key, oldValue);
    }

    if (this._changes.size === 0) return; // no change

    this._inLifecycle = 'onBeforeUpdate';
    this.onBeforeUpdate();
    this._inLifecycle = null;

    this._inLifecycle = 'onUpdate';
    const vnodes = Blueprint.cast(this.onUpdate());
    this._inLifecycle = null;

    // fill node key
    const _keysCount = vnodes.filter(n => n.key).length;
    if (_keysCount === 0) {
      // @ts-expect-error
      vnodes.forEach((n, i) => (n.key = `__$$${i}`));
    } else if (_keysCount < vnodes.length) {
      throw new Error('All must have keys, or none at all');
    }

    this._diff(vnodes);

    this._inLifecycle = 'onAfterUpdate';
    this.onAfterUpdate();
    this._inLifecycle = null;
  }

  private _doInit() {
    if (this._initted) return;

    for (const [key, meta] of this.meta.properties) {
      if (meta.onInit) meta.onInit.call(this, key);
    }

    this._inLifecycle = 'onInit';
    this.onInit();

    this._inLifecycle = null;
    this._initted = true;

    this._schedule();
  }

  private _doDestroy() {
    this._inLifecycle = 'onDestroy';

    for (const node of this._lastNodes) {
      if (node._ins) {
        node._ins._doDestroy();
        node._ins = null;
      }
    }

    for (const [key, meta] of this.meta.properties) {
      if (meta.onDestroy) meta.onDestroy.call(this, key);
    }

    this._changes.clear();
    this._metaCache = null;
    this._lastNodes.length = 0;
    this._updateQueue.length = 0;
    this.onDestroy();

    this._inLifecycle = null;
  }

  private _diff(newNodes: Blueprint[]) {
    const _destroy = (node: Blueprint) => {
      if (node._ins) {
        node._ins._doDestroy();
        node._ins = null;
      }
    };

    const _create = (node: Blueprint) => {
      // @ts-expect-error
      const Type = this._registry.get(node.type);
      if (!Type) throw new Error(`component "${node.type}" not found`);

      const _ins = new Type(this._registry, this.context);
      node._ins = _ins;

      _ins.dispatch(node.props);
      _ins._doInit();
    };

    const oldNodes = this._lastNodes;
    const oldNodeMap = new Map<string, Blueprint>(oldNodes.map(n => [n.key, n]));
    const newNodeMap = new Map<string, Blueprint>(newNodes.map(n => [n.key, n]));

    const _toDestroyKeys = new Set<string>();
    const _toCreateKeys = new Set<string>();
    const _toUpdateKeys = new Set<string>();

    for (let i = 0; i < oldNodes.length; i++) {
      const _n = oldNodes[i];
      _toUpdateKeys.add(_n.key);
      if (!newNodeMap.has(_n.key)) _toDestroyKeys.add(_n.key);
    }

    for (let i = 0; i < newNodes.length; i++) {
      const _n = newNodes[i];
      _toUpdateKeys.add(_n.key);
      if (!oldNodeMap.has(_n.key)) _toCreateKeys.add(_n.key);
    }

    // 卸载
    for (const _k of _toDestroyKeys) {
      _toUpdateKeys.delete(_k);
      _destroy(oldNodeMap.get(_k)!);
    }

    // 创建
    for (const _k of _toCreateKeys) {
      _toUpdateKeys.delete(_k);
      _create(newNodeMap.get(_k)!);
    }

    // 更新
    for (const _k of _toUpdateKeys) {
      const prev = oldNodeMap.get(_k)!;
      const next = newNodeMap.get(_k)!;

      // 类型相同，递归更新
      if (prev.type === next.type) {
        if (!prev._ins) throw new Error('prev._ins not exists');
        if (!next._ins) next._ins = prev._ins; // 传递实例

        // set props
        next._ins.dispatch(next.props);
      }

      // 类型不同，卸载 prev，创建 next
      else {
        _destroy(prev);
        _create(next);
      }
    }

    this._lastNodes = newNodes;
  }
}

export class Host<C extends keyof IComponentInfoMap, C2 = any> {
  private _registry: ComponentRegistry;
  private _comp: Component;

  constructor(root: C, registry = ComponentRegistry.Default, context?: C2) {
    this._registry = registry;

    const Type = registry.get(root);
    if (!Type) throw new Error(`component "${root}" not found`);

    this._comp = new Type(this._registry, context);
  }

  get component() {
    return this._comp;
  }

  dispatch(props?: IComponentInfoMap[C]) {
    if (props) this._comp.dispatch(props);

    if (!this._comp.initted) {
      // @ts-expect-error
      this._comp._doInit();
    }
  }

  destroy() {
    // @ts-expect-error
    this._comp._doDestroy();
  }
}

export interface IComponentInfoMap {}

export class ComponentRegistry {
  static Default = new ComponentRegistry();

  private _map = new Map<string, ComponentType>();

  register<C extends keyof IComponentInfoMap>(name: C, Type: ComponentType) {
    this._map.set(name, Type);
  }

  get<C extends keyof IComponentInfoMap>(name: C): ComponentType | undefined {
    return this._map.get(name);
  }
}
