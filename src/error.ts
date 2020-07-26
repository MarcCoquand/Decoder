export type DecodeError =
  | { [K in keyof any]: DecodeError }
  | string
  | DecodeError[];

export const makeSingleError = (message: DecodeError): DecodeError => message;
