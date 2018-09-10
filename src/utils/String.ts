export function isWhitespace(c: string): boolean {
  return c === ' ' || c === '\n' || c === '\r' || c === '\t';
}
export function isQuote(c: string): boolean {
  return c === '"' || c === '\'';
}
export function isAttribEnd(c: string) {
  return c === '>' || isWhitespace(c);
}
export function qname(name: string, attribute = false): { prefix: string, local: string } {
  const i = name.indexOf(':');
  const qualName = i < 0 ? [ '', name ] : name.split(':');
  let prefix = qualName[0];
  let local = qualName[1];

  // <x "xmlns"="http://foo">
  if (attribute && name === 'xmlns') {
    prefix = 'xmlns';
    local = '';
  }

  return { prefix, local };
}