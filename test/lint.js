import stylelint from 'stylelint';
import plugins from '../src/index.js';

/** Lints `code` as if it lived at `file`, with only the given rule switched on. */
export async function lint(code, { file = 'Button.module.scss', ruleName, options }) {
  const { results } = await stylelint.lint({
    code,
    codeFilename: file,
    config: {
      plugins,
      customSyntax: 'postcss-scss',
      rules: { [ruleName]: [true, options] },
    },
  });
  const [result] = results;
  if (result.invalidOptionWarnings.length) {
    throw new Error(result.invalidOptionWarnings.map(({ text }) => text).join('\n'));
  }
  return result.warnings.map(({ text, line, column, endColumn }) => ({ text, line, column, endColumn }));
}
