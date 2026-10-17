# Words that follow the mechanism

Use this when a static caption cannot explain the figure's changing state.
Keep the object as the explanation; put the words beside or below it, not on
top of the machinery. A short true caption is enough for a simple figure.

## Start with one state

In the same `draw()` that moves the parts and writes the readout, pass a snapshot
of the displayed state to the explanation. Use the eased position, not the target.
Otherwise the words can announce a result before the mechanism reaches it.

Write a pure `describe(snapshot)` function that returns a map of strings. State
what changed, what caused it, and any condition that matters. Preserve units,
negation and uncertainty. A settling reading is not the final value. A part
under a probe's centre is not necessarily the part touching its whole tip.

The dial indicator's optional example follows this pattern:

```sh
node examples/dial-indicator/build.mjs --explain
node examples/dial-indicator/build.mjs --explain --light
```

It writes `dial-indicator-explained.html` and `dial-indicator-explained-light.html`.
The default builds are unchanged. It uses drawing units, not a calibrated real
instrument. Block buttons or arrow keys select a state; there is no idle tour
while the reader studies the explanation.

## Optional helper

`kit/explain.mjs` is separate from the SVG core. Include `EXPLANATION_CSS` and
`explainScript()` only in pages that use it. It has no dependencies or animation
loop and does not own the model.

At build time, `explanationHtml({ title, initial, parts })` writes a complete
static explanation. `initial` is the string map returned by `describe` for the
initial drawing; it includes `summary`. `parts` is an array of `{ id, label }`.
Each `id` also names a string in `initial`. All supplied text is escaped.

In the browser, `mountExplanation(figure, describe)` returns:

- `update(snapshot)`: describe the current state, then update changed text nodes.
- `refresh()`: refresh linked emphasis after replacing a part in the DOM.
- `destroy()`: remove listeners and emphasis, and disable the text controls.

Give a piece of SVG the same `data-explain-ref="plunger"` as its text button.
The reference is one exact ID, not a CSS selector or a list. Pointer and keyboard
emphasis are additive and stay inside the supplied figure. Clicking a text
button focuses it, so touch users can locate a part too. Keep all essential
words visible; highlighting must not be the only way to learn the relationship.

HTML buttons provide keyboard access. Do not add focusable parts inside an SVG
with `role="img"`, or inside a stage with `role="slider"`. The static page keeps
the text and disables unavailable controls until the runtime mounts.

Use ordinary text nodes for continuously changing prose. Do not make them live
regions. Announce user-selected results when settled, not on every animation
frame. Under reduced motion, jump to the selected state and keep the explanation
usable. Respond if the preference changes while the page is open.

## Verify the whole explanation

Run `node --test scripts/explain.test.mjs scripts/dial-explanation.test.mjs`.
Then capture the whole `.iso-figure` at desktop and 390 px in both themes. Read
the caption, not only the card. Check initial, intermediate and settled states:
the geometry, number and sentence must describe the same instant. Check Tab,
arrow keys, touch-sized controls, reduced motion, and the page without scripts.

This helper does not prove the explanation is true. Review the claims against
the model and its assumptions.
