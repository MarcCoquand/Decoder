export type DecodeError =
  | { [K in keyof any]: DecodeError }
  | { index?: number; error: string | DecodeError; value?: any }
  | [number, DecodeError]
  | DecodeError[];

export const makeSingleError = (error: string, value: any): DecodeError => ({
  error,
  value,
});

export const formatIndex = (index: number, error: DecodeError): DecodeError => {
  const check = (
    de: DecodeError
  ): de is { index?: number; error: string | DecodeError; value?: any } =>
    typeof (de as any).error === 'string' ? true : false;

  if (check(error)) return { index, error: error.error, value: error.value };
  else return [index, error];
};
