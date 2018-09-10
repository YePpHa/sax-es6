import { Stream } from "stream";
import { NodeStringDecoder, StringDecoder } from "string_decoder";
import { IOptions } from "./models/IOptions";
import { SAXParser } from "./SAXParser";

export class SAXStream<NamespaceSupported extends boolean> extends Stream {
  private _parser: SAXParser<NamespaceSupported>;

  private _writable = true;
  private _readable = true;

  private _decoder?: NodeStringDecoder;

  constructor(strict: boolean = false, options?: Partial<IOptions<NamespaceSupported>>) {
    super();

    this._parser = new SAXParser(strict, options);
    this._parser.on('end', () => {
      this.emit('end');
    });
    this._parser.on('error', err => {
      this.emit('error', err);

      // if didn't throw, then means error was handled.
      // go ahead and clear error, so we can write again.
      this._parser.resume();
    });
  }

  public write(data: any): boolean {
    if (typeof Buffer === 'function' && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(data)) {
      if (!this._decoder) {
        this._decoder = new StringDecoder("utf8");
      }
      data = this._decoder.write(data);
    }

    this._parser.write(data.toString());
    this.emit('data', data);
    return true;
  }

  public end(chunk: any): boolean {
    if (chunk && chunk.length) {
      this.write(chunk);
    }
    this._parser.end();
    return true;
  }
}