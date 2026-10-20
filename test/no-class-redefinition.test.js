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

  it('rejects @extend of a design-system class', async () => {
    const warnings = await run('.save { @extend .btnPrimary; }');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain('Do not @extend ".btnPrimary"');
    expect(await run('.save { @extend .btnPrimary !optional; }')).toHaveLength(1);
  });

  it('allows a class the selector only filters on', async () => {
    const code = '.card:not(.btnPrimary) {} .toolbar:has(.btnPrimary) {} a[href$=".btnPrimary"] {}';
    expect(await run(code)).toEqual([]);
  });

  it('rejects the class in a compound selector or inside :is() or :global()', async () => {
    expect(await run('.surfaceCard:hover {} :is(.btnPrimary) {} :global(.surfaceCard) {}')).toHaveLength(3);
  });

  it('rejects a class built from the parent selector', async () => {
    expect(await run('.btn { &Primary {} }')).toMatchObject([{ text: expect.stringContaining('".btnPrimary"') }]);
    expect(await run('.btn { @at-root #{&}Primary {} }')).toMatchObject([{ text: expect.stringContaining('".btnPrimary"') }]);
    expect(await run('.surface { #{ & }Card {} }')).toMatchObject([{ text: expect.stringContaining('".surfaceCard"') }]);
  });

  it('reports a redefinition once, not again for nested rules', async () => {
    expect(await run('.btnPrimary { &:hover {} .label {} }')).toHaveLength(1);
    expect(await run('.btnPrimary { @at-root &:hover {} }')).toHaveLength(1);
    expect(await run('.btn { @at-root &Primary { &:hover {} .icon {} } }')).toHaveLength(1);
  });

  it('rejects the class under @at-root, marking a class built by nesting by its whole selector', async () => {
    expect(await run('.toolbar { @at-root .btnPrimary {} }')).toMatchObject([{ column: 21, endColumn: 32 }]);
    expect(await run('.btn { @at-root &Primary {} }')).toMatchObject([{ column: 17, endColumn: 25 }]);
  });

  it('resolves & against an enclosing @at-root, but not an @at-root query', async () => {
    expect(await run('.toolbar { @at-root .btn { @at-root &Primary {} } }')).toHaveLength(1);
    expect(await run('.btn { @at-root (without: media) { &Primary {} } }')).toHaveLength(1);
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

  it('checks every file when the files RegExp has the g or y flag', async () => {
    const files = /\.module\.scss$/gy;
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
