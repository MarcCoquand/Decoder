import { renderError, DecodeError } from '../src/error';

const mockErrorLevel2: DecodeError = {
  message: 'Key Auth, Decoding errors in object',
  next: [{ message: 'Key JWT, Not a JWT token', next: [] }],
};

const mockError: DecodeError = {
  message: 'Decoding errors in object',
  next: [{ message: 'Key name, Not a number', next: [] }, mockErrorLevel2],
};

describe('Error rendering', () => {
  it('renders errors', () => {
    const expected =
      'Error(s) decoding data:\n' +
      '  Decoding errors in object:\n' +
      '    Key name, Not a number\n' +
      '    Key Auth, Decoding errors in object:\n' +
      '      Key JWT, Not a JWT token';
    expect(renderError(mockError)).toEqual(expected);
  });
});
