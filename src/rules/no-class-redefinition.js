import stylelint from 'stylelint';
import { classPattern, fileOf, toFilePattern } from '../utils.js';

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

export const ruleName = 'design-system-guard/no-class-redefinition';

export const messages = ruleMessages(ruleName, {
  defined: (name, hint) =>
    `".${name}" belongs to the design system. Apply className="${name}" in markup instead of redefining it here.${hint ? ` ${hint}` : ''}`,
  extended: (name, hint) =>
    `Do not @extend ".${name}". Apply className="${name}" in markup instead.${hint ? ` ${hint}` : ''}`,
});

const meta = {
  url: 'https://github.com/ondrej-novak/stylelint-plugin-design-system-guard#no-class-redefinition',
};

/**
 * Global classes are cheap to reuse and easy to shadow: a component file that writes its own
 * `.btnPrimary { … }` looks right on the day and drifts from every other button by the next redesign.
 * This rule keeps those names out of component-scoped files, so the only way to get the style is to use it.
 */
const rule = (primary, secondaryOptions) => (root, result) => {
  const valid = validateOptions(
    result,
    ruleName,
    { actual: primary, possible: [true] },
    {
      actual: secondaryOptions,
      possible: {
        classes: [(value) => typeof value === 'string'],
        files: [(value) => typeof value === 'string' || value instanceof RegExp],
        hint: [(value) => typeof value === 'string'],
      },
    },
  );
  if (!valid) return;

  const classes = secondaryOptions?.classes ?? [];
  if (classes.length === 0) return;
  if (!toFilePattern(secondaryOptions?.files).test(fileOf(root))) return;

  const hint = secondaryOptions?.hint;
  const patterns = classes.map((name) => [name, classPattern(name)]);

  root.walkRules((node) => {
    const match = patterns.find(([, pattern]) => pattern.test(node.selector));
    if (!match) return;
    report({ result, ruleName, node, word: match[0], message: messages.defined(match[0], hint) });
  });

  root.walkAtRules('extend', (node) => {
    const match = patterns.find(([, pattern]) => pattern.test(node.params));
    if (!match) return;
    report({ result, ruleName, node, word: match[0], message: messages.extended(match[0], hint) });
  });
};

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;

export default createPlugin(ruleName, rule);
