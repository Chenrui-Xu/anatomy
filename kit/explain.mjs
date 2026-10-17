const explanationEscape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function explanationHtml({ title, initial, parts }) {
  const rows = parts.map(({ id, label }) => `<li class="iso-explanation-part"><button type="button" data-explain-ref="${explanationEscape(id)}" disabled>${explanationEscape(label)}</button><p data-explain-text="${explanationEscape(id)}">${explanationEscape(initial[id])}</p></li>`).join("");
  return `<section class="iso-explanation" aria-label="${explanationEscape(title)}"><h2>${explanationEscape(title)}</h2><p class="iso-explanation-summary" data-explain-text="summary">${explanationEscape(initial.summary)}</p><ul>${rows}</ul></section>`;
}

export function mountExplanation(root, describe) {
  if (typeof describe !== "function") throw new TypeError("describe must be a function");
  let active = true;
  let pointer = null;
  let focus = null;
  const reference = (target) => {
    const node = target?.closest?.("[data-explain-ref]");
    return node && root.contains(node) ? node : null;
  };
  const refresh = () => {
    if (!active) return;
    if (pointer && !root.contains(pointer)) pointer = null;
    if (focus && !root.contains(focus)) focus = null;
    const selected = new Set([pointer, focus].filter(Boolean).map((node) => node.getAttribute("data-explain-ref")));
    for (const node of root.querySelectorAll("[data-explain-ref]")) {
      const matches = selected.has(node.getAttribute("data-explain-ref"));
      if (node.hasAttribute("data-explain-active") !== matches) node.toggleAttribute("data-explain-active", matches);
    }
  };
  const handlers = {
    pointerover(event) { pointer = reference(event.target); refresh(); },
    pointerout(event) { pointer = reference(event.relatedTarget); refresh(); },
    focusin(event) { focus = reference(event.target); refresh(); },
    focusout(event) { focus = reference(event.relatedTarget); refresh(); },
    click(event) {
      const node = reference(event.target);
      if (node?.matches("button:not(:disabled)")) node.focus();
    },
  };
  for (const [name, handler] of Object.entries(handlers)) root.addEventListener(name, handler);
  for (const button of root.querySelectorAll("button[data-explain-ref]")) button.disabled = false;
  return {
    update(snapshot) {
      if (!active) return;
      const values = describe(snapshot);
      if (!values || typeof values !== "object" || Array.isArray(values)) throw new TypeError("describe must return a map of strings");
      const writes = [...root.querySelectorAll("[data-explain-text]")].map((node) => {
        const key = node.getAttribute("data-explain-text");
        if (!Object.hasOwn(values, key) || typeof values[key] !== "string") throw new TypeError(`describe must return a string for ${key}`);
        return [node, values[key]];
      });
      for (const [node, text] of writes) if (node.textContent !== text) node.textContent = text;
      refresh();
    },
    refresh,
    destroy() {
      if (!active) return;
      active = false;
      for (const [name, handler] of Object.entries(handlers)) root.removeEventListener(name, handler);
      for (const node of root.querySelectorAll("[data-explain-active]")) node.removeAttribute("data-explain-active");
      for (const button of root.querySelectorAll("button[data-explain-ref]")) button.disabled = true;
      pointer = focus = null;
    },
  };
}

export const EXPLANATION_CSS = `
.iso-explanation{margin-top:20px;padding-top:18px;border-top:1px solid var(--anatomy-faint);color:var(--anatomy-text);font-size:14px;line-height:1.6}
.iso-explanation h2{margin:0 0 10px;color:var(--anatomy-strong);font-size:16px;line-height:1.4}
.iso-explanation p{margin:6px 0 0}
.iso-explanation-summary{font-variant-numeric:tabular-nums}
.iso-explanation ul{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:14px}
.iso-explanation button{appearance:none;max-width:100%;padding:3px 7px;margin-left:-7px;border:1px solid transparent;background:transparent;color:var(--anatomy-strong);font:inherit;font-weight:600;text-align:left;cursor:pointer}
.iso-explanation button:disabled{cursor:default}
.iso-explanation button[data-explain-active]{background:var(--anatomy-face);border-color:var(--anatomy-mid)}
.iso-explanation button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:3px}
.iso-svg [data-explain-ref]{cursor:pointer}
.iso-svg [data-explain-active] .iso-edge,.iso-svg [data-explain-active] .iso-line,.iso-svg .iso-line[data-explain-active]{stroke:var(--anatomy-lit);stroke-width:1.5px!important}
`;
