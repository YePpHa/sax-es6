export interface ISAXParserEvents<T> {
  error: Error;
  text: string;
  doctype: string;
  processinginstruction: { name: string, body: string };
  opentag: T;
  closetag: string;
  attribute: { name: string; value: string };
  comment: string;
  opencdata: void;
  cdata: string;
  closecdata: void;
  opennamespace: { prefix: string; uri: string };
  closenamespace: { prefix: string; uri: string };
  end: void;
  ready: void;
  script: string;
  sgmldeclaration: string;
  opentagstart: { name: string, attributes: {} };
}

