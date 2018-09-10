export interface IOptions<NamespaceSupported> {
  /**
   * Whether or not to trim text and comment nodes.
   * 
   * Default: false
   */
  trim: boolean;

  /**
   * If true, then turn any whitespace into a single space.
   * 
   * Default: false
   */
  normalize: boolean;

  /**
   * If true, then lowercase tag names and attribute names in loose mode, rather than uppercasing them.
   * 
   * Default: false
   */
  lowercase: boolean;

  /**
   * If true, then namespaces are supported.
   * 
   * Default: false
   */
  xmlns: NamespaceSupported;

  /**
   * If false, then don't track line/col/position.
   * 
   * Default: false
   */
  trackPosition: boolean;

  /**
   * If true, only parse
   * [predefined XML entities](http://www.w3.org/TR/REC-xml/#sec-predefined-ent)
   * (`&amp;`, `&apos;`, `&gt;`, `&lt;`, and `&quot;`)
   * 
   * Default: false
   */
  strictEntities: boolean;

  noscript: boolean;
}