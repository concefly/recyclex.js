export type IOptions<_K, V> = {
  isEqual: (a?: V, b?: V) => boolean;
  getVersion: (v: V) => string | number;
  useVersionCheck: boolean;
};

export const DefaultOptions: IOptions<string, any> = {
  isEqual: (a, b) => a === b,
  getVersion: () => 0,
  useVersionCheck: false,
};
