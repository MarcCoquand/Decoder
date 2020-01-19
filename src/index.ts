import { Result } from './result';
import { DecodeError, renderError } from './error';
//utils
const isDate = (d: Date) => !isNaN(d.getDate());
const isISO = (str: string) => str.match(/(\d{4})-(\d{2})-(\d{2})/) !== null;
const isNaturalNumber = (n: number) =>
  n >= 0.0 && Math.floor(n) === n && n !== Infinity;
const isStringNumber = (n: string) =>
  n.length !== 0 && n.match(/^[+-]?\d+(\.\d+)?$/) !== null;

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
   * Attempt two decoders.
   *
   * Example:
   * ```
   * type Names = "Jack" | "Sofia"
   * const enums: Decoder<Names> = Decoder.literalString("Jack").or(Decoder.literalString("Sofia"))
   *
   * enums.run("Jack") // OK
   * enums.run("Sofia") // OK
   * enums.run("Josefine") // Fail
   * ```
   */
  or = <S>(decoder: Decoder<S>): Decoder<T | S> =>
    new Decoder((data: any) => {
      const res1 = this.decoder(data);
      switch (res1.get.type) {
        case 'OK':
          return Result.ok(res1.get.value);
        case 'FAIL':
          const res2 = decoder.decoder(data);
          switch (res2.get.type) {
            case 'OK':
              return Result.ok(res2.get.value);
            case 'FAIL':
              const msg: DecodeError = {
                message: 'Not one of',
                next: [
                  { message: `- ${res1.get.error}` },
                  { message: `- ${res2.get.error}` },
                ],
              };
              return Result.fail(msg);
          }
      }
    });

  private constructor(decoder: (data: any) => Result<T, DecodeError>) {
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
    const result = this.decoder(data);

    return result.mapError(renderError).get;
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
   * Add an extra predicate to the decoder.
   *
   * Example:
   *
   * ```
   * const naturalNumber = Decoder.number.satisfy({
   *  predicate: n => n>0
   *  failureMessage: `Not a natural number > 0`
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
    failureMessage?: string;
  }): Decoder<T> =>
    this.then(value => {
      if (predicate(value)) {
        return Decoder.ok(value);
      } else {
        const message = failureMessage ? failureMessage : `Predicate failed`;
        return Decoder.fail(message);
      }
    });

  /**
   * A decoder for numbers
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
    if (typeof data === 'number' && !isNaN(data)) {
      return Result.ok(data);
    } else if (typeof data === 'string' && isStringNumber(data)) {
      const result = parseFloat(data);
      return Result.ok(result);
    } else {
      return Result.fail({ message: `Not a number` });
    }
  });

  /**
   * A decoder for dates. Note that decoding UTC time that is formatted using
   * `toUTCString()` is not supported because Javascript's date parser parses it
   * wrong.
   *
   * Example:
   *
   * ```
   * Decoder.date.run("123") // OK (Timestamp)
   * Decoder.date.run(new Date()) // OK
   * Decoder.date.run("abra") // FAIL
   * Decoder.date.run("2020-01-13T18:27:35.817Z") // OK
   * Decoder.date.run("Mon, 13 Jan 2020 18:28:05 GMT") // FAIL, format is not supported
   * ```
   */
  public static date: Decoder<Date> = Decoder.number
    .satisfy({
      predicate: isNaturalNumber,
      failureMessage: 'Not a ISO date or timestamp',
    })
    .map(n => new Date(n))
    .or(
      new Decoder((data: any) => {
        if (
          Object.prototype.toString.call(data) === '[object Date]' &&
          isDate(data)
        )
          return Result.ok(data);
        else if (typeof data === 'string' && isISO(data)) {
          const date = new Date(data);
          if (isDate(date)) return Result.ok(date);
          else return Result.fail({ message: `Not a ISO date or timestamp` });
        } else return Result.fail({ message: `Not a ISO date or timestamp` });
      })
    );

  /**
   * A decoder that accepts undefined and null. Useful in conjunction with other
   * decoders.
   *
   * Example:
   *
   * ```
   * Decoder.empty.run(null) // OK, value is undefined
   * Decoder.empty.run(undefined) // OK, value is undefined
   * Decoder.empty.run(5) // FAIL, value is not null or undefined
   *```
   */
  public static empty: Decoder<undefined> = new Decoder(data =>
    data === null || data === undefined
      ? Result.ok(undefined)
      : Result.fail({ message: 'Not null or undefined' })
  );

  /**
   * Decodes a string.
   *
   * ```
   * Decoder.string.run('hi') // OK
   * Decoder.string.run(5) // Fail
   * ```
   */
  public static string: Decoder<string> = new Decoder((data: any) =>
    typeof data === 'string'
      ? Result.ok(data)
      : Result.fail({ message: `Not a string` })
  );

  /**
   * Decodes the exact string and sets it to a string literal type. Useful for
   * parsing unions.
   *
   * Example:
   *
   * ```
   * type Names = "Jack" | "Sofia"
   * const enums: Decoder<Names> = Decoder.literalString("Jack").or(Decoder.literalString("Sofia"))
   * ```
   */
  public static literalString = <T extends string>(str: T): Decoder<T> =>
    Decoder.string.then(incomingStr =>
      incomingStr === str
        ? Decoder.ok(str)
        : Decoder.fail(`String is not ${str}`)
    );

  /**
   * Takes a decoder and returns an optional decoder
   *
   * ```
   * const optionalNumber = Decoder.optional(Decoder.number)
   * optionalNumber.run(5) //OK
   * optionalNumber.run(undefined) //OK
   * optionalNumber.run(null) //OK
   * optionalNumber.run('hi') //FAIL
   */
  public static optional = <T>(decoder: Decoder<T>): Decoder<T | undefined> =>
    decoder.or(Decoder.empty);

  /**
   * Create a decoder that always fails, useful in conjunction with andThen.
   */
  public static fail = <T>(message: string): Decoder<T> =>
    new Decoder(() => Result.fail({ message }));

  /**
   * Create a decoder that always suceeds and returns value,
   * useful in conjunction with andThen
   */
  public static ok = <T>(value: T): Decoder<T> =>
    new Decoder(() => Result.ok(value));

  /**
   * Decodes the exact number and sets it to a number literal type. Useful for
   * parsing (discriminated) unions.
   * ```
   * type Versions = Decoder<1 | 2>
   * const versionDecoder: Decoder<Versions> = Decoder.literalNumber(1).or(Decoder.literalNumber(2))
   * ```
   */
  public static literalNumber = <T extends number>(number: T): Decoder<T> =>
    Decoder.number.then(incomingNumber =>
      incomingNumber === number
        ? Decoder.ok(number)
        : Decoder.fail(`Number is not ${number}`)
    );

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
      } else return Result.fail({ message: `Not an array` });
    });

  /**
   * Create a decoder for booleans.
   *
   * ```
   * Decoder.boolean.run(true) // succeeds
   * Decoder.boolean.run('true') // succeeds
   * Decoder.boolean.run(1) // fails
   * ```
   */
  public static boolean: Decoder<boolean> = new Decoder(data => {
    if (typeof data === 'boolean') return Result.ok(data);
    else if (typeof data === 'string') {
      switch (data) {
        case 'true':
          return Result.ok(true);
        case 'false':
          return Result.ok(false);
        default:
          return Result.fail({ message: `Not a boolean` });
      }
    } else return Result.fail({ message: `Not a boolean` });
  });

  /**
   * Decode the value of a specific key in an object using a given decoder. Returns the
   * value without the key pairing.
   *
   * Example:
   *
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
        return decoder.decoder(data[key]).mapError(error => ({
          message: `Key ${key}: ${error.message}`,
        }));
      } else {
        return Result.fail({ message: 'Not an object' });
      }
    });

  /**
   * Create a decoder for an object T. Will currently go through each field and
   * collect all the errors but in the future it might fail on first.
   *
   * object is a [Mapped type](https://www.typescriptlang.org/docs/handbook/advanced-types.html#mapped-types),
   * an object containing only decoders for each field. For example
   * `{name: Decoder.string}` is accepted but `{name: Decoder.string, email: string}` is rejected.
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
   * decodeUser.run({name: "Jenny", email: "fakemail@fake.com"}) // OK
   * decodeUser.run({nm: "Bad"}) // FAIL
   *
   * // will not typecheck, object must have the same field names as user and
   * // only contain decoders.
   * const decodeUser<User> = Decoder.object({nem: 'Hi'})
   * ```
   *
   */
  public static object = <T>(
    object: { [K in keyof T]: Decoder<T[K]> }
  ): Decoder<T> =>
    new Decoder((data: any) => {
      if (typeof data === 'object' && data !== null) {
        const keyValue = Object.entries(object) as [string, Decoder<unknown>][];

        let obj: any = {};
        let errors: DecodeError[] = [];
        let i: number;
        for (i = 0; i < keyValue.length; i++) {
          const [key, decoder] = keyValue[i];
          const result = decoder.decoder(data[key]).mapError(error => ({
            message: `- Key ${key}: ${error.message}`,
            next: error.next,
          })).get;
          switch (result.type) {
            case 'OK':
              obj[key] = result.value;
              break;
            case 'FAIL':
              errors.push(result.error);
              break;
          }
        }
        if (errors.length === 0) return Result.ok(obj as T);
        const errorMsg: DecodeError = {
          message: 'Could not decode object',
          next: errors,
        };
        return Result.fail(errorMsg);
      } else {
        return Result.fail({ message: 'Not an object' });
      }
    });
}
