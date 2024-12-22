import { OperatorFunction, Observable, scan, map, Subject, shareReplay, filter, BehaviorSubject, pipe } from 'rxjs';
import { DefaultOptions, IOptions } from './config';

type ExtractFirst<T> = T extends [infer U, any] ? U : never;
type ExtractSecond<T> = T extends [any, infer U] ? U : never;

export function incremental<T, LS extends [key: string, value: any][]>(
  split: (src: T) => LS,
  options?: Record<string, Partial<IOptions<string, any>>> | ((key: string) => Partial<IOptions<string, any>>)
): OperatorFunction<T, { [K in keyof LS]: Observable<ExtractSecond<LS[K]>> }> {
  return src$ => {
    let lastStreams: Map<string, { subject: Subject<any>; ob: Observable<any> }> = new Map();

    return new Observable(sub => {
      const inputSub = src$
        .pipe(
          map(list => {
            const oldGroups = lastStreams;
            const newGroups = new Map<string, T>();

            const listEntries = split(list);

            for (const [k, v] of listEntries) {
              if (newGroups.has(k)) throw new Error('keyBy must be unique, found duplicate key: ' + k);
              newGroups.set(k, v);
            }

            const toRemoveKeys = new Set<string>();
            const toCreateKeys = new Set<string>();
            const toUpdateKeys = new Set<string>();

            for (const k of oldGroups.keys()) {
              if (!newGroups.has(k)) toRemoveKeys.add(k);
              else toUpdateKeys.add(k);
            }

            for (const k of newGroups.keys()) {
              if (!oldGroups.has(k)) toCreateKeys.add(k);
            }

            const streams = new Map<string, { subject: Subject<any>; ob: Observable<any> }>();
            const orderedObs: Observable<any>[] = [];
            let streamsChanged = false;

            // remove old
            for (const k of toRemoveKeys) {
              const { subject } = oldGroups.get(k)!;
              subject.complete();
              streamsChanged = true;
            }

            // 按顺序创建 or 更新
            for (const [key, value] of listEntries) {
              // create
              if (toCreateKeys.has(key)) {
                const subject = new BehaviorSubject<T>(value);

                const ob = subject.pipe(
                  scan(
                    (lastInfos, newVal) => {
                      const getVersion =
                        (options ? (typeof options === 'function' ? options(key).getVersion : options[key]?.getVersion) : undefined) ??
                        DefaultOptions.getVersion;

                      const isEqual =
                        (options ? (typeof options === 'function' ? options(key).isEqual : options[key]?.isEqual) : undefined) ??
                        DefaultOptions.isEqual;

                      const useVersionCheck =
                        (options
                          ? typeof options === 'function'
                            ? options(key).useVersionCheck
                            : options[key]?.useVersionCheck
                          : undefined) ?? DefaultOptions.useVersionCheck;

                      let toCompareA: any;
                      let toCompareB: any;
                      let newVersion: any = undefined;

                      if (useVersionCheck) {
                        toCompareA = lastInfos.version;
                        newVersion = getVersion(newVal);
                        toCompareB = newVersion;
                      } else {
                        toCompareA = lastInfos.value;
                        toCompareB = newVal;
                      }

                      return { value: newVal, version: newVersion, changed: !isEqual(toCompareA, toCompareB) };
                    },
                    { value: null as any, version: null as any, changed: false }
                  ),
                  filter(({ changed }) => changed),
                  map(t => t.value),
                  shareReplay(1)
                );
                ob.subscribe();

                streams.set(key, { subject, ob });
                orderedObs.push(ob);

                streamsChanged = true;
              }

              // update
              else if (toUpdateKeys.has(key)) {
                const { subject, ob } = oldGroups.get(key)!;

                subject.next(value);
                streams.set(key, { subject, ob });
                orderedObs.push(ob);
              }
            }

            lastStreams = streams;

            return { orderedObs, streams, streamsChanged };
          }),
          filter(({ streamsChanged }) => streamsChanged),
          map(({ orderedObs }) => orderedObs)
        )
        .subscribe({
          next: obs => sub.next(obs as any),
          error: err => sub.error(err),
          complete: () => sub.complete(),
        });

      return () => {
        inputSub.unsubscribe();
        lastStreams.forEach(({ subject }) => subject.complete());
      };
    });
  };
}

export function incrementalList<T>(
  keyBy: (item: T) => string,
  options?: Partial<IOptions<string, T>>
): OperatorFunction<T[], Observable<T>[]> {
  return pipe(
    incremental(
      list => {
        return list.map(item => [keyBy(item), item] as const);
      },
      () => options || DefaultOptions
    )
  );
}
