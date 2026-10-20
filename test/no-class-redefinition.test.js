import { describe, expect, it } from 'vitest';
import { ruleName } from '../src/rules/no-class-redefinition.js';
import { lint } from './lint.js';

// Sample classes. In a consuming project they are the global classes in src/styles/ (see the README),
// and stylelint.config.js can read them from there instead of listing them by hand:
//
//   import { readFileSync } from 'node:fs';
//   import scss from 'postcss-scss';
//
//   const classes = [];
//   scss.parse(readFileSync('src/styles/_buttons.scss', 'utf8')).walkRules(/^\.[\w-]+$/, (rule) => {
//     classes.push(rule.selector.slice(1));
//   });
//
//   rules: { 'design-system-guard/no-class-redefinition': [true, { classes }] }
//
// The tests keep a fixed list, since they check the rule, not a stylesheet.
const options = { classes: ['btnPrimary', 'surfaceCard'] };
const run = (code, extra = {}) => lint(code, { ruleName, options: { ...options, ...extra.options }, file: extra.file });

describe('no-class-redefinition', () => {
  it('rejects a module file that redefines a design-system class', async () => {
    const warnings = await run('.btnPrimary {}');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('Apply className="btnPrimary"');
  });

  it('rejects the class inside a compound or nested selector', async () => {
    const warnings = await run('.toolbar { .surfaceCard:hover {} }');
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
    expect(await run('.btnPrimaryIcon {} .btnPrimary-label {}')).toEqual([]);
  });

  it('allows a class the selector only filters on', async () => {
    const code = '.card:not(.btnPrimary) {} .toolbar:has(.btnPrimary) {} a[href$=".btnPrimary"] {}';
    expect(await run(code)).toEqual([]);
  });

  it('rejects the class inside :is() or :global()', async () => {
    expect(await run(':is(.btnPrimary) {} :global(.surfaceCard) {}')).toHaveLength(2);
  });

  it('rejects a class built by nesting', async () => {
    const warnings = await run('.btn { &Primary {} }');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('".btnPrimary"');
  });

  it('reports a redefinition once, not again for every nested rule', async () => {
    expect(await run('.btnPrimary { &:hover {} .label {} }')).toHaveLength(1);
  });

  it('rejects the class under @at-root', async () => {
    expect(await run('.toolbar { @at-root .btnPrimary {} }')).toHaveLength(1);
  });

  it('rejects a class built by nesting under @at-root, marking its whole selector', async () => {
    const [warning, ...rest] = await run('.btn { @at-root &Primary { color: red; } }');
    expect(rest).toEqual([]);
    expect(warning).toMatchObject({ text: expect.stringContaining('".btnPrimary"'), column: 17, endColumn: 25 });
  });

  it('reports an @at-root rule inside a redefinition once', async () => {
    expect(await run('.btnPrimary { @at-root &:hover {} }')).toHaveLength(1);
  });

  it('checks the rules inside an @at-root query, not the query itself', async () => {
    const warnings = await run('.btn { @at-root (without: media) { .btnPrimary {} } }');
    expect(warnings).toMatchObject([{ column: 36 }]);
  });

  it('reports every protected class in a selector list', async () => {
    const warnings = await run('.btnPrimary, .surfaceCard {}');
    expect(warnings.map(({ text }) => text)).toEqual([
      expect.stringContaining('".btnPrimary"'),
      expect.stringContaining('".surfaceCard"'),
    ]);
  });

  it('points at the protected class, not a longer class that starts with it', async () => {
    const [warning] = await run('.btnPrimaryIcon, .btnPrimary {}');
    expect(warning.column).toBe(18);
  });

  it('passes the class name to a custom message', async () => {
    const warnings = await run('.btnPrimary {}', {
      options: { message: (name) => `Use ${name} from the design system.` },
    });
    expect(warnings[0].text).toBe(`Use btnPrimary from the design system. (${ruleName})`);
  });

  it('leaves global stylesheets alone, since that is where the classes are defined', async () => {
    expect(await run('.btnPrimary {}', { file: 'src/styles/_buttons.scss' })).toEqual([]);
  });

  it('honours a custom files pattern', async () => {
    const warnings = await run('.btnPrimary {}', {
      file: 'src/components/Button.scss',
      options: { files: 'src/components/' },
    });
    expect(warnings).toHaveLength(1);
  });

  it('matches files against the path relative to the working directory', async () => {
    const warnings = await run('.btnPrimary {}', {
      file: 'src/components/Button.scss',
      options: { files: '^src/components/' },
    });
    expect(warnings).toHaveLength(1);
  });

  it('accepts a list of files patterns', async () => {
    const warnings = await run('.btnPrimary {}', {
      file: 'src/pages/Home.scss',
      options: { files: ['src/components/', 'src/pages/'] },
    });
    expect(warnings).toHaveLength(1);
  });

  it('checks every file when the files RegExp has the g flag', async () => {
    const files = /\.module\.scss$/g;
    for (const file of ['Button.module.scss', 'Card.module.scss', 'Menu.module.scss']) {
      expect(await run('.btnPrimary {}', { file, options: { files } })).toHaveLength(1);
    }
  });

  it('accepts a single class as a string', async () => {
    expect(await run('.btnPrimary {}', { options: { classes: 'btnPrimary' } })).toHaveLength(1);
  });

  it('reports a files pattern that does not compile as an invalid option', async () => {
    await expect(run('.btnPrimary {}', { options: { files: '[src' } })).rejects.toThrow(
      'Invalid value "[src" for option "files"',
    );
  });

  it('appends the hint so the message can point at the team rule', async () => {
    const warnings = await run('.btnPrimary {}', { options: { hint: 'See docs/buttons.md.' } });
    expect(warnings[0].text).toContain('See docs/buttons.md.');
  });
});
