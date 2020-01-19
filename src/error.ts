export type DecodeError = { message: string; next?: DecodeError[] };

const addSpaces = (pad: number, str: string) => ' '.repeat(pad) + str;

const createRenderer = (pad: number) => (error: DecodeError): string => {
  if (error.next) {
    const renderWithPadding = createRenderer(pad + 2);
    const next = error.next.map(el => renderWithPadding(el));
    return `${addSpaces(pad, error.message)}:\n${next.join('\n')}`;
  } else {
    return addSpaces(pad, error.message);
  }
};

export const renderError = (error: DecodeError) =>
  `Error(s) decoding data:\n${createRenderer(2)(error)}`;
