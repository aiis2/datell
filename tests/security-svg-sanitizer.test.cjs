require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');

const { sanitizeSvgMarkup } = require('../src/renderer/utils/svgSanitizer.ts');

const malicious = `<svg viewBox="0 0 10 10" onload="alert(1)">
  <script>alert(2)</script>
  <foreignObject><iframe src="javascript:alert(3)"></iframe></foreignObject>
  <a href="javascript:alert(4)"><circle onclick="alert(5)" cx="5" cy="5" r="4"/></a>
  <image xlink:href="data:text/html,<script>alert(6)</script>"/>
</svg>`;

const sanitized = sanitizeSvgMarkup(malicious);

assert.match(sanitized, /^<svg\b/i, 'sanitized custom illustration should still be SVG markup');
assert.doesNotMatch(sanitized, /<script\b/i, 'script tags should be removed');
assert.doesNotMatch(sanitized, /foreignObject/i, 'foreignObject should be removed');
assert.doesNotMatch(sanitized, /\son\w+\s*=/i, 'event handler attributes should be removed');
assert.doesNotMatch(sanitized, /javascript:/i, 'javascript: URLs should be removed');
assert.doesNotMatch(sanitized, /data:text\/html/i, 'HTML data URLs should be removed');
assert.equal(sanitizeSvgMarkup('<img src=x onerror=alert(1)>'), '', 'non-SVG markup should not be rendered');

console.log('security svg sanitizer ok');
