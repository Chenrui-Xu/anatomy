import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { describeDial } from "../examples/dial-indicator/explanation.mjs";

const execute = promisify(execFile);
const drive = fileURLToPath(new URL("drive.mjs", import.meta.url));
const example = fileURLToPath(new URL("../examples/dial-indicator/dial-indicator-explained-light.html", import.meta.url));

const inspect = `window.dialSnapshot=()=>({
  readout:document.querySelector('[data-readout]').textContent,
  summary:document.querySelector('[data-explain-text="summary"]').textContent,
  plunger:document.querySelector('[data-explain-text="plunger"]').textContent,
  needle:document.querySelector('[data-explain-text="needle"]').textContent,
  transform:document.querySelector('[data-part="plunger"]').getAttribute('transform'),
  path:document.querySelector('[data-part="needle"]').getAttribute('d'),
  announcement:document.querySelector('[data-explain-announcement]').textContent,
  disabled:[...document.querySelectorAll('button')].map(button=>button.disabled),
  stageDisabled:document.querySelector('.iso-stage').getAttribute('aria-disabled')
});window.results={initial:dialSnapshot()};null`;
const startSampling = `window.samples=[];window.sampling=true;window.sampleFrame=()=>{samples.push(dialSnapshot());if(sampling)requestAnimationFrame(sampleFrame)};requestAnimationFrame(sampleFrame);null`;
const settledAt = (value) => `document.querySelector('[data-readout]').textContent.endsWith('reads ${value}.0 px')&&document.querySelector('[data-explain-text="summary"]').textContent.endsWith('The mechanism is at rest.')`;

async function run(actions, options = [], staticPage = false) {
  const directory = await mkdtemp(join(tmpdir(), "anatomy-dial-explanation-"));
  try {
    let page = example;
    if (staticPage) {
      page = join(directory, "static.html");
      const html = await readFile(example, "utf8");
      await writeFile(page, html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""));
    }
    const file = join(directory, "actions.json");
    await writeFile(file, JSON.stringify(actions));
    const result = await execute(process.execPath, [drive, page, "--actions", file, ...options], { timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    const payloads = [...result.stdout.matchAll(/^eval: (.*)$/gm)];
    assert.ok(payloads.length, result.stdout);
    return JSON.parse(payloads.at(-1)[1]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function regularRun() {
  return run([
    ["eval", inspect],
    ["eval", "window.ariaWrites={announcement:0,stage:0};window.ariaObserver=new MutationObserver(records=>{for(const record of records)ariaWrites[record.type==='attributes'?'stage':'announcement']++});ariaObserver.observe(document.querySelector('[data-explain-announcement]'),{childList:true});ariaObserver.observe(document.querySelector('.iso-stage'),{attributes:true,attributeFilter:['aria-valuenow','aria-valuetext']});null"],
    ["eval", startSampling],
    ["click", '[data-explain-stop="2"]'],
    ["until", settledAt(10), 15000],
    ["eval", "sampling=false;ariaObserver.disconnect();results.sampleCount=samples.length;results.transition=samples.filter((_,index)=>index%Math.max(1,Math.ceil(samples.length/32))===0);results.ariaWrites=ariaWrites;results.ten=dialSnapshot();null"],
    ["click", '[data-explain-stop="1"]'],
    ["until", settledAt(14), 15000],
    ["eval", "results.fourteen=dialSnapshot();null"],
    ["click", '[data-explain-stop="0"]'],
    ["until", settledAt(18), 15000],
    ["eval", "results.eighteen=dialSnapshot();null"],
    ["key", "End", ".iso-stage"],
    ["until", settledAt(10), 15000],
    ["eval", "results.keyboardEnd=dialSnapshot();null"],
    ["key", "ArrowRight", ".iso-stage"],
    ["until", settledAt(14), 15000],
    ["eval", "results.keyboardRight=dialSnapshot();results"],
  ]);
}

function reducedRun() {
  return run([
    ["eval", inspect],
    ["eval", startSampling],
    ["click", '[data-explain-stop="2"]'],
    ["until", settledAt(10), 1000],
    ["wait", 100],
    ["eval", "sampling=false;results.transition=samples;results.changed=dialSnapshot();null"],
    ["wait", 3800],
    ["eval", "results.afterIdle=dialSnapshot();results"],
  ], ["--reduced"]);
}

let normal, reduced, staticResult;
const normalObservations = () => normal ??= regularRun();
const reducedObservations = () => reduced ??= reducedRun();
const staticObservations = () => staticResult ??= run([["eval", inspect], ["eval", "results.initial"]], [], true);
const readingOf = (snapshot) => Number(snapshot.readout.match(/reads (-?\d+(?:\.\d+)?) px/)[1]);
const translationY = (snapshot) => Number(snapshot.transform.match(/translate\([-\d.]+[ ,]+([-\d.]+)\)/)[1]);

test("the dial describes between-block and unsettled states without claiming the target height", () => {
  const text = describeDial({ index: -1, reading: 13.37, settled: false });
  assert.match(text.summary, /probe centre is between blocks/);
  assert.match(text.summary, /currently reads 13\.4 px.*still settling/);
  assert.match(text.plunger, /13\.4 px above the carriage surface/);
  assert.match(text.needle, /0\.668 turns/);
  assert.throws(() => describeDial({ index: 0, reading: NaN, settled: true }), TypeError);
  assert.throws(() => describeDial({ index: 0, reading: 18, settled: true, perTurn: 0 }), TypeError);
});

test("the actual dial keeps the drawing and explanatory text together during interpolation", async () => {
  const result = await normalObservations();
  const moving = result.transition.filter((sample) => sample.summary.includes("still settling") && readingOf(sample) > 10.1 && readingOf(sample) < 17.9);
  assert.ok(moving.length >= 3, `expected multiple intermediate readings, observed ${moving.length}`);
  const high = translationY(result.initial), low = translationY(result.ten);
  for (const sample of moving) {
    const reading = readingOf(sample);
    assert.ok(sample.summary.includes(`currently reads ${reading.toFixed(1)} px`));
    assert.ok(sample.plunger.includes(`${reading.toFixed(1)} px above the carriage surface`));
    assert.ok(sample.needle.includes(`${reading.toFixed(1)} px corresponds to`));
    const turns = Number(sample.needle.match(/corresponds to (-?\d+(?:\.\d+)?) turns/)[1]);
    assert.ok(Math.abs(turns * 20 - reading) <= 0.061);
    const drawnReading = 10 + 8 * (translationY(sample) - low) / (high - low);
    assert.ok(Math.abs(drawnReading - reading) < 0.15, `plunger renders ${drawnReading}, prose reads ${reading}`);
    assert.notEqual(sample.path, result.initial.path);
    assert.notEqual(sample.path, result.ten.path);
  }
  assert.ok(new Set(moving.map((sample) => sample.path)).size >= 3);
});

test("all block buttons and native navigation keys reach the displayed block measurements", async () => {
  const result = await normalObservations();
  for (const [name, value, block] of [["ten", 10, 3], ["fourteen", 14, 2], ["eighteen", 18, 1], ["keyboardEnd", 10, 3], ["keyboardRight", 14, 2]]) {
    const snapshot = result[name];
    assert.equal(readingOf(snapshot), value);
    assert.match(snapshot.summary, new RegExp(`Block ${block} is under the probe centre`));
    assert.match(snapshot.summary, /The mechanism is at rest\.$/);
    assert.equal(snapshot.announcement, snapshot.readout);
    assert.deepEqual(snapshot.disabled, Array(6).fill(false));
    assert.equal(snapshot.stageDisabled, null);
  }
});

test("animation updates visible prose without announcing every animation frame", async () => {
  const result = await normalObservations();
  assert.ok(result.sampleCount > 10);
  assert.equal(result.ariaWrites.announcement, 1);
  assert.ok(result.ariaWrites.stage <= 2, JSON.stringify(result.ariaWrites));
  const announcements = new Set(result.transition.filter((sample) => sample.summary.includes("still settling")).map((sample) => sample.announcement));
  assert.deepEqual([...announcements], [result.initial.announcement]);
});

test("reduced motion jumps to the chosen block and stays there after the idle interval", async () => {
  const result = await reducedObservations();
  assert.ok(result.transition.length > 0);
  for (const sample of result.transition) assert.ok([18, 10].includes(readingOf(sample)), sample.readout);
  assert.equal(readingOf(result.changed), 10);
  assert.deepEqual(result.afterIdle, result.changed);
});

test("the built page remains a correct static explanation without its JavaScript", async () => {
  const snapshot = await staticObservations();
  assert.equal(readingOf(snapshot), 18);
  assert.match(snapshot.summary, /reads 18\.0 px.*at rest/);
  assert.match(snapshot.needle, /0\.900 turns/);
  assert.deepEqual(snapshot.disabled, Array(6).fill(true));
  assert.equal(snapshot.stageDisabled, "true");
  assert.equal(snapshot.announcement, "");
  assert.ok(snapshot.path.startsWith("M"));
  assert.ok(Number.isFinite(translationY(snapshot)));
});
