import EventEmitter = require('events');
import StrictEventEmitter from 'strict-event-emitter-types';
import { CDATA, DOCTYPE, MAX_BUFFER_LENGTH, rootNS, XML_NAMESPACE, XMLNS_NAMESPACE } from "./data/Constants";
import { Entities, XmlEntities } from "./data/Entities";
import { entityBody, entityStart, nameBody, nameStart } from "./data/Regex";
import { IBuffer } from "./models/IBuffer";
import { IOptions } from "./models/IOptions";
import { IQualifiedTag } from "./models/IQualifiedTag";
import { ISAXParserEvents } from "./models/ISAXParserEvents";
import { ITag } from "./models/ITag";
import { State } from "./models/State";
import { isAttribEnd, isQuote, isWhitespace, qname } from "./utils/String";

type TagType<NamespaceSupported extends boolean> =
  NamespaceSupported extends true ? IQualifiedTag :
  NamespaceSupported extends false ? ITag :
  never;

export class SAXParser<NamespaceSupported extends boolean> extends (EventEmitter as { new(): StrictEventEmitter<EventEmitter, ISAXParserEvents<ITag | IQualifiedTag>> }) {
  public get line(): number { return this._line; }
  private _line: number = 0;

  public get column(): number { return this._column; }
  private _column: number = 0;

  public get position(): number { return this._position; }
  private _position: number = 0;

  /**
   * Indicates the position where the current tag starts.
   */
  public get startTagPosition(): number { return this._startTagPosition; }
  private _startTagPosition: number = 0;

  /**
   * Whether or not the parser can be written to. If it's `true`, then wait for
   * the `ready` event to write again.
   */
  public get closed(): boolean { return this._closed; }
  private _closed: boolean = false;

  /**
   * Whether or not the parser is a jerk.
   */
  public get strict(): boolean { return this._strict; }
  private _strict: boolean = false;

  /**
   * Any options passed into the constructor.
   */
  public get options(): Readonly<IOptions<NamespaceSupported>> { return this._options; }
  private _options: IOptions<NamespaceSupported>;

  /**
   * The current tag being dealt with.
   */
  public get tag(): TagType<NamespaceSupported> | undefined { return this._tag; }
  private _tag: TagType<NamespaceSupported> | undefined;

  private _error: Error | undefined;
  private _state: State = State.Begin;
  private _entities: {[key: string]: string};
  private _attribList: Array<{ name: string, value: string }> = [];
  private _tags: Array<TagType<NamespaceSupported>> = [];

  private _currentChar: string = "";
  private _previousChar: string = "";

  private _closedRoot = false;
  private _sawRoot = false;

  private _bufferCheckPosition = MAX_BUFFER_LENGTH;

  private _buffer: IBuffer = {
    comment: '',
    sgmlDecl: '',
    textNode: '',
    tagName: '',
    doctype: '',
    procInstName: '',
    procInstBody: '',
    entity: '',
    attribName: '',
    attribValue: '',
    cdata: '',
    script: ''
  };

  constructor(strict: boolean = false, options?: Partial<IOptions<NamespaceSupported>>) {
    super();

    this._strict = strict;
    this._options = Object.assign({
      trim: false,
      normalize: false,
      lowercase: false,
      xmlns: false,
      trackPosition: false,
      strictEntities: false
    } as IOptions<NamespaceSupported>, options);

    this._entities = this._options.strictEntities ? Object.create(XmlEntities) : Object.create(Entities);
  }

  public end(): SAXParser<NamespaceSupported> {
    if (this._sawRoot && !this._closedRoot) this._strictFail('Unclosed root tag');
    if ((this._state !== State.Begin) &&
      (this._state !== State.BeginWhitespace) &&
      (this._state !== State.Text)) {
      this._emitError('Unexpected end');
    }
    this._closeText();
    this._currentChar = '';
    this._closed = true;
    this.emit('end');

    // Clear states for new document
    this._clearBuffers();
    this._currentChar = '';
    this._previousChar = '';
    this._bufferCheckPosition = MAX_BUFFER_LENGTH;
    this._closedRoot = false;
    this._sawRoot = false;

    this._error = undefined;
    this._state = State.Begin;
    this._attribList = [];
    this._tags = [];

    this._line = 0;
    this._column = 0;
    this._position = 0;
    this._startTagPosition = 0;
    this._closed = false;
    this._tag = undefined;

    this._entities = this._options.strictEntities ? Object.create(XmlEntities) : Object.create(Entities);

    return this;
  }

  /**
   * Write bytes onto the stream. You don't have to do this all at once. You can
   * keep writing as much as you want.
   * @param s 
   */
  public write(chunk?: string): SAXParser<NamespaceSupported> {
    if (this._error) {
      throw this._error;
    }
    if (this._closed) {
      this._emitError("Cannot write after close. Assign an onready handler.");
    }
    if (chunk === undefined) {
      return this.end();
    }
    let i = 0;
    while (true) {
      this._currentChar = chunk.charAt(i++);
      if (!this._currentChar) break;

      let c = this._currentChar;

      this._updatePosition(c);

      switch (this._state) {
        case State.Begin: {
          this._state = State.BeginWhitespace;
          if (c === '\uFEFF') {
            continue;
          }
          this._beginWhiteSpace(c);
          continue;
        }
        case State.BeginWhitespace: {
          this._beginWhiteSpace(c);
          continue;
        }
        case State.Text: {
          if (this._sawRoot && !this._closedRoot) {
            const startIndex = i - 1;
            while (c && c !== '<' && c !== '&') {
              c = chunk.charAt(i++);
              if (c) {
                this._updatePosition(c);
              }
            }
            this._buffer.textNode += chunk.substring(startIndex, i - 1);
          }
          if (c === '<' && !(this._sawRoot && this._closedRoot && !this._strict)) {
            this._state = State.OpenWaka;
            this._startTagPosition = this._position;
          } else {
            if (!isWhitespace(c) && (!this._sawRoot || this._closedRoot)) {
              this._strictFail('Text data outside of root node.');
            }
            if (c === '&') {
              this._state = State.TextEntity;
            } else {
              this._buffer.textNode += c;
            }
          }
          continue;
        }
        case State.Script: {
          // only non-strict
          if (c === '<') {
            this._state = State.ScriptEnding;
          } else {
            this._buffer.script += c;
          }
          continue;
        }
        case State.ScriptEnding: {
          if (c === '/') {
            this._state = State.CloseTag;
          } else {
            this._buffer.script += '<' + c;
            this._state = State.Script;
          }
          continue;
        }
        case State.OpenWaka: {
          // either a /, ?, !, or text is coming next.
          if (c === '!') {
            this._state = State.SgmlDecl;
            this._buffer.sgmlDecl = '';
          } else if (isWhitespace(c)) {
            // wait for it...
          } else if (nameStart.test(c)) {
            this._state = State.OpenTag;
            this._buffer.tagName = c;
          } else if (c === '/') {
            this._state = State.CloseTag;
            this._buffer.tagName = '';
          } else if (c === '?') {
            this._state = State.ProcInst;
            this._buffer.procInstName = this._buffer.procInstBody = '';
          } else {
            this._strictFail('Unencoded <');
            // if there was some whitespace, then add that in.
            if (this._startTagPosition + 1 < this._position) {
              const pad = this._position - this._startTagPosition;
              c = new Array(pad).join(' ') + c;
            }
            this._buffer.textNode += '<' + c;
            this._state = State.Text;
          }
          continue;
        }
        case State.SgmlDecl: {
          if ((this._buffer.sgmlDecl + c).toUpperCase() === CDATA) {
            if (this._buffer.textNode) this._closeText();
            this.emit('opencdata');
            this._state = State.CData;
            this._buffer.sgmlDecl = '';
            this._buffer.cdata = '';
          } else if (this._buffer.sgmlDecl + c === '--') {
            this._state = State.Comment;
            this._buffer.comment = '';
            this._buffer.sgmlDecl = '';
          } else if ((this._buffer.sgmlDecl + c).toUpperCase() === DOCTYPE) {
            this._state = State.DocType;
            if (this._buffer.doctype || this._sawRoot) {
              this._strictFail('Inappropriately located doctype declaration');
            }
            this._buffer.doctype = '';
            this._buffer.sgmlDecl = '';
          } else if (c === '>') {
            if (this._buffer.textNode) this._closeText();
            this.emit('sgmldeclaration', this._buffer.sgmlDecl);
            this._buffer.sgmlDecl = '';
            this._state = State.Text;
          } else if (isQuote(c)) {
            this._state = State.SgmlDeclQuoted;
            this._buffer.sgmlDecl += c;
          } else {
            this._buffer.sgmlDecl += c;
          }
          continue;
        }
        case State.SgmlDeclQuoted: {
          if (c === this._previousChar) {
            this._state = State.SgmlDecl;
            this._previousChar = '';
          }
          this._buffer.sgmlDecl += c;
          continue;
        }
        case State.DocType: {
          if (c === '>') {
            this._state = State.Text;
            if (this._buffer.textNode) this._closeText();
            this.emit('doctype', this._buffer.doctype.toString());
            this._buffer.doctype = true; // just remember that we saw it.
          } else {
            this._buffer.doctype += c;
            if (c === '[') {
              this._state = State.DocTypeDTD;
            } else if (isQuote(c)) {
              this._state = State.DocTypeQuoted;
              this._previousChar = c;
            }
          }
          continue;
        }
        case State.DocTypeQuoted: {
          this._buffer.doctype += c;
          if (c === this._previousChar) {
            this._previousChar = '';
            this._state = State.DocType;
          }
          continue;
        }
        case State.DocTypeDTD: {
          this._buffer.doctype += c;
          if (c === ']') {
            this._state = State.DocType;
          } else if (isQuote(c)) {
            this._state = State.DocTypeDTDQuoted;
            this._previousChar = c;
          }
          continue;
        }
        case State.DocTypeDTDQuoted: {
          this._buffer.doctype += c;
          if (c === this._previousChar) {
            this._state = State.DocTypeDTD;
            this._previousChar = '';
          }
          continue;
        }

        case State.Comment: {
          if (c === '-') {
            this._state = State.CommentEnding;
          } else {
            this._buffer.comment += c;
          }
          continue;
        }

        case State.CommentEnding:
          if (c === '-') {
            this._state = State.CommentEnded;
            this._buffer.comment = this._textopts(this._buffer.comment);
            if (this._buffer.comment) {
              if (this._buffer.textNode) this._closeText();
              this.emit('comment', this._buffer.comment);
            }
            this._buffer.comment = '';
          } else {
            this._buffer.comment += '-' + c;
            this._state = State.Comment;
          }
          continue;

        case State.CommentEnded:
          if (c !== '>') {
            this._strictFail('Malformed comment');
            // allow <!-- blah -- bloo --> in non-strict mode,
            // which is a comment of " blah -- bloo "
            this._buffer.comment += '--' + c;
            this._state = State.Comment;
          } else {
            this._state = State.Text;
          }
          continue;

        case State.CData:
          if (c === ']') {
            this._state = State.CDataEnding;
          } else {
            this._buffer.cdata += c;
          }
          continue;

        case State.CDataEnding:
          if (c === ']') {
            this._state = State.CDataEnding2;
          } else {
            this._buffer.cdata += ']' + c;
            this._state = State.CData;
          }
          continue;

        case State.CDataEnding2:
          if (c === '>') {
            if (this._buffer.cdata) {
              if (this._buffer.textNode) this._closeText();
              this.emit('cdata', this._buffer.cdata);
            }
            if (this._buffer.textNode) this._closeText();
            this.emit('closecdata');
            this._buffer.cdata = '';
            this._state = State.Text;
          } else if (c === ']') {
            this._buffer.cdata += ']';
          } else {
            this._buffer.cdata += ']]' + c;
            this._state = State.CData;
          }
          continue;

        case State.ProcInst:
          if (c === '?') {
            this._state = State.ProcInstEnding;
          } else if (isWhitespace(c)) {
            this._state = State.ProcInstBody;
          } else {
            this._buffer.procInstName += c;
          }
          continue;

        case State.ProcInstBody:
          if (!this._buffer.procInstBody && isWhitespace(c)) {
            continue;
          } else if (c === '?') {
            this._state = State.ProcInstEnding;
          } else {
            this._buffer.procInstBody += c;
          }
          continue;

        case State.ProcInstEnding:
          if (c === '>') {
            if (this._buffer.textNode) this._closeText();
            this.emit('processinginstruction', {
              name: this._buffer.procInstName,
              body: this._buffer.procInstBody
            });
            this._buffer.procInstName = this._buffer.procInstBody = '';
            this._state = State.Text;
          } else {
            this._buffer.procInstBody += '?' + c;
            this._state = State.ProcInstBody;
          }
          continue;

        case State.OpenTag:
          if (nameBody.test(c)) {
            this._buffer.tagName += c;
          } else {
            this._newTag();
            if (c === '>') {
              this._openTag();
            } else if (c === '/') {
              this._state = State.OpenTagSlash;
            } else {
              if (!isWhitespace(c)) {
                this._strictFail('Invalid character in tag name');
              }
              this._state = State.Attrib;
            }
          }
          continue;

        case State.OpenTagSlash:
          if (c === '>') {
            this._openTag(true);
            this._closeTag();
          } else {
            this._strictFail('Forward-slash in opening tag not followed by >');
            this._state = State.Attrib;
          }
          continue;

        case State.Attrib:
          // haven't read the attribute name yet.
          if (isWhitespace(c)) {
            continue;
          } else if (c === '>') {
            this._openTag();
          } else if (c === '/') {
            this._state = State.OpenTagSlash;
          } else if (nameStart.test(c)) {
            this._buffer.attribName = c;
            this._buffer.attribValue = '';
            this._state = State.AttribName;
          } else {
            this._strictFail('Invalid attribute name');
          }
          continue;

        case State.AttribName:
          if (c === '=') {
            this._state = State.AttribValue;
          } else if (c === '>') {
            this._strictFail('Attribute without value');
            this._buffer.attribValue = this._buffer.attribName;
            this._attrib();
            this._openTag();
          } else if (isWhitespace(c)) {
            this._state = State.AttribNameSawWhite;
          } else if (nameBody.test(c)) {
            this._buffer.attribName += c;
          } else {
            this._strictFail('Invalid attribute name');
          }
          continue;

        case State.AttribNameSawWhite:
          if (c === '=') {
            this._state = State.AttribValue;
          } else if (isWhitespace(c)) {
            continue;
          } else {
            this._strictFail('Attribute without value');
            if (!this._tag) throw new Error("Unexpected error where tag is undefined");
            this._tag.attributes[this._buffer.attribName] = '';
            this._buffer.attribValue = '';
            if (this._buffer.textNode) this._closeText();
            this.emit('attribute', {
              name: this._buffer.attribName,
              value: ''
            });
            this._buffer.attribName = '';
            if (c === '>') {
              this._openTag();
            } else if (nameStart.test(c)) {
              this._buffer.attribName = c;
              this._state = State.AttribName;
            } else {
              this._strictFail('Invalid attribute name');
              this._state = State.Attrib;
            }
          }
          continue;

        case State.AttribValue:
          if (isWhitespace(c)) {
            continue;
          } else if (isQuote(c)) {
            this._previousChar = c;
            this._state = State.AttribValueQuoted;
          } else {
            this._strictFail('Unquoted attribute value');
            this._state = State.AttribValueUnquoted;
            this._buffer.attribValue = c;
          }
          continue;

        case State.AttribValueQuoted:
          if (c !== this._previousChar) {
            if (c === '&') {
              this._state = State.AttribValueEntityQ;
            } else {
              this._buffer.attribValue += c;
            }
            continue;
          }
          this._attrib();
          this._previousChar = '';
          this._state = State.AttribValueClosed;
          continue;

        case State.AttribValueClosed:
          if (isWhitespace(c)) {
            this._state = State.Attrib;
          } else if (c === '>') {
            this._openTag();
          } else if (c === '/') {
            this._state = State.OpenTagSlash;
          } else if (nameStart.test(c)) {
            this._strictFail('No whitespace between attributes');
            this._buffer.attribName = c;
            this._buffer.attribValue = '';
            this._state = State.AttribName;
          } else {
            this._strictFail('Invalid attribute name');
          }
          continue;

        case State.AttribValueUnquoted:
          if (!isAttribEnd(c)) {
            if (c === '&') {
              this._state = State.AttribValueEntityU;
            } else {
              this._buffer.attribValue += c;
            }
            continue;
          }
          this._attrib();
          if (c === '>') {
            this._openTag();
          } else {
            this._state = State.Attrib;
          }
          continue;

        case State.CloseTag:
          if (!this._buffer.tagName) {
            if (isWhitespace(c)) {
              continue;
            } else if (!nameStart.test(c)) {
              if (this._buffer.script) {
                this._buffer.script += '</' + c;
                this._state = State.Script;
              } else {
                this._strictFail('Invalid tagname in closing tag.');
              }
            } else {
              this._buffer.tagName = c;
            }
          } else if (c === '>') {
            this._closeTag();
          } else if (nameBody.test(c)) {
            this._buffer.tagName += c;
          } else if (this._buffer.script) {
            this._buffer.script += '</' + this._buffer.tagName;
            this._buffer.tagName = '';
            this._state = State.Script;
          } else {
            if (!isWhitespace(c)) {
              this._strictFail('Invalid tagname in closing tag');
            }
            this._state = State.CloseTagSawWhite;
          }
          continue;

        case State.CloseTagSawWhite:
          if (isWhitespace(c)) {
            continue;
          }
          if (c === '>') {
            this._closeTag();
          } else {
            this._strictFail('Invalid characters in closing tag');
          }
          continue;

        case State.TextEntity:
        case State.AttribValueEntityQ:
        case State.AttribValueEntityU:
          let returnState: State|undefined;
          let buffer: 'textNode'|'attribValue'|undefined;
          switch (this._state) {
            case State.TextEntity:
              returnState = State.Text;
              buffer = 'textNode';
              break;

            case State.AttribValueEntityQ:
              returnState = State.AttribValueQuoted;
              buffer = 'attribValue';
              break;

            case State.AttribValueEntityU:
              returnState = State.AttribValueUnquoted;
              buffer = 'attribValue';
              break;
            default:
              throw new Error("Reached point that's not possible");
          }

          if (c === ';') {
            this._buffer[buffer] += this._parseEntity();
            this._buffer.entity = '';
            this._state = returnState;
          } else if ((this._buffer.entity.length ? entityBody : entityStart).test(c)) {
            this._buffer.entity += c;
          } else {
            this._strictFail('Invalid character in entity name');
            this._buffer[buffer] += '&' + this._buffer.entity + c;
            this._buffer.entity = '';
            this._state = returnState;
          }

          continue;

        default:
          throw new Error('Unknown state: ' + this._state);
      }
    }

    if (this._position >= this._bufferCheckPosition) {
      this._checkBufferLength();
    }

    return this;
  }

  /**
   * To gracefully handle errors, assign a listener to the `error` event. Then,
   * when the error is taken care of, you can call `resume` to continue parsing.
   * Otherwise, the parser will not continue while in an error state.
   */
  public resume(): SAXParser<NamespaceSupported> {
    this._error = undefined;
    return this;
  }

  /**
   * Close the stream. Once closed, no more data may be written until it is done
   * processing the buffer, which is signaled by the end event.
   */
  public close(): SAXParser<NamespaceSupported> {
    return this.write(undefined);
  }

  public flush(): void {
    this._closeText();
    if (this._buffer.cdata !== '') {
      if (this._buffer.textNode) this._closeText();
      this.emit('cdata', this._buffer.cdata);
      this._buffer.cdata = '';
    }
    if (this._buffer.script !== '') {
      if (this._buffer.textNode) this._closeText();
      this.emit('script', this._buffer.script);
      this._buffer.script = '';
    }
  }

  private _updatePosition(currentChar: string) {
    if (this._options.trackPosition) {
      this._position++;
      if (currentChar === '\n') {
        this._line++;
        this._column = 0;
      } else {
        this._column++;
      }
    }
  }

  private _clearBuffers(): void {
    this._buffer = {
      comment: '',
      sgmlDecl: '',
      textNode: '',
      tagName: '',
      doctype: '',
      procInstName: '',
      procInstBody: '',
      entity: '',
      attribName: '',
      attribValue: '',
      cdata: '',
      script: ''
    };
  }

  private _emitError(message: string): void {
    this._closeText();
    if (this._options.trackPosition) {
      message += `
Line: ${this._line}
Column: ${this._column}
Char: ${this._currentChar}`;
    }
    const err = new Error(message);
    this._error = err;
    this.emit("error", err);
  }

  private _strictFail(message: string): void {
    if (this._strict) {
      this._emitError(message);
    }
  }

  private _beginWhiteSpace(c: string): void {
    if (c === '<') {
      this._state = State.OpenWaka;
      this._startTagPosition = this._position;
    } else if (!isWhitespace(c)) {
      // have to process this as a text node.
      // weird, but happens.
      this._strictFail('Non-whitespace before first tag.');
      this._buffer.textNode = c;
      this._state = State.Text;
    }
  }

  private _closeText(): void {
    this._buffer.textNode = this._textopts(this._buffer.textNode);
    if (this._buffer.textNode) this.emit('text', this._buffer.textNode);
    this._buffer.textNode = '';
  }

  private _textopts(text: string): string {
    if (this._options.trim) text = text.trim();
    if (this._options.normalize) text = text.replace(/\s+/g, ' ');

    return text;
  }

  private _newTag(): void {
    if (!this._strict) this._buffer.tagName = this._options.lowercase ? this._buffer.tagName.toLowerCase() : this._buffer.tagName.toUpperCase();

    const parentNamespace = this._getParentNamespace();

    const tag = {
      name: this._buffer.tagName,
      attributes: {},
      isSelfClosing: false
    } as ITag | IQualifiedTag;

    // will be overridden if tag contails an xmlns="foo" or xmlns:foo="bar"
    if (this._isNamespacesSupported(tag)) {
      tag.ns = parentNamespace;
    }
    this._tag = tag as TagType<NamespaceSupported>;

    this._attribList.length = 0;
    if (this._buffer.textNode) this._closeText();
    this.emit('opentagstart', tag);
  }

  private _isNamespacesSupported(tag: ITag | IQualifiedTag): tag is IQualifiedTag {
    return !!this._options.xmlns;
  }

  private _parseEntity(): string {
    let entity = this._buffer.entity;
    const entityLC = entity.toLowerCase();
    let num: number = NaN;
    let numStr = '';

    if (this._entities[entity]) {
      return this._entities[entity];
    }
    if (this._entities[entityLC]) {
      return this._entities[entityLC];
    }
    entity = entityLC;
    if (entity.charAt(0) === '#') {
      if (entity.charAt(1) === 'x') {
        entity = entity.slice(2);
        num = parseInt(entity, 16);
        numStr = num.toString(16);
      } else {
        entity = entity.slice(1);
        num = parseInt(entity, 10);
        numStr = num.toString(10);
      }
    }
    entity = entity.replace(/^0+/, '');
    if (isNaN(num) || numStr.toLowerCase() !== entity) {
      this._strictFail('Invalid character entity');
      return '&' + this._buffer.entity + ';';
    }

    return String.fromCodePoint(num);
  }

  private _containsAttrb(name: string): boolean {
    for (const attr of this._attribList) {
      if (attr.name === name)
        return true;
    }

    return false;
  }

  private _attrib(): void {
    if (!this._strict) {
      this._buffer.attribName = this._options.lowercase ? this._buffer.attribName.toLowerCase() : this._buffer.attribName.toUpperCase();
    }

    if (!this._tag) {
      this._emitError("Tag is undefined");
      return;
    }

    if (
      this._containsAttrb(this._buffer.attribName) ||
      this._tag.attributes.hasOwnProperty(this._buffer.attribName)
    ) {
      this._buffer.attribName = this._buffer.attribValue = '';
      return;
    }

    if (this._options.xmlns) {
      const qn = qname(this._buffer.attribName, true);
      const prefix = qn.prefix;
      const local = qn.local;

      if (prefix === 'xmlns') {
        // namespace binding attribute. push the binding into scope
        if (local === 'xml' && this._buffer.attribValue !== XML_NAMESPACE) {
          this._strictFail(
            'xml: prefix must be bound to ' + XML_NAMESPACE + '\n' +
            'Actual: ' + this._buffer.attribValue);
        } else if (local === 'xmlns' && this._buffer.attribValue !== XMLNS_NAMESPACE) {
          this._strictFail(
            'xmlns: prefix must be bound to ' + XMLNS_NAMESPACE + '\n' +
            'Actual: ' + this._buffer.attribValue);
        } else {
          const tag = this._tag;
          if (this._isNamespacesSupported(tag)) {
            const parentNamespace = this._getParentNamespace();
            
            if (tag.ns === parentNamespace) {
              tag.ns = Object.create(parentNamespace);
            }
            tag.ns[local] = this._buffer.attribValue;
          }
        }
      }

      // defer onattribute events until all attributes have been seen
      // so any new bindings can take effect. preserve attribute order
      // so deferred events can be emitted in document order
      this._attribList.push({
        name: this._buffer.attribName,
        value: this._buffer.attribValue
      });
    } else {
      // in non-xmlns mode, we can emit the event right away
      this._tag.attributes[this._buffer.attribName] = this._buffer.attribValue;
      if (this._buffer.textNode) this._closeText();
      this.emit('attribute', {
        name: this._buffer.attribName,
        value: this._buffer.attribValue
      });
    }

    this._buffer.attribName = this._buffer.attribValue = '';
  }

  private _openTag(selfClosing?: boolean): void {
    const tag = this._tag;
    if (!tag) {
      this._emitError("Tag is undefined");
      return;
    }

    if (this._options.xmlns && this._isNamespacesSupported(tag)) {
      // add namespace info to tag
      const qn = qname(this._buffer.tagName);
      tag.prefix = qn.prefix;
      tag.local = qn.local;
      tag.uri = tag.ns[qn.prefix] || '';

      if (tag.prefix && !tag.uri) {
        this._strictFail( 'Unbound namespace prefix: ' +
          JSON.stringify(this._buffer.tagName));
        tag.uri = qn.prefix;
      }

      const parentNamespace = this._getParentNamespace();
      if (tag.ns && parentNamespace !== tag.ns) {
        Object.keys(tag.ns).forEach((p) => {
          if (this._buffer.textNode) this._closeText();
          this.emit('opennamespace', {
            prefix: p,
            uri: tag.ns[p]
          });
        });
      }

      // handle deferred onattribute events
      // Note: do not apply default ns to attributes:
      //   http://www.w3.org/TR/REC-xml-names/#defaulting
      for (let i = 0, l = this._attribList.length; i < l; i++) {
        const { name, value } = this._attribList[i];
        const qualName = qname(name, true);
        const prefix = qualName.prefix;
        const local = qualName.local;
        const uri = prefix === '' ? '' : (tag.ns[prefix] || '');
        const a = {
          name,
          value,
          prefix,
          local,
          uri
        };

        // if there's any attributes with an undefined namespace,
        // then fail on them now.
        if (prefix && prefix !== 'xmlns' && !uri) {
          this._strictFail( 'Unbound namespace prefix: ' +
            JSON.stringify(prefix));
          a.uri = prefix;
        }
        tag.attributes[name] = a;
        if (this._buffer.textNode) this._closeText();
        this.emit('attribute', a);
      }
      this._attribList.length = 0;
    }

    tag.isSelfClosing = !!selfClosing;

    // process the tag
    this._sawRoot = true;
    this._tags.push(tag);
    if (this._buffer.textNode) this._closeText();
    this.emit('opentag', tag);
    if (!selfClosing) {
      // special case for <script> in non-strict mode.
      if (!(this._strict || this._options.noscript) && this._buffer.tagName.toLowerCase() === 'script') {
        this._state = State.Script;
      } else {
        this._state = State.Text;
      }
      this._tag = undefined;
      this._buffer.tagName = '';
    }
    this._buffer.attribName = this._buffer.attribValue = '';
    this._attribList.length = 0;
  }

  private _closeTag(): void {
    if (!this._buffer.tagName) {
      this._strictFail( 'Weird empty close tag.');
      this._buffer.textNode += '</>';
      this._state = State.Text;
      return;
    }

    if (this._buffer.script) {
      if (this._buffer.tagName !== 'script') {
        this._buffer.script += '</' + this._buffer.tagName + '>';
        this._buffer.tagName = '';
        this._state = State.Script;
        return;
      }
      if (this._buffer.textNode) this._closeText();
      this.emit('script', this._buffer.script);
      this._buffer.script = '';
    }

    // first make sure that the closing tag actually exists.
    // <a><b></c></b></a> will close everything, otherwise.
    let t = this._tags.length;
    let tagName = this._buffer.tagName;
    if (!this._strict) {
      tagName = this._options.lowercase ? tagName.toLowerCase() : tagName.toUpperCase();
    }
    const closeTo = tagName;
    while (t--) {
      const close = this._tags[t];
      if (close.name !== closeTo) {
        // fail the first time in strict mode
        this._strictFail( 'Unexpected close tag');
      } else {
        break;
      }
    }

    // didn't find it.  we already failed for strict, so just abort.
    if (t < 0) {
      this._strictFail( 'Unmatched closing tag: ' + this._buffer.tagName);
      this._buffer.textNode += '</' + this._buffer.tagName + '>';
      this._state = State.Text;
      return;
    }
    this._buffer.tagName = tagName;
    let s = this._tags.length;
    while (s-- > t) {
      const tag = this._tag = this._tags.pop()!;
      this._buffer.tagName = tag.name;
      if (this._buffer.textNode) this._closeText();
      this.emit('closetag', this._buffer.tagName);

      const parentNamespace = this._getParentNamespace();
      if (this._options.xmlns && this._isNamespacesSupported(tag) && tag.ns !== parentNamespace) {
        // remove namespace bindings introduced by tag
        Object.keys(tag.ns).forEach(p => {
          const n = tag.ns[p];
          if (this._buffer.textNode) this._closeText();
          this.emit('closenamespace', { prefix: p, uri: n });
        });
      }
    }
    if (t === 0) this._closedRoot = true;
    this._buffer.tagName = this._buffer.attribValue = this._buffer.attribName = '';
    this._attribList.length = 0;
    this._state = State.Text;
  }

  private _checkSingleBuffer(type: keyof IBuffer, buffer: string, maxAllowed: number) {
    const len = buffer.length;
    if (len > maxAllowed) {
      // Text/cdata nodes can get big, and since they're buffered,
      // we can get here under normal conditions.
      // Avoid issues by emitting the text node now,
      // so at least it won't get any bigger.
      switch (type) {
        case 'textNode':
          this._closeText();
          break;

        case 'cdata':
          if (this._buffer.textNode) this._closeText();
          this.emit('cdata', this._buffer.cdata);
          this._buffer.cdata = '';
          break;

        case 'script':
          if (this._buffer.textNode) this._closeText();
          this.emit('script', this._buffer.script);
          this._buffer.script = '';
          break;

        default:
          this._emitError('Max buffer length exceeded: ' + buffer);
      }
    }

    return len;
  }

  private _checkBufferLength() {
    const maxAllowed = Math.max(MAX_BUFFER_LENGTH, 10);
    let maxActual = 0;

    maxActual = Math.max(maxActual, this._checkSingleBuffer("comment", this._buffer.comment, maxAllowed));
    maxActual = Math.max(maxActual, this._checkSingleBuffer("sgmlDecl", this._buffer.sgmlDecl, maxAllowed));
    maxActual = Math.max(maxActual, this._checkSingleBuffer("textNode", this._buffer.textNode, maxAllowed));
    maxActual = Math.max(maxActual, this._checkSingleBuffer("tagName", this._buffer.tagName, maxAllowed));
    if (typeof this._buffer.doctype === "string") {
      maxActual = Math.max(maxActual, this._checkSingleBuffer("doctype", this._buffer.doctype, maxAllowed));
    }
    maxActual = Math.max(maxActual, this._checkSingleBuffer("procInstName", this._buffer.procInstName, maxAllowed));
    maxActual = Math.max(maxActual, this._checkSingleBuffer("procInstBody", this._buffer.procInstBody, maxAllowed));
    maxActual = Math.max(maxActual, this._checkSingleBuffer("entity", this._buffer.entity, maxAllowed));
    maxActual = Math.max(maxActual, this._checkSingleBuffer("attribName", this._buffer.attribName, maxAllowed));
    maxActual = Math.max(maxActual, this._checkSingleBuffer("attribValue", this._buffer.attribValue, maxAllowed));
    maxActual = Math.max(maxActual, this._checkSingleBuffer("cdata", this._buffer.cdata, maxAllowed));
    maxActual = Math.max(maxActual, this._checkSingleBuffer("script", this._buffer.script, maxAllowed));

    // schedule the next check for the earliest possible buffer overrun.
    const m = MAX_BUFFER_LENGTH - maxActual;
    this._bufferCheckPosition = m + this._position;
  }

  private _getParentNamespace(): { [key: string]: string } {
    if (this._tags.length > 0) {
      const parent = this._tags[this._tags.length - 1];
      if (this._isNamespacesSupported(parent)) {
        return parent.ns;
      }
    } else {
      return rootNS;
    }

    return {};
  }
}
