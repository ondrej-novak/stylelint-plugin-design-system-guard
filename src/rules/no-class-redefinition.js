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
      const selectors = resolveNestedSelector(selectorOf(node), node);
      resolved.set(node, new Set(selectors.flatMap((selector) => findClasses(selector).map(({ name }) => name))));
    }
    return resolved.get(node);
  };

  // `offset` is where the selector starts within the node's source.
  const checkDefinitions = (node, offset = 0) => {
    const selector = selectorOf(node);
    const parent = closestRule(node);
    const own = findClasses(selector);
    for (const name of resolvedClasses(node)) {
      // `.btnPrimary { &:hover {} }` is one redefinition, already reported on the parent.
      if (parent && resolvedClasses(parent).has(name)) continue;
      const at = own.find((found) => found.name === name);
      // A class built by nesting has no text of its own, so mark the whole selector.
      const [start, end] = at ? [at.index, at.index + name.length + 1] : [0, selector.length];
      report({ result, ruleName, node, index: offset + start, endIndex: offset + end, message: messages.defined, messageArgs: [name, hint] });
    }
  };

  root.walkRules((node) => checkDefinitions(node));

  // postcss-scss parses `@at-root .btnPrimary { … }` as an at-rule, so walkRules never sees it.
  root.walkAtRules(/^(at-root|extend)$/i, (node) => {
    const offset = `@${node.name}${node.raws.afterName ?? ' '}`.length;
    if (node.name.toLowerCase() === 'at-root') {
      // The bare and `(without: media)` forms carry no selector; walkRules checks the rules inside them.
      if (node.params && !node.params.startsWith('(')) checkDefinitions(node, offset);
      return;
    }
    for (const { name, index } of findClasses(node.params.replace(/\s*!optional\s*$/i, ''))) {
      const start = offset + index;
      report({ result, ruleName, node, index: start, endIndex: start + name.length + 1, message: messages.extended, messageArgs: [name, hint] });
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

// `@at-root &Primary` holds its selector in params.
function selectorOf(node) {
  return node.type === 'rule' ? node.selector : node.params;
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
