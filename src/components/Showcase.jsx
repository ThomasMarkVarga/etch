import { useEffect, useRef } from 'react';

/**
 * The cross-promotion rail the other vibe-coding.fans apps carry.
 *
 * Self-hosted, exactly as PasteSafe, Overlap and BridgeDays do it: the CSS,
 * the script, the data and the logos are all files on this origin, so mounting
 * it costs no network request and no third-party script. The links are plain
 * anchors; nothing is tracked beyond the utm_source already in each URL, and
 * nothing about the visitor is sent anywhere.
 *
 * It is loaded on an idle callback rather than during first paint, because an
 * advert has no business competing with the code someone came here to make.
 */

export default function Showcase() {
  const slotRef = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return undefined;
    let cancelled = false;

    const mount = async () => {
      if (cancelled || !slotRef.current || mounted.current) return;
      try {
        const [{ mountAds }, { default: ads }] = await Promise.all([
          import('../showcase/showcase.js'),
          import('../showcase/makers.js'),
        ]);
        if (cancelled || !slotRef.current) return;
        mounted.current = true;
        mountAds(slotRef.current, ads);
      } catch {
        // The rail is a nice-to-have. If it does not load, the app is
        // untouched, and there is nowhere to report the failure to anyway.
      }
    };

    const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 600);
    const handle = idle(mount, { timeout: 2500 });

    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function' && typeof handle === 'number') cancelIdleCallback(handle);
    };
  }, []);

  return <aside ref={slotRef} className="showcase-slot" aria-label="Our other apps" />;
}
