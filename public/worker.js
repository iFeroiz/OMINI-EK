/* OMINI background worker: folder-file extraction, persistent inverted index and search. */
const DB_NAME = 'OMINI_MANUAL_DATABASE_LOCAL';
const STORE = 'manuals';
const CONNECTION_STORE = 'folderConnections';
const SNAPSHOT_ID = 'search-worker-index-buffer-v2';
const BATCH_SIZE = 50;
const MAX_IN_FLIGHT_BYTES = 192 * 1024 * 1024;
const STOP_WORDS = new Set(['como','qual','quais','quando','onde','para','sobre','com','uma','uns','das','dos','por','que','the','and','this','that','segundo','de','da','do','em','no','na','nos','nas','ao','aos','as','os','um','e','ou','se','seu','sua','meu','minha','meus','minhas','quero','preciso','mostre','informe','indique','explique','procure','pesquise','encontre','arquivo','arquivos','documento','documentos','fale','diga']);
let postings = new Map();
let indexedCount = 0;
let databasePromise = null;
let searchMetadata = [];
let pdfModulePromise = null;
let activeBytes = 0;
let activeFiles = 0;
const MAX_CONCURRENT_FILES = 8;
const byteWaiters = [];
let xlsxModulePromise = null;

function normalize(value) {
  return String(value || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function tokenize(value) { return normalize(value).split(/\s+/).filter(word => word.length >= 2 && !STOP_WORDS.has(word)); }
function wordForms(word) {
  const forms = new Set([word]);
  if (word.length >= 5) {
    if (word.endsWith('es')) forms.add(word.slice(0, -2));
    if (word.endsWith('s')) forms.add(word.slice(0, -1));
    for (const [suffix, replacement] of [['oes','ao'],['aes','ao'],['ais','al'],['eis','el'],['ois','ol'],['uis','ul']]) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) forms.add(word.slice(0, -suffix.length) + replacement);
    }
  }
  return [...forms];
}
function queryTokens(query) { return [...new Set(tokenize(query))]; }
function openDb() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); databasePromise = null; }; resolve(db); };
    request.onerror = () => { databasePromise = null; reject(request.error); };
  });
  return databasePromise;
}
async function readLatestSnapshot() {
  const db = await openDb();
  if (!db.objectStoreNames.contains(CONNECTION_STORE)) return null;
  return new Promise((resolve, reject) => {
    const get = db.transaction(CONNECTION_STORE, 'readonly').objectStore(CONNECTION_STORE).get(SNAPSHOT_ID);
    get.onsuccess = () => resolve(get.result?.schema === 6 ? get.result : null);
    get.onerror = () => reject(get.error);
  });
}async function saveSnapshot(signature) {
  const db = await openDb();
  if (!db.objectStoreNames.contains(CONNECTION_STORE)) throw new Error('Store local de índice não disponível.');
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONNECTION_STORE, 'readwrite');
    tx.objectStore(CONNECTION_STORE).put({ id: SNAPSHOT_ID, schema: 6, signature, entries: [...postings], count: indexedCount, metadata: searchMetadata, savedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Falha ao salvar o índice local.'));
    tx.onabort = () => reject(tx.error || new Error('Gravação do índice cancelada.'));
  });
}function findCandidates(query) {
  const terms = queryTokens(query);
  if (!terms.length) return [];
  const groups = terms.map(term => wordForms(term).map(form => postings.get(form)).filter(Boolean));
  if (groups.some(group => !group.length)) return [];
  const contains = (list, value) => {
    let low = 0, high = list.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1, current = list[middle];
      if (current === value) return true;
      if (current < value) low = middle + 1; else high = middle - 1;
    }
    return false;
  };
  const seed = groups.flat().reduce((best, list) => !best || list.length < best.length ? list : best, null);
  return seed.filter(index => groups.every(group => group.some(list => contains(list, index))));
}
function acquireByteBudget(size, name) {
  const ext = '.' + String(name || '').split('.').pop().toLowerCase();
  const multiplier = ext === '.pdf' ? 4 : ['.docx','.xls','.xlsx','.xlsm','.pptx','.odt','.ods','.odp'].includes(ext) ? 3 : 1.5;
  const weight = Math.max(1024 * 1024, Math.min(MAX_IN_FLIGHT_BYTES, Number(size || 0) * multiplier || 1024 * 1024));
  return new Promise(resolve => {
    const enter = () => {
      if (activeFiles < MAX_CONCURRENT_FILES && (activeBytes === 0 || activeBytes + weight <= MAX_IN_FLIGHT_BYTES)) {
        activeFiles++; activeBytes += weight;
        resolve(() => { activeFiles--; activeBytes -= weight; const queued = byteWaiters.splice(0); queued.forEach(retry => retry()); });
      } else byteWaiters.push(enter);
    };
    enter();
  });
}async function withByteBudget(size, name, action) { const release = await acquireByteBudget(size, name); try { return await action(); } finally { release(); } }

function decodeXml(xml) {
  return String(xml || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, ' ').trim();
}
async function unzipEntries(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer), decoder = new TextDecoder();
  let eocd = -1;
  for (let i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i++) if (view.getUint32(i, true) === 0x06054b50) eocd = i;
  if (eocd < 0) throw new Error('Arquivo compactado inválido.');
  const count = view.getUint16(eocd + 10, true); let offset = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true), size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true), name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({ name, method, size, localOffset, bytes, view });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
async function unzipEntry(entry) {
  const { bytes, view, localOffset, size, method } = entry;
  const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
  const compressed = bytes.slice(start, start + size);
  if (method === 0) return new TextDecoder().decode(compressed);
  if (method !== 8 || !('DecompressionStream' in self)) throw new Error('Compactação Office não suportada neste navegador.');
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
async function officeText(file, ext) {
  if (ext === '.xls') {
    if (!xlsxModulePromise) xlsxModulePromise = import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
    const XLSX = await xlsxModulePromise;
    const workbook = XLSX.read(await file.arrayBuffer(), { dense: true, cellText: true });
    const text = workbook.SheetNames.map(name => XLSX.utils.sheet_to_csv(workbook.Sheets[name], { FS: ' ' })).join('\n');
    return { text: text.slice(0, 8_000_000), pages: workbook.SheetNames.length };
  }
  const entries = await unzipEntries(await file.arrayBuffer());
  let wanted = [];
  if (ext === '.docx') wanted = entries.filter(e => e.name === 'word/document.xml');
  else if (['.odt','.ods','.odp'].includes(ext)) wanted = entries.filter(e => e.name === 'content.xml');
  else if (ext === '.pptx') wanted = entries.filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.name)).sort((a,b) => Number(a.name.match(/slide(\d+)/)[1]) - Number(b.name.match(/slide(\d+)/)[1]));
  else if (['.xlsx','.xlsm'].includes(ext)) {
    const sharedXml = entries.find(e => e.name === 'xl/sharedStrings.xml');
    const shared = sharedXml ? [...(await unzipEntry(sharedXml)).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match => decodeXml(match[1])) : [];
    const sheets = entries.filter(e => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
    const cells = [];
    for (const sheet of sheets) {
      const xml = await unzipEntry(sheet);
      for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const kind = match[1].match(/\bt=["']([^"']+)["']/)?.[1] || '';
        const value = match[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || '';
        const inline = [...match[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(item => decodeXml(item[1])).join(' ');
        cells.push(kind === 's' ? (shared[Number(value)] || '') : inline || decodeXml(value));
      }
    }
    return { text: cells.join(' | ').slice(0, 8_000_000), pages: sheets.length };
  }
  const parts = [];
  for (const entry of wanted) parts.push(decodeXml(await unzipEntry(entry)));
  return { text: parts.join('\n').slice(0, 8_000_000), pages: wanted.length };
}async function pdfText(file) {
  if (!pdfModulePromise) pdfModulePromise = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs').then(module => {
    module.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
    return module;
  });
  const pdfjs = await pdfModulePromise;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts = []; let chars = 0;
  try {
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      const pageText = content.items.map(item => item.str || '').join(' ');
      parts.push(pageText); chars += pageText.length;
      if (chars >= 8_000_000) break;
    }
    return { text: parts.join('\n').slice(0, 8_000_000), pages: pdf.numPages };
  } finally { await pdf.destroy(); }
}
async function extractFile(file, name) {
  const ext = '.' + String(name).split('.').pop().toLowerCase();
  if (ext === '.pdf') return pdfText(file);
  if (['.docx','.xls','.xlsx','.xlsm','.pptx','.odt','.ods','.odp'].includes(ext)) return officeText(file, ext);
  if (['.jpg','.jpeg','.png','.webp','.gif','.bmp'].includes(ext)) return { text: '', pages: 0 };
  let text = await file.slice(0, 16 * 1024 * 1024).text();
  if (ext === '.html' || ext === '.htm') text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  if (ext === '.rtf') text = text.replace(/\\'[0-9a-f]{2}/gi, ' ').replace(/\\[a-z]+-?\d* ?|[{}]/gi, ' ');
  return { text: text.slice(0, 8_000_000), pages: 0 };
}
async function saveRecord(record) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Não foi possível salvar o arquivo indexado.'));
    tx.onabort = () => reject(tx.error || new Error('Gravação cancelada.'));
  });
}
async function indexFile(descriptor) {
  return withByteBudget(descriptor.size, descriptor.name, async () => {
    if (!descriptor.fileHandle || descriptor.fileHandle.kind !== 'file') throw new Error('Handle do arquivo indisponível.');
    const file = await descriptor.fileHandle.getFile();
    if (file.size !== descriptor.size || file.lastModified !== descriptor.lastModified) throw new Error('O arquivo mudou durante a leitura; reindexe a pasta.');
    const ext = '.' + String(descriptor.name).split('.').pop().toLowerCase();
    const isImage = file.type.startsWith('image/') || ['.jpg','.jpeg','.png','.webp','.gif','.bmp'].includes(ext);
    const extracted = isImage ? { text: '', pages: 0 } : await extractFile(file, descriptor.name);
    const record = {
      id: descriptor.id, name: descriptor.name, path: descriptor.path, folder: descriptor.folder || '',
      size: file.size, lastModified: file.lastModified, type: ext === '.pdf' ? 'pdf' : isImage ? 'image' : ext.slice(1),
      mimeType: file.type || descriptor.mimeType || '', pages: extracted.pages, text: extracted.text || '',
      normalizedText: normalize(extracted.text || ''), blob: null, fileHandle: descriptor.fileHandle,
      createdAt: Date.now(), connectedFolder: true, contentIndexedAt: Date.now(), contentSupported: true, indexParserVersion: 6
    };
    await saveRecord(record);
    return { id: String(record.id), name: record.name, path: record.path, size: record.size, lastModified: record.lastModified, textLength: record.text.length };
  });
}
async function indexFiles(data) {
  const files = Array.isArray(data.files) ? data.files : [];
  const results = new Array(files.length); let complete = 0;
  for (let offset = 0; offset < files.length; offset += BATCH_SIZE) {
    const chunk = files.slice(offset, offset + BATCH_SIZE);
    await Promise.all(chunk.map(async (file, localIndex) => {
      const index = offset + localIndex;
      try { results[index] = { ok: true, file: await indexFile(file) }; }
      catch (error) { results[index] = { ok: false, id: String(file.id), name: file.name, path: file.path, error: error?.message || String(error) }; }
      complete++;
      self.postMessage({ type: 'file-progress', id: data.id, completed: complete, total: files.length, result: results[index] });
    }));
  }
  self.postMessage({ type: 'files-indexed', id: data.id, results });
}

function makeSignature(metadata) {
  let seed = 'catalog-index-v6|' + metadata.length + '|';
  for (const item of metadata) seed += String(item.id) + ':' + String(item.path || '') + ':' + Number(item.size || 0) + ':' + Number(item.lastModified || 0) + ':' + Number(item.contentIndexedAt || 0) + ':' + Number(item.imageOcrIndexedAt || 0) + ':' + Number(item.pdfOcrIndexedAt || 0) + ':' + Number(item.indexParserVersion || 0) + ':' + Number(item.textLength || 0) + '|';
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return 'v6:' + metadata.length + ':' + (hash >>> 0);
}
async function readCatalogMetadata() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
      const metadata = [], tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).openCursor();let scanned=0;
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(metadata); return; }
        scanned++;if(scanned===1||scanned%50===0)self.postMessage({type:'catalog-progress',scanned,eligible:metadata.length});
        const item = cursor.value;
        if (item.connectedFolder) metadata.push({ id: String(item.id), name: String(item.name || 'Documento'), path: String(item.path || ''), size: Number(item.size || 0), lastModified: Number(item.lastModified || 0), contentIndexedAt: Number(item.contentIndexedAt || 0), imageOcrIndexedAt: Number(item.imageOcrIndexedAt || 0), pdfOcrIndexedAt: Number(item.pdfOcrIndexedAt || 0), indexParserVersion: Number(item.indexParserVersion || 0), textLength: String(item.text || item.normalizedText || '').length });
        cursor.continue();
      };
      tx.onerror = () => reject(tx.error);
  });
}
async function buildIndexFromCatalog(signature, total) {
  postings = new Map(); searchMetadata = []; indexedCount = 0;
  const db = await openDb();
  await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        const item = cursor.value;
        if (!item.connectedFolder) { cursor.continue(); return; }
        const ocr = String(item.ocrText || '') + ' ' + (Array.isArray(item.learnedFacts) ? item.learnedFacts.filter(fact => String(fact).startsWith('Texto OCR indexado:')).map(fact => String(fact).replace(/^Texto OCR indexado:\s*/, '')).join(' ') : '');
        const name = normalize(item.name || ''), path = normalize(item.path || ''), content = normalize(String(item.normalizedText || item.text || '') + ' ' + ocr);
        const unique = new Set([...tokenize(name), ...tokenize(path), ...tokenize(content)].flatMap(wordForms));
        const index = indexedCount++;
        for (const word of unique) { let list = postings.get(word); if (!list) postings.set(word, list = []); list.push(index); }
        searchMetadata.push({ id: String(item.id), name: String(item.name || 'Documento'), path: String(item.path || ''), nameTerms: tokenize(name), pathTerms: tokenize(path) });
        if (indexedCount % 100 === 0) self.postMessage({ type: 'index-progress', completed: indexedCount, total: Math.max(Number(total || indexedCount), 1) });
        cursor.continue();
      };
      tx.onerror = () => reject(tx.error);
  });
  self.postMessage({ type: 'ready', restored: false, count: indexedCount, terms: postings.size });
  saveSnapshot(signature).catch(error => self.postMessage({ type: 'snapshot-error', message: error?.message || String(error) }));
}
async function initializeIndex(forceBuild = false) {
  const metadata = await readCatalogMetadata();
  const signature = makeSignature(metadata);
  if (!forceBuild) {
    const snapshot = await readLatestSnapshot();
    if (snapshot && snapshot.signature === signature) {
      postings = new Map(snapshot.entries || []); indexedCount = Number(snapshot.count || 0); searchMetadata = snapshot.metadata || [];
      self.postMessage({ type: 'ready', restored: true, count: indexedCount, terms: postings.size });
      return;
    }
  }
  await buildIndexFromCatalog(signature, metadata.length);
}function rankCandidates(indices, query) {
  const terms = queryTokens(query), foldedQuery = normalize(query);
  return indices.map(index => ({ index, doc: searchMetadata[index] })).filter(hit => hit.doc).sort((a, b) => {
    const score = doc => terms.reduce((total, term) => total + (doc.nameTerms?.includes(term) ? 5 : 0) + (doc.pathTerms?.includes(term) ? 2 : 0), 0) + (normalize(doc.name).includes(foldedQuery) || normalize(doc.path).includes(foldedQuery) ? 50 : 0);
    return score(b.doc) - score(a.doc) || a.doc.path.localeCompare(b.doc.path, 'pt-BR');
  }).map(({ doc }) => ({ id: doc.id, name: doc.name, path: doc.path }));
}self.onmessage = ({ data }) => {
  if (data?.type === 'init-index') {
    initializeIndex(data.forceBuild === true).catch(error => self.postMessage({ type: 'index-error', message: error?.message || String(error) }));
  } else if (data?.type === 'search') {
    const indices = findCandidates(data.query || '');
    self.postMessage({ type: 'results', id: data.id, results: rankCandidates(indices, data.query || '') });
  } else if (data?.type === 'index-files') {
    indexFiles(data).catch(error => self.postMessage({ type: 'files-indexed', id: data.id, error: error?.message || String(error), results: [] }));
  }
};
