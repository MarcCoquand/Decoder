import { Decoder } from '../src/decoder';
import * as fc from 'fast-check';

describe('Number decoder', () => {
  it('decodes numbers', () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), n => {
        const res = Decoder.number.run(n);
        const res2 = Decoder.number.run(`${n}`);

        expect(res).toEqual({ type: 'OK', value: n });
        expect(res2).toEqual({ type: 'OK', value: n });
      })
    );
  });
  it('does not decode invalid data', () => {
    fc.assert(
      fc.property(fc.anything(), (anything: any) => {
        fc.pre(isNaN(anything));
        const res = Decoder.number.run(anything);
        expect(res).toHaveProperty('type', 'FAIL');
      })
    );
  });
});

describe('Boolean decoder', () => {
  it('decodes booleans', () => {
    fc.assert(
      fc.property(fc.boolean(), bool => {
        const res = Decoder.boolean.run(bool);
        expect(res).toEqual({ type: 'OK', value: bool });
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

describe('String decoder', () => {
  it('decodes strings', () => {
    fc.assert(
      fc.property(fc.string(), str => {
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
      fc.property(fc.array(fc.string()), arr => {
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

describe('Other decoders', () => {
  it('decodes nullable', () => {
    fc.assert(
      fc.property(fc.option(fc.string()), str => {
        const res = Decoder.string.nullable().run(str);
        const res2 = Decoder.string.nullable().run(undefined);
        const res3 = Decoder.string.nullable().run(null);
        expect(res).toEqual({ type: 'OK', value: str });
        expect(res2).toEqual({ type: 'OK', value: null });
        expect(res3).toEqual({ type: 'OK', value: null });
      })
    );
  });

  it('decodes literals', () => {
    const success = Decoder.literalString('JACK').run('JACK');
    const fail = Decoder.literalString('JACK').run('JACKFRUIT');

    expect(success).toEqual({ type: 'OK', value: 'JACK' });
    expect(fail).toHaveProperty('type', 'FAIL');
  });

  it('decodes predicates', () => {
    const positiveN = Decoder.number.satisfy({ predicate: n => n > 0 });

    expect(positiveN.run(5)).toEqual({ type: 'OK', value: 5 });
    expect(positiveN.run(-5)).toHaveProperty('type', 'FAIL');
  });

  it('decodes either', () => {
    const decoder1 = Decoder.number.map(n => ({ type: 'number', value: n }));
    const decoder2 = Decoder.string.map(s => ({ type: 'string', value: s }));
    const orDecoder = decoder1.or(decoder2);

    const strings = orDecoder.run('hi');
    const ints = orDecoder.run(5);
    const bool = orDecoder.run(true);

    expect(strings).toEqual({
      type: 'OK',
      value: { type: 'string', value: 'hi' },
    });
    expect(ints).toEqual({ type: 'OK', value: { type: 'number', value: 5 } });
    expect(bool).toHaveProperty('type', 'FAIL');
  });

  it('decodes object', () => {
    const idDecoder = Decoder.number.satisfy({ predicate: n => n > 0 });
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
