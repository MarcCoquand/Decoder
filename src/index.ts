import { Result } from './result';
import { DecodeError, renderError, makeSingleError } from './error';
//utils
const isDate = (d: Date): boolean => !isNaN(d.getDate());
const isISO = (str: string): boolean =>
  str.match(/(\d{4})-(\d{2})-(\d{2})/) !== null;
const isInteger = (n: number): boolean => Math.floor(n) === n && n !== Infinity;
const isStringNumber = (n: string): boolean =>
  n.length !== 0 && n.match(/^[+-]?\d+(\.\d+)?$/) !== null;
type NonEmptyArray<T> = [T, ...T[]];

export class ValidationFailedError extends Error {
  public error: string;
  constructor(error: string) {
    super();
    this.error = error;
  }
}

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
  private decoder: (data: any) => Result<T, DecodeError>;

  /**
   * Transform a decoder from T to S.
   *
   * Example:
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
   * const nrDecoder = Decoder.number.default(0)
   *
   * nrDecoder.run(5) // OK 5
   * nrDecoder.run('hi') // OK 0
   * ```
   */
  default = <E>(value: T | E) =>
    new Decoder(data => {
      const result = this.decoder(data);
      if (Result.isOk(result)) return result;
      else return Result.ok(value);
    });

  private static createOneOf = <T>(decoders: Decoder<T>[]): Decoder<T> =>
    new Decoder(data => {
      let next: Decoder<T>;
      const error = { message: 'Not decoded since', next: [] } as DecodeError;
      for (next of decoders) {
        const result = next.decoder(data).get;
        switch (result.type) {
          case 'OK':
            return Result.ok(result.value);
          case 'FAIL':
            error.next.push({
              message: `| ${result.error.message}`,
              next: result.error.next,
            });
        }
      }
      return Result.fail(error);
    });
  /**
   * Attempt multiple decoders in order until one succeeds. Takes a non-empty
   * array of various decoders. The type signature is informally:
   * ```
   * oneOf = (decoders: [Decoder<A>, Decoder<B>, ...]) => Decoder<A | B | ...>
   * ```
   *
   * Example:
   * ```
   * const enums: Decoder<"Jack" | "Sofia"> = Decoder.oneOf([
   *    Decoder.literalString("Jack"),
   *    Decoder.literalString("Sofia")
   * ])
   * enums.run("Jack") // OK
   * enums.run("Sofia") // OK
   * enums.run("Josefine") // Fail
   * ```
   */
  public static oneOf = <T extends Decoder<any>>(
    decoders: NonEmptyArray<T>
  ): Decoder<T extends Decoder<infer R> ? R : never> =>
    Decoder.createOneOf(decoders);

  private constructor(decoder: (data: any) => Result<T, DecodeError>) {
    this.decoder = decoder;
  }

  /**
   * Run a decoder on data. The result is a [discriminated union](https://www.typescriptlang.org/docs/handbook/advanced-types.html#discriminated-unions).    *
   *
   * Example:
   * ```
   * const userCredentials: Decoder<Credentials> = Decoder.object({...})
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
    const result = this.decoder(data);

    return result.mapError(
      error => `Error(s) decoding data:\n${renderError(error)}`
    ).get;
  };

  /**
   * Run a decoder on data. It will either succeed and yield the value or throw
   * an ValidationFailed error
   */
  guard = (data: any) => {
    const result = this.decoder(data).mapError(
      error => `Error(s) decoding data:\n${renderError(error)}`
    ).get;

    if (result.type === 'OK') return result.value;
    else throw new ValidationFailedError(result.error);
  };

  /**
   * Create decoders that is dependent on previous results.
   *
   * Example:
   * ```
   * const version = Decoder.field('version, Decoder.number)
   * const api = ({ version }: { version: number }): Decoder<{...}> => {
   *   switch (version) {
   *      case 0:
   *        return myFirstDecoder;
   *      case 1:
   *        return mySecondDecoder;
   *      default:
   *        return Decoder.fail('Version ${version} not supported')
   * }
   * };
   * const versionedApi = version.then(api);
   * ```
   */
  then = <S>(dependentDecoder: (res: T) => Decoder<S>): Decoder<S> =>
    new Decoder(data => {
      const result = this.decoder(data);
      switch (result.get.type) {
        case 'OK':
          return dependentDecoder(result.get.value).decoder(data);
        case 'FAIL':
          return Result.fail(result.get.error);
      }
    });

  /**
   * Add an extra predicate to the decoder. Optionally add a failure message
   * that overrides the earlier failure message.
   *
   * Example:
   * ```
   * const naturalNumber = Decoder.number.satisfy({
   *  predicate: n => n>0
   *  failureMessage: `Not a natural number`
   * })
   * naturalNumber.run(5) // OK, 5
   * naturalNumber.run(-1) // FAIL, Not a natural number
   * ```
   */
  satisfy = ({
    predicate,
    failureMessage,
  }: {
    predicate: (arg: T) => boolean;
    failureMessage?: string;
  }): Decoder<T> =>
    this.then(value => {
      if (predicate(value)) {
        return Decoder.ok(value);
      } else {
        const message = failureMessage
          ? failureMessage
          : `Not fulfilled predicate`;
        return Decoder.fail(message);
      }
    });

  /**
   * A decoder for numbers.
   *
   * Example:
   * ```
   * Decoder.number.run(5) // OK
   * Decoder.number.run('5') // OK
   * Decoder.number.run('hi') // FAIL
   * ```
   */
  public static number: Decoder<number> = new Decoder((data: any) => {
    switch (typeof data) {
      case 'number':
        if (!isNaN(data)) return Result.ok(data);
        return Result.fail(makeSingleError('Not a number'));
      case 'string':
        if (isStringNumber(data)) return Result.ok(parseFloat(data));
        return Result.fail(makeSingleError('Not a number'));
      default:
        return Result.fail(makeSingleError('Not a number'));
    }
  });

  /**
   * A decoder for iso dates. Use `Decoder.date` to also support timestamps.
   *
   * Example:
   * ```
   * Decoder.date.run(new Date()) // OK
   * Decoder.date.run("abra") // FAIL
   * Decoder.date.run("2020-01-13T18:27:35.817Z") // OK
   * Decoder.date.run(123) // FAIL
   * Decoder.date.run("Mon, 13 Jan 2020 18:28:05 GMT") // FAIL, format is not supported
   * ```
   */
  public static isoDate: Decoder<Date> = new Decoder((data: any) => {
    switch (Object.prototype.toString.call(data)) {
      case '[object Date]':
        if (isDate(data)) return Result.ok(data);
        return Result.fail(makeSingleError('Badly formatted date object'));
      case '[object String]':
        return isISO(data)
          ? Result.ok(new Date(data))
          : Result.fail(makeSingleError(`Not a ISO date`));
      default:
        return Result.fail(makeSingleError(`Not a ISO date`));
    }
  });

  /**
   * A decoder for timestamps.
   *
   * Example:
   * ```
   * Decoder.date.run(123) // OK (Timestamp)
   * Decoder.date.run(new Date()) // FAIL
   * Decoder.date.run("abra") // FAIL
   * Decoder.date.run("2020-01-13T18:27:35.817Z") // FAIL
   * Decoder.date.run("Mon, 13 Jan 2020 18:28:05 GMT") // FAIL
   * ```
   */
  public static timestamp: Decoder<number> = Decoder.number.satisfy({
    predicate: isInteger,
    failureMessage: 'Not a timestamp',
  });

  /**
   * A decoder for dates. Decoding UTC time that is formatted using
   * `toUTCString()` is not supported; Javascript's date parser parses UTC strings
   * wrong.
   *
   * Example:
   * ```
   * Decoder.date.run(123) // OK (Timestamp)
   * Decoder.date.run(new Date()) // OK
   * Decoder.date.run("abra") // FAIL
   * Decoder.date.run("2020-01-13T18:27:35.817Z") // OK
   * Decoder.date.run("Mon, 13 Jan 2020 18:28:05 GMT") // FAIL, format is not supported
   * ```
   */
  public static date: Decoder<Date> = Decoder.oneOf([
    Decoder.timestamp.map(n => new Date(n)),
    Decoder.isoDate,
  ]);

  /**
   * A decoder that accepts undefined and null. Useful in conjunction with other
   * decoders.
   *
   * Example:
   * ```
   * Decoder.empty.run(null) // OK, value is undefined
   * Decoder.empty.run(undefined) // OK, value is undefined
   * Decoder.empty.run(5) // FAIL, value is not null or undefined
   *```
   */
  public static empty: Decoder<undefined> = new Decoder(data =>
    data === null || data === undefined
      ? Result.ok(undefined)
      : Result.fail(makeSingleError('Not null or undefined'))
  );

  /**
   * Decodes a string.
   *
   * Example:
   * ```
   * Decoder.string.run('hi') // OK
   * Decoder.string.run(5) // Fail
   * ```
   */
  public static string: Decoder<string> = new Decoder((data: any) =>
    typeof data === 'string'
      ? Result.ok(data)
      : Result.fail(makeSingleError('Not a string'))
  );

  /**
   * Decodes the exact string and sets it to a string literal type. Useful for
   * parsing unions.
   *
   * Example:
   * ```
   * const jackOrSofia: Decoder<'Jack' | 'Sofia'> = Decoder.oneOf([
   *    Decoder.literalString('Jack'),
   *    Decoder.literalString('Sofia')
   * ])
   * jackOrSofia.run('Jack') // OK
   * jackOrSofia.run('Josephine') // FAIL
   * ```
   */
  public static literalString = <T extends string>(str: T): Decoder<T> =>
    Decoder.string.then(incomingStr =>
      incomingStr === str ? Decoder.ok(str) : Decoder.fail(`Not ${str}`)
    );

  /**
   * Takes a decoder and returns an optional decoder.
   *
   * Example:
   * ```
   * const optionalNumber = Decoder.optional(Decoder.number)
   * optionalNumber.run(5) //OK
   * optionalNumber.run(undefined) //OK
   * optionalNumber.run(null) //OK
   * optionalNumber.run('hi') //FAIL
   * ```
   */
  public static optional = <T>(decoder: Decoder<T>): Decoder<T | undefined> =>
    Decoder.oneOf([Decoder.empty, decoder]);

  /**
   * Create a decoder that always fails with a message.
   */
  public static fail = <T>(message: string): Decoder<T> =>
    new Decoder(() => Result.fail(makeSingleError(message)));

  /**
   * Create a decoder that always suceeds and returns T.
   */
  public static ok = <T>(value: T): Decoder<T> =>
    new Decoder(() => Result.ok(value));

  /**
   * Decodes the exact number and sets it to a number literal type.
   *
   * Example:
   * ```
   * const versionDecoder: Decoder<1 | 2> = Decoder.oneOf([
   *    Decoder.literalNumber(1),
   *    Decoder.literalNumber(2)
   * ])
   *
   * versionDecoder.run(1) // OK
   * versionDecoder.run(3) // FAIL
   * ```
   */
  public static literalNumber = <T extends number>(number: T): Decoder<T> =>
    Decoder.number.then(incomingNumber =>
      incomingNumber === number
        ? Decoder.ok(number)
        : Decoder.fail(`Not ${number}`)
    );

  /**
   * Create an array decoder given a decoder for the elements.
   *
   * Example:
   * ```
   * Decoder.array(Decoder.string).run(['hello','world']) // OK
   * Decoder.array(Decoder.string).run(5) // Fail
   * ```
   */
  public static array = <T>(decoder: Decoder<T>): Decoder<T[]> =>
    new Decoder((data: any) => {
      if (Array.isArray(data)) {
        return Result.merge(data.map(item => decoder.decoder(item)));
      } else return Result.fail(makeSingleError('Not an array'));
    });

  /**
   * Create a decoder for booleans.
   *
   * Example:
   * ```
   * Decoder.boolean.run(true) // succeeds
   * Decoder.boolean.run('false') // succeeds
   * Decoder.boolean.run(1) // fails
   * ```
   */
  public static boolean: Decoder<boolean> = new Decoder(data => {
    switch (typeof data) {
      case 'boolean':
        return Result.ok(data);
      case 'string':
        switch (data) {
          case 'true':
            return Result.ok(true);
          case 'false':
            return Result.ok(false);
          default:
            return Result.fail(makeSingleError('Not a boolean'));
        }
      default: {
        return Result.fail(makeSingleError('Not a boolean'));
      }
    }
  });

  /**
   * Decode the value of a specific key in an object using a given decoder.
   *
   * Example:
   * ```
   * const versionDecoder = Decoder.field("version", Decoder.number)
   *
   * versionDecoder.run({version: 5}) // OK, 5
   * versionDecoder.run({name: "hi"}) // fail
   * ```
   *
   */
  public static field = <T>(key: string, decoder: Decoder<T>): Decoder<T> =>
    new Decoder(data => {
      if (typeof data === 'object' && data !== null) {
        return decoder
          .decoder(data[key])
          .mapError(error => makeSingleError(`Key '${key}', ${error.message}`));
      } else {
        return Result.fail(makeSingleError('Not an object'));
      }
    });

  /**
   * Create a decoder for a type T.
   *
   * Argument "object" is a [Mapped
   * type](https://www.typescriptlang.org/docs/handbook/advanced-types.html#mapped-types),
   * an object containing only decoders for each field.
   * ```typescript
   * {name: Decoder.string} // Ok parameter
   * {name: Decoder.string, email: 'email@email'} // Type error, email must be decoder
   * ```
   *
   * Example:
   * ```
   * interface User {
   *    name: string
   *    email: string
   * }
   *
   * // typechecks
   * const decodeUser: Decoder<User> = Decoder.object({name: Decoder.string, email: Decoder.email})
   * decodeUser.run({name: "Jenny", email: "fakemail@fake.com"}) // OK
   * decodeUser.run({nm: "Bad"}) // FAIL
   *
   * // will not typecheck, object must have the same field names as user and
   * // only contain decoders.
   * const decodeUser: Decoder<User> = Decoder.object({nem: 'Hi'})
   * ```
   *
   */
  public static object = <T>(
    object: { [K in keyof T]: Decoder<T[K]> }
  ): Decoder<T> =>
    new Decoder((data: any) => {
      if (typeof data === 'object' && data !== null) {
        let obj: any = {};
        const error: DecodeError = {
          message: 'Could not decode object',
          next: [],
        };
        let key: keyof T;
        for (key in object) {
          const result = object[key].decoder(data[key]).mapError(error => ({
            message: `- Key '${key}', ${error.message}`,
            next: error.next,
          })).get;
          switch (result.type) {
            case 'OK':
              obj[key] = result.value;
              break;
            case 'FAIL':
              error.next.push(result.error);
              break;
          }
        }
        if (error.next.length === 0) return Result.ok(obj as T);
        return Result.fail(error);
      } else {
        return Result.fail(makeSingleError('Not an object'));
      }
    });
}

/**
 * Deduce the return type of a decoder. If there is a deep nesting of objects
 * the type will be inferred but will not display correctly in the signature.
 *
 * Example:
 * ```
 * const paramDecoder = Decoder.object({
 *  body: userDecoder
 * })
 * const handleRequest = (params: DecodedValue<typeof paramDecoder>) => {
 *  // params.body is inferred
 * }
 * ```
 *
 */
export type DecodedValue<T> = T extends Decoder<infer U> ? U : never;
