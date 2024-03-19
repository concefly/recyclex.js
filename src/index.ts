export type IProps = Record<string, any>;

export interface ComponentType {
  new (registry: ComponentRegistry, context?: any): Component;
}

export interface IPropertyMeta {
  isEquals?: (a: any, b: any) => boolean;
}

export interface IComponentMeta {
  properties: Map<string, IPropertyMeta>;
}

function _propertyDecorator(def: IPropertyMeta) {
  return function (prototype: any, key: string) {
    if (!Object.prototype.hasOwnProperty.call(prototype, '_meta')) {
      // inject meta data
      Object.defineProperty(prototype, '_meta', {
        value: { properties: new Map() } satisfies IComponentMeta,
        enumerable: false,
      });
    }

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

          this.requestUpdate(key, oldValue);
        },
      },
    });
  };
}

// property decorator
export function Reactive(def: IPropertyMeta = {}) {
  return _propertyDecorator({ ...def });
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

function _defaultEquals(a: any, b: any) {
  return a === b;
}

export class Blueprint {
  static of<C extends keyof IComponentInfoMap>(type: C, props: IComponentInfoMap[C], key?: string | number): Blueprint {
    return new Blueprint(type as any, props, typeof key === 'number' ? key + '' : key);
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
    readonly key?: string
  ) {}
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
  private _skipUpdateFlags = new Set<string>();
  private _lastNodes: Blueprint[] = [];
  private readonly _updateQueue: { key: string; oldValue?: any }[] = [];

  private _withBatchUpdate(fn: Function) {
    try {
      this._skipUpdateFlags.add('batch');
      fn();

      this._skipUpdateFlags.delete('batch');
      this._doUpdate();
    } catch (e) {
      // clear queue
      this._updateQueue.length = 0;
      this._skipUpdateFlags.delete('batch');
      throw e;
    }
  }

  requestUpdate(key: string, oldValue?: any) {
    const _def = this.meta.properties.get(key);
    if (!_def) throw new Error(`property "${key}" not found`);

    const _equals = _def.isEquals || _defaultEquals;
    const _curValue = (this as any)[key];

    if (_equals(oldValue, _curValue)) return; // no change

    this._updateQueue.push({ key, oldValue });

    if (this._skipUpdateFlags.size === 0) this._doUpdate();
  }

  set(datas: Partial<P>) {
    this._withBatchUpdate(() => {
      for (const [key, value] of Object.entries(datas)) {
        // @ts-expect-error
        this[key] = value;
      }
    });
  }

  private _doUpdate() {
    if (this._skipUpdateFlags.size > 0 || !this._initted) return;

    const queue = this._updateQueue.concat();
    this._updateQueue.length = 0;

    this._changes.clear();
    for (const { key, oldValue } of queue) {
      this._changes.set(key, oldValue);
    }

    if (this._changes.size === 0) return; // no change

    this._skipUpdateFlags.add('update');

    try {
      this.onBeforeUpdate();
      if (this._updateQueue.length > 0) throw new Error('Cannot call requestUpdate in onBeforeUpdate');

      const vnodes = Blueprint.cast(this.onUpdate());
      if (this._updateQueue.length > 0) throw new Error('Cannot call requestUpdate in onUpdate');

      this._diff(vnodes);

      this.onAfterUpdate();
      if (this._updateQueue.length > 0) throw new Error('Cannot call requestUpdate in onAfterUpdate');
    } finally {
      this._skipUpdateFlags.delete('update');
    }
  }

  private _doInit() {
    this._withBatchUpdate(() => {
      this.onInit();
      this._initted = true;
    });
  }

  private _doDestroy() {
    this._skipUpdateFlags.add('destroy'); // 销毁时不触发更新

    for (const node of this._lastNodes) {
      if (node._ins) {
        node._ins._doDestroy();
        node._ins = null;
      }
    }

    this._changes.clear();
    this._metaCache = null;
    this._lastNodes.length = 0;
    this._updateQueue.length = 0;
    this.onDestroy();
  }

  private _diff(newNodes: Blueprint[]) {
    const oldNodes = this._lastNodes;
    const maxLength = Math.max(oldNodes.length, newNodes.length);

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

      _ins.set(node.props);
      _ins._doInit();
    };

    for (let i = 0; i < maxLength; i++) {
      const prev = oldNodes[i];
      const next = newNodes[i];

      if (prev && next) {
        // 类型相同，递归更新
        if (prev.type === next.type) {
          if (!prev._ins) throw new Error('prev._ins not exists');
          if (!next._ins) next._ins = prev._ins; // 传递实例

          // set props
          next._ins.set(next.props);
        }

        // 类型不同，卸载 prev，创建 next
        else {
          _destroy(prev);
          _create(next);
        }
      }

      // 卸载
      else if (prev) _destroy(prev);
      // 创建
      else if (next) _create(next);
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

  flush(props?: IComponentInfoMap[C]) {
    if (props) this._comp.set(props);

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
