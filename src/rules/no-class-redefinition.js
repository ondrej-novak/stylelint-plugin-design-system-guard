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

  const names = new Set(toList(secondaryOptions?.classes));
  if (names.size === 0) return;
  if (!isCheckedFile(root, secondaryOptions?.files)) return;

  const hint = secondaryOptions?.hint;
  // Selectors with nesting resolved, so `.btn { &Primary {} }` counts as `.btnPrimary`, and the protected
  // classes they style. `walk` visits a parent before its children, so the parent's entry is always ready.
  const resolved = new Map();

  root.walk((node) => {
    // postcss-scss parses `@at-root .btnPrimary { … }` as an at-rule, with the selector in params.
    const offset = node.type === 'atrule' ? `@${node.name}${node.raws.afterName ?? ' '}`.length : 0;

    if (node.type === 'atrule' && node.name.toLowerCase() === 'extend') {
      for (const [name, index] of findClasses(node.params.replace(/\s*!optional\s*$/i, ''), names)) {
        const start = offset + index;
        report({ result, ruleName, node, index: start, endIndex: start + name.length + 1, message: messages.extended, messageArgs: [name, hint] });
      }
      return;
    }

    const selector = selectorOf(node);
    if (selector === undefined) return;

    // `&` refers to the nearest ancestor with a selector. Other at-rules, such as `@media`, sit between without changing it.
    let ancestor = node.parent;
    while (ancestor && !resolved.has(ancestor)) ancestor = ancestor.parent;
    const parent = resolved.get(ancestor);

    const selectors = resolveNesting(selector, parent?.selectors, node.type === 'atrule');
    const classes = new Set(selectors.flatMap((resolvedSelector) => [...findClasses(resolvedSelector, names).keys()]));
    resolved.set(node, { selectors, classes });

    const own = findClasses(selector, names);
    for (const name of classes) {
      // `.btnPrimary { &:hover {} }` is one redefinition, already reported on the parent.
      if (parent?.classes.has(name)) continue;
      // A class built by nesting has no text of its own, so mark the whole selector.
      const [start, end] = own.has(name) ? [own.get(name), own.get(name) + name.length + 1] : [0, selector.length];
      report({ result, ruleName, node, index: offset + start, endIndex: offset + end, message: messages.defined, messageArgs: [name, hint] });
    }
  });
};

/**
 * Maps each protected class `selector` styles to the offset of its dot. Classes inside `:not()` or `:has()`
 * and text in attribute values do not count. Text the parser rejects, such as the `font:` of a Sass
 * nested property, styles no class.
 */
function findClasses(selector, names) {
  const found = new Map();
  try {
    selectorParser((ast) => {
      ast.walkPseudos((pseudo) => {
        if (FILTER_PSEUDOS.has(pseudo.value.toLowerCase())) pseudo.remove();
      });
      ast.walkClasses((node) => {
        if (names.has(node.value) && !found.has(node.value)) found.set(node.value, node.sourceIndex);
      });
    }).processSync(selector);
  } catch {}
  return found;
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

// A rule's selector, or the one `@at-root &Primary` holds in params. The bare and `(without: media)`
// forms of `@at-root` carry none, and `&` inside them refers further up.
function selectorOf(node) {
  if (node.type === 'rule') return node.selector;
  if (node.type === 'atrule' && node.name.toLowerCase() === 'at-root' && node.params !== '' && !node.params.startsWith('(')) return node.params;
  return undefined;
}

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;

export default createPlugin(ruleName, rule);
