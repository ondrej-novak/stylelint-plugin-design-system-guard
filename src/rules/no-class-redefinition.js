import selectorParser from 'postcss-selector-parser';
import stylelint from 'stylelint';
import { isCheckedFile, isPattern, toList } from '../utils.js';

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
  const resolve = (node) => {
    if (!resolved.has(node)) {
      const parent = selectorParent(node);
      const selectors = resolveNesting(selectorOf(node), parent && resolve(parent).selectors, node.type === 'atrule');
      const classes = new Set(selectors.flatMap((selector) => findClasses(selector).map(({ name }) => name)));
      resolved.set(node, { selectors, classes });
    }
    return resolved.get(node);
  };

  // `offset` is where the selector starts within the node's source.
  const checkDefinitions = (node, offset = 0) => {
    const selector = selectorOf(node);
    const parent = selectorParent(node);
    const own = findClasses(selector);
    for (const name of resolve(node).classes) {
      // `.btnPrimary { &:hover {} }` is one redefinition, already reported on the parent.
      if (parent && resolve(parent).classes.has(name)) continue;
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
      if (hasSelector(node)) checkDefinitions(node, offset);
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
 * Classes inside `:not()` or `:has()` and text in attribute values do not count. Text the parser
 * rejects, such as the `font:` of a Sass nested property, styles no class.
 */
function protectedClassFinder(classes) {
  const names = new Set(classes);

  return (selector) => {
    const found = new Map();
    try {
      selectorParser((ast) => {
        ast.walkClasses((node) => {
          if (names.has(node.value) && !found.has(node.value) && !isInsideFilter(node)) found.set(node.value, node.sourceIndex);
        });
      }).processSync(selector);
    } catch {
      return [];
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

/**
 * Lists the selectors `selector` compiles to under `parents`, the way Sass does: `&` takes each parent
 * in turn, and a selector without one goes after the parent, unless `@at-root` keeps it at the top.
 * `#{&}` pastes in the parent list as text, so `.btn { #{&}Primary {} }` still goes after `.btn`.
 */
function resolveNesting(selector, parents, atRoot) {
  const pasted = selector.replace(/#\{\s*&\s*\}/g, () => parents?.join(', ') ?? '');
  const own = splitOutside(pasted, ',').map((part) => part.trim());
  if (!parents) return own;
  return own.flatMap((part) => {
    const pieces = splitOutside(part, '&');
    if (pieces.length > 1) return parents.map((parent) => pieces.join(parent));
    return atRoot ? [part] : parents.map((parent) => `${parent} ${part}`);
  });
}

const CLOSERS = { '(': ')', '[': ']', '{': '}' };

// Splits at `separator` outside quotes, brackets and interpolation. `&` also splits inside `:not(&)`.
function splitOutside(text, separator) {
  const parts = [];
  const open = [];
  let quote = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') i++;
    else if (quote) quote = char === quote ? '' : quote;
    else if (char === '"' || char === "'") quote = char;
    else if (CLOSERS[char]) open.push(CLOSERS[char]);
    else if (char === open.at(-1)) open.pop();
    else if (char === separator && open.every((closer) => separator === '&' && closer === ')')) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

// The nearest ancestor `&` refers to. Other at-rules, such as `@media`, sit between without changing it.
function selectorParent(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (hasSelector(parent)) return parent;
  }
  return undefined;
}

// The bare and `(without: media)` forms of `@at-root` carry no selector; walkRules checks the rules inside them.
function hasSelector(node) {
  if (node.type === 'rule') return true;
  return node.type === 'atrule' && node.name.toLowerCase() === 'at-root' && node.params !== '' && !node.params.startsWith('(');
}

// `@at-root &Primary` holds its selector in params.
function selectorOf(node) {
  return node.type === 'rule' ? node.selector : node.params;
}

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;

export default createPlugin(ruleName, rule);
