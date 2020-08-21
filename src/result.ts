export class Result<T, E> {
  public get: { type: 'OK'; value: T } | { type: 'FAIL'; error: E };

  map = <V>(f: (value: T) => V): Result<V, E> => {
    switch (this.get.type) {
      case 'OK':
        return new Result({ type: 'OK', value: f(this.get.value) });

      case 'FAIL':
        return new Result({ type: 'FAIL', error: this.get.error });
    }
  };

  mapError = <V>(f: (value: E) => V): Result<T, V> => {
    switch (this.get.type) {
      case 'OK':
        return new Result({ type: 'OK', value: this.get.value });

      case 'FAIL':
        return new Result({ type: 'FAIL', error: f(this.get.error) });
    }
  };

  andThen = <V>(f: (value: T) => Result<V, E>) => {
    switch (this.get.type) {
      case 'OK':
        return f(this.get.value);
      case 'FAIL':
        return new Result({ type: 'FAIL', error: this.get.error });
    }
  };

  static merge = <T, E>(
    values: Result<T, E>[],
    addErrorIndex: (index: number, error: E) => E
  ): Result<T[], E[]> =>
    values.reduce((p, c, i) => {
      switch (p.get.type) {
        case 'OK':
          switch (c.get.type) {
            case 'OK':
              return Result.ok([...p.get.value, c.get.value]);
            case 'FAIL':
              return Result.fail([addErrorIndex(i, c.get.error)]);
          }
        case 'FAIL':
          switch (c.get.type) {
            case 'OK':
              return Result.fail(p.get.error);
            case 'FAIL':
              return Result.fail([
                ...p.get.error,
                addErrorIndex(i, c.get.error),
              ]);
          }
      }
    }, Result.ok([] as T[]) as Result<T[], E[]>);

  static ok = <T, E>(value: T): Result<T, E> =>
    new Result({ type: 'OK', value });
  static fail = <T, E>(error: E): Result<T, E> =>
    new Result({ type: 'FAIL', error });

  static isOk = <T, E>(value: Result<T, E>) => value.get.type === 'OK';
  static isFail = <T, E>(value: Result<T, E>) => value.get.type === 'FAIL';
  constructor(value: { type: 'OK'; value: T } | { type: 'FAIL'; error: E }) {
    this.get = value;
  }
}
