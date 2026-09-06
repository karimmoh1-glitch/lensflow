# Daythread brand

"Your entire business, moving together."

## The mark

Three strands — the channels a business already runs on — converge into one thread that
ends in a node: the point where the work actually happens. Read left to right it is
momentum; read as a glyph it is a soft "D" made of a thread. It is drawn in the surrounding
text color with a coral node, so it needs no container on paper or on ink.

| Asset | File | Use |
|---|---|---|
| Mark (ink) | `public/brand/daythread-mark.svg` | headers, favicons on light |
| Mark (paper) | `public/brand/daythread-mark-paper.svg` | on dark surfaces |
| App icon | `public/brand/daythread-app-icon.svg` | 512px, ink badge, iOS/PWA |
| Wordmark | `public/brand/daythread-wordmark.svg` | text-based (Manrope 800); convert to outlines before print |
| Lockup | `public/brand/daythread-lockup.svg` | mark + wordmark |
| Component | `src/components/brand/DaythreadLogo.tsx` | `DaythreadMark`, `DaythreadLogo` |
| Runtime icons | `/icon`, `/apple-icon`, `/pwa-icon` | generated from the same paths |

Rules: minimum 16px; clear space equal to the node's diameter; never recolor the node;
never add a gradient, glow or drop shadow; never rotate; never place the mark inside a
circle.

## Type

One family, Manrope, everywhere. Weight carries hierarchy, not size alone.

| Role | Size / weight | Tracking |
|---|---|---|
| Page title | 28px / 900 | −0.01em |
| Section title | 17px / 700 | 0 |
| Eyebrow | 11px / 700 uppercase | +0.14em |
| Body | 14px / 500 | 0 |
| Muted | 14px / 500 at 60% ink | 0 |
| Micro | 11px / 500 at 50% ink | 0 |

## Color

Ink `#101114` on paper `#FAFAF9`. Two signature colors, each with a job: coral `#F0524D`
is the human, primary-action color (and the mark's node); violet `#6D5AE6` is the system
working — AI, connection, motion. Semantic greens, ambers, reds and blues carry state only.
Never use a signature color decoratively.

## Surfaces and space

Three surface levels: flat (paper), resting (white with a hairline border, `dt-surface`),
raised (white with a soft long shadow, `dt-surface-raised`) for sheets and the thing that
matters most on a page, and quiet (`dt-surface-quiet`) for grouped facts. Radius scale
8 / 12 / 16 / 22 / 26px; the larger the surface, the larger the radius. Spacing in 4px
steps; page gutters 16px on phones, 32px on desktop; section rhythm 32–40px.

## Motion

Motion answers "what just happened?". Durations 150–460ms, ease-out curves
(`cubic-bezier(0.16, 1, 0.3, 1)`). Page content settles in (`dt-swap`), lists stagger in
(`dt-stagger`, `dt-rows`), the sidebar's active pill slides, a successful state breathes
once (`dt-confirm`), a failed action nudges once (`dt-nudge`). Nothing loops except the
loader. `prefers-reduced-motion` turns every animation off and shows end states.

## The loader

`DaythreadLoader`: one thread travels a path through five points — inbox, calendar,
bookings, automation, the business — lighting each, then settles into the coral node.
SVG + CSS, no per-frame JS. Used for the first authenticated paint, an integration
connecting, and operations a person waits on. `ThreadDots` is its 18px form inside buttons.

## Iconography

Lucide, 2px stroke, 16–20px, ink at 65% at rest. Channel logos keep their own brand colors
at 24px; everything else is monochrome.

## Tone

Quietly powerful. Confident, specific, honest: numbers only when real; states only when
confirmed; the thread, not fireworks.
