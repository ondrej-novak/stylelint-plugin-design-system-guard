import { describe, expect, it } from 'vitest';
import { ruleName } from '../src/rules/no-class-redefinition.js';
import { lint } from './lint.js';

const options = { classes: ['btnPrimary', 'surfaceCard'] };
const run = (code, extra = {}) => lint(code, { ruleName, options: { ...options, ...extra.options }, file: extra.file });

describe('no-class-redefinition', () => {
  it('rejects a module file that redefines a design-system class', async () => {
    const warnings = await run('.btnPrimary { color: red; }');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('Apply className="btnPrimary"');
  });

  it('rejects the class inside a compound or nested selector', async () => {
    const warnings = await run('.toolbar { .surfaceCard:hover { padding: 0; } }');
    expect(warnings).toHaveLength(1);
  });

  it('rejects @extend of a design-system class', async () => {
    const warnings = await run('.save { @extend .btnPrimary; }');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('Do not @extend ".btnPrimary"');
  });

  it('rejects an !optional @extend', async () => {
    expect(await run('.save { @extend .btnPrimary !optional; }')).toHaveLength(1);
  });

  it('allows a class that only starts with a protected name', async () => {
    expect(await run('.btnPrimaryIcon { width: 16px; } .btnPrimary-label { gap: 4px; }')).toEqual([]);
  });

  it('allows a class the selector only filters on', async () => {
    const code = '.card:not(.btnPrimary) { gap: 4px; } .toolbar:has(.btnPrimary) { gap: 4px; } a[href$=".btnPrimary"] { color: red; }';
    expect(await run(code)).toEqual([]);
  });

  it('rejects the class inside :is() or :global()', async () => {
    expect(await run(':is(.btnPrimary) { color: red; } :global(.surfaceCard) { padding: 0; }')).toHaveLength(2);
  });

  it('rejects a class built by nesting', async () => {
    const warnings = await run('.btn { &Primary { color: red; } }');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('".btnPrimary"');
  });

  it('reports a redefinition once, not again for every nested rule', async () => {
    expect(await run('.btnPrimary { color: red; &:hover { color: blue; } .label { gap: 4px; } }')).toHaveLength(1);
  });

  it('rejects the class under @at-root', async () => {
    expect(await run('.toolbar { @at-root .btnPrimary { color: red; } }')).toHaveLength(1);
  });

  it('reports every protected class in a selector list', async () => {
    const warnings = await run('.btnPrimary, .surfaceCard { color: red; }');
    expect(warnings.map(({ text }) => text)).toEqual([
      expect.stringContaining('".btnPrimary"'),
      expect.stringContaining('".surfaceCard"'),
    ]);
  });

  it('points at the protected class, not a longer class that starts with it', async () => {
    const [warning] = await run('.btnPrimaryIcon, .btnPrimary { color: red; }');
    expect(warning.column).toBe(18);
  });

  it('passes the class name to a custom message', async () => {
    const warnings = await run('.btnPrimary { color: red; }', {
      options: { message: (name) => `Use ${name} from the design system.` },
    });
    expect(warnings[0].text).toBe(`Use btnPrimary from the design system. (${ruleName})`);
  });

  it('leaves global stylesheets alone, since that is where the classes are defined', async () => {
    expect(await run('.btnPrimary { color: red; }', { file: 'src/styles/_buttons.scss' })).toEqual([]);
  });

  it('honours a custom files pattern', async () => {
    const warnings = await run('.btnPrimary { color: red; }', {
      file: 'src/components/Button.scss',
      options: { files: 'src/components/' },
    });
    expect(warnings).toHaveLength(1);
  });

  it('matches files against the path relative to the working directory', async () => {
    const warnings = await run('.btnPrimary { color: red; }', {
      file: 'src/components/Button.scss',
      options: { files: '^src/components/' },
    });
    expect(warnings).toHaveLength(1);
  });

  it('accepts a list of files patterns', async () => {
    const warnings = await run('.btnPrimary { color: red; }', {
      file: 'src/pages/Home.scss',
      options: { files: ['src/components/', 'src/pages/'] },
    });
    expect(warnings).toHaveLength(1);
  });

  it('checks every file when the files RegExp has the g flag', async () => {
    const files = /\.module\.scss$/g;
    for (const file of ['Button.module.scss', 'Card.module.scss', 'Menu.module.scss']) {
      expect(await run('.btnPrimary { color: red; }', { file, options: { files } })).toHaveLength(1);
    }
  });

  it('accepts a single class as a string', async () => {
    expect(await run('.btnPrimary { color: red; }', { options: { classes: 'btnPrimary' } })).toHaveLength(1);
  });

  it('reports a files pattern that does not compile as an invalid option', async () => {
    await expect(run('.btnPrimary { color: red; }', { options: { files: '[src' } })).rejects.toThrow(
      'Invalid value "[src" for option "files"',
    );
  });

  it('appends the hint so the message can point at the team rule', async () => {
    const warnings = await run('.btnPrimary { color: red; }', { options: { hint: 'See docs/buttons.md.' } });
    expect(warnings[0].text).toContain('See docs/buttons.md.');
  });
});
