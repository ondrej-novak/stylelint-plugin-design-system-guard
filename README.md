# stylelint-plugin-design-system-guard

Two Stylelint rules that stop component styles from redefining design system.

I wrote them for a React codebase where most of the code came from AI coding agents. The agents were fast, but when one needed a primary button it usually wrote a new `.btnPrimary` in the component's CSS module instead of finding the global one. Each copy looked right on the day. After a few weeks there were several slightly different primary buttons. Code review missed most of them, because a reviewer has no reason to suspect a ten-line SCSS file.

A rule in the agent's instructions helped, but did not stop it. A lint error did. The agent reads the message, uses the global class and moves on. People do the same.

## Rules

### `no-class-redefinition`

Rejects a design-system class defined or `@extend`ed in a component stylesheet.

```scss
// Button.module.scss
.btnPrimary { background: blue; }         // ✗ redefines a design-system class
.toolbar .btnPrimary:hover { color: red; } // ✗ same, inside a longer selector
.btn { &Primary { color: red; } }          // ✗ same, built by nesting
.save { @extend .btnPrimary; }             // ✗ extends it
.btnPrimaryIcon { width: 16px; }           // ✓ a different class
.card:not(.btnPrimary) { gap: 4px; }       // ✓ only filters on it, as does :has()
```

```
".btnPrimary" belongs to the design system. Apply className="btnPrimary" in markup instead of redefining it here.
```

| Option | Default | |
|---|---|---|
| `classes` | `[]` | Class names to protect, without the dot |
| `files` | `/\.module\.s?css$/` | Which files to check: one or more regular expressions, as strings or RegExp, tested against the path relative to the working directory with `/` separators. The global stylesheets that define the classes should not match. |
| `hint` | | Text appended to every message, for example a link to your guidelines |

### `no-local-geometry`

Rejects width declarations under the selectors you name, and leaves every other width alone.
Use it for sizes that have to agree across the whole app, such as the width of a mobile preview.

```scss
// EmailPreview.module.scss
.frame[data-viewport='mobile'] { width: 375px; }  // ✗ the design system owns this size
.preview { &[data-viewport='mobile'] { .body { max-width: 360px; } } } // ✗ found through nesting
.sidebar { width: 380px; }                         // ✓ not under a configured selector
```

| Option | Default | |
|---|---|---|
| `selectors` | `[]` | Regular expressions, as strings or RegExp. A declaration counts if any ancestor rule matches. |
| `properties` | `['width', 'min-width', 'max-width']` | Properties to check |
| `files` | `/\.module\.s?css$/` | Which files to check, as for `no-class-redefinition` |
| `hint` | | Text appended to every message |

## Install

```sh
npm install --save-dev stylelint stylelint-plugin-design-system-guard
```

```js
// stylelint.config.js
import designSystemGuard from 'stylelint-plugin-design-system-guard';

export default {
  plugins: [designSystemGuard],
  rules: {
    'design-system-guard/no-class-redefinition': [true, {
      classes: ['btnPrimary', 'btnSecondary', 'surfaceCard'],
      hint: 'See docs/design-system.md.',
    }],
    'design-system-guard/no-local-geometry': [true, {
      selectors: ['\\[data-viewport'],
    }],
  },
};
```

For SCSS, also install `postcss-scss` and add `customSyntax: 'postcss-scss'`, as the
[example config](examples/stylelint.config.js) does.

## Using it with AI coding agents

The rules work best next to a short instruction the agent reads before it writes code, so it knows
the rule exists and what to do when it fires. [`examples/`](examples) has a full Stylelint config and
the matching [Claude Code rule](examples/.claude/rules/frontend-ui.md). Three things made the difference:

- The error message names the class to use. An agent fixes "use `className="btnPrimary"`" on the first try. It fixes "invalid selector" by trying things until the error goes away.
- The rule is narrow. A rule that fires on legitimate code teaches agents and people to add disable comments.
- Lint runs in CI and blocks the merge, so the rule holds even when nobody reads the diff closely.

## Development

```sh
npm install
npm test
```

## License

MIT
