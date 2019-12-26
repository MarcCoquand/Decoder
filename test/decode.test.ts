import { Decoder } from '../src/decoder';
import * as fc from 'fast-check';

describe('Decode', () => {
  it('decodes numbers', () => {
    const number = Decoder.number.decode(5);
    const number2 = Decoder.number.decode('5');
    const notNumber = Decoder.number.decode('hello');
    expect(number).toEqual({ type: 'OK', value: 5 });
    expect(number2).toEqual({ type: 'OK', value: 5 });
    expect(notNumber).toEqual({
      type: 'FAIL',
      error: 'Not a number, got hello',
    });
  });
  // TODO: Property based test
  it('decodes string', () => {
    const str = Decoder.string.decode('Hello world');
    expect(str).toEqual({ type: 'OK', value: 'Hello world' });
  });

  it('decodes arrays', () => {
    const arr = Decoder.array(Decoder.string).decode(['hi', 'there', 'bah']);

    expect(arr).toEqual({ type: 'OK', value: ['hi', 'there', 'bah'] });
  });

  it('decodes literals', () => {
    const success = Decoder.literal('JACK').decode('JACK');
    const fail = Decoder.literal('JACK').decode('JACKFRUIT');

    expect(success).toEqual({ type: 'OK', value: 'JACK' });
    expect(fail).toHaveProperty('type', 'FAIL');
  });

  it('decodes predicates', () => {
    const positiveN = Decoder.number.withPredicate({ predicate: n => n > 0 });

    expect(positiveN.decode(5)).toEqual({ type: 'OK', value: 5 });
    expect(positiveN.decode(-5)).toHaveProperty('type', 'FAIL');
  });

  it('decodes boolean', () => {
    const success = Decoder.boolean.decode(true);
    const fail = Decoder.boolean.decode(1);

    expect(success).toEqual({ type: 'OK', value: true });
    expect(fail).toHaveProperty('type', 'FAIL');
  });

  it('decodes either', () => {
    const decoder1 = Decoder.number.map(n => ({ type: 'number', value: n }));
    const decoder2 = Decoder.string.map(s => ({ type: 'string', value: s }));
    const orDecoder = decoder1.or(decoder2);

    const strings = orDecoder.decode('hi');
    const ints = orDecoder.decode(5);
    const bool = orDecoder.decode(true);

    expect(strings).toEqual({
      type: 'OK',
      value: { type: 'string', value: 'hi' },
    });
    expect(ints).toEqual({ type: 'OK', value: { type: 'number', value: 5 } });
    expect(bool).toHaveProperty('type', 'FAIL');
  });

  it('decodes object', () => {
    const idDecoder = Decoder.number.withPredicate({ predicate: n => n > 0 });
    const userDecoder = Decoder.object({ name: Decoder.string, id: idDecoder });

    expect(userDecoder.decode({ name: 'hi', id: 5 })).toEqual({
      type: 'OK',
      value: { name: 'hi', id: 5 },
    });
    expect(userDecoder.decode({ name: 'hi', id: -1 })).toHaveProperty(
      'type',
      'FAIL'
    );
  });
});
