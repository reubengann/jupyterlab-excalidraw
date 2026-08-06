const { TextDecoder, TextEncoder } = require('util');

if (!globalThis.CSS) {
  globalThis.CSS = {};
}

globalThis.CSS.supports = () => false;
globalThis.TextDecoder = TextDecoder;
globalThis.TextEncoder = TextEncoder;
