import { ICON_PATHS } from './icons.js';

/**
 * A Bootstrap Icon.
 *
 * Semantics follow the use, not the glyph. An icon sitting beside visible text
 * is decorative and is hidden from screen readers; an icon standing alone
 * carries meaning and must be given a label by its caller.
 *
 * @param {object} props
 * @param {string} props.name
 * @param {number} [props.size] Pixels. Sizes come from a small set, not ad hoc.
 * @param {string} [props.label] Supply only when the icon is the whole message.
 * @param {string} [props.className]
 */
export default function Icon({ name, size = 16, label, className = '', ...rest }) {
  const d = ICON_PATHS[name];
  if (!d) {
    if (import.meta.env.DEV) console.warn(`Icon "${name}" is not in the generated set.`);
    return null;
  }

  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true', focusable: 'false' };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      style={{ flex: 'none', verticalAlign: '-0.125em' }}
      {...a11y}
      {...rest}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}
