export const duration = { press: 0.12, small: 0.2, sheet: 0.28, page: 0.28, count: 0.6, celebrate: 0.9 } as const;
export const ease = { enter: [0.2, 0.8, 0.2, 1] as const, exit: [0.4, 0, 1, 1] as const };
export const spring = { type: "spring" as const, stiffness: 380, damping: 32 };
export const stagger = { chips: 0.04, bars: 0.06 } as const;

/** Standard enter animation for cards/rows: fade + 8px rise. */
export const riseIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: duration.small, ease: ease.enter },
};
