export type IProps = Record<string, any>;

export interface ComponentType {
  new (registry: ComponentRegistry): Component;
}

export interface IPropertyMeta {
  type: 'prop' | 'state';
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
export function Prop(def: Omit<IPropertyMeta, 'key' | 'type'> = {}) {
  return _propertyDecorator({ ...def, type: 'prop' });
}

// state decorator
export function State(def: Omit<IPropertyMeta, 'key' | 'type'> = {}) {
  return _propertyDecorator({ ...def, type: 'state' });
}

// class decorator
export function Register(name: string, registry = ComponentRegistry.Default) {
  return function (constructor: ComponentType) {
    registry.register(name, constructor);
  };
}

function _defaultEquals(a: any, b: any) {
  return a === b;
}

export class VNode {
  static of<C extends keyof IComponentInfo>(type: C, props: IComponentInfo[C]): VNode {
    return new VNode(type as any, props);
  }

  static cast(arg: any): VNode[] {
    if (arg instanceof VNode) return [arg];

    if (Array.isArray(arg)) {
      const list: VNode[] = [];
      for (const item of arg) {
        list.push(...VNode.cast(item));
      }
      return list;
    }

    return [];
  }

  _ins: Component | null = null;

  constructor(
    readonly type: string,
    readonly props: IProps
  ) {}
}

export class Component {
  constructor(private _registry: ComponentRegistry) {}

  protected _changes = new Map<string, any>();

  onInit() {}
  onDestroy() {}

  onBeforeUpdate() {}
  onAfterUpdate() {}

  onUpdate(): any {
    return [];
  }

  get meta(): IComponentMeta {
    if (this._metaCache) return this._metaCache;

    const proto = Object.getPrototypeOf(this);

    const curMeta: IComponentMeta = proto._meta;
    const parentMeta: IComponentMeta | undefined = Object.getPrototypeOf(proto)._meta;

    // merge parent meta
    const meta = { ...parentMeta, ...curMeta, properties: new Map([...(parentMeta?.properties || []), ...curMeta.properties]) };
    this._metaCache = meta;

    return meta;
  }

  get initted() {
    return this._initted;
  }

  private _metaCache: IComponentMeta | null = null;
  private _initted = false;
  private _holdingUpdate = true;
  private _lastNodes: VNode[] = [];
  private readonly _updateQueue: { key: string; oldValue?: any }[] = [];

  requestUpdate(key: string, oldValue?: any) {
    const _def = this.meta.properties.get(key);
    if (!_def) throw new Error(`property "${key}" not found`);

    const _equals = _def.isEquals || _defaultEquals;
    const _curValue = (this as any)[key];

    if (_equals(oldValue, _curValue)) return; // no change

    this._updateQueue.push({ key, oldValue });
    this._doUpdate();
  }

  set(datas: Partial<IProps>) {
    this._holdingUpdate = true;

    for (const [key, value] of Object.entries(datas)) {
      // @ts-expect-error
      this[key] = value;
    }

    this._holdingUpdate = false;
    this._doUpdate();
  }

  private _doUpdate() {
    if (this._holdingUpdate || !this._initted) return;

    const queue = this._updateQueue.concat();
    this._updateQueue.length = 0;

    this._changes.clear();
    for (const { key, oldValue } of queue) {
      this._changes.set(key, oldValue);
    }

    if (this._changes.size === 0) return; // no change

    this.onBeforeUpdate();

    const vnodes = VNode.cast(this.onUpdate());
    this._diff(vnodes);

    this.onAfterUpdate();
  }

  private _doInit() {
    this.onInit();

    this._initted = true;
    this._holdingUpdate = false;

    this._doUpdate(); // trigger update
  }

  private _doDestroy() {
    this._changes.clear();
    this._metaCache = null;
    this._lastNodes.length = 0;
    this._updateQueue.length = 0;
    this.onDestroy();
  }

  private _diff(newNodes: VNode[]) {
    const oldNodes = this._lastNodes;
    const maxLength = Math.max(oldNodes.length, newNodes.length);

    const _destroy = (node: VNode) => {
      if (node._ins) {
        node._ins._doDestroy();
        node._ins = null;
      }
    };

    const _create = (node: VNode) => {
      const Type = this._registry.get(node.type);
      if (!Type) throw new Error(`component "${node.type}" not found`);

      const _ins = new Type(this._registry);
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
      else if (prev) {
        _destroy(prev);
      }

      // 创建
      else if (next) {
        _create(next);
      }
    }

    this._lastNodes = newNodes;
  }
}

export class Host {
  private _registry: ComponentRegistry;
  private _comp: Component;

  constructor(registry: ComponentRegistry, root: string) {
    this._registry = registry;

    const Type = registry.get(root);
    if (!Type) throw new Error(`component "${root}" not found`);

    this._comp = new Type(this._registry);
  }

  flush(props?: IProps) {
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

export interface IComponentInfo {
  [key: string]: IProps;
}

export class ComponentRegistry {
  static Default = new ComponentRegistry();

  private _map = new Map<string, ComponentType>();

  register<C extends keyof IComponentInfo>(name: C, Type: ComponentType) {
    // @ts-expect-error
    this._map.set(name, Type);
  }

  get<C extends keyof IComponentInfo>(name: C): ComponentType | undefined {
    // @ts-expect-error
    return this._map.get(name);
  }
}
