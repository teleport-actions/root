export function parseOptionalInt(input: string, defaultValue: number): number {
  if (!input) {
    return defaultValue;
  }

  const v = parseInt(input, 10);
  if (Number.isNaN(v)) {
    return defaultValue;
  }

  return v;
}

export function parseListenURL(input: string): URL {
  const u = new URL(input);
  if (!u.port) {
    throw new Error('listen URI requires a port, e.g. tcp://127.0.0.1:1234');
  }

  return u;
}
