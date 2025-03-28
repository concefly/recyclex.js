import {
  map,
  Observable,
  scan,
  Subject,
  BehaviorSubject,
  tap,
  bufferWhen,
  OperatorFunction,
  ObservableInputTuple,
  combineLatest,
  filter,
  takeUntil,
  MonoTypeOperatorFunction,
  Subscription,
  startWith,
} from 'rxjs';

export type IOptions<_K, V> = {
  isEqual: (a?: V, b?: V) => boolean;
  getVersion: (v: V) => string | number;
  useVersionCheck: boolean;
};

export type IOptionsMap<P> = { [K in keyof P]?: Partial<IOptions<K, P[K]>> };

export const DefaultOptions: IOptions<string, any> = {
  isEqual: (a, b) => a === b,
  getVersion: () => 0,
  useVersionCheck: false,
};

export type Blueprint<P extends Record<string, any> = any, R = void> = {
  factory: IComponentFactory<P, R>;
  props: P;
  key: string;
  onInstance?: (ins: IComponentInstance<P, R> | null) => void;
};

export type ITokenDefinition<T> = string & { _type: T };

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

export type IProvideCB = <T>(key: ITokenDefinition<T>, value: T) => T;
export type IInjectCB = <T>(key: ITokenDefinition<T>) => T;

export type IPropSubjects<P extends Record<string, any>> = {
  [K in keyof P as K extends string ? `${K}$` : never]-?: BehaviorSubject<P[K]>;
};

export type IComponentContext<P extends Record<string, any>, R = void> = {
  key: string;

  P: IPropSubjects<P>;
  afterInput$: Subject<Set<keyof P>>;
  afterUpdate$: Subject<void>;
  dispose$: Subject<void>;

  select: <T extends readonly unknown[]>(sources: readonly [...ObservableInputTuple<T>]) => Observable<T>;
  bufferInput: <T>() => OperatorFunction<T, T>;
  takeUntilDispose: <T>() => MonoTypeOperatorFunction<T>;

  addSub: (...subs: Subscription[]) => void;

  provide: IProvideCB;
  inject: IInjectCB;

  setRef: (ref: R) => void;
};

export type ISetupCallback<P extends Record<string, any>, R = void> = (ctx: IComponentContext<P, R>) => Observable<Blueprint[]> | void;

export interface IComponentDefinition<P extends Record<string, any>, R = void> {
  defaultProps: Required<P>;
  setup: ISetupCallback<Required<P>, R>;
  options?: IOptionsMap<Required<P>>;
}

export interface IComponentFactory<P extends Record<string, any>, R = void> {
  def: IComponentDefinition<P, R>;
  create: (
    key: string,
    props?: P,
    parent?: IComponentInstance<any, any>,
    beforeSetup?: (ctx: IComponentContext<P, R>) => void
  ) => IComponentInstance<P, R>;
}

export interface IComponentInstance<P extends Record<string, any>, R = void> {
  key: string;
  parent?: IComponentInstance<any>;

  ref: R;

  contextStore: Map<string, any>;

  provide: IProvideCB;
  inject: IInjectCB;

  update(newProps: P): void;
  dispose(): void;
}

export type IInstanceType<T> = T extends IComponentFactory<infer P, infer R> ? IComponentInstance<P, R> : never;

export class ComponentError<P extends Record<string, any>, R = void> extends Error {
  constructor(
    readonly instance: IComponentInstance<P, R>,
    readonly msg: string,
    readonly innerError?: any
  ) {
    super(msg);
  }
}

export const DefaultError$ = new Subject<ComponentError<any, any>>();
DefaultError$.subscribe(err => {
  console.error(`Error in component ${err.instance.key}: ${err.msg}`);
  console.error(err.innerError);
});

export function blueprint<P extends Record<string, any>, R = void>(
  factory: IComponentFactory<P, R>,
  props: P,
  key: string,
  onInstance?: (ins: IComponentInstance<P, R> | null) => void
): Blueprint {
  // @ts-expect-error
  return { factory, props, key, onInstance };
}

export function defineToken<T>(key: string): ITokenDefinition<T> {
  return key as any;
}

export function defineComponent<P extends Record<string, any>, R = void>(def: IComponentDefinition<P, R>): IComponentFactory<P, R> {
  type _IChild = Blueprint & { ins?: IComponentInstance<any> };

  const create = (
    key: string,
    initProps: P = def.defaultProps,
    parent?: IComponentInstance<any>,
    beforeSetup?: (ctx: IComponentContext<P, R>) => void
  ) => {
    const contextStore = new Map<string, any>();
    const instance: IComponentInstance<P, R> = { key, ref: null as any, contextStore, parent, provide, inject, update, dispose };

    const propSubjects: IPropSubjects<P> = {} as any;
    const inputProps$ = new Subject<P>();

    const afterInput$ = new Subject<Set<keyof P>>();
    const afterUpdate$ = new Subject<void>();
    const dispose$ = new Subject<void>();

    let updating = false;

    const properties = Object.keys(def.defaultProps) as (keyof P)[];

    for (const k of properties) {
      const v = initProps[k] ?? def.defaultProps[k];

      // @ts-expect-error
      propSubjects[`${k}$`] = new BehaviorSubject<any>(v);
    }

    const bufferInput = <T>() => {
      const fn: OperatorFunction<T, T> = src$ =>
        src$.pipe(
          bufferWhen(() => afterInput$),
          filter(args => args.length > 0),
          map(args => args[args.length - 1])
        );

      return fn;
    };

    const select = <T extends readonly unknown[]>(list: readonly [...ObservableInputTuple<T>]) => {
      const vSet = new Set(Object.values(propSubjects));
      const isAllProp = list.every(v => vSet.has(v as any));

      if (!isAllProp) throw new Error('select only support properties stream');

      return combineLatest(list).pipe(bufferInput());
    };

    const takeUntilDispose = <T>() => takeUntil<T>(dispose$);

    const addSub = (...subs: Subscription[]) => {
      for (const sub of subs) {
        dispose$.subscribe(() => sub.unsubscribe());
      }
    };

    const ctx: IComponentContext<P, R> = {
      key,
      P: propSubjects,
      afterUpdate$,
      afterInput$,
      dispose$,
      provide,
      inject,
      bufferInput,
      select,
      takeUntilDispose,
      addSub,
      setRef,
    };

    // setup
    beforeSetup?.(ctx);
    const blueprints$ = def.setup(ctx) ?? new Subject<Blueprint[]>();

    let disposed = false;
    let children: _IChild[] = [];

    const inputSub = inputProps$
      .pipe(
        startWith(initProps), // 初始化输入，给 infos 填充初始值
        scan<P, Record<string, { value: any; version: any; changed: boolean }>>((infos, cur) => {
          for (const key of properties as string[]) {
            const newVal = cur[key] ?? def.defaultProps[key];

            const getVersion = def.options?.[key]?.getVersion ?? DefaultOptions.getVersion;
            const isEqual = def.options?.[key]?.isEqual ?? DefaultOptions.isEqual;
            const useVersionCheck = def.options?.[key]?.useVersionCheck ?? DefaultOptions.useVersionCheck;

            if (!infos[key]) {
              infos[key] = { value: newVal, version: useVersionCheck ? getVersion(newVal) : undefined, changed: false };
              continue;
            }

            let toCompareA: any;
            let toCompareB: any;
            let newVersion: any = undefined;

            if (useVersionCheck) {
              toCompareA = infos[key].version;
              newVersion = getVersion(newVal);
              toCompareB = newVersion;
            } else {
              toCompareA = infos[key].value;
              toCompareB = newVal;
            }

            infos[key].value = newVal;
            infos[key].version = newVersion;
            infos[key].changed = !isEqual(toCompareA, toCompareB);
          }

          return infos;
        }, {}),
        map(infos => {
          const entries = Object.entries(infos).filter(([_, info]) => info.changed);
          if (entries.length === 0) return;

          for (const [k, v] of entries) {
            propSubjects[`${k}$`].next(v.value);
          }

          const changes = new Set<string>(entries.map(([key]) => key));
          return changes;
        }),
        tap(changes => {
          if (changes) afterInput$.next(changes);
        })
      )
      .subscribe({ error: err => DefaultError$.next(new ComponentError(instance, err.message, err)) });

    const updateSub = blueprints$
      .pipe(
        scan(
          (lastInfo, nextChildren) => {
            if (disposed) throw new Error('Already disposed');
            if (updating) throw new Error('Infinity loop detected');

            updating = true;

            const { children: lastChildren, oldChildMap, newChildMap, commonKeys, _toDisposeKeys, _toCreateKeys, _toUpdateKeys } = lastInfo;

            oldChildMap.clear();
            newChildMap.clear();
            commonKeys.clear();

            _toDisposeKeys.clear();
            _toCreateKeys.clear();
            _toUpdateKeys.clear();

            for (const c of lastChildren) oldChildMap.set(c.key, c);
            for (const c of nextChildren) newChildMap.set(c.key, c);

            for (const c of lastChildren) commonKeys.add(c.key);
            for (const c of nextChildren) commonKeys.add(c.key);

            for (let i = 0; i < lastChildren.length; i++) {
              const _n = lastChildren[i];
              if (newChildMap.has(_n.key)) _toUpdateKeys.add(_n.key);
              else _toDisposeKeys.add(_n.key);
            }

            for (let i = 0; i < nextChildren.length; i++) {
              const _n = nextChildren[i];
              if (oldChildMap.has(_n.key)) _toUpdateKeys.add(_n.key);
              else _toCreateKeys.add(_n.key);
            }

            // 卸载
            for (const _k of _toDisposeKeys) {
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

            children = nextChildren;
            lastInfo.children = nextChildren;

            afterUpdate$.next();

            updating = false;
            return lastInfo;
          },
          {
            children: [] as _IChild[],
            oldChildMap: new Map<string, _IChild>(),
            newChildMap: new Map<string, _IChild>(),
            commonKeys: new Set<string>(),
            _toDisposeKeys: new Set<string>(),
            _toCreateKeys: new Set<string>(),
            _toUpdateKeys: new Set<string>(),
          }
        )
      )
      .subscribe({ error: err => DefaultError$.next(new ComponentError(instance, err.message, err)) });

    // blueprint 订阅完成后，立刻触发一次 afterInput，因为 P 是 BehaviorSubject, 会在订阅时立刻发送一次
    afterInput$.next(new Set(properties));

    function _disposeChild(child: _IChild) {
      if (child.ins) {
        child.ins.dispose();
        child.ins = undefined;
        child.onInstance?.(null);
      }
    }

    function _createChild(child: _IChild) {
      child.ins = child.factory.create(child.key, child.props, instance);
      child.onInstance?.(child.ins);
    }

    function provide<T>(key: ITokenDefinition<T>, value: T) {
      if (contextStore.has(key)) throw new Error('key already exists');
      contextStore.set(key, value);
      return value;
    }

    function inject(key: ITokenDefinition<any>) {
      if (contextStore.has(key)) return contextStore.get(key);

      let cur = parent;

      while (cur) {
        if (cur.contextStore.has(key)) {
          return cur.contextStore.get(key);
        }

        cur = cur.parent;
      }

      throw new Error('context not found: ' + key);
    }

    function update(newProps: P) {
      if (disposed) throw new Error('Already disposed');
      inputProps$.next(newProps);
    }

    function setRef(ref: R) {
      instance.ref = ref;
    }

    function dispose() {
      if (disposed) throw new Error('Already disposed');

      for (let i = children.length - 1; i >= 0; i--) {
        children[i].ins?.dispose();
      }

      updateSub.unsubscribe();
      inputSub.unsubscribe();

      // complete
      inputProps$.complete();
      afterUpdate$.complete();
      afterInput$.complete();

      for (const sub of Object.values(propSubjects)) {
        sub.complete();
      }

      dispose$.next();
      dispose$.complete();

      children.length = 0;
      disposed = true;
    }

    return instance;
  };

  return { def, create };
}
