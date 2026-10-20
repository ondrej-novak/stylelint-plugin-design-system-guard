import designSystemGuard from 'stylelint-plugin-design-system-guard';

export default {
  plugins: [designSystemGuard],
  customSyntax: 'postcss-scss',
  rules: {
    'design-system-guard/no-class-redefinition': [true, {
      classes: ['btnPrimary', 'btnSecondary', 'btnDanger', 'iconButton', 'surfaceCard', 'mutedText'],
      hint: 'Check src/styles for an existing class first (.claude/rules/frontend-ui.md).',
    }],
    'design-system-guard/no-local-geometry': [true, {
      selectors: ['\\[data-viewport', '\\.mobileView', '\\.desktopView'],
      hint: 'Preview sizes come from the previewFrame class.',
    }],
  },
};
