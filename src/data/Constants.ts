// this really needs to be replaced with character classes.
// XML allows all manner of ridiculous numbers and digits.
export const CDATA = '[CDATA[';
export const DOCTYPE = 'DOCTYPE';
export const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
export const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';
export const rootNS = { xml: XML_NAMESPACE, xmlns: XMLNS_NAMESPACE };

// When we pass the MAX_BUFFER_LENGTH position, start checking for buffer
// overruns. When we check, schedule the next check for MAX_BUFFER_LENGTH
// - (max(buffer lengths)), since that's the earliest that a buffer overrun
// could occur.  This way, checks are as rare as required, but as often as
// necessary to ensure never crossing this bound. Furthermore, buffers are only
// tested at most once per write(), so passing a very large string into write()
// might have undesirable effects, but this is manageable by the caller, so it
// is assumed to be safe.  Thus, a call to write() may, in the extreme edge
// case, result in creating at most one complete copy of the string passed in.
// Set to Infinity to have unlimited buffers.
export const MAX_BUFFER_LENGTH = 64 * 1024;