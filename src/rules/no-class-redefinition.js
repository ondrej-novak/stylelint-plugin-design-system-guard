import resolveNestedSelector from 'postcss-resolve-nested-selector';
import selectorParser from 'postcss-selector-parser';
import stylelint from 'stylelint';
import { classPattern, isCheckedFile, isPattern, toList } from '../utils.js';

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

// Classes inside these only narrow the match: `.card:not(.btnPrimary)` styles cards, not buttons.
const FILTER_PSEUDOS = new Set([':not', ':has']);

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
        files: [isPattern],
        hint: [(value) => typeof value === 'string'],
      },
    },
  );
  if (!valid) return;

  const classes = toList(secondaryOptions?.classes);
  if (classes.length === 0) return;
  if (!isCheckedFile(root, secondaryOptions?.files)) return;

  const hint = secondaryOptions?.hint;
  const findClasses = protectedClassFinder(classes);

  // Resolving nesting first means `.btn { &Primary {} }` counts as `.btnPrimary`.
  const resolved = new Map();
  const resolvedClasses = (node) => {
    if (!resolved.has(node)) {
      const selectors = resolveNestedSelector(node.selector, node);
      resolved.set(node, new Set(selectors.flatMap((selector) => findClasses(selector).map(({ name }) => name))));
    }
    return resolved.get(node);
  };

  root.walkRules((node) => {
    const parent = closestRule(node);
    const own = findClasses(node.selector);
    for (const name of resolvedClasses(node)) {
      // `.btnPrimary { &:hover {} }` is one redefinition, already reported on the parent.
      if (parent && resolvedClasses(parent).has(name)) continue;
      const at = own.find((found) => found.name === name);
      // A class built by nesting has no text of its own, so mark the whole selector.
      const [index, endIndex] = at ? [at.index, at.index + name.length + 1] : [0, node.selector.length];
      report({ result, ruleName, node, index, endIndex, message: messages.defined(name, hint) });
    }
  });

  // postcss-scss parses `@at-root .btnPrimary { … }` as an at-rule, so walkRules never sees it.
  root.walkAtRules(/^(at-root|extend)$/i, (node) => {
    const message = node.name.toLowerCase() === 'extend' ? messages.extended : messages.defined;
    const offset = `@${node.name}${node.raws.afterName ?? ' '}`.length;
    for (const { name, index } of findClasses(node.params.replace(/\s*!optional\s*$/i, ''))) {
      const start = offset + index;
      report({ result, ruleName, node, index: start, endIndex: start + name.length + 1, message: message(name, hint) });
    }
  });
};

/**
 * Returns a function listing the protected classes a selector styles, each with the offset of its dot.
 * Classes inside `:not()` or `:has()` and text in attribute values do not count. Selectors the parser
 * rejects, such as some SCSS interpolation, fall back to a text match.
 */
function protectedClassFinder(classes) {
  const names = new Set(classes);
  const patterns = classes.map((name) => [name, classPattern(name)]);

  return (selector) => {
    const found = new Map();
    try {
      selectorParser((ast) => {
        ast.walkClasses((node) => {
          if (names.has(node.value) && !found.has(node.value) && !isInsideFilter(node)) found.set(node.value, node.sourceIndex);
        });
      }).processSync(selector);
    } catch {
      found.clear();
      for (const [name, pattern] of patterns) {
        const match = pattern.exec(selector);
        if (match) found.set(name, match.index);
      }
    }
    return [...found].map(([name, index]) => ({ name, index }));
  };
}

function isInsideFilter(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'pseudo' && FILTER_PSEUDOS.has(parent.value.toLowerCase())) return true;
  }
  return false;
}

function closestRule(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'rule') return parent;
  }
  return undefined;
}

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;

export default createPlugin(ruleName, rule);
