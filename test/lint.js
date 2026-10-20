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
  return results[0].warnings.map(({ text, line }) => ({ text, line }));
}
