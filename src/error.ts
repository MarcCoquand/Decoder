export type DecodeError = { message: string; next: DecodeError[] };

const addSpaces = (pad: number, str: string) => ' '.repeat(pad) + str;

const createRenderer = (pad: number) => (error: DecodeError): string => {
  if (error.next.length !== 0) {
    const render = createRenderer(pad + 2);
    const next = error.next.map((el) => render(el));
    return `${addSpaces(pad, error.message)}:\n${next.join('\n')}`;
  } else {
    return addSpaces(pad, error.message);
  }
};

export const makeSingleError = (message: string): DecodeError => ({
  message,
  next: [],
});

export const renderError = createRenderer(2);
