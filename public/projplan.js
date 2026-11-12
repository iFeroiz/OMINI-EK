const CHECKLIST_TEMPLATE = {
    caracteristica: ["Chaparia", "Barramento", "Entrada", "Normas", "Comando AC", "Comando DC", "Auxiliares", "Inversor", "Outros"],
    observacoes: ["Chaparia", "Materiais", "Cor", "Hardware", "Documentação"],
    materiais: ["Chaparia", "Barramento", "Proteção", "Comando AC", "Climatização", "Inversores", "Outros"],
    servicos: ["Projeto", "Montagem", "Startup", "FAT", "Outros"],
    custo: ["Miscelâneas", "Chaparia", "Materiais", "Outros"]
};

const COLUMNS = [
    { id: 'nao_iniciado', title: 'Não iniciado', badge: 'bg-brand-card text-brand-muted border border-brand-border' },
    { id: 'pausado', title: 'Pausado', badge: 'bg-amber-950 text-amber-300 border border-amber-800' },
    { id: 'em_execucao', title: 'Em Execução', badge: 'bg-blue-950 text-blue-300 border border-blue-800' },
    { id: 'finalizado', title: 'Finalizado', badge: 'bg-emerald-950 text-emerald-300 border border-emerald-800' }
];

class OminiApp {
    constructor() {
        this.data = this.loadData();
        this.projId = null;
        this.painelId = null;
        this.activeTab = 'checklist';
        this.initUI();
    }

    loadData() {
        const saved = localStorage.getItem('omini_projects_v5');
        if (saved) {
            try { return JSON.parse(saved); } catch(e) {}
        }
        return {
            tagsGlobais: ["10.26.062", "Argentina", "Urgente"],
            projetos: [{
                id: 'p1', titulo: '10.26.062(Argentina)', tags: ["10.26.062", "Argentina"], status: 'em_execucao', data: 'nov 13',
                paineis: [{ id: 'pn1', titulo: 'CCM Principal', tag: 'CCM-01', checklist: this.emptyChecklist(), ferramentas: this.emptyTools(), folhaDados: {} }]
            }]
        };
    }

    save() { localStorage.setItem('omini_projects_v5', JSON.stringify(this.data)); }
    
    emptyChecklist() {
        let c = {};
        for (let k in CHECKLIST_TEMPLATE) {
            c[k] = {};
            CHECKLIST_TEMPLATE[k].forEach(i => c[k][i] = null);
        }
        return c;
    }

    emptyTools() { return { motores: [], hvacPd: 100, hvacH: 2000, hvacW: 600, hvacD: 600, hvacTe: 45, hvacTi: 35, barrasIn: 800, barrasIcw: 37 }; }

    initUI() { this.renderKanban(); this.initChecklistDOM(); }

    initChecklistDOM() {
        const container = document.getElementById('checklist-columns-container');
        if (!container) return;
        container.innerHTML = '';
        const metas = [
            {key: 'caracteristica', title: 'Característica', color: 'emerald'},
            {key: 'observacoes', title: 'Observações', color: 'amber'},
            {key: 'materiais', title: 'Materiais', color: 'emerald'},
            {key: 'servicos', title: 'Serviços', color: 'sky'},
            {key: 'custo', title: 'Custo', color: 'purple'}
        ];
        metas.forEach(m => {
            container.innerHTML += `
                <div class="w-80 shrink-0 bg-brand-card rounded-xl p-4 flex flex-col border border-brand-border relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-full h-1 bg-${m.color}-500"></div>
                    <div class="pb-3 border-b border-brand-border mb-3 flex justify-between items-center text-xs">
                        <span class="font-bold uppercase tracking-wider">${m.title}</span>
                        <span id="prog-val-${m.key}" class="font-mono font-bold text-${m.color}-400 bg-${m.color}-500/10 px-2 py-0.5 rounded">0%</span>
                    </div>
                    <div class="w-full bg-brand-input rounded-full h-1.5 mb-3"><div id="prog-bar-${m.key}" class="bg-${m.color}-500 h-1.5 rounded-full transition-all" style="width:0%"></div></div>
                    <div id="list-items-${m.key}" class="flex-1 overflow-y-auto space-y-2 pr-1"></div>
                </div>`;
        });
    }

    renderKanban(query = '') {
        const container = document.getElementById('kanban-columns');
        container.innerHTML = '';
        COLUMNS.forEach(col => {
            let projs = this.data.projetos.filter(p => p.status === col.id && (!query || p.titulo.toLowerCase().includes(query.toLowerCase())));
            let div = document.createElement('div');
            div.className = 'w-80 shrink-0 flex flex-col bg-brand-card rounded-xl border border-brand-border max-h-full shadow-md';
            div.ondragover = e => e.preventDefault();
            div.ondrop = e => { e.preventDefault(); let id = e.dataTransfer.getData('text'); this.moveProj(id, col.id); };

            let html = `<div class="p-3.5 border-b border-brand-border flex justify-between items-center bg-brand-aside rounded-t-xl"><span class="px-2.5 py-0.5 rounded text-xs font-semibold ${col.badge}">${col.title}</span><span class="text-xs text-brand-muted font-mono">${projs.length}</span></div><div class="p-2 flex-1 overflow-y-auto space-y-2.5 min-h-[220px]">`;
            if (projs.length === 0) html += `<div class="text-center py-8 text-xs text-brand-muted italic">Vazio</div>`;
            projs.forEach(p => {
                let tags = p.tags.map(t => `<span class="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">${t}</span>`).join('');
                html += `<div draggable="true" ondragstart="event.dataTransfer.setData('text','${p.id}')" onclick="app.openProj('${p.id}')" class="bg-brand-input hover:bg-brand-border/40 border border-brand-border rounded-xl p-3.5 cursor-pointer transition shadow group">
                    <div class="flex justify-between mb-2"><div class="flex gap-1">${tags}</div></div>
                    <p class="text-xs font-medium mb-3">${p.titulo}</p>
                    <div class="flex justify-between text-[11px] text-brand-muted pt-2.5 border-t border-brand-border"><span class="flex items-center gap-1"><i class="regular fa-calendar"></i>${p.data}</span><span class="text-brand-accent font-medium">${p.paineis.length} painéis</span></div>
                </div>`;
            });
            div.innerHTML = html + `</div>`;
            container.appendChild(div);
        });
    }

    moveProj(id, status) { let p = this.data.projetos.find(x => x.id === id); if(p){p.status=status; this.save(); this.renderKanban();} }
    filtrarProjetos(q) { this.renderKanban(q); }
    
    abrirModalNovoProjeto() { document.getElementById('modal-novo-projeto').classList.remove('hidden'); }
    fecharModalNovoProjeto() { document.getElementById('modal-novo-projeto').classList.add('hidden'); }
    salvarNovoProjeto(e) {
        e.preventDefault();
        let titulo = document.getElementById('nproj-titulo').value;
        let tags = document.getElementById('nproj-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
        this.data.projetos.push({ id: 'p_' + Date.now(), titulo, tags: tags.length ? tags : ['Projeto'], status: document.getElementById('nproj-status').value, data: document.getElementById('nproj-data').value || 'hoje', paineis: [] });
        this.save(); this.fecharModalNovoProjeto(); this.renderKanban();
    }

    openProj(id) {
        this.projId = id;
        let p = this.data.projetos.find(x => x.id === id);
        if (!p) return;
        document.getElementById('mp-titulo').textContent = p.titulo;
        document.getElementById('mp-tags-container').innerHTML = p.tags.map(t => `<span class="font-mono text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">${t}</span>`).join('');
        this.renderPaineisList(p);
        document.getElementById('modal-projeto').classList.remove('hidden');
    }
    fecharModalProjeto() { document.getElementById('modal-projeto').classList.add('hidden'); this.renderKanban(); }

    renderPaineisList(p) {
        let c = document.getElementById('mp-paineis-list');
        c.innerHTML = p.paineis.length === 0 ? `<div class="text-center text-xs text-brand-muted py-4">Nenhum painel cadastrado.</div>` : '';
        p.paineis.forEach(pn => {
            c.innerHTML += `<div onclick="app.openChecklist('${pn.id}')" class="bg-brand-input hover:bg-brand-border border border-brand-border rounded-xl p-3.5 flex justify-between items-center cursor-pointer transition">
                <div class="flex items-center gap-3"><span class="font-mono text-xs text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded border border-brand-accent/30">${pn.tag}</span><span class="text-xs font-medium">${pn.titulo}</span></div>
                <button onclick="event.stopPropagation(); app.delPainel('${pn.id}')" class="text-brand-muted hover:text-red-400"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>`;
        });
    }

    abrirModalNovoPainel() { document.getElementById('modal-novo-painel').classList.remove('hidden'); }
    fecharModalNovoPainel() { document.getElementById('modal-novo-painel').classList.add('hidden'); }
    salvarNovoPainel(e) {
        e.preventDefault();
        let p = this.data.projetos.find(x => x.id === this.projId);
        if (!p) return;
        p.paineis.push({ id: 'pn_' + Date.now(), titulo: document.getElementById('np-titulo').value, tag: document.getElementById('np-tag').value || 'PN', checklist: this.emptyChecklist(), ferramentas: this.emptyTools(), folhaDados: {} });
        this.save(); this.fecharModalNovoPainel(); this.renderPaineisList(p);
    }
    delPainel(id) {
        let p = this.data.projetos.find(x => x.id === this.projId);
        if (!p || !confirm('Excluir painel?')) return;
        p.paineis = p.paineis.filter(x => x.id !== id);
        this.save(); this.renderPaineisList(p);
    }

    openChecklist(id) {
        this.painelId = id;
        let p = this.data.projetos.find(x => x.id === this.projId);
        let pn = p.paineis.find(x => x.id === id);
        if (!pn) return;

        document.getElementById('modal-painel-titulo').textContent = pn.titulo;
        document.getElementById('modal-painel-sub').textContent = `Projeto: ${p.titulo}`;
        document.getElementById('modal-checklist').classList.remove('hidden');
        
        this.renderChecklistItems(pn);
        this.loadToolsUI(pn);
        this.trocarAbaPainel('checklist');
    }

    fecharModalChecklistParaPainel() {
        document.getElementById('modal-checklist').classList.add('hidden');
        let p = this.data.projetos.find(x => x.id === this.projId);
        if (p) this.renderPaineisList(p);
    }

    trocarAbaPainel(tab) {
        this.activeTab = tab;
        ['dados', 'checklist', 'motores', 'hvac', 'barras', 'layout2d'].forEach(t => {
            let btn = document.getElementById(`tab-btn-${t}`);
            let content = document.getElementById(`tab-content-${t}`);
            if (t === tab) {
                btn.className = "py-2.5 px-3 border-b-2 font-semibold border-brand-accent text-brand-accent flex items-center space-x-2";
                content.classList.remove('hidden');
            } else {
                btn.className = "py-2.5 px-3 border-b-2 border-transparent text-brand-muted hover:text-brand-text font-semibold flex items-center space-x-2";
                content.classList.add('hidden');
            }
        });
        if (tab === 'layout2d') {
            let f = document.getElementById('painel-cad2d-frame');
            if (f && !f.srcdoc) f.srcdoc = CAD_EMBED_HTML;
        }
    }

    renderChecklistItems(pn) {
        for (let cat in CHECKLIST_TEMPLATE) {
            let c = document.getElementById(`list-items-${cat}`);
            if (!c) continue;
            c.innerHTML = '';
            let total = CHECKLIST_TEMPLATE[cat].length, done = 0;
            CHECKLIST_TEMPLATE[cat].forEach(item => {
                let st = pn.checklist[cat][item];
                if (st === 'ok' || st === 'na') done++;
                c.innerHTML += `<div class="bg-brand-input border border-brand-border rounded-lg p-2.5 flex justify-between items-center text-xs">
                    <span class="text-brand-text">${item}</span>
                    <div class="flex space-x-1">
                        <button onclick="app.setCheck('${cat}','${item}','ok')" class="px-2 py-0.5 rounded text-[10px] font-bold ${st==='ok'?'bg-emerald-600 text-white':'bg-brand-card text-brand-muted border border-brand-border'}">OK</button>
                        <button onclick="app.setCheck('${cat}','${item}','na')" class="px-2 py-0.5 rounded text-[10px] font-bold ${st==='na'?'bg-zinc-600 text-white':'bg-brand-card text-brand-muted border border-brand-border'}">N/A</button>
                    </div>
                </div>`;
            });
            let pct = Math.round((done / total) * 100);
            let v = document.getElementById(`prog-val-${cat}`), b = document.getElementById(`prog-bar-${cat}`);
            if (v) v.textContent = `${pct}%`;
            if (b) b.style.width = `${pct}%`;
        }
    }

    setCheck(cat, item, val) {
        let p = this.data.projetos.find(x => x.id === this.projId);
        let pn = p.paineis.find(x => x.id === this.painelId);
        pn.checklist[cat][item] = pn.checklist[cat][item] === val ? null : val;
        this.save();
        this.renderChecklistItems(pn);
    }

    loadToolsUI(pn) {
        let f = pn.ferramentas;
        document.getElementById('hvac-pd').value = f.hvacPd || 100;
        document.getElementById('hvac-h').value = f.hvacH || 2000;
        document.getElementById('hvac-w').value = f.hvacW || 600;
        document.getElementById('hvac-d').value = f.hvacD || 600;
        document.getElementById('barras-in').value = f.barrasIn || 800;
        document.getElementById('barras-icw').value = f.barrasIcw || 37;
        this.renderMotoresList(pn);
        this.calcHVAC();
    }

    salvarFerramentasPainel() {
        let p = this.data.projetos.find(x => x.id === this.projId);
        let pn = p.paineis.find(x => x.id === this.painelId);
        pn.ferramentas.hvacPd = parseFloat(document.getElementById('hvac-pd').value) || 0;
        pn.ferramentas.hvacH = parseFloat(document.getElementById('hvac-h').value) || 2000;
        pn.ferramentas.hvacW = parseFloat(document.getElementById('hvac-w').value) || 600;
        pn.ferramentas.hvacD = parseFloat(document.getElementById('hvac-d').value) || 600;
        pn.ferramentas.barrasIn = parseFloat(document.getElementById('barras-in').value) || 0;
        pn.ferramentas.barrasIcw = parseFloat(document.getElementById('barras-icw').value) || 0;
        this.save();
        this.calcHVAC();
    }

    calcHVAC() {
        let f = this.data.projetos.find(x => x.id === this.projId)?.paineis.find(x => x.id === this.painelId)?.ferramentas;
        if (!f) return;
        let dt = (f.hvacTe || 45) - (f.hvacTi || 35);
        let area = (f.hvacH * f.hvacW * 2 + f.hvacH * f.hvacD * 2) / 1000000;
        let q_dissipado = (5.5 * area * dt);
        let q_req = Math.max(0, (f.hvacPd || 100) - q_dissipado);
        document.getElementById('res-hvac-watts').textContent = `${q_req.toFixed(2)} W`;
        document.getElementById('res-hvac-btu').textContent = `${(q_req * 3.412).toFixed(2)} BTU`;
        document.getElementById('res-hvac-m3h').textContent = `${((q_req * 3.1) / (dt || 1)).toFixed(2)}`;
        document.getElementById('res-hvac-sugestao').textContent = q_req > 0 ? "Exaustor / Ar Requerido" : "Troca Natural OK";
    }

    adicionarMotorAoPainel() {
        let p = this.data.projetos.find(x => x.id === this.projId);
        let pn = p.paineis.find(x => x.id === this.painelId);
        let pot = parseFloat(document.getElementById('m-pot').value) || 0;
        if (pot <= 0) return;
        pn.ferramentas.motores.push({ id: 'm_' + Date.now(), tag: document.getElementById('m-tag').value || 'M', pot, un: document.getElementById('m-unidade').value });
        this.save();
        this.renderMotoresList(pn);
    }

    renderMotoresList(pn) {
        let c = document.getElementById('lista-motores-painel');
        c.innerHTML = pn.ferramentas.motores.length === 0 ? `<div class="text-xs text-brand-muted italic">Nenhum motor.</div>` : '';
        pn.ferramentas.motores.forEach(m => {
            c.innerHTML += `<div class="bg-brand-input border border-brand-border rounded-lg p-2.5 flex justify-between items-center text-xs">
                <span class="font-bold text-brand-accent">${m.tag}</span><span class="text-brand-text">${m.pot} ${m.un.toUpperCase()}</span>
            </div>`;
        });
    }

    abrirModalGerenciarTags() { document.getElementById('modal-gerenciar-tags').classList.remove('hidden'); }
    fecharModalGerenciarTags() { document.getElementById('modal-gerenciar-tags').classList.add('hidden'); }
    exportarDados() {
        let blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'omini_backup.json'; a.click();
    }
}

const CAD_EMBED_HTML = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><style>body{background:#111315;color:#fff;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0}div{text-align:center}</style></head><body><div><h3>OMINI CAD 2D Engine</h3><p style="color:#91a0a9;font-size:12px">Módulo Rittal CAD Integrado</p></div></body></html>`;

let app = null;
document.addEventListener('DOMContentLoaded', () => { app = new OminiApp(); window.app = app; });