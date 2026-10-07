Lumen is a calm, product-first system: vast white space, one saturated blue, large semibold headlines and soft, rounded surfaces. Content leads; chrome recedes. Every screen should feel like a well-lit gallery with one thing on show.

## Principles

- **The product is the hero.** One idea per section, centred, with the image doing the work. Remove anything that doesn't help someone decide or act.
- **Space is the separator.** Separate sections by switching background (`bg` → `bg-alt`) and by padding (`space-20`), not by borders, boxes or shadows.
- **One accent.** `accent` blue is the only saturated colour on most screens; it marks what is clickable. `highlight` orange appears only as the "New" eyebrow.
- **Soft geometry.** Buttons are full pills (`radius-pill`); cards and tiles use `radius-lg` (18px); large tiles and sheets `radius-xl`.
- **Quiet motion.** Fades and gentle lifts over 0.3s with `ease-standard`; nothing bounces or slides far.

## Content and voice

- Short, confident and warm. Headlines are two to five words and often end with a full stop: "Simply brilliant." "Built for what's next."
- Subheads are one sentence that delivers the benefit: "Everything you need. Nothing you don't."
- Sentence case everywhere — headlines, buttons, navigation. No ALL CAPS, no exclamation marks, no emoji.
- Address the reader as "you". Buttons are verbs: "Buy", "Get started", "Learn more".
- Use curly quotes and apostrophes (’ “ ”) and a non-breaking space before units.

## Colour

- Page ground is `bg` (white / black). Alternate full-width sections with `bg-alt`; place `Card`s only on `bg-alt`.
- Text: `label` for headlines and primary copy, `label-secondary` for subheads and body under a headline, `label-tertiary` only for placeholders, disabled text and icons (it does not meet 4.5:1 for small text).
- Interactive: `accent` fills the primary button (`on-accent` text); `link` colours text links and secondary buttons. `link` is a slightly deeper blue than `accent` in light theme so small text stays above 5:1.
- One dramatic contrast tile per page may use `inverse-bg` with `inverse-label`.
- Status: `success` and `danger` always come with a word or icon (check / info) — never colour alone.
- Hairlines use `separator` (1px) and are decorative; control boundaries use `border-control`.
- The dark theme is near-black (`bg` #000, `surface` #1d1d1f), with `link` brightening to #2997ff.

## Typography

- Headlines use the `display` family; text uses the `text` family. Both resolve to the system's San Francisco faces on Apple devices and fall back to Helvetica Neue / Arial elsewhere. No font files are bundled.
- Scale: `hero` 80 → `headline-1` 56 → `headline-2` 48 → `headline-3` 40 → `title-1` 32 → `title-2` 28 → `title-3` 24 → `subhead` 21 → `body` 17 → `callout` 14 → `caption` 12.
- Headlines are semibold (600), tight leading and slightly negative tracking at the largest sizes. Body is regular (400) at 17px with -0.022em tracking.
- Under 734px wide, step each headline down one level (`headline-1` → `headline-3`).
- Never set text below 12px; never use more than two weights in a block.

## Layout and spacing

- Centre content in `content-width` (980px) with `gutter` (22px) side margins; media may go to `content-width-wide`.
- Spacing runs on a 4px base: `space-1` 4 through `space-30` 120. Section padding is `space-20` (80px) top and bottom; `space-30` for a page's first hero; `space-16` on small screens.
- Headline → subhead: 6px; subhead → CTAs: `space-6`; CTAs → media: `space-8`.
- Mosaic grids of tiles use `tile-gap` (12px) on `bg-alt`.
- The `NavBar` is 44px (`nav-height`), sticky, translucent: `nav-glass` behind `blur-glass`.

## Corners, shadows and depth

- Radii: `radius-xs` 5 (checkboxes, tags), `radius-control-inner` 7 and `radius-control` 9 (inset segmented control), `radius-sm` 8 (small controls), `radius-md` 12 (fields, images in cards), `radius-lg` 18 (cards, tiles), `radius-xl` 28 (hero tiles, sheets, modals), `radius-pill` (every button).
- Shadows are rare: `shadow-card` on cards over `bg-alt`, `shadow-card-hover` for interactive cards, `shadow-overlay` for popovers and modals. In dark theme cards get a faint 1px edge instead.
- Translucency (nav, sheets) comes from `blur-glass`, not from shadow.

## Interaction states

- Hover: primary buttons shift to `accent-hover`; secondary buttons fill with `link`; text links underline; interactive cards lift.
- Focus: a solid 3px `focus-ring` outline with a 1px offset on every interactive element; it meets 3:1 on all grounds in both themes.
- Disabled: 42% opacity, no hover.
- Pressed: no colour change on buttons; a `Switch` knob stretches while held.
- Toggles: on/off settings use `Switch` (green `switch-on` by default) and take effect immediately; choosing one of several views uses `SegmentedControl` — `inset` (iOS-style rounded rectangle) in app screens and settings, `pill` on marketing pages. Toggle slides use `ease-switch` over 0.25s; honour reduced motion.

## Imagery

- Product photography or screenshots on clean, flat grounds that match the section (`bg` or `bg-alt`) so images appear to float.
- No stock people, gradients or textures behind text. Media may bleed off the bottom of a hero tile.
- Images inside cards use `radius-md`.

## Iconography

- Line icons in a 24px grid, 1.5px stroke, round caps and joins — see the Icons asset group. In code use `Lumen.Icon` (inherits `currentColor`); the SVG files are inked `label` light (#1d1d1f).
- Use 16px icons in the nav, 14px beside text, 24px standalone. Icons accompany words; they rarely replace them.
- The chevron (›) follows text links; the up-right arrow marks external links.
- No logo is defined yet: set the brand name in the `display` face at 17px semibold until one is added.

## Components

`Button`, `TextLink`, `NavBar`, `HeroTile`, `Card`, `SegmentedControl`, `Switch`, `TextField` and `Badge` live in `components/bundle.js` as `window.Lumen` (React 18), styled by `components/bundle.css` from the tokens. Build pages as a stack of `HeroTile`s and card grids under a `NavBar`; one primary `Button` per view.
