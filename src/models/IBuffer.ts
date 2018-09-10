export interface IBuffer {
  comment: string;
  sgmlDecl: string;
  textNode: string;
  tagName: string;
  doctype: string|boolean;
  procInstName: string;
  procInstBody: string;
  entity: string;
  attribName: string;
  attribValue: string;
  cdata: string;
  script: string;
}