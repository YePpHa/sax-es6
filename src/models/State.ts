export enum State {
  /**
   * leading byte order mark or whitespace
   */
  Begin,

  /**
   * leading whitespace
   */
  BeginWhitespace,

  /**
   * general stuff
   */
  Text,

  /**
   * &amp and such.
   */
  TextEntity,

  /**
   * <
   */
  OpenWaka,

  /**
   * <!BLARG
   */
  SgmlDecl,

  /**
   * <!BLARG foo "bar
   */
  SgmlDeclQuoted,

  /**
   * <!DOCTYPE
   */
  DocType,

  /**
   * <!DOCTYPE "//blah
   */
  DocTypeQuoted,

  /**
   * <!DOCTYPE "//blah" [ ...
   */
  DocTypeDTD,

  /**
   * <!DOCTYPE "//blah" [ "foo
   */
  DocTypeDTDQuoted,

  /**
   * <!-
   */
  CommentStarting,

  /**
   * <!--
   */
  Comment,

  /**
   * <!-- blah -
   */
  CommentEnding,

  /**
   * <!-- blah --
   */
  CommentEnded,

  /**
   * <![CDATA[ something
   */
  CData,

  /**
   * ]
   */
  CDataEnding,

  /**
   * ]]
   */
  CDataEnding2,

  /**
   * <?hi
   */
  ProcInst,

  /**
   * <?hi there
   */
  ProcInstBody,

  /**
   * <?hi "there" ?
   */
  ProcInstEnding,

  /**
   * <strong
   */
  OpenTag,

  /**
   * <strong /
   */
  OpenTagSlash,

  /**
   * <a
   */
  Attrib,

  /**
   * <a foo
   */
  AttribName,

  /**
   * <a foo _
   */
  AttribNameSawWhite,

  /**
   * <a foo=
   */
  AttribValue,

  /**
   * <a foo="bar
   */
  AttribValueQuoted,

  /**
   * <a foo="bar"
   */
  AttribValueClosed,

  /**
   * <a foo=bar
   */
  AttribValueUnquoted,

  /**
   * <foo bar="&quot;"
   */
  AttribValueEntityQ,

  /**
   * <foo bar=&quot
   */
  AttribValueEntityU,

  /**
   * </a
   */
  CloseTag,

  /**
   * </a   >
   */
  CloseTagSawWhite,

  /**
   * <script> ...
   */
  Script,

  /**
   * <script> ... <
   */
  ScriptEnding
}