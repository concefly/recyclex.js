export type Blueprint<P extends Record<string, any> = any> = {
  comp: IComponentDefinition<P>;
  props: P;
  key: string;
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

export type ISetupCallback<P extends Record<string, any>> = (
  initProps: P,
  ctx: {
    onBeforeUpdateCB: IOnBeforeUpdateCB<P>;
    onUpdateCB: IOnUpdateCB<P>;
    onAfterUpdateCB: IOnAfterUpdateCB<P>;
  }
) => IOnDisposeCB;

export interface IComponentDefinition<P extends Record<string, any>> {
  defaultProps: P;
  controllers?: IController[];
  setup: ISetupCallback<P>;
}

export interface IComponentInstance<P extends Record<string, any>> {
  key: string;

  update(newProps: P): void;
  dispose(): void;
}

export function blueprint<P extends Record<string, any>>(comp: IComponentDefinition<P>, props: P, key: string): Blueprint<P> {
  return { comp, props, key };
}

export function defineComponent<P extends Record<string, any>>(def: IComponentDefinition<P>) {
  const create = (props: P = def.defaultProps, key: string) => {
    const ctx: Parameters<ISetupCallback<P>>[1] = {
      onBeforeUpdateCB: () => {},
      onUpdateCB: () => {},
      onAfterUpdateCB: () => {},
    };

    const onDisposeCB = def.setup(props, ctx);

    const children: IComponentInstance<any>[] = [];

    const commonKeys = new Set<string>();
    const changes = new Map<string, any>();

    let oldProps = props;

    const update = (newProps: P) => {
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

      const nextBps = ctx.onUpdateCB?.(newProps, changes) ?? [];

      const _toDisposeKeys = new Set<string>();
      const _toCreateKeys = new Set<string>();
      const _toUpdateKeys = new Set<string>();
    };

    const dispose = () => {
      if (def.controllers) {
        for (const controller of def.controllers) {
          controller.onDestroy?.();
        }
      }

      for (let i = children.length - 1; i >= 0; i--) {
        children[i].dispose();
      }

      children.length = 0;

      onDisposeCB();
    };

    const instance: IComponentInstance<P> = {
      key,
      update,
      dispose,
    };

    return instance;
  };

  return { create };
}
