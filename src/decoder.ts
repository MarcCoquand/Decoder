import { Result } from './result';

/**
 * Decode data and check it's validity using Decoder. Useful when you want to
 * check that data from clients or other outgoing sources is valid.
 *
 * To create a decoder, use one of the primitive decoders provided as a static method.
 * Then call it's deocde method on the data you want to decode.
 *
 * ```
 * const idDecoder<{id: string}> = Decoder.object({id: Decoder.string})
 *
 * idDecoder.run("2913088") // Failure, must have a field id.
 *
 * const result = idDecoder.run({id: 2913088}) // OK
 *
 * // To access the result value
 * switch(result.type) {
 *   case "OK":
 *      doThingWithId(result.value)
 *   case "FAIL":
 *      // Or if it fails you can find the reason by accessing error
 *      throw new Error(result.error)
 * }
 * ```
 *
 */
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
   * Sets a default value to the decoder if it fails.
   *
   * ```
   * const nrDecoder = Decoder.number.withDefault(0)
   *
   * nrDecoder.run(5) // OK 5
   * nrDecoder.run('hi') // OK 0
   * ```
   */
  withDefault = <E>(value: T | E) =>
    new Decoder(data => {
      const result = this.decoder(data);
      if (Result.isOk(result)) return result;
      else return Result.ok(value);
    });

  /**
   * Add an extra predicate to the decoder.
   *
   * @param {function} predicate A predicate function to run on the decoded value
   * @param {function} failureMessage Optional failure message to run in case the
   *    predicate fails. Provides the data that the predicate checked.
   *
   * Example:
   *
   * ```
   * const naturalNumber = Decoder.number.satisfy({
   *  predicate: n => n>0
   *  failureMessage: data => `data is not a natural number > 0, it is: ${data}`
   * })
   * naturalNumber.run(5) // OK, 5
   * naturalNumber.run(-1) // FAIL
   * ```
   */
  satisfy = ({
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
            else return Result.fail(`Predicate failed`);
          }
        case 'FAIL':
          return result;
      }
    });

  /**
   * Attempt two decoders.
   *
   * Example:
   * ```
   * type Names = "Jack" | "Sofia"
   * const enums: Decoder<Names> = Decoder.literal("Jack").or(Decoder.literal("Sofia"))
   *
   * enums.run("Jack") // OK
   * enums.run("Sofia") // OK
   * enums.run("Josefine") // Fail
   * ```
   */
  or = <S>(decoder: Decoder<S>): Decoder<T | S> =>
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
      // We cast Result<T,string> | Result<S, string> to
      // Result<T | S, string>
    }) as unknown) as (data: any) => Result<T | S, string>);

  private constructor(decoder: (data: any) => Result<T, string>) {
    this.decoder = decoder;
  }

  /**
   * Run a decoder on data. The result is a [discriminated union](https://www.typescriptlang.org/docs/handbook/advanced-types.html#discriminated-unions). In order to
   * access the result you must explicitly handle the failure case with a switch.
   *
   * Example:
   *
   * ```
   * const userCredentials: Decoder<Credentials> = Decoder.object({...})
   *
   * //... Somewhere else
   * const result = userCredentials.run(request.query)
   * switch(result.type) {
   *    case "OK":
   *       login(result.value)
   *    case "FAIL":
   *        throw new Error(result.error)
   * }
   * ```
   */
  run = (data: any) => {
    return this.decoder(data).get;
  };

  /**
   * Create decoders that are dependent on previous results.
   *
   * Example:
   *
   * ```
   * const version = Decoder.object({
   *  version: Decoder.literalNumber(0).or(Decoder.literalNumber(1)),
   * });
   * const api = ({ version }: { version: 0 | 1 }): Decoder<{...}> => {
   *   switch (version) {
   *      case 0:
   *        return myFirstDecoder;
   *      case 1:
   *        return mySecondDecoder;
   * }
   * };
   * const versionedApi = version.andThen(api);
   * ```
   */
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
   * A decoder that accepts numbers. It will succeed on both string numbers and
   * numbers.
   *
   * Example:
   *
   * ```
   * Decoder.number.run(5) // OK
   * Decoder.number.run('5') // OK
   * Decoder.number.run('hi') // FAIL
   * ```
   */
  public static number: Decoder<number> = new Decoder((data: any) => {
    if (isNaN(data)) {
      return Result.fail(`Not a number`);
    } else if (typeof data === 'string') {
      return Result.ok(parseInt(data));
    } else if (typeof data === 'number') {
      return Result.ok(data);
    } else {
      return Result.fail(`Not a number`);
    }
  });

  /**
   * A decoder that accepts undefined and null. Useful in conjunction with other
   * decoders.
   *
   * Example:
   *
   * ```
   * Decoder.null.run(null) // OK, value is null
   * Decoder.null.run(undefined) // OK, value is null
   * Decoder.null.run(5) // FAIL, value is not null or undefined
   *
   * const optionalNumberDecoder = Decoder.number.or(Decoder.null)
   * optionalNumberDecoder.run(5) // OK
   * optionalNumberDecoder.run(undefined) // OK
   * optionalNumberDecoder.run('hi') // FAIL
   *```
   */
  public static null: Decoder<null> = new Decoder(data => {
    if (data === null || data === undefined) return Result.ok(null);
    else {
      return Result.fail(`Not null or undefined`);
    }
  });

  /**
   * Decodes the exact string and sets it to a string literal type. Useful for
   * parsing (discriminated) unions.
   * ```
   * type Names = "Jack" | "Sofia"
   * const enums: Decoder<Names> = Decoder.literalString("Jack").or(Decoder.literalString("Sofia"))
   * ```
   */
  public static literalString = <T extends string>(str: T): Decoder<T> =>
    new Decoder(data => {
      const result = Decoder.string.decoder(data);
      switch (result.get.type) {
        case 'OK':
          if (result.get.value === str)
            return (Result.ok(str) as unknown) as Result<T, string>;
          else return Result.fail(`String is not ${str}`);
        case 'FAIL':
          return Result.fail(result.get.error);
      }
    });

  /**
   * Decodes the exact number and sets it to a number literal type. Useful for
   * parsing (discriminated) unions.
   * ```
   * type Versions = Decoder<1 | 2>
   * const versionDecoder: Decoder<Versions> = Decoder.literalNumber(1).or(Decoder.literalNumber(2))
   * ```
   */
  public static literalNumber = <T extends number>(number: T): Decoder<T> =>
    new Decoder(data => {
      const result = Decoder.number.decoder(data);
      switch (result.get.type) {
        case 'OK':
          if (result.get.value === number)
            return (Result.ok(number) as unknown) as Result<T, string>;
          else return Result.fail(`Number is not ${number}`);
        case 'FAIL':
          return Result.fail(result.get.error);
      }
    });

  /**
   * Decodes a string.
   *
   * ```
   * Decoder.string.run('hi') // OK
   * Decoder.string.run(5) // Fail
   * ```
   */
  public static string: Decoder<string> = new Decoder((data: any) =>
    typeof data === 'string' ? Result.ok(data) : Result.fail(`Not a string`)
  );

  /**
   * Create a decoder that always fails, useful in conjunction with andThen.
   */
  public static fail = <T>(message: string): Decoder<T> =>
    new Decoder(() => Result.fail(message));

  /**
   * Create a decoder that always suceeds, useful in conjunction with andThen
   */
  public static ok = <T>(value: T): Decoder<T> =>
    new Decoder(() => Result.ok(value));

  /**
   * Create an array decoder given a decoder for the elements.
   *
   * ```
   * Decoder.array(Decoder.string).run(['hello','world']) // OK
   * Decoder.array(Decoder.string).run(5) // Fail
   * ```
   */
  public static array = <T>(decoder: Decoder<T>): Decoder<T[]> =>
    new Decoder((data: any) => {
      if (Array.isArray(data)) {
        return Result.merge(data.map(item => decoder.decoder(item)));
      } else return Result.fail(`Not an array`);
    });

  /**
   * Create a decoder for booleans.
   *
   * ```
   * Decoder.boolean.run(true) // succeeds
   * Decoder.boolean.run(1) // fails
   * ```
   */
  public static boolean: Decoder<boolean> = new Decoder(data => {
    if (typeof data === 'boolean') return Result.ok(data);
    else return Result.fail(`Not a boolean`);
  });

  /**
   * Decode a specific field in an object using a given decoder.
   *
   * ```
   * const versionDecoder = Decoder.field("version", Decoder.number)
   *
   * versionDecoder.run({version: 5}) // OK
   * versionDecoder.run({name: "hi"}) // fail
   * ```
   *
   */
  public static field = <T>(
    fieldName: string,
    decoder: Decoder<T>
  ): Decoder<T> =>
    new Decoder(data => {
      if (typeof data === 'object' && data !== null) {
        return decoder.decoder(data[fieldName]);
      } else {
        return Result.fail(`Data is not an object`);
      }
    });

  /**
   * Create a decoder for an object T. Will currently go through each field and
   * collect all the errors but in the future it might fail on first.
   *
   * @param object [Mapped type](https://www.typescriptlang.org/docs/handbook/advanced-types.html#mapped-types),
   *   an object containing only decoders for each field. For example
   *    `{name: Decoder.string}`
   *
   * ```
   * interface User {
   *    name: string
   *    email: string
   * }
   *
   * // typechecks
   * const decodeUser<User> = Decoder.object({name: Decoder.string, email: Decoder.email})
   *
   * // will not typecheck, object must have the same field names as user and
   * // only contain decoders.
   * const decodeUser<User> = Decoder.object({nem: 'Hi'})
   * ```
   */
  public static object = <T>(
    object: { [P in keyof T]: Decoder<T[P]> }
  ): Decoder<T> =>
    new Decoder((data: any) => {
      if (typeof data === 'object' && data !== null) {
        const keyValue = Object.entries(object) as [string, Decoder<unknown>][];

        let obj: any = {};
        const errors = keyValue.reduce((errors, c) => {
          const [key, decoder] = c;
          const result = decoder.run(data[key]);
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
        return Result.fail(`Not an object`);
      }
    });
}
