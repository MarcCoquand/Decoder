import { Result } from './result';
import { DecodeError, makeSingleError, formatIndex } from './error';
//utils
const isDate = (d: Date): boolean => !isNaN(d.getDate());
const isISO = (str: string): boolean =>
  str.match(/(\d{4})-(\d{2})-(\d{2})/) !== null;
const isInteger = (n: number): boolean => Math.floor(n) === n && n !== Infinity;
var numberReSnippet =
  '(?:NaN|-?(?:(?:\\d+|\\d*\\.\\d+)(?:[E|e][+|-]?\\d+)?|Infinity))';
var matchOnlyNumberRe = new RegExp('^(' + numberReSnippet + ')$');

const isStringNumber = (n: string): boolean =>
  n.length !== 0 && n.match(matchOnlyNumberRe) !== null;

export { DecodeError };
export class ValidationFailedError extends Error {
  public error: DecodeError;
  constructor(error: DecodeError) {
    super(`Decoding value failed: ${JSON.stringify(error)}`);
    this.error = error;
    Object.setPrototypeOf(this, ValidationFailedError.prototype);
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
    new Decoder((data) => this.decoder(data).map((res) => mapFunction(res)));

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
    new Decoder((data) => {
      const result = this.decoder(data);
      if (Result.isOk(result)) return result;
      else return Result.ok(value);
    });

  private static createOneOf = <T>(decoders: Decoder<T>[]): Decoder<T> =>
    new Decoder((data) => {
      let next: Decoder<T>;
      let errors: DecodeError = [];
      for (next of decoders) {
        const result = next.decoder(data).get;
        switch (result.type) {
          case 'OK':
            return Result.ok(result.value);
          case 'FAIL':
            if (Array.isArray(result.error) && Array.isArray(errors))
              errors = [...errors, ...result.error] as DecodeError;
            else (errors as DecodeError[]).push(result.error);
        }
      }
      return Result.fail(errors as DecodeError);
    });
  /**
   * Attempt multiple decoders in order until one succeeds. The type signature is informally:
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
    decoders: T[]
  ): Decoder<T extends Decoder<infer R> ? R : never> => {
    if (decoders.length === 0)
      return (Decoder.ok as unknown) as Decoder<
        T extends Decoder<infer R> ? R : never
      >;
    return Decoder.createOneOf(decoders);
  };

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
  run = (data: any) => this.decoder(data).get;

  /**
   * Run a decoder on data. It will either succeed and yield the value or throw
   * an ValidationFailed error
   */
  guard = (data: any) => {
    const result = this.decoder(data).get;

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
    new Decoder((data) => {
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
    this.then((value) => {
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
        return Result.fail(makeSingleError('Not a number', data));
      case 'string':
        if (isStringNumber(data)) return Result.ok(parseFloat(data));
        return Result.fail(makeSingleError('Not a number', data));
      default:
        return Result.fail(makeSingleError('Not a number', data));
    }
  });

  /**
   * A decoder for iso dates. Use `Decoder.date` to also support timestamps.
   *
   * Example:
   * ```
   * Decoder.isoDate.run(new Date()) // OK
   * Decoder.isoDate.run("abra") // FAIL
   * Decoder.isoDate.run("2020-01-13T18:27:35.817Z") // OK
   * Decoder.isoDate.run(123) // FAIL
   * Decoder.isoDate.run("Mon, 13 Jan 2020 18:28:05 GMT") // FAIL, format is not supported
   * ```
   */
  public static isoDate: Decoder<Date> = new Decoder((data: any) => {
    switch (Object.prototype.toString.call(data)) {
      case '[object Date]':
        if (isDate(data)) return Result.ok(data);
        return Result.fail(
          makeSingleError('Badly formatted date object', data)
        );
      case '[object String]':
        return isISO(data)
          ? Result.ok(new Date(data))
          : Result.fail(makeSingleError(`Not a ISO date`, data));
      default:
        return Result.fail(makeSingleError(`Not a ISO date`, data));
    }
  });

  /**
   * A decoder for timestamps.
   *
   * Example:
   * ```
   * Decoder.timestamp.run(123) // OK (Timestamp)
   * Decoder.timestamp.run(new Date()) // FAIL
   * Decoder.timestamp.run("abra") // FAIL
   * Decoder.timestamp.run("2020-01-13T18:27:35.817Z") // FAIL
   * Decoder.timestamp.run("Mon, 13 Jan 2020 18:28:05 GMT") // FAIL
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
    Decoder.timestamp.map((n) => new Date(n)),
    Decoder.isoDate,
  ]);

  /**
   * A decoder that accepts undefined.
   *
   * Example:
   * ```
   * Decoder.undefined.run(null) // FAIL
   * Decoder.undefined.run(5) // FAIL
   * Decoder.undefined.run(undefined) // OK
   *```
   */
  public static undefined: Decoder<undefined> = new Decoder((data) =>
    data === undefined
      ? Result.ok(data)
      : Result.fail(makeSingleError('Not undefined', data))
  );

  /**
   * A decoder that accepts null.
   *
   * Example:
   * ```
   * Decoder.null.run(undefined) // FAIL
   * Decoder.null.run(5) // FAIL
   * Decoder.null.run(null) // OK
   *```
   */
  public static null: Decoder<null> = new Decoder((data) =>
    data === null
      ? Result.ok(data)
      : Result.fail(makeSingleError('Not null', data))
  );
  /**
   * A decoder that accepts a Buffer.
   *
   * Example:
   * ```
   * Decoder.buffer.run(undefined) // FAIL
   * Decoder.buffer.run(5) // FAIL
   * Decoder.buffer.run(Buffer.from('Hello world')) // OK
   * Decoder.buffer.run(<Buffer 68 65 6c 6c 6f>) // OK
   *```
   */
  public static buffer: Decoder<Buffer> = new Decoder((data) =>
    Buffer.isBuffer(data)
      ? Result.ok(data)
      : Result.fail(makeSingleError('Not Buffer', data))
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
      : Result.fail(makeSingleError('Not a string', data))
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
    Decoder.string.then((incomingStr) =>
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
    Decoder.oneOf([
      Decoder.undefined,
      Decoder.null.map((_) => undefined),
      decoder,
    ]);

  /**
   * Create a decoder that always fails with a message.
   */
  public static fail = <T>(message: string): Decoder<T> =>
    new Decoder(() => Result.fail({ error: message }));

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
    Decoder.number.then((incomingNumber) =>
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
        return Result.merge(
          data.map((item) => decoder.decoder(item)),
          (index, e) => formatIndex(index, e)
        );
      } else return Result.fail(makeSingleError('Not an array', data));
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
  public static boolean: Decoder<boolean> = new Decoder((data) => {
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
            return Result.fail(makeSingleError('Not a boolean', data));
        }
      default: {
        return Result.fail(makeSingleError('Not a boolean', data));
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
    new Decoder((data) => {
      if (typeof data === 'object' && data !== null) {
        return decoder.decoder(data[key]).mapError((e) => ({ [key]: e }));
      } else {
        return Result.fail(makeSingleError('Not an object', data));
      }
    });

  /**
   * A decoder that accepts anything.
   */
  public static any: Decoder<unknown> = new Decoder((data) => Result.ok(data));

  /**
   * run a decoder on each item in an array, collecting the amount of successful and failed decodings.
   *
   * ```
   * example:
   *
   * Decoder.number.sequence([1,3,4,"hello"]) // => {successful: [1,2,3], failed: ["hello"]}
   * ```
   */
  public sequence = (
    array: unknown[]
  ): { successful: T[]; failed: unknown[] } => {
    const failed = [];
    const successful = [];
    for (const item of array) {
      const result = this.run(item);
      switch (result.type) {
        case 'OK':
          successful.push(result.value);
          break;
        case 'FAIL':
          failed.push(item);
      }
    }
    return { failed, successful };
  };

  /**
   * Decode values of an object where the keys are unknown.
   *
   * Example:
   * ```
   * const userDecoder = Decoder.object({age: Decoder.number})
   * const usersDecoder = Decoder.dict(userDecoder)
   *
   * usersDecoder.run({emelie: {age: 32}, bob: {age: 50}}) // OK, {emelie: {age: 32}, bob: {age: 50}}
   * usersDecoder.run({name: 'emelie', age: 32}) // fail
   * ```
   *
   */
  public static dict = <T>(
    decoder: Decoder<T>
  ): Decoder<{ [key: string]: T }> =>
    new Decoder((data) => {
      if (typeof data === 'object' && data !== null) {
        let decoded: any = {};
        let errors: DecodeError = {};
        for (const key in data) {
          const result = decoder.run(data[key]);
          switch (result.type) {
            case 'OK':
              decoded[key] = result.value;
              break;
            case 'FAIL':
              errors[key] = result.error;
              break;
          }
        }
        if (Object.keys(errors).length === 0)
          return Result.ok(decoded as { [key: string]: T });
        return Result.fail(errors);
      } else {
        return Result.fail(makeSingleError('Not an object', data));
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
        let errors: DecodeError = {};
        let key: keyof T;
        for (key in object) {
          const result = object[key].decoder(data[key]).get;
          switch (result.type) {
            case 'OK':
              obj[key] = result.value;
              break;
            case 'FAIL':
              errors[key] = result.error;
              break;
          }
        }
        if (Object.keys(errors).length === 0) return Result.ok(obj as T);
        return Result.fail(errors);
      } else {
        return Result.fail(makeSingleError('Not an object', data));
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
