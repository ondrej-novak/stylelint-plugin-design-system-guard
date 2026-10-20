const DEFAULT_FILES = [/\.module\.s?css$/];

/** Option validator: a RegExp, or a string that compiles to one. */
export function isPattern(value) {
  if (value instanceof RegExp) return true;
  if (typeof value !== 'string') return false;
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

/** An option that takes one value or a list of them, as a list. */
export function toList(value) {
  return value === undefined ? [] : [value].flat();
}

/** Compiles pattern options. Drops `g` and `y`, which make `.test()` stateful across calls. */
export function toPatterns(value) {
  return toList(value).map((p) => (p instanceof RegExp ? new RegExp(p.source, p.flags.replace(/[gy]/g, '')) : new RegExp(p)));
}

/** Whether the file being linted matches the `files` option, falling back to CSS modules. */
export function isCheckedFile(root, files) {
  const patterns = toPatterns(files);
  const file = fileOf(root);
  return (patterns.length > 0 ? patterns : DEFAULT_FILES).some((pattern) => pattern.test(file));
}

/** The file being linted with `/` separators on every OS, or '' for code passed in as a string. */
export function fileOf(root) {
  return (root.source?.input?.file ?? '').replaceAll('\\', '/');
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches `.name` as a whole class, so `.btnPrimary` does not also catch `.btnPrimaryIcon`. */
export function classPattern(name) {
  return new RegExp(`\\.${escapeRegExp(name)}(?![\\w-])`);
}
