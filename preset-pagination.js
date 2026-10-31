// Pagination of preset quotations into physical A4 pages.
// Called after render(), before the preview is visually scaled.
// Terms are kept together whenever possible; if longer than an A4 page,
// only complete numbered clauses are moved to the next page.
export function paginatePresetDocument(root, options = {}) {
  const first = root.querySelector('article.paper');
  if (!first || !first.getBoundingClientRect().width) return;
  const nodes = Array.from(first.children);
  first.replaceChildren();
  const mm = 96 / 25.4;
  let page = first;

  function nextPage() {
    page = document.createElement('article');
    page.className = 'paper';
    root.appendChild(page);
    return page;
  }
  function fits(node) {
    const pr = page.getBoundingClientRect();
    const nr = node.getBoundingClientRect();
    const scale = pr.width / (210 * mm);
    const bottom = pr.top + (297 - 12 - 2) * mm * scale;
    return nr.bottom <= bottom + 0.5;
  }
  function appendWhole(node) {
    page.appendChild(node);
    if (!fits(node) && page.children.length > 1) {
      node.remove();
      nextPage().appendChild(node);
    }
  }
  function termsSize(section, preferred) {
    const body = section.querySelector('.excel-terms');
    if (!body) return true;
    const sizes = [preferred];
    if (options.fit !== 'normal') {
      for (let n = preferred - 0.5; n >= 6.5; n -= 0.5) sizes.push(n);
      if (sizes[sizes.length - 1] !== 6.5) sizes.push(6.5);
    }
    for (const n of sizes) {
      body.style.fontSize = n + 'pt';
      section.style.setProperty('--term-gap', n < preferred ? '1mm' : '1.3mm');
      if (fits(section)) return true;
    }
    return false;
  }
  function emptyTerms(original) {
    const section = original.cloneNode(false);
    const header = original.querySelector('.excel-terms-header');
    if (header) section.appendChild(header.cloneNode(true));
    const body = original.querySelector('.excel-terms').cloneNode(false);
    section.appendChild(body);
    return { section, body };
  }
  function appendTerms(original) {
    const preferred = Math.max(6.5, Math.min(9, Number(options.size) || 8));
    page.appendChild(original);
    if (termsSize(original, preferred)) return;
    if (page.children.length > 1) {
      original.remove();
      nextPage().appendChild(original);
      if (termsSize(original, preferred)) return;
    }
    // Unusually long terms: repeat the heading and split only between clauses.
    const clauses = Array.from(original.querySelectorAll('.excel-terms > .excel-term'));
    if (!clauses.length) return;
    const finalSize = original.querySelector('.excel-terms').style.fontSize;
    original.remove();
    let part = emptyTerms(original);
    page.appendChild(part.section);
    part.body.style.fontSize = finalSize;
    for (const clause of clauses) {
      part.body.appendChild(clause);
      if (!fits(part.section) && part.body.children.length > 1) {
        clause.remove();
        nextPage();
        part = emptyTerms(original);
        page.appendChild(part.section);
        part.body.style.fontSize = finalSize;
        part.body.appendChild(clause);
      }
    }
  }
  function appendItemTable(original) {
    const rows = Array.from(original.tBodies[0]?.rows || []);
    if (!rows.length) { appendWhole(original); return; }
    const skeleton = () => {
      const table = original.cloneNode(true);
      table.tBodies[0].replaceChildren();
      return table;
    };
    let table = skeleton();
    appendWhole(table);
    for (const row of rows) {
      table.tBodies[0].appendChild(row);
      if (!fits(row)) {
        row.remove();
        if (table.tBodies[0].rows.length === 0) table.remove();
        nextPage();
        table = skeleton();
        page.appendChild(table);
        table.tBodies[0].appendChild(row);
      }
    }
  }
  for (const node of nodes) {
    if (node.matches('section.excel-terms-section')) appendTerms(node);
    else if (node.matches('table.excel-table')) appendItemTable(node);
    else appendWhole(node);
  }
  return root.querySelectorAll('article.paper').length;
}
