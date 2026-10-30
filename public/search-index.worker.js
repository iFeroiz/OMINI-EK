/* Índice invertido em segundo plano para a pesquisa local do OMINI. */
let postings = new Map();
let indexedCount = 0;

self.onmessage = ({ data }) => {
  if (data?.type === 'build') {
    postings = new Map();
    const docs = Array.isArray(data.docs) ? data.docs : [];
    docs.forEach((docIndex, i) => {
      const uniqueTerms = new Set(docIndex || []);
      for (const term of uniqueTerms) {
        let list = postings.get(term);
        if (!list) postings.set(term, list = []);
        list.push(i);
      }
    });
    indexedCount = docs.length;
    self.postMessage({ type: 'ready', count: indexedCount, terms: postings.size });
    return;
  }
  if (data?.type === 'search') {
    const lists = (data.terms || []).map(term => postings.get(term));
    if (!lists.length || lists.some(list => !list)) {
      self.postMessage({ type: 'results', id: data.id, indices: [] });
      return;
    }
    lists.sort((a, b) => a.length - b.length);
    const has = (list, target) => {
      let low = 0, high = list.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1, value = list[mid];
        if (value === target) return true;
        if (value < target) low = mid + 1; else high = mid - 1;
      }
      return false;
    };
    const indices = lists[0].filter(index => lists.slice(1).every(list => has(list, index)));
    self.postMessage({ type: 'results', id: data.id, indices });
  }
};
