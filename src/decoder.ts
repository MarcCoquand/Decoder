import { Result } from './result';

export class Decoder<T> {
  private decoder: (data: any) => Result<T, string>;

  /**
   * Transform a decoder. Useful for narrowing data types. For example:
   * ```
   * const setDecoder: Decoder<Set<number>> =
   *      Decoder.array(Decoder.number).map(numberArray => new Set(numberArray))
   * ```
   */
  map = <S>(mapFunction: (arg: T) => S): Decoder<S> =>
    new Decoder(data => this.decoder(data).map(res => mapFunction(res)));

  /**
   * Turns a decoder into a nullable one. For example:
   *
   * ```
   * const optionalNumber = Decoder.number.nullable()
   *
   * optionalNumber.decode(null) // OK
   * optionalNumber.decode(undefined) // OK, value is null
   * optionalNumber.decode(5) // OK, value is 5
   * optionalNumber.decode('hi') // FAIL
   *```
   */
  nullable = (): Decoder<T | null> =>
    new Decoder(data => {
      if (data === null || data === undefined) return Result.ok(null);
      else {
        return this.decoder(data);
      }
    });

  /**
   * Sets a default value to the decoder.
   *
   * ```
   * const nrDecoder = Decoder.number.withDefault(0)
   *
   * nrDecoder.decode(5) // OK 5
   * nrDecoder.decoder('hi') // OK 0
   * ```
   */
  withDefault = <E>(value: T | E) =>
    new Decoder(data => {
      const result = this.decoder(data);
      if (Result.isOk(result)) return result;
      else return Result.ok(value);
    });

  /**
   * Add an extra predicate to the decoder. Optionally you can also add a custom
   * error message which gets shown in case of failure.
   *
   * ```
   * const naturalNumber = Decoder.number.withPredicate({
   *  predicate: n => n>0
   *  failureMessage: data => `data is not a natural number > 0, it is: ${data}`
   * })
   * naturalNumber.decode(5) // OK, 5
   * naturalNumber.decode(-1) // FAIL
   * ```
   */
  withPredicate = ({
    predicate,
    failureMessage,
  }: {
    predicate: (arg: T) => boolean;
    failureMessage?: (attemptedData: any) => string;
  }): Decoder<T> =>
    new Decoder(data => {
      const result = this.decoder(data);

      switch (result.get.type) {
        case 'OK':
          if (predicate(result.get.value)) {
            return result;
          } else {
            if (failureMessage !== undefined)
              return Result.fail(failureMessage(data));
            else return Result.fail(`Predicate failed on ${data}`);
          }
        case 'FAIL':
          return result;
      }
    });

  /**
   * Attempt two decoders.
   * ```
   * type Names = "Jack" | "Sofia"
   * const enums: Decoder<Names> = Decoder.literal("Jack").or(Decoder.literal("Sofia"))
   * ```
   */
  or = <S>(decoder: Decoder<S>): Decoder<T | S> =>
    // We cast Result<T,string> | Result<S, string> to
    // Result<T | S, string>
    new Decoder((((data: any) => {
      const res1 = this.decoder(data);
      switch (res1.get.type) {
        case 'OK':
          return res1;
        case 'FAIL':
          const res2 = decoder.decoder(data);
          switch (res2.get.type) {
            case 'OK':
              return res2;
            case 'FAIL':
              return Result.fail(
                `Failed to parse ${data}, got: ${res2.get.error}, and: ${res1.get.error}`
              );
          }
      }
    }) as unknown) as (data: any) => Result<T | S, string>);

  private constructor(decoder: (data: any) => Result<T, string>) {
    this.decoder = decoder;
  }

  decode = (data: any) => {
    return this.decoder(data).get;
  };

  andThen = <S>(dependentDecoder: (res: T) => Decoder<S>): Decoder<S> =>
    new Decoder(data => {
      const result = this.decoder(data);
      switch (result.get.type) {
        case 'OK':
          return dependentDecoder(result.get.value).decoder(data);
        case 'FAIL':
          return (result as unknown) as Result<S, string>;
      }
    });

  /**
   * Parses data and casts it to number.
   * It will succeed on '5' and 5
   */
  public static number: Decoder<number> = new Decoder((data: any) => {
    if (isNaN(data)) {
      return Result.fail(`Not a number, got ${data}`);
    } else if (typeof data === 'string') {
      return Result.ok(parseInt(data));
    } else if (typeof data === 'number') {
      return Result.ok(data);
    } else {
      return Result.fail(`Not a number, got ${data}`);
    }
  });

  /**
   * Decodes the exact string and sets it to a string literal type. Useful for
   * parsing (discriminated) unions.
   * ```
   * type Names = "Jack" | "Sofia"
   * const enums: Decoder<Names> = Decoder.literal("Jack").or(Decoder.literal("Sofia"))
   * ```
   */
  public static literal = <T extends string>(str: T): Decoder<T> =>
    new Decoder(data => {
      const result = Decoder.string.decoder(data);
      switch (result.get.type) {
        case 'OK':
          if (result.get.value === str)
            return (Result.ok(str) as unknown) as Result<T, string>;
          else return Result.fail(`String must be ${str}`);
        case 'FAIL':
          return Result.fail(result.get.error);
      }
    });

  public static string: Decoder<string> = new Decoder((data: any) =>
    typeof data === 'string'
      ? Result.ok(data)
      : Result.fail(`Not a string, got ${data}`)
  );

  public static array = <T>(of: Decoder<T>): Decoder<T[]> =>
    new Decoder((data: any) => {
      if (Array.isArray(data)) {
        return Result.merge(data.map(item => of.decoder(item)));
      } else return Result.fail(`Not an array: ${data}`);
    });

  public static boolean: Decoder<boolean> = new Decoder(data => {
    if (typeof data === 'boolean') return Result.ok(data);
    else return Result.fail(`Not a boolean: ${data}`);
  });

  public static field = <T>(
    fieldName: string,
    decoder: Decoder<T>
  ): Decoder<T> =>
    new Decoder(data => {
      if (typeof data === 'object' && data !== null) {
        return decoder.decoder(data[fieldName]);
      } else {
        return Result.fail(`Data is not an object, got: ${data}`);
      }
    });

  // Object is a mapped type.
  public static object = <T>(
    object: { [P in keyof T]: Decoder<T[P]> }
  ): Decoder<T> =>
    new Decoder((data: any) => {
      if (typeof data === 'object' && data !== null) {
        const keyValue = Object.entries(object) as [string, Decoder<unknown>][];

        let obj: any = {};
        const errors = keyValue.reduce((errors, c) => {
          const [key, decoder] = c;
          const result = decoder.decode(data[key]);
          switch (result.type) {
            case 'OK':
              obj[key] = result.value;
              return errors;
            case 'FAIL':
              return [...errors, result.error];
          }
        }, [] as string[]);

        if (errors.length === 0) return Result.ok(obj as T);

        return Result.fail(`Failed to parse, got errors: ${errors.join('\n')}`);
      } else {
        return Result.fail(`Not an object, got: ${data}`);
      }
    });
}
