import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const seed = JSON.parse(await readFile(join(root, 'seed/recap-example.json'), 'utf8'));

async function run(data, check) {
  const directory = await mkdtemp(join(tmpdir(), 'poster-test-'));
  try {
    const input = join(directory, 'data.json');
    const output = join(directory, 'poster.png');
    await writeFile(input, JSON.stringify(data));
    const result = spawnSync(process.execPath, [join(root, 'render.mjs'), input, output], { encoding: 'utf8', timeout: 30000 });
    assert.ifError(result.error);
    await check(result, output);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('renders supplied figures, units and all five intraday qualifiers at the requested pixel size', async () => {
  await run(seed, async (result, output) => {
    assert.equal(result.status, 0, result.stderr);
    const png = await readFile(output);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), 1350);
    const audit = JSON.parse(await readFile(`${output}.audit.json`, 'utf8'));
    assert.equal(audit.deviceScaleFactor, 2);
    assert.equal((audit.text.match(/INTRADAY/g) || []).length, 5);
    for (const value of ['7,676.80', '26,169.38', '52,361.52', '+53.12', '+214.04', '+146.36', '−14.49']) assert.ok(audit.text.includes(value), value);
    assert.deepEqual(audit.layout, { overflow: [], clipped: [], overlap: false });
  });
});

test('accepts a different subject and a sourced narrative without market-specific text', async () => {
  const other = structuredClone(seed);
  other.eyebrow.left = 'OBSERVATORY';
  other.hero.label = 'READING';
  other.hero.figure.unit = '°C';
  other.table.headers = ['SITE', 'READING', 'DELTA', 'RATE'];
  other.table.rows.forEach((row, index) => { row.label = `SITE ${String.fromCharCode(65 + index)}`; row.cells.forEach(cell => { cell.unit = '°C'; }); });
  other.columns.forEach((column, index) => { column.heading = index ? 'SECOND SET' : 'FIRST SET'; column.rows.forEach(row => { row.label = 'SENSOR'; row.figure.unit = '°C'; delete row.figure.qualifier; }); });
  other.note = { text: 'A sentence supplied by the data file.', source: 'brief' };
  other.footer = { lines: ['SOURCE: TEST FIXTURE'], handle: '@example' };
  await run(other, async (result, output) => {
    assert.equal(result.status, 0, result.stderr);
    const audit = JSON.parse(await readFile(`${output}.audit.json`, 'utf8'));
    assert.ok(audit.text.includes('OBSERVATORY'));
    assert.ok(audit.text.includes(other.note.text));
    assert.ok(audit.text.includes('@example'));
    assert.doesNotMatch(audit.text, /S&P|NASDAQ|DOW|GAINERS|LOSERS|RRC|THESTREET/);
  });
});

test('rejects missing units and unknown sources before rendering', async () => {
  for (const field of ['unit', 'source']) {
    const invalid = structuredClone(seed);
    invalid.hero.figure[field] = null;
    await run(invalid, async result => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Invalid poster data/);
    });
  }
});

test('rejects a composition that would collide with the footer', async () => {
  const crowded = structuredClone(seed);
  crowded.columns[0].rows = Array.from({ length: 20 }, () => structuredClone(seed.columns[0].rows[0]));
  await run(crowded, async result => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Layout does not fit/);
  });
});
