import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const [input, destination = 'output/poster.png'] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node render.mjs <data.json> [output.png]');
  process.exit(1);
}

// Validate the presentation data, with no subject-specific names or calculations.
export function validate(data) {
  const fail = message => { throw new Error(`Invalid poster data: ${message}`); };
  const text = (value, label) => { if (typeof value !== 'string' || !value.trim()) fail(`${label} needs text`); };
  const source = key => { if (!data.sources?.[key]?.name) fail(`unknown source: ${key}`); };
  const figure = f => {
    if (!f || !Number.isFinite(f.value)) fail('figure needs a finite value');
    if (!Number.isInteger(f.decimals) || f.decimals < 0 || f.decimals > 6) fail('figure decimals must be 0–6');
    text(f.unit, 'figure unit');
    source(f.source);
    if (f.tone && !['rise', 'fall', 'accent'].includes(f.tone)) fail('unsupported tone');
    if (f.qualifier !== undefined) text(f.qualifier, 'qualifier');
  };
  if (![data.canvas?.width, data.canvas?.height].every(n => Number.isInteger(n) && n >= 200 && n <= 6000 && n % 2 === 0)) fail('canvas dimensions must be even integers from 200 to 6000');
  text(data.eyebrow?.left, 'eyebrow left'); text(data.eyebrow?.right, 'eyebrow right'); source(data.eyebrow.source);
  text(data.hero?.label, 'hero label'); figure(data.hero.figure);
  if (data.table?.headers?.length !== 4 || !data.table.rows?.length) fail('table needs four headers and rows');
  data.table.headers.forEach(h => text(h, 'table header'));
  data.table.rows.forEach(row => {
    text(row.label, 'row label'); source(row.source);
    if (row.cells?.length !== 3) fail('table row needs three figures');
    row.cells.forEach(figure);
  });
  if (data.columns?.length !== 2) fail('exactly two columns required');
  data.columns.forEach(column => {
    text(column.heading, 'column heading');
    if (!column.rows?.length) fail('column needs rows');
    column.rows.forEach(row => { text(row.label, 'row label'); figure(row.figure); });
  });
  if (data.note?.text) { text(data.note.text, 'note'); source(data.note.source); }
  if (!data.footer?.lines?.length) fail('footer source lines required');
  data.footer.lines.forEach(line => text(line, 'footer line'));
}

let browser;
let server;
try {
  const raw = await readFile(resolve(input), 'utf8');
  const data = JSON.parse(raw);
  validate(data);
  const files = new Map([
    ['/', ['renderer/index.html', 'text/html']],
    ['/renderer/poster.css', ['renderer/poster.css', 'text/css']],
    ['/renderer/poster.js', ['renderer/poster.js', 'text/javascript']],
    ['/assets/fonts/BarlowCondensed-Bold.ttf', ['assets/fonts/BarlowCondensed-Bold.ttf', 'font/ttf']],
    ['/assets/fonts/DejaVuSansMono.ttf', ['assets/fonts/DejaVuSansMono.ttf', 'font/ttf']]
  ]);
  server = createServer(async (request, response) => {
    try {
      if (request.url === '/data.json') {
        response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(raw); return;
      }
      const file = files.get(request.url);
      if (!file) { response.writeHead(404); response.end(); return; }
      const content = await readFile(resolve(root, file[0]));
      response.writeHead(200, { 'Content-Type': file[1] }); response.end(content);
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  let executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (!executablePath) {
    try { await access(chromium.executablePath()); }
    catch {
      try { await access('/usr/bin/chromium'); executablePath = '/usr/bin/chromium'; }
      catch { throw new Error('Install Chromium with npm run browser:install or set CHROMIUM_EXECUTABLE_PATH'); }
    }
  }
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({
    viewport: { width: data.canvas.width / 2, height: data.canvas.height / 2 },
    deviceScaleFactor: 2,
    locale: 'en-AU', timezoneId: 'Australia/Sydney'
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.posterReady || window.posterError);
  const error = await page.evaluate(() => window.posterError);
  if (error || errors.length) throw new Error(error || errors.join('; '));
  const layout = await page.evaluate(() => {
    const box = document.querySelector('#poster').getBoundingClientRect();
    const footer = document.querySelector('.footer').getBoundingClientRect();
    const columns = document.querySelector('.columns').getBoundingClientRect();
    const note = document.querySelector('.note')?.getBoundingClientRect();
    const overflow = [...document.querySelectorAll('#poster *:not(canvas)')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width && (r.right > box.right + .5 || r.bottom > box.bottom + .5 || r.left < box.left - .5);
    }).map(el => el.className || el.tagName);
    const clipped = [...document.querySelectorAll('td, th, .list-row, .eyebrow, .footer')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className || el.tagName);
    return { overflow, clipped, overlap: Boolean(columns.bottom > (note?.top ?? footer.top) || (note && note.bottom > footer.top)) };
  });
  if (layout.overflow.length || layout.clipped.length || layout.overlap) throw new Error(`Layout does not fit: ${JSON.stringify(layout)}`);
  const output = resolve(destination);
  if (extname(output).toLowerCase() !== '.png') throw new Error('Output must be a PNG path');
  await mkdir(dirname(output), { recursive: true });
  await page.screenshot({ path: output, type: 'png', scale: 'device' });
  const text = await page.locator('#poster').innerText();
  await writeFile(`${output}.audit.json`, JSON.stringify({ input: resolve(input), dataSha256: createHash('sha256').update(raw).digest('hex'), width: data.canvas.width, height: data.canvas.height, deviceScaleFactor: 2, browser: browser.version(), text, layout, sources: data.sources }, null, 2) + '\n');
  console.log(`Rendered ${output} (${data.canvas.width}×${data.canvas.height}, deviceScaleFactor 2)`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) await new Promise(done => server.close(done));
}
