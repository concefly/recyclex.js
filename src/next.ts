export type IOptions = {
  isEqual: (a: any, b: any) => boolean;
  getVersion: (v: any) => string | number;
  useVersionCheck: string[];
};

export const DefaultOptions: IOptions = {
  isEqual: (a, b) => a === b,
  getVersion: () => 0,
  useVersionCheck: [],
};

export type Blueprint<P extends Record<string, any> = any> = { factory: IComponentFactory<P>; props: P; key: string };

export type IContextDefinition<K extends string, T> = { key: K; defaultValue: T };

export type IController = {
  onBeforeUpdate?(): any;
  onUpdate?(): any;
  onAfterUpdate?(): any;
  onDestroy?(): any;

  onMutateBlueprints?(list: Blueprint[]): Blueprint[];
};

export type IControllerFactory = (ins: IComponentInstance<any>) => IController;

export type IOnBeforeUpdateCB<P extends Record<string, any>> = (props: P, changes: Map<keyof P, any>) => void;
export type IOnUpdateCB<P extends Record<string, any>> = (props: P, changes: Map<keyof P, any>) => Blueprint[] | void;
export type IOnAfterUpdateCB<P extends Record<string, any>> = (props: P, changes: Map<keyof P, any>) => void;

export type IOnDisposeCB = () => void;

export type ISetupCallback<P extends Record<string, any>> = (ctx: {
  key: string;

  initProps: P;

  onBeforeUpdate: IOnBeforeUpdateCB<P>;
  onUpdate: IOnUpdateCB<P>;
  onAfterUpdate: IOnAfterUpdateCB<P>;

  createContext: <K extends string, T>(key: IContextDefinition<K, T>) => { value: T };
  getContext: <K extends string, T>(key: IContextDefinition<K, T>) => { value: T };
}) => IOnDisposeCB;

export interface IComponentDefinition<P extends Record<string, any>> {
  defaultProps: P;
  setup: ISetupCallback<P>;
  controllers?: IControllerFactory[];
  options?: IOptions;
}

export interface IComponentFactory<P extends Record<string, any>> {
  defaultProps: P;
  create: (key: string, props?: P, parent?: IComponentInstance<any>) => IComponentInstance<P>;
}

export interface IComponentInstance<P extends Record<string, any>> {
  key: string;
  parent?: IComponentInstance<any>;

  contextStore: Map<string, any>;

  update(newProps: P): void;
  dispose(): void;
}

export function blueprint<P extends Record<string, any>>(factory: IComponentFactory<P>, props: P, key: string): Blueprint<P> {
  return { factory, props, key };
}

export function defineContext<K extends string, T>(key: K, defaultValue: () => T): IContextDefinition<K, T> {
  return {
    key,
    get defaultValue() {
      return defaultValue();
    },
  };
}

export function defineComponent<P extends Record<string, any>>(def: IComponentDefinition<P>): IComponentFactory<P> {
  type _IChild = Blueprint & { ins?: IComponentInstance<any> };

  const create = (key: string, initProps: P = def.defaultProps, parent?: IComponentInstance<any>) => {
    const contextStore = new Map<string, any>();
    const instance: IComponentInstance<P> = { key, contextStore, parent, update, dispose };

    const ctx: Parameters<ISetupCallback<P>>[0] = {
      key,
      initProps,
      onBeforeUpdate: () => {},
      onUpdate: () => {},
      onAfterUpdate: () => {},

      createContext: key => {
        if (contextStore.has(key.key)) throw new Error('key already exists');
        const rst = { value: key.defaultValue };
        contextStore.set(key.key, rst);
        return rst;
      },

      getContext: key => {
        if (contextStore.has(key.key)) return contextStore.get(key.key);

        let cur = parent;

        while (cur) {
          if (cur.contextStore.has(key.key)) {
            return cur.contextStore.get(key.key);
          }

          cur = cur.parent;
        }

        throw new Error('key not exists');
      },
    };

    const options = def.options ?? DefaultOptions;

    // setup
    const controllers = def.controllers?.map(factory => factory(instance)) ?? [];
    const onDisposeCB = def.setup(ctx);

    let disposed = false;
    let children: _IChild[] = [];

    const commonKeys = new Set<string>();
    const changes = new Map<string, any>();

    let oldProps: any = {};
    let oldVersions: any = {};

    const oldChildMap = new Map<string, _IChild>();
    const newChildMap = new Map<string, _IChild>();

    const _toDisposeKeys = new Set<string>();
    const _toCreateKeys = new Set<string>();
    const _toUpdateKeys = new Set<string>();

    const _disposeChild = (child: _IChild) => {
      if (child.ins) {
        for (const ctrl of controllers) {
          ctrl.onDestroy?.();
        }

        child.ins.dispose();
        child.ins = undefined;
      }
    };

    const _createChild = (child: _IChild) => {
      child.ins = child.factory.create(child.key, child.props, instance);
    };

    function update(newProps: P) {
      if (disposed) throw new Error('Already disposed');

      // calc changes
      commonKeys.clear();
      changes.clear();

      for (const k of Object.keys(oldProps)) commonKeys.add(k);
      for (const k of Object.keys(newProps)) commonKeys.add(k);

      let newVersions: any = {};

      for (const k of commonKeys) {
        const oldVal = oldProps[k];
        const newVal = newProps[k];

        const useVersionCheck = options.useVersionCheck.includes(k);

        let toCompareA: any;
        let toCompareB: any;

        if (useVersionCheck) {
          toCompareA = oldVersions[k];

          newVersions[k] = options.getVersion(newVal);
          toCompareB = newVersions[k];
        } else {
          toCompareA = oldVal;
          toCompareB = newVal;
        }

        if (!options.isEqual(toCompareA, toCompareB)) {
          changes.set(k, oldVal);
        }
      }

      // 没有变化，不处理
      if (changes.size === 0) return;

      oldChildMap.clear();
      newChildMap.clear();

      for (const ctrl of controllers) {
        ctrl.onBeforeUpdate?.();
      }
      ctx.onBeforeUpdate?.(newProps, changes);

      for (const ctrl of controllers) {
        ctrl.onUpdate?.();
      }

      let nextChildren = (ctx.onUpdate?.(newProps, changes) ?? []) as _IChild[];

      for (const ctrl of controllers) {
        if (ctrl.onMutateBlueprints) {
          nextChildren = ctrl.onMutateBlueprints(nextChildren);
        }
      }

      for (const ctrl of controllers) {
        ctrl.onAfterUpdate?.();
      }
      ctx.onAfterUpdate?.(newProps, changes);

      for (const c of children) oldChildMap.set(c.key, c);
      for (const c of nextChildren) newChildMap.set(c.key, c);

      commonKeys.clear();

      for (const c of children) commonKeys.add(c.key);
      for (const c of nextChildren) commonKeys.add(c.key);

      _toDisposeKeys.clear();
      _toCreateKeys.clear();
      _toUpdateKeys.clear();

      for (let i = 0; i < children.length; i++) {
        const _n = children[i];
        _toUpdateKeys.add(_n.key);
        if (!newChildMap.has(_n.key)) _toDisposeKeys.add(_n.key);
      }

      for (let i = 0; i < nextChildren.length; i++) {
        const _n = nextChildren[i];
        _toUpdateKeys.add(_n.key);
        if (!oldChildMap.has(_n.key)) _toCreateKeys.add(_n.key);
      }

      // 卸载
      for (const _k of _toDisposeKeys) {
        _toUpdateKeys.delete(_k);

        const child = oldChildMap.get(_k)!;
        _disposeChild(child);
      }

      // 按顺序创建 or 更新
      for (const child of nextChildren) {
        // create
        if (_toCreateKeys.has(child.key)) {
          _createChild(child);
        }

        // update
        else if (_toUpdateKeys.has(child.key)) {
          const prev = oldChildMap.get(child.key)!;
          const next = newChildMap.get(child.key)!;

          // 类型相同，递归更新
          if (prev.factory === next.factory) {
            if (!prev.ins) throw new Error('prev.ins not exists');
            if (!next.ins) next.ins = prev.ins; // 传递实例

            // set props
            next.ins.update(next.props);
          }

          // 类型不同，卸载 prev，创建 next
          else {
            _disposeChild(prev);
            _createChild(next);
          }
        }
      }

      oldProps = newProps;
      oldVersions = newVersions;

      children = nextChildren;
    }

    function dispose() {
      if (disposed) throw new Error('Already disposed');

      for (let i = children.length - 1; i >= 0; i--) {
        children[i].ins?.dispose();
      }

      onDisposeCB();

      children.length = 0;
      disposed = true;
    }

    // 立刻初始化
    update(initProps);

    return instance;
  };

  return { defaultProps: def.defaultProps, create };
}
