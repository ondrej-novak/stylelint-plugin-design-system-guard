import { describe, expect, it } from 'vitest';
import { ruleName } from '../src/rules/no-local-geometry.js';
import { lint } from './lint.js';

// Sample sizes. In a consuming project they live once in src/styles/_preview.scss (see the README),
// and code there can read them instead of repeating them:
//
//   import { readFileSync } from 'node:fs';
//   import scss from 'postcss-scss';
//
//   const sizes = new Map();
//   scss.parse(readFileSync('src/styles/_preview.scss', 'utf8')).walkDecls(/^--preview-/, (decl) => {
//     sizes.set(decl.prop, decl.value);
//   });
//   const MOBILE_WIDTH = sizes.get('--preview-mobile-width');
//
// The rule checks property names, never values, so plain constants are enough here.
const MOBILE_WIDTH = '375px';
const MOBILE_HEIGHT = '600px';
const MOBILE_PADDING = '8px';
// Deliberately not a design-system size: the rule must leave it alone.
const SIDEBAR_WIDTH = '380px';
const options = { selectors: ['\\[data-viewport'] };
const run = (code, extra = {}) => lint(code, { ruleName, options: { ...options, ...extra.options }, file: extra.file });

describe('no-local-geometry', () => {
  it('rejects a width set under a scoped selector', async () => {
    const warnings = await run(`[data-viewport='mobile'] .frame { width: ${MOBILE_WIDTH}; }`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('"width"');
  });

  it('finds the scope through nesting', async () => {
    const warnings = await run(`.preview { &[data-viewport='mobile'] { .frame { max-width: ${MOBILE_WIDTH}; } } }`);
    expect(warnings).toHaveLength(1);
  });

  it('rejects logical width properties by default', async () => {
    expect(await run(`[data-viewport='mobile'] { inline-size: ${MOBILE_WIDTH}; max-inline-size: ${MOBILE_WIDTH}; }`)).toHaveLength(2);
  });

  it('passes the property to a custom message', async () => {
    const warnings = await run(`[data-viewport='mobile'] { width: ${MOBILE_WIDTH}; }`, {
      options: { message: (property) => `${property} comes from previewFrame.` },
    });
    expect(warnings[0].text).toBe(`width comes from previewFrame. (${ruleName})`);
  });

  it('allows other properties under the scope', async () => {
    expect(await run(`[data-viewport='mobile'] { padding: ${MOBILE_PADDING}; }`)).toEqual([]);
  });

  it('allows widths outside the scope', async () => {
    expect(await run(`.sidebar { width: ${SIDEBAR_WIDTH}; }`)).toEqual([]);
  });

  it('checks the configured properties only', async () => {
    const code = `[data-viewport='mobile'] { width: ${MOBILE_WIDTH}; height: ${MOBILE_HEIGHT}; }`;
    const warnings = await run(code, { options: { properties: ['height'] } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('"height"');
  });

  it('accepts a single selector and property as strings', async () => {
    const code = `[data-viewport='mobile'] { width: ${MOBILE_WIDTH}; height: ${MOBILE_HEIGHT}; }`;
    const warnings = await run(code, { options: { selectors: '\\[data-viewport', properties: 'height' } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('"height"');
  });

  it('matches configured properties regardless of case', async () => {
    const warnings = await run(`[data-viewport='mobile'] { height: ${MOBILE_HEIGHT}; }`, { options: { properties: ['Height'] } });
    expect(warnings).toHaveLength(1);
  });

  it('checks every declaration when a selector RegExp has the g flag', async () => {
    const code = `[data-viewport] { width: ${MOBILE_WIDTH}; min-width: ${MOBILE_WIDTH}; max-width: ${MOBILE_WIDTH}; }`;
    expect(await run(code, { options: { selectors: [/data-viewport/g] } })).toHaveLength(3);
  });

  it('reports a selector that does not compile as an invalid option', async () => {
    await expect(run(`.frame { width: ${MOBILE_WIDTH}; }`, { options: { selectors: ['[data-viewport'] } })).rejects.toThrow(
      'Invalid value "[data-viewport" for option "selectors"',
    );
  });
});
