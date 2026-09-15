import { ICON_PATHS } from './icons.js';

/**
 * A Bootstrap Icon.
 *
 * Always carries the `.icon` class, which forces `display: inline-block` and a
 * baseline nudge. That is not cosmetic: Tailwind's preflight sets
 * `svg { display: block }`, and a block-level SVG cannot share a line with the
 * text it labels, so every icon was breaking onto its own line above its own
 * label. The class also survives a caller passing `className`, which a `style`
 * prop would not.
 *
 * Semantics follow the use, not the glyph. An icon sitting beside visible text
 * is decorative and is hidden from screen readers; an icon standing alone
 * carries meaning and must be given a label by its caller.
 *
 * @param {object} props
 * @param {string} props.name
 * @param {number} [props.size] Pixels.
 * @param {string} [props.label] Supply only when the icon is the whole message.
 * @param {string} [props.className]
 * @param {object} [props.style] Merged, never replacing the layout rules.
 */
export default function Icon({ name, size = 16, label, className = '', style, ...rest }) {
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
      className={`icon ${className}`.trim()}
      style={style}
      {...a11y}
      {...rest}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}
