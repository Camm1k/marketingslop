const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

function parts(figure) {
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: figure.decimals,
    maximumFractionDigits: figure.decimals,
    signDisplay: figure.signed ? 'always' : 'auto'
  }).format(figure.value).replace('-', '−');
}

function number(figure, hero = false) {
  const span = node('span', `${hero ? 'hero-value' : 'figure'} ${figure.tone ?? ''}`);
  span.dataset.source = figure.source;
  span.append(node('span', 'value', parts(figure)), node('span', 'unit', figure.unit));
  if (figure.qualifier) span.append(node('span', 'qualifier', figure.qualifier));
  return span;
}

async function render() {
  const response = await fetch('/data.json');
  if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
  const data = await response.json();
  const poster = document.querySelector('#poster');
  poster.style.width = `${data.canvas.width}px`;
  poster.style.height = `${data.canvas.height}px`;

  const eyebrow = node('header', 'eyebrow mono');
  eyebrow.append(node('span', '', data.eyebrow.left), node('span', '', data.eyebrow.right));
  poster.append(eyebrow);
  const hero = node('section', 'hero');
  hero.append(node('div', 'hero-label mono', data.hero.label), number(data.hero.figure, true));
  poster.append(hero);

  const table = node('table', 'table mono');
  const colgroup = node('colgroup');
  data.table.headers.forEach(() => colgroup.append(node('col')));
  const head = node('thead');
  const header = node('tr');
  data.table.headers.forEach(text => header.append(node('th', '', text)));
  head.append(header);
  const body = node('tbody');
  data.table.rows.forEach(row => {
    const tr = node('tr');
    tr.append(node('td', '', row.label));
    row.cells.forEach(cell => {
      const td = node('td');
      td.append(number(cell));
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(colgroup, head, body);
  poster.append(table);

  const columns = node('section', 'columns');
  data.columns.forEach(column => {
    const section = node('section');
    section.append(node('h2', 'column-title mono', column.heading));
    column.rows.forEach(row => {
      const line = node('div', 'list-row');
      const label = node('span', 'identifier mono', row.label);
      // Qualifiers stay with their own row; no footnote is needed to interpret a figure.
      if (row.figure.qualifier) label.append(node('span', 'qualifier', row.figure.qualifier));
      const figure = { ...row.figure, qualifier: undefined };
      line.append(label, number(figure));
      section.append(line);
    });
    columns.append(section);
  });
  poster.append(columns);

  if (data.note?.text) {
    const note = node('section', 'note');
    if (data.note.label) note.append(node('div', 'note-label mono', data.note.label));
    note.append(node('p', '', data.note.text));
    poster.append(note);
  }
  const footer = node('footer', 'footer');
  const sources = node('div', 'sources mono');
  data.footer.lines.forEach(line => sources.append(node('div', '', line)));
  footer.append(sources);
  if (data.footer.handle) footer.append(node('div', 'handle mono', data.footer.handle));
  poster.append(footer);

  // Seeded, per-pixel noise, generated in code and composited over the entire piece.
  const grain = node('canvas');
  grain.id = 'grain';
  grain.width = data.canvas.width;
  grain.height = data.canvas.height;
  const context = grain.getContext('2d');
  const pixels = context.createImageData(grain.width, grain.height);
  let state = 73421;
  for (let i = 0; i < pixels.data.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const value = state >>> 24;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  poster.append(grain);
  await document.fonts.ready;
  if (!document.fonts.check('700 300px Display') || !document.fonts.check('23px Figures')) {
    throw new Error('Required font did not load');
  }
  window.posterReady = true;
}

render().catch(error => { window.posterError = error.message; });
