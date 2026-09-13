# Daythread design system (v2)

The tokens live in `tailwind.config.ts`. The primitives live in `src/components/ui.tsx`. This file sets out the rules those two follow.

## Why v1 read as "vibe-coded"

These are the findings from the audit of the app before v2 (the screenshots are in the PR):

- **Every block was a card.** There were 139 `rounded-xl`, 102 `border border-border` and 54 `<Card>` on the authenticated surfaces, plus shadows on resting content. Hierarchy came from boxes, not from type and space.
- **Radii were inconsistent.** Six radius steps were in use (6 to 26px), plus 45 arbitrary pixel values. Rounded pills sat next to square tables.
- **The type had no voice.** Manrope did every job at weights 600–800. Page titles, card titles and row names all looked alike, and 157 labels were set at 11px.
- **Color had no job.** Coral was used for the brand, for "waiting", for booking blocks, for today's date and for avatar tiles. Violet appeared in atmospheric gradients. Green, red and blue icon tiles were used as decoration.
- **Ornament stood in for polish.** There were radial gradient glows behind the hero, the demo and the auth panel, glass navigation with backdrop blur, a sliding white nav pill with a shadow, and hover lifts, scale-bounces and staggered entrances on every page.
- **Controls were inconsistent.** The same kind of action appeared at three heights, in three radii and in two weights; icon strokes ranged from 1.9 to 2.5.
- **AI looked like marketing.** "Daythread read" sat in a tinted card with no provenance, beside decorative color.

## Principles

1. **Hierarchy comes from type and space before boxes.** Use a hairline or whitespace first. Use a bordered panel only when the content is a separate object. Shadows are only for things that float, such as menus, sheets and dialogs.
2. **Every color has a job.** If you can't name a color's job, it should be ink.
3. **Show the work.** Intelligence is shown as a traceable path: what they wrote → what Daythread understood → the suggested step → your approval. There is no sparkle and no glow.
4. **Motion answers "what just happened?"** It stays under 200ms and uses opacity plus a few pixels. Nothing bounces on load.
5. **Functionality is never faked.** A control that looks active works. Status that can't be proven isn't claimed.

## Tokens

### Color

| Token | Value | Job |
|---|---|---|
| `ink` | `#16171A` | Text and primary controls. Secondary text is `ink/65` (AA on white and paper). Nothing lighter carries text. |
| `paper` | `#F6F6F4` | The quiet surface: sidebar, rails, table headers, hover. |
| `canvas`/white | `#FFFFFF` | Content ground. |
| `border` | `ink @ 9%` | Hairlines. |
| `border-strong` | `ink @ 16%` | Control outlines. |
| `accent` (coral) | `#E8504A` · text `#B8342F` · strong `#C93E39` | The brand: logo node, the one conversion button (`brand` variant), **"waiting on you"**, and today's date. Never decoration, never a row action. |
| `signal` (indigo) | `#4F57D6` · soft · text · line | Daythread's understanding: the "understood" beat, the reasoning rule on Today, thinking nodes. |
| `booking` (teal) | `#138576` · soft · text | A booked session: calendar blocks, confirmed status, booking bars. |
| `success` / `warning` / `danger` / `info` | semantic | State only. Warning is "not confirmed", "needs attention". |
| `midnight` | `#111214` | The single dark surface: the auth panel and footer-level marketing bands. |

Provider colors (Instagram, WhatsApp, Gmail…) appear only inside the provider marks themselves.

### Type

- **Instrument Sans** (`font-sans`) is used for everything in the product. Weights are 400, 500 (controls, row names) and 600 (titles). 700 is not used in the app.
- **Instrument Serif** (`font-serif`) is the editorial voice, and it is never bolded. Use it for landing headlines, the founder pages, the Today greeting, and empty-state headlines where the page is a moment rather than a tool.

| Step | Size / line | Use |
|---|---|---|
| `page-title` | 22/28, 600 | One per page |
| `section-title` / `text-13 font-semibold` | 13–14 | Section headings |
| `text-sm` | 14/22 | Body, row names |
| `text-13` | 13/20 | Dense rows, controls, rail text |
| `text-xs` | 12/16 | Metadata. The minimum for anything a person reads. |
| `text-2xs` | 11/16 | Counts inside tags and initials only |
| `display-sm…xl` | 28–72 | Serif headlines |

### Space, radius, elevation

- **Spacing:** a 4px base. Rows are 44–48px tall. Page gutters are 16 (phone), 24 (tablet) and 40 (desktop). Sections are 36–40px apart.
- **Radius:**
  - `rounded-sm` 4 for tags.
  - `rounded` 6 for buttons and inputs.
  - `rounded-lg` 8 for panels and menus.
  - `rounded-2xl` 12 for dialogs and sheets. This is the maximum. `3xl`/`4xl` collapse to 12.
- **Elevation:** use `none` for resting content, `xs` for outline buttons and the active segment, `popover` for menus, and `overlay` for dialogs and sheets. `elev-2` is only for product mockups on the landing page.

### Controls

| | Height | Style |
|---|---|---|
| `Button sm` | 32 | 13px, 500 |
| `Button md` | 36 | 13px, 500 |
| `Button lg` | 40 | 14px, 500 |
| primary | | ink fill |
| secondary | | ink @ 5% |
| outline | | white + `border-strong` + xs shadow |
| ghost | | text only |
| danger | | red |
| brand | | coral. One per marketing or upgrade surface. |
| Inputs | 36 | `border-strong`; on focus, a darker border plus a 3px ink @ 7% ring |
| `SegmentedLinks` | | View switches that live in the URL |
| Icons | 16px | lucide, stroke 1.75. 20px in the phone tab bar. |

Every interactive element has a visible `focus-visible` ring and a 24px minimum target (40–44px on touch).

### Motion

Three durations:

- `120ms` for control color.
- `160–200ms` for a page fade, a message arriving, or a sheet rising 8px.
- Scroll-linked scenes on the landing page follow the scroll and have no duration.

There is no staggered entrance, no bounce on load, and nothing animates in the sidebar. `prefers-reduced-motion` turns every entrance off.

## Patterns

- **Shell:**
  - The sidebar is `paper`: workspace (switcher when there are several), search, work nav, automation nav, settings, booking page, and account with plan and logout.
  - The active item is a quiet fill.
  - On phones there is a 48px top bar (menu, place, search) and a five-slot tab bar (Today, Inbox, Calendar, Bookings, More).
- **Today (command center):**
  - A serif greeting and a one-line state.
  - The left column is "Needs you": the first item in focus with its reasoning set off by the signal rule, then compact rows that reveal actions on hover.
  - The rail holds the setup checklist, today's sessions, coming up, and what's running.
- **Inbox:**
  - Three panes: list, thread, rail.
  - The rail leads with the signature path (*wrote → understood → suggested step → approve*), then calendar, summary, follow-up and stage, book-from-here, and history.
  - On phones, the next step is a one-line disclosure above the thread.
- **Calendar and bookings:**
  - A 3px left bar carries booking state (teal confirmed, amber not confirmed, grey canceled).
  - The month grid is hairline cells. Today is a coral dot and the selected day is an ink ring.
- **People:** a real table on desktop (name, relationship, bookings, last conversation) that collapses to two lines on phones.
- **Settings:** a quiet section nav in the same style as the sidebar. Integration cards are hairline panels with provider marks and plain status tags. There are no gradient heroes and no accent strips.
- **Empty states:** a paper panel with the mark, one sentence of what belongs there, and the action.

## Don't

- Gradients, glows, glass, blur, blobs, or hover lifts.
- Coral for anything that isn't the brand or "waiting on you".
- Status stamps on logos on the landing page. What a deployment has switched on is stated once, on `/status`.
- Text below `ink/65`, or below 12px, that a person must read.
- A second primary button in the same view.
