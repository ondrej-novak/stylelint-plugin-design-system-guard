# Frontend UI

## Reuse before you style

Before writing a new class in a `*.module.scss` file, look in `src/styles/` for one that already does the job. Buttons, cards and muted text all have global classes. Apply them in markup. A button with text needs no `aria-label`; one with only an icon does, since it has no text to read out:

```tsx
<button className="btnPrimary">Save</button>
<button className="iconButton" aria-label="Close"><CloseIcon /></button>
```

Do not copy their declarations into a module file or `@extend` them. Stylelint rejects both (`design-system-guard/no-class-redefinition`). If the global class is missing something you need, change the global class, or say in the pull request why this case is different.

## Preview panes

Desktop and mobile previews take their size from the `previewFrame` class. Do not set widths under `[data-viewport]` in a component (`design-system-guard/no-local-geometry`).

## When lint fails

Read the message: it names the class to use instead. Fix the code. Do not add a disable comment to get past the rule.
