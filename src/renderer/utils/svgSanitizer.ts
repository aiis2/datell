const SVG_ROOT_PATTERN = /^<svg[\s>]/i;

const BLOCKED_ELEMENT_PATTERN =
  /<\s*(script|foreignObject|iframe|object|embed|link|meta|base|form|input|button|textarea|select|audio|video|canvas)\b[\s\S]*?(?:<\s*\/\s*\1\s*>|\/\s*>)/gi;

const BLOCKED_EMPTY_ELEMENT_PATTERN =
  /<\s*(script|foreignObject|iframe|object|embed|link|meta|base|form|input|button|textarea|select|audio|video|canvas)\b[^>]*>/gi;

const EVENT_HANDLER_ATTR_PATTERN = /\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const UNSAFE_URL_ATTR_PATTERN =
  /\s+(href|xlink:href|src)\s*=\s*(?:"\s*(?:javascript:|data:text\/html)[^"]*"|'\s*(?:javascript:|data:text\/html)[^']*'|(?:javascript:|data:text\/html)[^\s>]*)/gi;
const UNSAFE_STYLE_ATTR_PATTERN =
  /\s+style\s*=\s*(?:"[^"]*(?:expression\s*\(|javascript:|url\s*\(\s*['"]?\s*javascript:)[^"]*"|'[^']*(?:expression\s*\(|javascript:|url\s*\(\s*["']?\s*javascript:)[^']*')/gi;

export function sanitizeSvgMarkup(input: string): string {
  const source = String(input ?? '').trim();
  if (!SVG_ROOT_PATTERN.test(source)) return '';

  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(BLOCKED_ELEMENT_PATTERN, '')
    .replace(BLOCKED_EMPTY_ELEMENT_PATTERN, '')
    .replace(EVENT_HANDLER_ATTR_PATTERN, '')
    .replace(UNSAFE_URL_ATTR_PATTERN, '')
    .replace(UNSAFE_STYLE_ATTR_PATTERN, '')
    .trim();
}
