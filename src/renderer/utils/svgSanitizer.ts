import {
  DOMParser,
  XMLSerializer,
  type Attr as XmlAttr,
  type Document as XmlDocument,
  type Element as XmlElement,
  type Node as XmlNode,
} from '@xmldom/xmldom';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const ALLOWED_ELEMENTS = new Set([
  'circle',
  'clippath',
  'defs',
  'desc',
  'ellipse',
  'feblend',
  'fecolormatrix',
  'fecomponenttransfer',
  'fecomposite',
  'feconvolvematrix',
  'fediffuselighting',
  'fedisplacementmap',
  'fedistantlight',
  'fedropshadow',
  'feflood',
  'fefunca',
  'fefuncb',
  'fefuncg',
  'fefuncr',
  'fegaussianblur',
  'femerge',
  'femergenode',
  'femorphology',
  'feoffset',
  'fepointlight',
  'fespecularlighting',
  'fespotlight',
  'fetile',
  'feturbulence',
  'filter',
  'g',
  'line',
  'lineargradient',
  'marker',
  'mask',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialgradient',
  'rect',
  'stop',
  'svg',
  'symbol',
  'text',
  'title',
  'tspan',
  'use',
]);

const SAFE_STYLE_PROPERTIES = new Set([
  'color',
  'display',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'fill-rule',
  'flood-color',
  'flood-opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'lighting-color',
  'opacity',
  'paint-order',
  'shape-rendering',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'vector-effect',
  'visibility',
]);

const LOCAL_FRAGMENT_PATTERN = /^#[A-Za-z_][\w:.-]*$/;
const UNSAFE_PROTOCOL_PATTERN = /^(?:data|javascript|vbscript):/i;
const URL_FUNCTION_PATTERN = /url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi;

function hasOnlyLocalUrlReferences(value: string): boolean {
  let found = false;
  let match: RegExpExecArray | null;
  URL_FUNCTION_PATTERN.lastIndex = 0;
  while ((match = URL_FUNCTION_PATTERN.exec(value)) !== null) {
    found = true;
    if (!LOCAL_FRAGMENT_PATTERN.test(match[2].trim())) return false;
  }
  URL_FUNCTION_PATTERN.lastIndex = 0;
  return !found || !/url\s*\(/i.test(value.replace(URL_FUNCTION_PATTERN, ''));
}

function sanitizeStyle(style: string): string {
  const declarations: string[] = [];
  for (const candidate of style.split(';')) {
    const separator = candidate.indexOf(':');
    if (separator < 1) continue;

    const property = candidate.slice(0, separator).trim().toLowerCase();
    const value = candidate.slice(separator + 1).trim();
    if (!SAFE_STYLE_PROPERTIES.has(property) || !value) continue;
    if (/[\\@]|expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding/i.test(value)) continue;
    if (!hasOnlyLocalUrlReferences(value)) continue;
    declarations.push(`${property}: ${value}`);
  }
  return declarations.join('; ');
}

function removeAttribute(element: XmlElement, attribute: XmlAttr): void {
  try {
    element.removeAttributeNode(attribute);
  } catch {
    element.removeAttribute(attribute.name);
  }
}

function sanitizeAttributes(element: XmlElement, elementName: string): void {
  const attributes = Array.from({ length: element.attributes.length }, (_, index) => element.attributes.item(index))
    .filter((attribute): attribute is XmlAttr => attribute !== null);

  for (const attribute of attributes) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value.trim();
    const compactValue = value.replace(/[\u0000-\u0020\u007f]+/g, '');

    if (name.startsWith('on') || name === 'xml:base' || name === 'base' || name === 'src') {
      removeAttribute(element, attribute);
      continue;
    }

    if (name === 'href' || name === 'xlink:href') {
      if (elementName !== 'use' || !LOCAL_FRAGMENT_PATTERN.test(value)) {
        removeAttribute(element, attribute);
      }
      continue;
    }

    if (name === 'style') {
      const safeStyle = sanitizeStyle(value);
      if (safeStyle) {
        attribute.value = safeStyle;
      } else {
        removeAttribute(element, attribute);
      }
      continue;
    }

    if (UNSAFE_PROTOCOL_PATTERN.test(compactValue) || !hasOnlyLocalUrlReferences(value)) {
      removeAttribute(element, attribute);
    }
  }
}

function sanitizeElement(element: XmlElement): void {
  const elementName = (element.localName || element.nodeName).toLowerCase();
  sanitizeAttributes(element, elementName);

  const children = Array.from({ length: element.childNodes.length }, (_, index) => element.childNodes.item(index))
    .filter((child): child is XmlNode => child !== null);

  for (const child of children) {
    if (child.nodeType === 1) {
      const childElement = child as XmlElement;
      const childName = (childElement.localName || childElement.nodeName).toLowerCase();
      const namespace = childElement.namespaceURI;
      if (!ALLOWED_ELEMENTS.has(childName) || (namespace && namespace !== SVG_NAMESPACE)) {
        element.removeChild(childElement);
      } else {
        sanitizeElement(childElement);
      }
    } else if (child.nodeType === 7 || child.nodeType === 8 || child.nodeType === 10) {
      element.removeChild(child);
    }
  }
}

export function sanitizeSvgMarkup(input: string): string {
  const source = String(input ?? '').trim();
  if (!source || /<!DOCTYPE/i.test(source)) return '';

  let parseFailed = false;
  let document: XmlDocument;
  try {
    document = new DOMParser({
      onError: () => {
        parseFailed = true;
      },
    }).parseFromString(source, 'image/svg+xml');
  } catch {
    return '';
  }

  const root = document.documentElement;
  const rootName = root ? (root.localName || root.nodeName).toLowerCase() : '';
  if (parseFailed || !root || rootName !== 'svg' || (root.namespaceURI && root.namespaceURI !== SVG_NAMESPACE)) {
    return '';
  }

  sanitizeElement(root);
  return new XMLSerializer().serializeToString(root).trim();
}
