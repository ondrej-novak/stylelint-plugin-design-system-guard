# Accessibility

## Use the native element

Use `<button>` for actions and `<a href>` for navigation. They come with focus, Enter and Space, and the right role. Do not put `onClick` on a `div` and add `role="button"`: you would have to rebuild all of that by hand.

```tsx
<button className="btnPrimary" onClick={save}>Save</button>
```

Do not change an element's role. Wrap it instead:

```tsx
<div role="tab"><h2>Billing</h2></div>
```

## Name every control

Every button, link and form field needs a name a screen reader can read out.

- A button or link with text already has one. Do not add `aria-label` to it. The label replaces the visible text, and the two drift apart. If you must add one, start it with the visible text.
- A button with only an icon needs `aria-label`.
- A form field needs a `<label>`. A placeholder is not a label.

```tsx
<button className="iconButton" aria-label="Close"><CloseIcon /></button>

<label htmlFor="email">Email</label>
<input id="email" type="email" />
```

## Keep it usable from the keyboard

A custom control with an ARIA role must work with Tab, Enter and Space, and with arrow keys where the pattern expects them. Do not put `aria-hidden="true"` or `role="presentation"` on anything that can take focus.

Do not remove the focus outline (`outline: none`) unless you add a visible replacement in the same rule.
