const fs = require('fs');
const s = fs.readFileSync('projplan.html', 'utf8');
const blocks = [...s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
const js = blocks[blocks.length - 1][1];
const re = /(^|[^\S\n]*\n[^\S\n]*)(return|throw|break|continue|yield)\b[^\S\n]*\n/g;
let m, c = 0;
while ((m = re.exec(js))) {
  c++;
  const line = js.slice(0, m.index).split('\n').length;
  console.log(line, JSON.stringify(m[0].slice(0, 40)), 'next', JSON.stringify(js.slice(m.index + m[0].length, m.index + m[0].length + 40)));
}
console.log('count', c);
