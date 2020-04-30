import { Decoder } from '../src';
import * as fc from 'fast-check';

describe('Number decoder', () => {
  it('decodes numbers', () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (n) => {
        const res = Decoder.number.run(n);
        const resAsNumber = Decoder.number.run(`${n}`);

        expect(res).toEqual({ type: 'OK', value: n });
        expect(resAsNumber).toEqual({ type: 'OK', value: n });
      })
    );
  });
  it('does not decode invalid data', () => {
    fc.assert(
      fc.property(fc.anything(), (anything: any) => {
        fc.pre(
          typeof anything !== 'number' &&
            typeof anything === 'string' &&
            (anything as string).match(/^[+-]?\d+(\.\d+)?$/) === null
        );
        const res = Decoder.number.run(anything);
        expect(res).toHaveProperty('type', 'FAIL');
      })
    );
  });
});

describe('Boolean decoder', () => {
  it('decodes booleans', () => {
    fc.assert(
      fc.property(fc.boolean(), (bool) => {
        const res = Decoder.boolean.run(bool);
        const resAsString = Decoder.boolean.run(`${bool}`);
        expect(res).toEqual({ type: 'OK', value: bool });
        expect(resAsString).toEqual({ type: 'OK', value: bool });
      })
    );
  });
  it('does not decode invalid data', () => {
    fc.assert(
      fc.property(fc.anything(), (anything: any) => {
        fc.pre(typeof anything !== 'boolean');
        const res = Decoder.boolean.run(anything);
        expect(res).toHaveProperty('type', 'FAIL');
      })
    );
  });
});

describe('Date decoder', () => {
  it('decodes dates', () => {
    fc.assert(
      fc.property(fc.date(), (date) => {
        const res = Decoder.date.run(date);
        const res2 = Decoder.date.run(date.toISOString());
        const res3 = Decoder.date.run(date.getTime());
        switch (res.type) {
          case 'OK':
            expect(res.value).toEqual(date);
            break;
          case 'FAIL':
            expect(true).toBe(false);
        }
        switch (res2.type) {
          case 'OK':
            expect(res2.value).toEqual(date);
            break;
          case 'FAIL':
            expect(true).toBe(false);
        }
        switch (res3.type) {
          case 'OK':
            expect(res3.value).toEqual(date);
            break;
          case 'FAIL':
            expect(true).toBe(false);
        }
      })
    );
  });
  it('does not decode invalid data', () => {
    const isInteger = (n: number) => Math.floor(n) === n && n !== Infinity;
    fc.assert(
      fc.property(fc.anything(), (anything: any) => {
        fc.pre(
          !(anything instanceof Date) &&
            !(typeof anything === 'string' && isInteger(parseInt(anything))) &&
            !(typeof anything === 'number' && isInteger(anything))
        );
        const res = Decoder.date.run(anything);
        expect(res).toHaveProperty('type', 'FAIL');
      })
    );
  });
  it('does not decode UTC', () => {
    fc.assert(
      fc.property(fc.date(), (date) => {
        const res3 = Decoder.date.run(date.toUTCString());
        expect(res3).toHaveProperty('type', 'FAIL');
      })
    );
  });
});

describe('String decoder', () => {
  it('decodes strings', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        const res = Decoder.string.run(str);
        expect(res).toEqual({ type: 'OK', value: str });
      })
    );
  });
  it('does not decode invalid data', () => {
    fc.assert(
      fc.property(fc.anything(), (anything: any) => {
        fc.pre(typeof anything !== 'string');
        const res = Decoder.string.run(anything);
        expect(res).toHaveProperty('type', 'FAIL');
      })
    );
  });
});

describe('Array decoder', () => {
  it('decodes arrays', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (arr) => {
        const res = Decoder.array(Decoder.string).run(arr);
        expect(res).toEqual({ type: 'OK', value: arr });
      })
    );
  });
  it('does not decode invalid data', () => {
    fc.assert(
      fc.property(fc.anything(), (anything: any) => {
        fc.pre(!Array.isArray(anything));
        const res = Decoder.array(Decoder.string).run(anything);
        expect(res).toHaveProperty('type', 'FAIL');
      })
    );
  });
});

describe('Null decoder', () => {
  it('decodes null and undefined', () => {
    const res2 = Decoder.empty.run(undefined);
    const res3 = Decoder.empty.run(null);
    expect(res2).toEqual({ type: 'OK', value: undefined });
    expect(res3).toEqual({ type: 'OK', value: undefined });
  });

  it('does not decode invalid data', () => {
    fc.assert(
      fc.property(fc.anything(), (anything: any) => {
        fc.pre(anything !== null && anything !== undefined);
        const res = Decoder.empty.run(anything);
        expect(res).toHaveProperty('type', 'FAIL');
      })
    );
  });
});

describe('Methods', () => {
  it('map', () => {
    const setDecoder = Decoder.array(Decoder.number).map((arr) => new Set(arr));
    const result = setDecoder.run([1, 2, 3]);
    expect(result).toHaveProperty('value', new Set([1, 2, 3]));
  });
  it('then', () => {
    const thenDecoder = Decoder.number.then((_) => Decoder.ok('hi'));
    const result = thenDecoder.run(1);

    expect(result).toHaveProperty('value', 'hi');
  });

  it('default', () => {
    const withDefaultDecoder = Decoder.number.default(0);

    const result = withDefaultDecoder.run('hi');
    expect(result).toHaveProperty('value', 0);
  });
});

describe('Other decoders', () => {
  it('decodes literals', () => {
    const success = Decoder.literalString('JACK').run('JACK');
    const fail = Decoder.literalString('JACK').run('JACKFRUIT');

    expect(success).toEqual({ type: 'OK', value: 'JACK' });
    expect(fail).toHaveProperty('type', 'FAIL');
  });

  it('decodes predicates', () => {
    const positiveN = Decoder.number.satisfy({ predicate: (n) => n > 0 });

    expect(positiveN.run(5)).toEqual({ type: 'OK', value: 5 });
    expect(positiveN.run(-5)).toHaveProperty('type', 'FAIL');
  });

  it('decodes oneOf', () => {
    const marketDecoder = Decoder.oneOf([
      Decoder.literalString('SV'),
      Decoder.literalString('US'),
      Decoder.literalString('AU'),
    ]);

    const market = marketDecoder.run('AU');

    const marketFail = marketDecoder.run('EN');

    expect(market).toEqual({
      type: 'OK',
      value: 'AU',
    });
    expect(marketFail).toHaveProperty('type', 'FAIL');
  });

  it('decodes fields', () => {
    const versionDecoder = Decoder.field('version', Decoder.number);

    const result = versionDecoder.run({ version: 5 });
    expect(result).toHaveProperty('value', 5);
  });

  it('nullable decoders', () => {
    const optionalNumberDecoder = Decoder.optional(Decoder.number);

    const result1 = optionalNumberDecoder.run(5);
    const result2 = optionalNumberDecoder.run(undefined);
    const result3 = optionalNumberDecoder.run(null);
    const result4 = optionalNumberDecoder.run('hi');
    expect(result1).toHaveProperty('value', 5);
    expect(result2).toHaveProperty('value', undefined);
    expect(result3).toHaveProperty('value', undefined);
    expect(result4).toHaveProperty('type', 'FAIL');
  });

  it('decodes object', () => {
    const idDecoder = Decoder.number.satisfy({ predicate: (n) => n > 0 });
    const userDecoder = Decoder.object({ name: Decoder.string, id: idDecoder });

    expect(userDecoder.run({ name: 'hi', id: 5 })).toEqual({
      type: 'OK',
      value: { name: 'hi', id: 5 },
    });
    expect(userDecoder.run({ name: 'hi', id: -1 })).toHaveProperty(
      'type',
      'FAIL'
    );
  });
});
