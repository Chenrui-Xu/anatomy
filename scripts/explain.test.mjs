import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { explanationHtml, EXPLANATION_CSS } from "../kit/explain.mjs";
import { ISO_CSS } from "../kit/iso-kit.mjs";
import { explainScript, kitScript } from "./inline-kit.mjs";

const execute = promisify(execFile);
const drive = fileURLToPath(new URL("drive.mjs", import.meta.url));
const initial = { summary: "Travel 18.0 px", carriage: "Carriage: at rest", plunger: "Plunger: 18.0 px", needle: "Needle: 0.9 turn" };
const parts = [{ id: "carriage", label: "Carriage" }, { id: "plunger", label: "Plunger" }, { id: "needle", label: "Needle" }];

test("explanation markup escapes text and reference names", () => {
  const text = '<img src=x onerror="alert(1)">&\'"';
  const html = explanationHtml({ title: text, initial: { summary: text, [text]: text }, parts: [{ id: text, label: text }] });
  assert.doesNotMatch(html, /<img| onerror="/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;&quot;/);
  assert.match(html, /<button[^>]+ disabled>/);
  assert.doesNotMatch(html, /aria-live|tabindex/);
});

test("the optional runtime is absent from the default kit script", () => {
  assert.doesNotMatch(kitScript(), /mountExplanation|iso-explanation/);
  assert.match(explainScript(), /function mountExplanation/);
  assert.doesNotMatch(explainScript(), /^export /m);
});

function fixture(id) {
  const svg = `<svg class="iso-svg" role="img" aria-label="Three measured parts" width="240" height="70" viewBox="0 0 240 70">${parts.map(({ id: part }, index) => `<g data-explain-ref="${part}"><rect class="iso-fill" x="${10 + 75 * index}" y="10" width="60" height="50"/><path class="iso-line" d="M${10 + 75 * index} 10h60v50h-60Z" style="stroke-width:0.6px"/></g>`).join("")}</svg>`;
  return `<figure class="iso-figure" id="${id}"><div class="iso-plate">${svg}</div>${explanationHtml({ title: "Read the same state", initial, parts })}</figure>`;
}

async function inspectBrowser() {
  const directory = await mkdtemp(join(tmpdir(), "anatomy-explanation-"));
  try {
    const page = join(directory, "figure.html");
    const actionsFile = join(directory, "actions.json");
    const script = `${explainScript()}
const first=document.querySelector('#first'), second=document.querySelector('#second');
window.results={static:{summary:first.querySelector('[data-explain-text="summary"]').textContent,disabled:[...first.querySelectorAll('button')].every(button=>button.disabled)}};
const describe=state=>state?{summary:'Travel '+state.value.toFixed(1)+' px',carriage:'Carriage: '+state.caption,plunger:'Plunger: '+state.value.toFixed(1)+' px',needle:'Needle: '+state.value/20+' turn'}:{summary:'partly changed',carriage:42};
window.firstExplanation=mountExplanation(first,describe);
window.secondExplanation=mountExplanation(second,describe);
window.current={value:18,caption:'at rest'};
firstExplanation.update(current);secondExplanation.update(current);
window.activeParts=id=>[...new Set([...document.querySelectorAll('#'+id+' [data-explain-active]')].map(node=>node.getAttribute('data-explain-ref')))].sort();
window.texts=id=>Object.fromEntries([...document.querySelectorAll('#'+id+' [data-explain-text]')].map(node=>[node.getAttribute('data-explain-text'),node.textContent]));
`;
    await writeFile(page, `<!doctype html><html lang="en"><style>${ISO_CSS}${EXPLANATION_CSS}body{margin:30px;display:flex;gap:30px}.iso-figure{width:300px}.iso-plate{padding:20px}</style><body class="iso" data-theme="light"><button id="outside">Outside</button>${fixture("first")}${fixture("second")}<script type="module">${script}</script></body></html>`);
    const actions = [
      ["key", "Tab", "#outside"],
      ["eval", "results.keyboard={part:document.activeElement.getAttribute('data-explain-ref'),first:activeParts('first'),second:activeParts('second'),svgTabs:document.querySelectorAll('svg [tabindex]').length}"],
      ["click", '#first button[data-explain-ref="plunger"]'],
      ["move", '#first svg [data-explain-ref="carriage"]', 0.5, 0.5],
      ["eval", "results.union={first:activeParts('first'),second:activeParts('second'),focused:document.activeElement.getAttribute('data-explain-ref'),stroke:getComputedStyle(document.querySelector('#first svg [data-explain-ref=carriage] path')).strokeWidth}"],
      ["move", "#outside", 0.5, 0.5],
      ["eval", "results.focusAfterPointerLeave=activeParts('first');window.changed=0;window.observer=new MutationObserver(records=>changed+=records.length);observer.observe(document.querySelector('#first'),{subtree:true,childList:true,attributes:true,characterData:true});firstExplanation.update(current);null"],
      ["wait", 10],
      ["eval", "results.unchangedWrites=changed;observer.disconnect();window.focusedBefore=document.activeElement;current={value:12.5,caption:'<img src=x onerror=alert(1)> & settled'};firstExplanation.update(current);results.state={first:texts('first'),second:texts('second'),focusPreserved:document.activeElement===focusedBefore,images:document.querySelectorAll('#first img').length};null"],
      ["eval", "try{firstExplanation.update(null)}catch(error){results.invalid={message:error.message,texts:texts('first')}};null"],
      ["move", '#second svg [data-explain-ref="needle"]', 0.5, 0.5],
      ["eval", "results.isolation={first:activeParts('first'),second:activeParts('second')};firstExplanation.destroy();results.destroy={first:activeParts('first'),second:activeParts('second'),disabled:[...document.querySelectorAll('#first button')].every(button=>button.disabled)};null"],
      ["move", '#first svg [data-explain-ref="carriage"]', 0.5, 0.5],
      ["eval", "firstExplanation.update({value:0,caption:'removed'});firstExplanation.refresh();firstExplanation.destroy();results.afterDestroy={active:activeParts('first'),text:texts('first').summary};results"],
    ];
    await writeFile(actionsFile, JSON.stringify(actions));
    const result = await execute(process.execPath, [drive, page, "--actions", actionsFile, "--width", "1100"], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    const payloads = [...result.stdout.matchAll(/^eval: (.*)$/gm)];
    assert.ok(payloads.length, result.stdout);
    return JSON.parse(payloads.at(-1)[1]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

let browser;
const observations = () => browser ??= inspectBrowser();

test("static explanations are complete and controls remain disabled before mounting", async () => {
  const result = await observations();
  assert.deepEqual(result.static, { summary: "Travel 18.0 px", disabled: true });
});

test("native Tab navigation links the text to the picture without SVG tab stops", async () => {
  const result = await observations();
  assert.deepEqual(result.keyboard, { part: "carriage", first: ["carriage"], second: [], svgTabs: 0 });
});

test("pointer and keyboard highlights are additive and leaving preserves focus", async () => {
  const result = await observations();
  assert.deepEqual(result.union, { first: ["carriage", "plunger"], second: [], focused: "plunger", stroke: "1.5px" });
  assert.deepEqual(result.focusAfterPointerLeave, ["plunger"]);
});

test("state updates change text safely and preserve focus without duplicate DOM writes", async () => {
  const result = await observations();
  assert.equal(result.unchangedWrites, 0);
  assert.deepEqual(result.state, {
    first: { summary: "Travel 12.5 px", carriage: "Carriage: <img src=x onerror=alert(1)> & settled", plunger: "Plunger: 12.5 px", needle: "Needle: 0.625 turn" },
    second: initial,
    focusPreserved: true,
    images: 0,
  });
});

test("invalid descriptions fail before partially replacing a valid explanation", async () => {
  const result = await observations();
  assert.match(result.invalid.message, /describe must return a string for carriage/);
  assert.deepEqual(result.invalid.texts, result.state.first);
});

test("separate figures keep their own references and destroy removes behavior", async () => {
  const result = await observations();
  assert.deepEqual(result.isolation, { first: ["plunger"], second: ["needle"] });
  assert.deepEqual(result.destroy, { first: [], second: ["needle"], disabled: true });
  assert.deepEqual(result.afterDestroy, { active: [], text: "Travel 12.5 px" });
});
