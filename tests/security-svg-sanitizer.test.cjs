require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');

const { sanitizeSvgMarkup } = require('../src/renderer/utils/svgSanitizer.ts');

const malicious = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" onload="alert(1)">
  <script>alert(2)</script>
  <foreignObject><iframe src="javascript:alert(3)"></iframe></foreignObject>
  <a href="javascript:alert(4)"><circle onclick="alert(5)" cx="5" cy="5" r="4"/></a>
  <image xlink:href="data:text/html,%3Cscript%3Ealert(6)%3C/script%3E"/>
</svg>`;

const sanitized = sanitizeSvgMarkup(malicious);

assert.match(sanitized, /^<svg\b/i, 'sanitized custom illustration should still be SVG markup');
assert.doesNotMatch(sanitized, /<script\b/i, 'script tags should be removed');
assert.doesNotMatch(sanitized, /foreignObject/i, 'foreignObject should be removed');
assert.doesNotMatch(sanitized, /\son\w+\s*=/i, 'event handler attributes should be removed');
assert.doesNotMatch(sanitized, /javascript:/i, 'javascript: URLs should be removed');
assert.doesNotMatch(sanitized, /data:text\/html/i, 'HTML data URLs should be removed');
assert.equal(sanitizeSvgMarkup('<img src=x onerror=alert(1)>'), '', 'non-SVG markup should not be rendered');

const encodedProtocol = sanitizeSvgMarkup(`
  <svg xmlns="http://www.w3.org/2000/svg">
    <a href="jav&#x61;script:alert(1)"><circle r="4"/></a>
    <animate attributeName="href" values="jav&#x61;script:alert(2)"/>
    <set attributeName="onload" to="alert(3)"/>
  </svg>
`);

assert.doesNotMatch(
  encodedProtocol,
  /\bhref\s*=/i,
  'entity-encoded script URLs must not survive as navigable attributes',
);
assert.doesNotMatch(
  encodedProtocol,
  /<(?:animate|set)\b/i,
  'SVG animation elements must not mutate URL or event attributes after sanitization',
);

const ordinarySvg = sanitizeSvgMarkup(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <defs>
      <linearGradient id="paint"><stop offset="0" style="stop-color: #fff"/></linearGradient>
      <symbol id="dot"><circle r="2"/></symbol>
    </defs>
    <rect width="10" height="10" fill="url(#paint)"/>
    <use href="#dot" x="5" y="5"/>
  </svg>
`);
assert.match(ordinarySvg, /<linearGradient\b/, 'static gradients should remain renderable');
assert.match(ordinarySvg, /fill="url\(#paint\)"/, 'local paint references should remain available');
assert.match(ordinarySvg, /<use\s+href="#dot"/, 'local symbol references should remain available');

console.log('security svg sanitizer ok');
