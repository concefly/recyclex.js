export type Blueprint<P extends Record<string, any> = any, C = any> = {
  factory: IComponentFactory<P, C>;
  props: P;
  key: string;
  context?: C;
};

export type IController = {
  onInit?(): any;
  onBeforeUpdate?(): any;
  onUpdate?(): any;
  onAfterUpdate?(): any;
  onDestroy?(): any;

  onMutateBlueprints?(list: Blueprint[]): Blueprint[];
};

export type IOnBeforeUpdateCB<P extends Record<string, any>> = (props: P, changes: Map<string, any>) => void;
export type IOnUpdateCB<P extends Record<string, any>> = (props: P, changes: Map<string, any>) => Blueprint[] | void;
export type IOnAfterUpdateCB<P extends Record<string, any>> = (props: P, changes: Map<string, any>) => void;

export type IOnDisposeCB = () => void;

export type ISetupCallback<P extends Record<string, any>, C> = (ctx: {
  key: string;
  context: C;
  onBeforeUpdate: IOnBeforeUpdateCB<P>;
  onUpdate: IOnUpdateCB<P>;
  onAfterUpdate: IOnAfterUpdateCB<P>;
}) => IOnDisposeCB;

export interface IComponentDefinition<P extends Record<string, any>> {
  defaultProps: P;
  setup: ISetupCallback<P, void>;
}
export interface IComponentDefinitionWithContext<P extends Record<string, any>, C> {
  defaultProps: P;
  context: C;
  setup: ISetupCallback<P, C>;
}

export interface IComponentFactory<P extends Record<string, any>, C> {
  defaultProps: P;
  create(key: string): IComponentInstance<P, void>;
  create(key: string, initProps?: P): IComponentInstance<P, void>;
  create(key: string, initProps?: P, context?: C): IComponentInstance<P, C>;
}

export interface IComponentInstance<P extends Record<string, any>, C> {
  key: string;
  update(newProps: P): void;
  dispose(): void;
}

export function blueprint<P extends Record<string, any>, C>(
  factory: IComponentFactory<P, C>,
  props: P,
  key: string,
  context?: C
): Blueprint<P, C> {
  return { factory, props, key, context };
}

export function defineComponent<P extends Record<string, any>, C>(def: IComponentDefinitionWithContext<P, C>): IComponentFactory<P, C>;
export function defineComponent<P extends Record<string, any>>(def: IComponentDefinition<P>): IComponentFactory<P, void>;
export function defineComponent(def: IComponentDefinition<any> | IComponentDefinitionWithContext<any, any>): IComponentFactory<any, any> {
  type _IChild = Blueprint & { ins?: IComponentInstance<any, any> };

  const create = (key: string, initProps?: any, context?: any) => {
    const ctx: Parameters<ISetupCallback<any, any>>[0] = {
      key,
      context: context ?? (def as any).context,
      onBeforeUpdate: () => {},
      onUpdate: () => {},
      onAfterUpdate: () => {},
    };

    // setup
    const onDisposeCB = def.setup(ctx);

    let disposed = false;
    let children: _IChild[] = [];

    const commonKeys = new Set<string>();
    const changes = new Map<string, any>();

    let oldProps: any = {};

    const oldChildMap = new Map<string, _IChild>();
    const newChildMap = new Map<string, _IChild>();

    const _toDisposeKeys = new Set<string>();
    const _toCreateKeys = new Set<string>();
    const _toUpdateKeys = new Set<string>();

    const _disposeChild = (child: _IChild) => {
      if (child.ins) {
        child.ins.dispose();
        child.ins = undefined;
      }
    };

    const _createChild = (child: _IChild, newContext?: any) => {
      child.ins = child.factory.create(child.key, child.props, newContext ?? ctx.context);
    };

    const update = (newProps: any) => {
      if (disposed) throw new Error('Already disposed');

      // calc changes
      commonKeys.clear();
      changes.clear();

      for (const k of Object.keys(oldProps)) commonKeys.add(k);
      for (const k of Object.keys(newProps)) commonKeys.add(k);

      for (const k of commonKeys) {
        const oldVal = oldProps[k];
        const newVal = newProps[k];

        if (oldVal !== newVal) {
          changes.set(k, oldVal);
        }
      }

      // 没有变化，不处理
      if (changes.size === 0) return;

      oldChildMap.clear();
      newChildMap.clear();

      ctx.onBeforeUpdate?.(newProps, changes);

      const nextChildren = (ctx.onUpdate?.(newProps, changes) ?? []) as _IChild[];
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
          _createChild(child, child.context);
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
            _createChild(next, next.context);
          }
        }
      }

      oldProps = newProps;
      children = nextChildren;
    };

    const dispose = () => {
      if (disposed) throw new Error('Already disposed');

      for (let i = children.length - 1; i >= 0; i--) {
        children[i].ins?.dispose();
      }

      onDisposeCB();

      children.length = 0;
      disposed = true;
    };

    // 立刻初始化
    if (initProps) {
      update(initProps);
    }

    const instance: IComponentInstance<any, any> = { key, update, dispose };

    return instance;
  };

  return { defaultProps: def.defaultProps, create };
}
