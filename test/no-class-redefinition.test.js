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

  it('allows a class that only starts with a protected name', async () => {
    expect(await run('.btnPrimaryIcon { width: 16px; } .btnPrimary-label { gap: 4px; }')).toEqual([]);
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
