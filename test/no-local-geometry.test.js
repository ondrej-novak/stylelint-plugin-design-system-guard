import { describe, expect, it } from 'vitest';
import { ruleName } from '../src/rules/no-local-geometry.js';
import { lint } from './lint.js';

const options = { selectors: ['\\[data-viewport'] };
const run = (code, extra = {}) => lint(code, { ruleName, options: { ...options, ...extra.options }, file: extra.file });

describe('no-local-geometry', () => {
  it('rejects a width set under a scoped selector', async () => {
    const warnings = await run("[data-viewport='mobile'] .frame { width: 375px; }");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('"width"');
  });

  it('finds the scope through nesting', async () => {
    const warnings = await run(".preview { &[data-viewport='mobile'] { .frame { max-width: 360px; } } }");
    expect(warnings).toHaveLength(1);
  });

  it('allows other properties under the scope', async () => {
    expect(await run("[data-viewport='mobile'] { padding: 8px; }")).toEqual([]);
  });

  it('allows widths outside the scope', async () => {
    expect(await run('.sidebar { width: 380px; }')).toEqual([]);
  });

  it('checks the configured properties only', async () => {
    const code = "[data-viewport='mobile'] { width: 375px; height: 600px; }";
    const warnings = await run(code, { options: { properties: ['height'] } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('"height"');
  });

  it('accepts a single selector and property as strings', async () => {
    const code = "[data-viewport='mobile'] { width: 375px; height: 600px; }";
    const warnings = await run(code, { options: { selectors: '\\[data-viewport', properties: 'height' } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('"height"');
  });

  it('matches configured properties regardless of case', async () => {
    const warnings = await run("[data-viewport='mobile'] { height: 600px; }", { options: { properties: ['Height'] } });
    expect(warnings).toHaveLength(1);
  });

  it('checks every declaration when a selector RegExp has the g flag', async () => {
    const code = '[data-viewport] { width: 375px; min-width: 375px; max-width: 375px; }';
    expect(await run(code, { options: { selectors: [/data-viewport/g] } })).toHaveLength(3);
  });

  it('reports a selector that does not compile as an invalid option', async () => {
    await expect(run('.frame { width: 375px; }', { options: { selectors: ['[data-viewport'] } })).rejects.toThrow(
      'Invalid value "[data-viewport" for option "selectors"',
    );
  });
});
