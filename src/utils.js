const DEFAULT_FILES = /\.module\.s?css$/;

/** Turns the `files` option (a string or RegExp) into a RegExp, falling back to CSS modules. */
export function toFilePattern(files) {
  if (!files) return DEFAULT_FILES;
  return files instanceof RegExp ? files : new RegExp(files);
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
