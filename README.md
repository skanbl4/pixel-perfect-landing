# Pixel-perfect landing from a Figma mockup

[Русская версия](README.ru.md)

A responsive landing page hand-coded from a free Figma Community mockup:
plain HTML, CSS and vanilla JavaScript. No frameworks, no build step, no npm.

The point is proof rather than just a page. The demo puts the mockup export
next to the live page at the same width, for each breakpoint. You can overlay
them and fade between the two yourself.

| Page | What it is |
|---|---|
| [**Proof page**](https://skanbl4.github.io/pixel-perfect-landing/) | Mockup and live page side by side or overlaid, desktop 1920 and mobile 375 |
| [**Landing**](https://skanbl4.github.io/pixel-perfect-landing/landing/) | The pixel-perfect build itself, static |
| [**Live version**](https://skanbl4.github.io/pixel-perfect-landing/live/) | The same page with motion and interaction added |

## How the match is verified

Everything is measured, nothing is judged by eye. An automated check renders
the page in headless Chrome at 10 widths (320 to 2560) and compares it with
the mockup exports:

- document height against the frame height;
- top and bottom edges of every diagonal band, at both edges of the viewport;
- the box of **every line of text and every image** inside each section;
- the position of **every word** in selected lines (this catches a wrong font
  size hidden behind a matching line length);
- no page background showing through the band joins;
- the clearance between the diagonal cut and the content.

The run is clean at every width. Line position must be within 2 px, line length
within 3 px.

The remaining pixel difference is **1.7%** at 1920 and **3.2%** at 375 (share of
pixels that differ by more than 40 of 255 in any channel). Most of it is not
layout. The mobile export has an iPhone status bar drawn on top, which does not
belong on a web page. The rest is the photo and illustrations, where one pixel
of rasterization on thin lines adds up to a visible percentage.

**Remaining mismatches are listed on every run** with their size and cause.
There are three: the word "Tristique." is 6 px wider in the desktop title
(glyph shapes differ at 80 px), the photo edge is off by 4 px (the image was
re-saved), and three accordion lines are off by 4–6 px.

**Inconsistencies in the mockup itself are reproduced, not fixed.** The desktop
and mobile frames disagree in places: two title lines set in different sizes,
a different list in the third band, Title Case answers, different footer links.
Each frame is matched as drawn. A difference from the mockup is a bug, even
when it looks nicer. That includes the mockup's yellow on white (contrast
1.8:1 on the accordion signs and the "next" arrow): reproduced knowingly,
not overlooked.

## The live version

Same markup and styles as the landing, plus `live/css/live.css` and
`live/js/live.js`. **Once the opening animations finish and before the first
interaction, it is pixel-identical to the static landing**, and a screenshot
comparison checks that.

- **Typing title.** The hero title is typed letter by letter at an uneven,
  human pace, once per page load. The caret keeps blinking while the title is
  on screen and rests, solid as in the mockup, once it scrolls away.
  The letters are revealed with the CSS Custom Highlight API instead of being
  wrapped in spans, so the line breaks never change and nothing moves.
- **Illustrations.** Each illustration fades and slides in once, with one live
  detail inside the SVG: the lamp flickers on, the chat dots bounce, the cards
  pop out from behind the character. The first plays on load, the others when
  they reach the middle of the screen.
- **Block scroll docking.** When scrolling stops near a section, the page
  eases it into place: centered if it fits the screen, top-aligned if it is
  taller. The thresholds differ for scrolling down and up. The page never pulls
  back to a section the reader has just left, and tall sections scroll freely.
  Space and PageDown move one section at a time. Wheel "bounce" from worn mice
  is filtered out.
- **Testimonial slider.** The photo is revealed with a growing circle and the
  text slides line by line. Swipe works on touch screens. The card height stays
  fixed across all slides.

All effects respect `prefers-reduced-motion`, every motion stops as soon as
its element leaves the screen, and keyboard focus is never scrolled out of view.

The effects are verified with a small Chrome DevTools Protocol driver
(plain Node, no dependencies) that runs in real time. This matters because
headless screenshots with virtual time do not advance WAAPI animations
honestly.

> Illustration effects need the page served over HTTP. Opened as a local file,
> the browser blocks reading the SVG, and the illustrations only fade in.

## Breakpoints

| Name | From | Source |
|---|---|---|
| mobile | base | mobile frame, 375 |
| tablet | 640px | own decision, the mockup has no such frame |
| desktop | 1140px | desktop frame layout, drawn at 1920 |

1920 is the width the mockup is drawn at, not a breakpoint. Otherwise a 1440
laptop would never see the desktop layout. Between 1140 and 1920 everything is
fluid (`clamp()`), tuned so the clamp hits its maximum at 1920 and the
pixel-perfect match there is untouched.

The diagonal cuts are `clip-path: polygon()` with the angle written in degrees
via `tan()`, in container query units. They are anchored to the page's vertical
axis rather than its edge, so the composition stays the same at any width:
measured at 1920, 2240, 2560, 3200 and 3840, the band edge at the container
lands on the same pixel.

## Project structure

```
index.html          proof page: mockup vs live page
demo/               proof page styles and the side-by-side / overlay switch
landing/            the static pixel-perfect landing
live/               the same landing with effects (markup copy, shared CSS)
assets/img/         illustrations and images from the mockup
assets/reference/   mockup frame exports used for comparison
```

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/. Use `127.0.0.1` rather than `localhost`,
because on some systems `localhost` resolves to IPv6 first and Python's server
only listens on IPv4.

## Credits and licenses

- **Mockup:** "Freebie Interactive Website & Mobile Responsive Designs" by
  [Imzul Design Agency](https://www.figma.com/@imzul),
  [Figma Community](https://www.figma.com/community/file/1198413387972983198/freebie-interactive-website-mobile-responsive-designs),
  CC BY 4.0.
- **Font:** the mockup uses Segoe UI, a Windows system font that cannot be
  served on the web. It is replaced with [Selawik](https://github.com/microsoft/Selawik)
  (SIL OFL), Microsoft's open replacement with matching character widths, so
  lines break exactly where the mockup breaks them.
- **Illustrations:** [DrawKit](https://www.drawkit.com/), free for commercial
  use. Attribution is not required but is given here.
- **Slider photos** in the live version (all except the first, which comes from
  the mockup): [Unsplash](https://unsplash.com/license), converted to black and
  white to match the mockup.
