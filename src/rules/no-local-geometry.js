import stylelint from 'stylelint';
import { isCheckedFile, isPattern, toList, toPatterns } from '../utils.js';

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

export const ruleName = 'design-system-guard/no-local-geometry';

export const messages = ruleMessages(ruleName, {
  rejected: (property, hint) =>
    `Do not set "${property}" under a scoped selector here. The design system owns this size.${hint ? ` ${hint}` : ''}`,
});

const meta = {
  url: 'https://github.com/ondrej-novak/stylelint-plugin-design-system-guard#no-local-geometry',
};

const DEFAULT_PROPERTIES = ['width', 'min-width', 'max-width', 'inline-size', 'min-inline-size', 'max-inline-size'];

/**
 * Some sizes have to agree across the whole app: a mobile preview is 375px everywhere or it is wrong
 * somewhere. This rule rejects those sizes when a component sets them under one of the configured
 * selectors, and leaves every other width alone. A sidebar that happens to be 380px wide is none of its business.
 */
const rule = (primary, secondaryOptions) => (root, result) => {
  const valid = validateOptions(
    result,
    ruleName,
    { actual: primary, possible: [true] },
    {
      actual: secondaryOptions,
      possible: {
        selectors: [isPattern],
        properties: [(value) => typeof value === 'string'],
        files: [isPattern],
        hint: [(value) => typeof value === 'string'],
      },
    },
  );
  if (!valid) return;

  const selectors = toPatterns(secondaryOptions?.selectors);
  if (selectors.length === 0) return;
  if (!isCheckedFile(root, secondaryOptions?.files)) return;

  const properties = new Set(toList(secondaryOptions?.properties ?? DEFAULT_PROPERTIES).map((p) => p.toLowerCase()));
  const hint = secondaryOptions?.hint;

  root.walkDecls((decl) => {
    if (!properties.has(decl.prop.toLowerCase())) return;
    if (!isInsideScopedRule(decl, selectors)) return;
    report({ result, ruleName, node: decl, word: decl.prop, message: messages.rejected, messageArgs: [decl.prop, hint] });
  });
};

// Walks up through nested rules, so `.preview { &[data-viewport='mobile'] { width: … } }` counts
// the same as the flat selector.
function isInsideScopedRule(node, selectors) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'rule' && selectors.some((s) => s.test(parent.selector))) return true;
  }
  return false;
}

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;

export default createPlugin(ruleName, rule);
