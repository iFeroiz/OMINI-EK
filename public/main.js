
(()=>{"use strict";
const OLLAMA="http://127.0.0.1:11434",DB="OMINI_MANUAL_DATABASE_LOCAL",STORE="manuals",HISTORY="OMINI_CHAT_HISTORY",LEARNED_MEMORY="OMINI_LEARNED_MEMORY_V1",MODEL_CACHE_MS=300000;
const $=s=>document.querySelector(s),input=$("#omniAIInput"),send=$("#omniAISend"),stop=$("#omniAIStop"),model=$("#omniAIModel"),status=$("#omniAIStatus"),dot=$("#omniAIDot"),chat=$("#omniAIConversation"),welcome=$("#omniChatWelcome"),template=$("#omniAIAnswer");
let busy=false,controller=null,stopped=false,ocrWorkerPromise=null,activeOcrWorker=null,activeSearchPdfTask=null,activeSearchPdfRender=null,docCache=null,docInvertedIndex=null,modelCache=null,modelCacheAt=0,modelCachePending=null;
const norm=s=>String(s||"").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim(),stopWords=new Set(["como","qual","quais","quando","onde","para","sobre","com","uma","uns","das","dos","por","que","the","and","this","that","segundo","de","da","do","em","no","na","nos","nas","ao","aos","as","os","um","uma","e","ou","se","seu","sua","meu","minha","meus","minhas","quero","preciso","mostre","informe","indique","explique","procure","pesquise","encontre","arquivo","arquivos","documento","documentos","fale","diga"]),terms=q=>[...new Set(norm(q).split(/[^a-z0-9]+/).filter(x=>x.length>2&&!stopWords.has(x)))];
const libraryCard=$("#omniLibraryLoading"),libraryTitle=$("#omniLibraryLoadingTitle"),libraryText=$("#omniLibraryLoadingText"),libraryPercent=$("#omniLibraryLoadingPercent"),libraryProgress=$("#omniLibraryProgress"),libraryBar=$("#omniLibraryProgressBar"),libraryCount=$("#omniLibraryFileCount"),libraryStage=$("#omniLibraryStage"),libraryFiles=$("#omniLibraryFiles"),startupOverlay=$("#omniStartupOverlay"),startupRing=$("#omniStartupRing"),startupHeading=$("#omniStartupHeading"),startupCaption=$("#omniStartupCaption");
function updateLibraryProgress(state={}){if(!libraryCard)return;const percent=Math.max(0,Math.min(100,Number(state.percent)||0)),files=Array.isArray(state.files)?state.files:[],folder=window.OMINI_FOLDER_PROGRESS===true,labels={opening:"INICIALIZAÇÃO",database:"ORGANIZAÇÃO",catalog:"VARREDURA DA PASTA",preloading:"INDEXAÇÃO",ready:"PRONTO",error:"ATENÇÃO"};libraryCard.dataset.state=state.stage||"opening";if(startupHeading)startupHeading.textContent=folder?"Carregando arquivos da pasta":state.stage==="ready"?"Sua biblioteca está pronta":state.stage==="error"?"A biblioteca precisa de atenção":"Preparando sua biblioteca";if(startupCaption)startupCaption.textContent=folder?"O acesso à página de cálculos continua disponível enquanto os arquivos são preparados.":"Lendo e organizando seus arquivos para agilizar as pesquisas.";if(libraryTitle)libraryTitle.textContent=state.stage==="ready"?"Sua biblioteca está pronta":state.stage==="error"?"A biblioteca precisa de atenção":state.stage==="database"?"Organizando arquivos já cadastrados":folder?"Varredura e indexação da pasta":"Preparando sua biblioteca";if(libraryText)libraryText.textContent=state.text||"Abrindo o armazenamento local…";if(libraryPercent)libraryPercent.textContent=percent+"%";if(libraryProgress)libraryProgress.setAttribute("aria-valuenow",String(percent));if(libraryBar)libraryBar.style.width=percent+"%";if(startupRing)startupRing.style.setProperty("--startup-progress",percent+"%");if(startupOverlay){if(state.stage==="ready"||state.stage==="error"){startupOverlay.classList.remove("is-background");startupOverlay.classList.add("is-complete");setTimeout(()=>{startupOverlay.hidden=true},480)}else{startupOverlay.hidden=false;startupOverlay.classList.remove("is-complete");startupOverlay.classList.toggle("is-background",window.OMINI_BACKGROUND_PRESEARCH===true)}}if(libraryCount)libraryCount.textContent=files.length?files.length+" arquivo(s) no banco local":state.stage==="database"?"Lendo registros e atualizando a lista local…":state.stage==="catalog"?"Verificando vínculo e autorização da pasta…":state.stage==="preloading"?"Restaurando ou criando o buffer de pesquisa…":state.stage==="ready"?"Nenhum arquivo para preparar":"Preparando armazenamento local…";if(libraryStage)libraryStage.textContent=labels[state.stage]||"PREPARAÇÃO";if(libraryFiles){libraryFiles.replaceChildren();const shown=files.slice(0,3);for(const file of shown){const row=document.createElement("div"),icon=document.createElement("span"),name=document.createElement("span"),check=document.createElement("span");row.className="omni-library-file";icon.className="omni-library-file-icon";icon.textContent="▧";name.className="omni-library-file-name";name.textContent=file.name||file.path||"Documento local";name.title=name.textContent;check.className="omni-library-file-check";check.textContent=state.stage==="ready"?"✓":"…";row.append(icon,name,check);libraryFiles.appendChild(row)}if(files.length>shown.length){const more=document.createElement("div");more.className="omni-library-more";more.textContent="e mais "+(files.length-shown.length)+" arquivo(s)";libraryFiles.appendChild(more)}libraryFiles.hidden=!files.length}}
let startupProgressStage="",startupProgressStageAt=Date.now();function onStartupProgress(state){if(state?.stage!==startupProgressStage){startupProgressStage=state?.stage||"opening";startupProgressStageAt=Date.now()}updateLibraryProgress(state)}window.addEventListener("omni:startup-progress",event=>onStartupProgress(event.detail));onStartupProgress(window.OMINI_STARTUP_PROGRESS||{stage:"opening",text:"Abrindo o banco local do navegador…",percent:8});const startupElapsedTimer=setInterval(()=>{if(!startupOverlay||startupOverlay.hidden){clearInterval(startupElapsedTimer);return}const state=window.OMINI_STARTUP_PROGRESS||{},seconds=Math.floor((Date.now()-startupProgressStageAt)/1000);if(libraryCount&&state.stage!=="ready"&&state.stage!=="error"){const base=state.files?.length?`${state.files.length} arquivo(s) no banco local`:state.stage==="database"?"Lendo registros do banco local":state.stage==="catalog"?"Verificando a pasta vinculada":state.stage==="preloading"?"Preparando o índice de pesquisa":"Preparando armazenamento";libraryCount.textContent=base+" · "+seconds+"s nesta etapa"}},1000);
function setStatus(t,online=""){if(window.OMINI_STARTUP_PRESEARCH_ACTIVE&&window.OMINI_CHAT_BUSY){if(libraryText&&/Lendo (?:imagem|PDF)/i.test(t))libraryText.textContent=t;return}if(status)status.textContent=t;if(dot)dot.className="omini-ai-dot"+(online?" "+online:"");if(window.OMINI_STARTUP_PRESEARCH_ACTIVE&&online==="busy"&&libraryText&&/Lendo (?:imagem|PDF)/i.test(t))libraryText.textContent=t}
function isOllamaFetchFailure(error){const message=String(error?.message||error);return/failed to fetch|networkerror|load failed/i.test(message)||error?.name==="TypeError"&&/fetch|network/i.test(message)}
function ollamaConnectionMessage(endpoint){const fileOrigin=location.protocol==="file:";return`Não foi possível conectar ao Ollama em ${OLLAMA}/${endpoint}. ${fileOrigin?" Esta página está aberta como arquivo. Feche esta aba e abra “Iniciar OMINI.bat” na pasta outputs para iniciar o Ollama e abrir o site pelo endereço local.":" Confira também se o endereço local 127.0.0.1:11434 está acessível."}`}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function tokenList(value){return" "+[...new Set((String(value||"").match(/[a-z0-9]{2,}/g)||[]))].join(" ")+" "}
function tokenHas(list,word){return list.includes(" "+word+" ")}
function phraseKey(value){return norm(value).replace(/[^a-z0-9]+/g," ").trim()}
function queryKey(value){return phraseKey(value)}
function readLearnedMemory(){try{const value=JSON.parse(localStorage.getItem(LEARNED_MEMORY)||"[]");return Array.isArray(value)?value:[]}catch{return[]}}
function snapshotOf(d){return{id:String(d.id),name:d.name||"Documento",size:Number(d.size||0),lastModified:Number(d.lastModified||0)}}
function memoryMatch(q,docs){const key=queryKey(q),queryTerms=terms(q),byId=new Map(docs.map(d=>[String(d.id),d]));let best=null;for(const entry of readLearnedMemory()){const sources=(entry.sources||[]).map(s=>{const d=byId.get(String(s.id));return d&&(d.size==null||Number(d.size)===Number(s.size||0))&&(d.lastModified==null||Number(d.lastModified)===Number(s.lastModified||0))?d:null}).filter(Boolean);if(!sources.length||(entry.sources||[]).length!==sources.length)continue;const exact=entry.key===key&&Boolean(entry.answer),entryTerms=new Set([...(entry.terms||terms(entry.question)),...terms(entry.ocrText||""),...terms(entry.answer||"")]),overlap=queryTerms.filter(t=>entryTerms.has(t)).length,score=queryTerms.length?overlap/queryTerms.length:0;if(!exact&&(queryTerms.length<2||score<.7))continue;const candidate={entry,exact,score,sources};if(!best||Number(candidate.exact)>Number(best.exact)||candidate.exact===best.exact&&candidate.score>best.score)best=candidate}return best}
function memoryPrompt(match,docs){if(!match||match.exact)return"";const ids=new Set(docs.map(d=>String(d.id)));if(!match.sources.some(d=>ids.has(String(d.id))))return"";const e=match.entry,parts=[`Pesquisa anterior: ${String(e.question||"").slice(0,240)}`];if(e.answer)parts.push(`Resposta registrada: ${String(e.answer).slice(0,700)}`);if(e.ocrText)parts.push(`Texto extraído anteriormente da imagem: ${String(e.ocrText).slice(0,900)}`);return"Memória local de pesquisa anterior, baseada nestas fontes: "+match.sources.map(d=>d.name).join(", ")+". Use como pista, confira com as fontes atuais e recalcule se os valores da pergunta mudaram.\n"+parts.join("\n")}
function saveLearnedMemory(q,answer,docs,ocrText=""){const clean=String(answer||"").trim(),weak=/não consegui confirmar|evidência insuficiente|informação[_ ]não[_ ]encontrada/i.test(clean);if(!clean||weak&&!ocrText)return;const entry={key:queryKey(q),question:String(q).slice(0,400),terms:terms(q),answer:weak?"":clean.slice(0,1400),ocrText:String(ocrText||"").slice(0,4000),sources:docs.slice(0,3).map(snapshotOf),savedAt:Date.now()};if(!entry.sources.length)return;try{const entries=readLearnedMemory().filter(x=>!(x.key===entry.key&&(x.sources||[]).some(s=>entry.sources.some(n=>String(n.id)===String(s.id)))));localStorage.setItem(LEARNED_MEMORY,JSON.stringify([entry,...entries].slice(0,80)))}catch(error){console.warn("Não foi possível gravar a memória local",error)}}
function codeList(value){const text=String(value||"").toLowerCase(),found=[...(text.match(/[a-z0-9]+(?:[-_/][a-z0-9]+)+/g)||[]),...(text.match(/\b[a-z0-9]{8,}\b/g)||[])];return[...new Set(found.map(compactText).filter(x=>x.length>=8&&/[a-z]/.test(x)&&/\d/.test(x)))]}
function foldedCode(value){return compactText(value).toUpperCase().replace(/O/g,"0").replace(/[IL]/g,"1").replace(/S/g,"5").replace(/B/g,"8").replace(/Z/g,"2").toLowerCase()}
function queryCodes(value){const text=norm(value),segmented=text.match(/[a-z0-9]+(?:[-_/][a-z0-9]+)+/g)||[];return codeList(text).map(compact=>{const raw=segmented.find(x=>compactText(x)===compact);return{compact,original:raw||compact,folded:foldedCode(compact),parts:raw?(raw.match(/[a-z0-9]+/g)||[]):[compact]}})}
function buildDocumentInvertedIndex(docs){const index=new Map();docs.forEach((doc,docIndex)=>{const words=new Set([doc.nameTokens,doc.pathTokens,doc.contentTokens].join(" ").match(/[a-z0-9]{2,}/g)||[]);for(const word of words){let matches=index.get(word);if(!matches)index.set(word,matches=[]);matches.push(docIndex)}});return index}
 let searchWorker=null,searchWorkerReady=null,searchWorkerSeq=0,searchWorkerAvailable=false,searchWorkerDocumentCount=0;const searchWorkerPending=new Map();
 function routeWorkerResults(data){if(data.type!=='results')return;const pending=searchWorkerPending.get(data.id);if(pending){pending(data.results||[]);searchWorkerPending.delete(data.id)}}
 async function startSearchWorker(){
  if(!window.Worker)return false;
  const next=new Worker(new URL('./worker.js',document.baseURI),{type:'module'});let resolveReady,count=0,failed=false;
  const ready=new Promise(resolve=>{resolveReady=resolve;setTimeout(()=>resolve(false),60000)});
  next.onmessage=event=>{const data=event.data||{};if(data.type==='ready'){count=Number(data.count||0);if(window.OMINI_STARTUP_PRESEARCH_ACTIVE)window.OMINI_UPDATE_STARTUP_PROGRESS?.('preloading',(data.restored?'Buffer salvo restaurado':'Índice reconstruído com os textos locais')+' · '+count+' arquivos disponíveis',92,window.OMINI_STARTUP_FILES||[]);resolveReady(true)}else if(data.type==='catalog-progress'&&window.OMINI_STARTUP_PRESEARCH_ACTIVE){window.OMINI_UPDATE_STARTUP_PROGRESS?.('preloading','Lendo o catálogo local · '+data.eligible+' arquivos indexáveis verificados ('+data.scanned+' registros)',88,window.OMINI_STARTUP_FILES||[])}else if(data.type==='index-progress'&&window.OMINI_STARTUP_PRESEARCH_ACTIVE){const percent=80+Math.round(data.completed/Math.max(data.total,1)*12);window.OMINI_UPDATE_STARTUP_PROGRESS?.('preloading','Montando índice em memória · '+data.completed+'/'+data.total+' arquivos',percent,window.OMINI_STARTUP_FILES||[])}else if(data.type==='index-error'){failed=true;console.error('Falha ao montar o índice no Worker:',data.message);resolveReady(false)}else routeWorkerResults(data)};
  next.onerror=()=>{failed=true;if(searchWorker===next){searchWorkerAvailable=false;searchWorkerReady=null;for(const resolve of searchWorkerPending.values())if(typeof resolve==='function')resolve(null);searchWorkerPending.clear()}resolveReady(false)};
  try{next.postMessage({type:'init-index',forceBuild:window.OMINI_SEARCH_INDEX_DIRTY===true});const initialized=await ready;if(!initialized||failed){next.terminate();return Boolean(searchWorkerAvailable)}
   while(window.OMINI_CHAT_BUSY||[...searchWorkerPending.keys()].some(key=>typeof key==='number'))await new Promise(resolve=>setTimeout(resolve,40));
   const previous=searchWorker;searchWorker=next;searchWorkerAvailable=true;searchWorkerDocumentCount=count;searchWorkerReady=Promise.resolve(true);window.OMINI_SEARCH_INDEX_DIRTY=false;workerQueryCache?.clear?.();if(previous)previous.terminate();return true;
  }catch(error){next.terminate();console.warn('Web Worker indisponível; a pesquisa usará leitura direta dos documentos:',error);return Boolean(searchWorkerAvailable)}
 } const workerQueryCache=new Map();
 function workerSearch(query,signal=null){const key=norm(query);if(workerQueryCache.has(key))return Promise.resolve(workerQueryCache.get(key));if(!searchWorker||!searchWorkerReady)return Promise.resolve(null);return searchWorkerReady.then(ready=>{if(signal?.aborted)return null;if((!ready&&!searchWorkerAvailable)||!searchWorker)return null;const id=++searchWorkerSeq;return new Promise(resolve=>{const finish=result=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);searchWorkerPending.delete(id);if(result){workerQueryCache.set(key,result);if(workerQueryCache.size>80)workerQueryCache.delete(workerQueryCache.keys().next().value)}resolve(result)},cancel=()=>finish(null),timer=setTimeout(()=>finish(null),10000);searchWorkerPending.set(id,result=>finish(result));signal?.addEventListener('abort',cancel,{once:true});searchWorker.postMessage({type:'search',id,query:String(query||'')})})})}
 let importWorker=null,importRequestSeq=0;const importRequests=new Map();
 function ensureImportWorker(){if(importWorker)return importWorker;importWorker=new Worker(new URL('./worker.js',document.baseURI),{type:'module'});importWorker.onmessage=event=>{const data=event.data||{},request=importRequests.get(data.id);if(!request)return;if(data.type==='file-progress'){request.onProgress?.(data);return}if(data.type==='files-indexed'){importRequests.delete(data.id);if(data.error)request.reject(new Error(data.error));else request.resolve(data.results||[])}};importWorker.onerror=()=>{for(const request of importRequests.values())request.reject(new Error('Falha no Worker de leitura de arquivos.'));importRequests.clear();importWorker.terminate();importWorker=null};return importWorker}
 window.OMINI_INDEX_FILES_BATCH=(files,onProgress)=>new Promise((resolve,reject)=>{const worker=ensureImportWorker(),id='file-batch-'+Date.now()+'-'+(++importRequestSeq);importRequests.set(id,{resolve,reject,onProgress});try{worker.postMessage({type:'index-files',id,files})}catch(error){importRequests.delete(id);reject(error)}}); function candidateDocsForTerms(docs,queryTerms){if(!docInvertedIndex)return docs;const lists=queryTerms.map(term=>docInvertedIndex.get(term));if(lists.some(list=>!list))return[];lists.sort((a,b)=>a.length-b.length);const has=(list,target)=>{let low=0,high=list.length-1;while(low<=high){const mid=(low+high)>>1,value=list[mid];if(value===target)return true;if(value<target)low=mid+1;else high=mid-1}return false};return lists[0].filter(index=>lists.slice(1).every(list=>has(list,index))).map(index=>docs[index])}
async function allDocs(){
 if(docCache)return docCache;
 const db=await openDB();
 try{
  docCache=await new Promise((resolve,reject)=>{
   const docs=[],tx=db.transaction(STORE,"readonly"),request=tx.objectStore(STORE).openCursor();
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const cursor=request.result;
    if(!cursor){resolve(docs);return}
     const item=cursor.value;if(!item.connectedFolder){cursor.continue();return}
    const ocr=String(item.ocrText||"")+" "+(item.learnedFacts||[]).filter(x=>String(x).startsWith("Texto OCR indexado:")).map(x=>String(x).replace(/^Texto OCR indexado:\s*/,"")).join(" ");
    const name=norm(item.name||""),path=norm(item.path||""),content=norm(String(item.normalizedText||item.text||"")+" "+ocr);
    const nameCodes=codeList(name),pathCodes=codeList(path),contentCodes=codeList(content);
    docs.push({
     id:item.id,name:item.name||"Documento",path:item.path||"",type:item.type||"",mimeType:item.mimeType||"",serverManaged:Boolean(item.serverManaged),localServerPath:item.localServerPath||"",
     size:Number(item.size||0),lastModified:Number(item.lastModified||0),contentSupported:item.contentSupported!==false,contentIndexedAt:Number(item.contentIndexedAt||0),imageOcrIndexedAt:Number(item.imageOcrIndexedAt||0),pdfOcrIndexedAt:Number(item.pdfOcrIndexedAt||0),text:String(item.text||item.normalizedText||""),ocrText:String(item.ocrText||""),hasSearchContent:Boolean(content),_contentBuffered:Boolean(content),
     nameTokens:tokenList(name),pathTokens:tokenList(path),contentTokens:tokenList(content),contentPhrase:phraseKey(content),
     nameCodes:tokenList(nameCodes.join(" ")),pathCodes:tokenList(pathCodes.join(" ")),contentCodes:tokenList(contentCodes.join(" ")),
     nameFoldedCodes:tokenList(nameCodes.map(foldedCode).join(" ")),pathFoldedCodes:tokenList(pathCodes.map(foldedCode).join(" ")),
     learnedFacts:item.learnedFacts||[]
    });
    cursor.continue();
   };
   tx.onerror=()=>reject(tx.error);
  });
   docInvertedIndex=null;
  return docCache;
 }finally{db.close()}
}
function searchDocFromRecord(item){const ocr=String(item.ocrText||"")+" "+(item.learnedFacts||[]).filter(x=>String(x).startsWith("Texto OCR indexado:")).map(x=>String(x).replace(/^Texto OCR indexado:\s*/,"")).join(" "),name=norm(item.name||""),path=norm(item.path||""),content=norm(String(item.normalizedText||item.text||"")+" "+ocr),nameCodes=codeList(name),pathCodes=codeList(path),contentCodes=codeList(content);return{id:item.id,name:item.name||"Documento",path:item.path||"",type:item.type||"",mimeType:item.mimeType||"",serverManaged:Boolean(item.serverManaged),localServerPath:item.localServerPath||"",size:Number(item.size||0),lastModified:Number(item.lastModified||0),contentSupported:item.contentSupported!==false,contentIndexedAt:Number(item.contentIndexedAt||0),imageOcrIndexedAt:Number(item.imageOcrIndexedAt||0),pdfOcrIndexedAt:Number(item.pdfOcrIndexedAt||0),text:String(item.text||item.normalizedText||""),ocrText:String(item.ocrText||""),hasSearchContent:Boolean(content),_contentBuffered:Boolean(content),nameTokens:tokenList(name),pathTokens:tokenList(path),contentTokens:tokenList(content),contentPhrase:phraseKey(content),nameCodes:tokenList(nameCodes.join(" ")),pathCodes:tokenList(pathCodes.join(" ")),contentCodes:tokenList(contentCodes.join(" ")),nameFoldedCodes:tokenList(nameCodes.map(foldedCode).join(" ")),pathFoldedCodes:tokenList(pathCodes.map(foldedCode).join(" ")),learnedFacts:item.learnedFacts||[]}}
async function loadDocuments(items){if(!items.length)return[];if(items.every(item=>item._contentBuffered))return items;const db=await openDB();try{const docs=await new Promise((resolve,reject)=>{const docs=new Array(items.length),tx=db.transaction(STORE,"readonly"),store=tx.objectStore(STORE);items.forEach((item,i)=>{const request=store.get(item.id);request.onsuccess=()=>{const record=request.result;if(record){const{blob,...withoutBlob}=record;docs[i]=withoutBlob}else docs[i]=item};request.onerror=()=>reject(request.error)});tx.oncomplete=()=>resolve(docs.filter(Boolean));tx.onerror=()=>reject(tx.error)});return docs}finally{db.close()}}
async function waitForSearchIdle(){while(window.OMINI_CHAT_BUSY&&!window.OMINI_CANCEL_STARTUP_PRESEARCH)await new Promise(resolve=>setTimeout(resolve,120))}
async function prepareSearchableDocs(docs){
 const startup=window.OMINI_STARTUP_PRESEARCH_ACTIVE===true,files=window.OMINI_STARTUP_FILES||[],pending=[],isCanceled=()=>startup?window.OMINI_CANCEL_STARTUP_PRESEARCH===true:stopped;
 const batchSize=4;
 for(let start=0;start<pending.length;start+=batchSize){
  if(isCanceled())throw Error("interrompida");
  const batch=pending.slice(start,start+batchSize);
  await Promise.all(batch.map(async doc=>{try{await loadDocuments([doc])}catch(error){console.warn("Não foi possível pesquisar o conteúdo de",doc.name,error)}}));
  const completed=Math.min(start+batch.length,pending.length);
  const text=`Lendo conteúdo dos arquivos · ${completed}/${pending.length}`;
  setStatus(text,"busy");
  if(startup)window.OMINI_UPDATE_STARTUP_PROGRESS?.("preloading",text,Math.min(82,70+Math.round(completed/Math.max(pending.length,1)*12)),files);
 }
 let refreshedDocs=pending.length?await allDocs():docs;
 const pendingImages=refreshedDocs.filter(doc=>doc.contentSupported&&(doc.type==="image"||String(doc.mimeType||"").startsWith("image/"))&&!doc.imageOcrIndexedAt&&!doc.hasSearchContent);
 const pendingPdfs=refreshedDocs.filter(doc=>doc.contentSupported&&(doc.type==="pdf"||/\.pdf$/i.test(doc.name||""))&&!doc.pdfOcrIndexedAt&&!doc.hasSearchContent);
 const total=pendingImages.length+pendingPdfs.length;let done=0;
 for(const doc of pendingImages){
  await waitForSearchIdle();
  if(isCanceled())throw Error("interrompida");
  const text=`Pré-lendo imagem · ${doc.name}`;setStatus(text,"busy");
  try{await indexImageForSearch(doc)}catch(error){console.warn("Não foi possível pré-ler a imagem",doc.name,error)}
  done++;if(startup)window.OMINI_UPDATE_STARTUP_PROGRESS?.("preloading",`${text} · ${done}/${total}`,Math.min(99,82+Math.round(done/Math.max(total,1)*17)),files);
 }
 for(const doc of pendingPdfs){
  await waitForSearchIdle();
  if(isCanceled())throw Error("interrompida");
  const text=`Pré-lendo PDF · ${doc.name}`;setStatus(text,"busy");
  try{await indexPdfForSearch(doc)}catch(error){console.warn("Não foi possível pré-ler o PDF",doc.name,error)}
  done++;if(startup)window.OMINI_UPDATE_STARTUP_PROGRESS?.("preloading",`${text} · ${done}/${total}`,Math.min(99,82+Math.round(done/Math.max(total,1)*17)),files);
 }
 if(pendingImages.length||pendingPdfs.length){docCache=null;docInvertedIndex=null;}
 refreshedDocs=await allDocs();
 return refreshedDocs;
}
async function indexImageForSearch(doc,existingBlob=null){
 const blob=existingBlob||await loadDocumentBlob(doc.id);
 if(!blob)throw Error("Imagem indisponível para leitura.");
 const text=await ocrBlob(blob),db=await openDB();
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),request=store.get(doc.id);
   request.onsuccess=()=>{const item=request.result;if(!item)return;const facts=Array.isArray(item.learnedFacts)?item.learnedFacts:[];if(text&&!facts.some(x=>String(x).startsWith("Texto OCR indexado:")))facts.push("Texto OCR indexado: "+text.slice(0,4000));item.learnedFacts=facts;item.ocrText=text;item.imageOcrIndexedAt=Date.now();store.put(item)};
   request.onerror=()=>reject(request.error);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Não foi possível gravar o texto da imagem."));
  });
 }finally{db.close()}
 docCache=null;docInvertedIndex=null;window.OMINI_SEARCH_INDEX_DIRTY=true;
 return text;
}
async function indexPdfForSearch(doc){
 const blob=await loadDocumentBlob(doc.id);
 if(!blob)throw Error("PDF indisponível para leitura de texto.");
 await window.ensureOminiPdfJs();
 const pdf=await window.pdfjsLib.getDocument({data:await blob.arrayBuffer()}).promise,parts=[];
 try{
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
   await waitForSearchIdle();
   if(window.OMINI_STARTUP_PRESEARCH_ACTIVE?window.OMINI_CANCEL_STARTUP_PRESEARCH===true:stopped)throw Error("interrompida");
   const page=await pdf.getPage(pageNo),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(1.35,1200/base.width)}),canvas=document.createElement("canvas");
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvas,canvasContext:canvas.getContext("2d",{alpha:false}),viewport}).promise;
   const image=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));canvas.width=canvas.height=1;
   if(image){const label=`Lendo PDF · ${doc.name} · página ${pageNo}/${pdf.numPages}`,text=await ocrBlob(image,label);if(text)parts.push(`Página ${pageNo}: ${text}`)}
   setStatus(`Lendo PDF · ${doc.name} · página ${pageNo}/${pdf.numPages}`,"busy");
  }
 }finally{await pdf.destroy().catch(()=>{})}
 const ocrText=parts.join("\n"),db=await openDB();
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),request=store.get(doc.id);
   request.onsuccess=()=>{const item=request.result;if(!item)return;item.ocrText=ocrText;item.pdfOcrIndexedAt=Date.now();store.put(item)};
   request.onerror=()=>reject(request.error);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Não foi possível guardar o texto do PDF."));
  });
 }finally{db.close()}
 docCache=null;docInvertedIndex=null;window.OMINI_SEARCH_INDEX_DIRTY=true;
}async function loadDocumentBlob(id){const db=await openDB();try{const record=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readonly"),request=tx.objectStore(STORE).get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);tx.onerror=()=>reject(tx.error)});if(record?.blob)return record.blob;if(record?.fileHandle){let permission=await record.fileHandle.queryPermission({mode:"read"});if(permission!=="granted")throw Error("A pasta precisa ser autorizada novamente. Clique em Vincular pasta do computador.");return await record.fileHandle.getFile()}return null}finally{db.close()}}
function hasQueryContext(doc,phrase,queryTerms){
 const fields=[phraseKey(doc.name||""),phraseKey(doc.path||""),String(doc.contentPhrase||"")].map(value=>" "+value+" ");
 if(phrase&&fields.some(value=>value.includes(" "+phrase+" ")))return true;
 const required=[...new Set(queryTerms)];if(!required.length)return false;
 const maxWindow=Math.max(8,required.length+4);
 const requiredSet=new Set(required);
 for(const field of fields){
  const counts=new Map(),windowWords=[];let present=0,match;
  const wordPattern=/[a-z0-9]+/g;
  while((match=wordPattern.exec(field))){const word=match[0],count=counts.get(word)||0;windowWords.push(word);if(requiredSet.has(word)){counts.set(word,count+1);if(!count)present++}
   while(windowWords.length>maxWindow){const removed=windowWords.shift();if(requiredSet.has(removed)){const old=counts.get(removed)||0;if(old<=1){counts.delete(removed);present--}else counts.set(removed,old-1)}}
   if(present===required.length)return true;
  }
 }
 return false;
}
 async function retrieve(docs,q){
 const query=norm(q),phrase=phraseKey(q),codes=queryCodes(query),ts=[...new Set([...terms(q),...query.split(/[^a-z0-9]+/).filter(t=>t.length>=2&&!stopWords.has(t))])].filter(t=>!/^\d+(?:ka|a|v|kv|hz|w|kw|mw|mm|cm)$/i.test(t)&&(!/^\d+$/.test(t)||t.length>=2));
 if(!ts.length)return[];
  const workerHits=codes.length?null:await workerSearch(q),byId=new Map(docs.map(doc=>[String(doc.id),doc])),candidates=workerHits?workerHits.map(hit=>byId.get(String(hit.id))).filter(Boolean):candidateDocsForTerms(docs,ts);
 if(!candidates.length)return[];
 const exactPhrase=candidates.filter(d=>[phraseKey(d.name||""),phraseKey(d.path||""),String(d.contentPhrase||"")].some(value=>phrase&&(" "+value+" ").includes(" "+phrase+" ")));
 if(exactPhrase.length)return exactPhrase;
 if(codes.length){
  const ranked=[];
  for(const d of candidates){
   let exact=0,nameExact=0;
   for(const code of codes){
    const exactName=tokenHas(d.nameCodes,code.compact)||tokenHas(d.pathCodes,code.compact),exactText=tokenHas(d.contentCodes,code.compact),foldedName=tokenHas(d.nameFoldedCodes,code.folded)||tokenHas(d.pathFoldedCodes,code.folded),hasExact=exactName||exactText||foldedName;
    if(hasExact){exact++;if(exactName||foldedName)nameExact++}
   }
   if(exact===codes.length&&hasQueryContext(d,phrase,ts))ranked.push({d,exact,nameExact});
  }
  ranked.sort((a,b)=>b.exact-a.exact||b.nameExact-a.nameExact||String(a.d.name||"").localeCompare(String(b.d.name||""),"pt-BR"));
  if(ranked.length)return ranked.map(x=>x.d);
 }
 const minimumHits=ts.length,ranked=[];
 for(const d of candidates){
  let matched=0,score=0;
  for(const term of ts){
   const inName=tokenHas(d.nameTokens,term),inPath=tokenHas(d.pathTokens,term),inContent=tokenHas(d.contentTokens,term);
   if(inName||inPath||inContent){matched++;score+=inName?45:0;score+=inPath?24:0;score+=inContent?8:0}
  }
  if(matched<minimumHits||!hasQueryContext(d,phrase,ts))continue;
  score+=matched*12+(matched===ts.length?40:0);
  ranked.push({d,score,matched});
 }
 ranked.sort((a,b)=>b.score-a.score||b.matched-a.matched||String(a.d.name||"").localeCompare(String(b.d.name||""),"pt-BR"));
 return ranked.map(x=>x.d);
}
function compactText(value){return norm(value).replace(/[^a-z0-9]/g,"")}
function makeMessage(){const row=template.cloneNode(true);row.removeAttribute("id");row.querySelectorAll("[id]").forEach(x=>x.removeAttribute("id"));row.classList.add("show","omni-chat-message","omni-chat-assistant");row.querySelector(".omni-chat-answer-label").textContent="OMINI · OLLAMA";const preview=document.createElement("div");preview.className="omni-chat-search-preview";row.querySelector(".omni-chat-answer-head").after(preview);chat.appendChild(row);return{body:row.querySelector(".omni-chat-answer-body"),sources:row.querySelector(".omini-ai-sources"),preview}}
function renderSearchPreview(container,docs,q){
 if(!container)return;container.replaceChildren();const queryTerms=[...new Set([...terms(q),...norm(q).split(/[^a-z0-9]+/).filter(x=>x.length>2)])];
 for(const doc of docs.slice(0,5)){
  const raw=String(doc.text||doc.normalizedText||doc.ocrText||(doc.learnedFacts||[]).filter(x=>String(x).startsWith("Texto OCR indexado:")).join(" ")||""),hits=[];let cursor=0,scanned=0;
  while(cursor<raw.length&&scanned<2000000&&hits.length<2){let end=raw.indexOf("\n",cursor);if(end<0||end-cursor>1800)end=Math.min(raw.length,cursor+1800);const line=raw.slice(cursor,end).replace(/\r/g,"").trim();if(line){const folded=norm(line),count=queryTerms.reduce((total,term)=>total+(folded.includes(term)?1:0),0);if(count===queryTerms.length)hits.push(line.length>300?line.slice(0,297)+"…":line)}cursor=end<raw.length?end+1:end;scanned=cursor}
  const card=document.createElement("div"),title=document.createElement("strong"),excerpt=document.createElement("p");card.className="omni-search-preview-item";title.textContent=doc.name||"Documento local";excerpt.textContent=hits.length?hits.join(" … "):raw?"Arquivo corresponde à consulta completa; confira o conteúdo para ver o contexto correspondente.":"Correspondência da consulta completa encontrada no nome ou caminho do arquivo.";card.append(title,excerpt);container.appendChild(card)
 }
 container.hidden=!docs.length;
}
function addUser(q){const row=document.createElement("div"),b=document.createElement("div");row.className="omni-chat-message omni-chat-user";b.className="omni-chat-bubble";b.textContent=q;row.appendChild(b);chat.appendChild(row)}
function setSources(el,items){el.replaceChildren();const fragment=document.createDocumentFragment();for(const d of items){const a=document.createElement("a");a.className="omini-ai-source";if(d._site){a.textContent="[SITE] Pesquisar em "+d.name;a.href=d.href;a.target="_blank";a.rel="noopener noreferrer";a.title="Pesquisa limitada ao favorito "+d.host}else{a.textContent="["+(String(d.name||"").split(".").pop()||"DOC").toUpperCase()+"] "+(d.name||"Documento local");a.href="#manualLibrary";a.title=d.path||d.name||"";a.onclick=()=>window.dispatchEvent(new CustomEvent("omni:open-document",{detail:{id:d.id}}))}fragment.appendChild(a)}el.appendChild(fragment);el.hidden=!items.length}
function favoriteSearches(q){const nav=document.querySelector(".nav-menu"),ts=terms(q),out=[],seen=new Set(),aliases=[[/se\.com/i,"altivar altistart atv atv12 atv320 atv340 atv610 atv630 atv900 inversor inversores softstarter soft starter"],[/weg\.net/i,"cfw cfw11 cfw500 cfw700 cfw900 ssw ssw07 ssw900 inversor inversores softstarter soft starter weg"],[/siemens\.com/i,"sinamics g120 g120c g130 g150 sirius siemens"],[/abb\.com/i,"acs580 acs880 abb inversor drive"],[/rockwellautomation\.com/i,"powerflex allen bradley rockwell"],[/phoenixcontact\.com/i,"phoenix contact"],[/wago\.com/i,"wago borne plc"]];if(!nav)return out;nav.querySelectorAll("a.bookmark-item[href]").forEach(a=>{let u;try{u=new URL(a.href)}catch{return}if(!/^https?:$/.test(u.protocol))return;const name=(a.querySelector("span:last-child")?.textContent||a.textContent||"").trim(),host=u.hostname.toLowerCase(),alias=aliases.find(x=>x[0].test(host))?.[1]||"",hay=norm(name+" "+host+" "+alias);if(!ts.length||!ts.every(t=>hay.includes(t))||seen.has(host))return;seen.add(host);out.push({_site:true,name,host,href:"https://www.google.com/search?q="+encodeURIComponent("site:"+host+" "+q)})});return out.slice(0,8)}
async function zipImages(file){const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer);let end=-1;for(let i=Math.max(0,bytes.length-65557);i<=bytes.length-22;i++)if(v.getUint32(i,true)===0x06054b50)end=i;if(end<0)return[];let o=v.getUint32(end+16,true);const count=v.getUint16(end+10,true),dec=new TextDecoder(),out=[];for(let i=0;i<count&&out.length<3;i++){if(v.getUint32(o,true)!==0x02014b50)break;const method=v.getUint16(o+10,true),size=v.getUint32(o+20,true),nl=v.getUint16(o+28,true),el=v.getUint16(o+30,true),cl=v.getUint16(o+32,true),local=v.getUint32(o+42,true),name=dec.decode(bytes.subarray(o+46,o+46+nl));if(/(?:word|ppt|xl|media|Pictures)\/.*\.(png|jpe?g|webp|gif|bmp)$/i.test(name)){const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true),compressed=bytes.slice(start,start+size);let raw;if(method===0)raw=compressed;else if(method===8&&"DecompressionStream"in window)raw=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());if(raw){const ext=name.split(".").pop().toLowerCase();out.push(new Blob([raw],{type:ext.startsWith("jp")?"image/jpeg":"image/"+ext}))}}o+=46+nl+el+cl}return out}
function loadOcrWorker(){if(ocrWorkerPromise)return ocrWorkerPromise;ocrWorkerPromise=new Promise((resolve,reject)=>{const init=()=>{if(!window.Tesseract){reject(new Error("O OCR não carregou."));return}window.Tesseract.createWorker("eng",1,{langPath:"https://tessdata.projectnaptha.com/4.0.0",logger:m=>{if(m.status==="recognizing text")setStatus((activeOcrLabel||"Lendo texto da imagem")+" · "+Math.round((m.progress||0)*100)+"%","busy")}}).then(async worker=>{activeOcrWorker=worker;await worker.setParameters({preserve_interword_spaces:"1",user_defined_dpi:"300"});resolve(worker)}).catch(reject)};if(window.Tesseract){init();return}const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js";script.async=true;script.onload=init;script.onerror=()=>reject(new Error("Não foi possível carregar o OCR. Verifique a conexão com a internet e tente novamente."));document.head.appendChild(script)}).catch(error=>{ocrWorkerPromise=null;throw error});return ocrWorkerPromise}
function raceAbort(promise,signal){if(!signal)return promise;if(signal.aborted)return Promise.reject(Error("interrompida"));return new Promise((resolve,reject)=>{const finish=()=>signal.removeEventListener("abort",abort),abort=()=>{finish();reject(Error("interrompida"))};signal.addEventListener("abort",abort,{once:true});promise.then(value=>{finish();resolve(value)},error=>{finish();reject(error)})})}
async function ocrBlob(blob,label=activeOcrLabel||"Lendo texto da imagem"){activeOcrLabel=label;setStatus("Carregando OCR · "+label,"busy");try{const worker=await raceAbort(loadOcrWorker(),controller?.signal);if(stopped)throw Error("interrompida");activeOcrWorker=worker;const result=await raceAbort(worker.recognize(blob),controller?.signal);if(stopped)throw Error("interrompida");return String(result?.data?.text||"").trim()}finally{activeOcrLabel=""}}
async function imagesFor(docs,q){
 const notes=[],query=norm(q),queryCode=queryCodes(q).length>0;
 const needsVisualEvidence=queryCode||/(acessor|accessor|manopla|rotary|handle|catalog|catálogo|nsx|ip\s?\d{2}|modelo|código|codigo)/i.test(q);
 for(let i=0;i<docs.length&&notes.length<1;i++){
  if(stopped)break;
  const d=docs[i],name=d.name||"documento",text=String(d.text||d.normalizedText||""),cached=(d.learnedFacts||[]).find(x=>String(x).startsWith("Texto OCR indexado:"));
  const cachedText=String(d.ocrText||"")||(cached?String(cached).replace(/^Texto OCR indexado:\s*/,""):"");
  const requestedCodes=queryCodes(q),cachedHasRequestedCode=!requestedCodes.length||requestedCodes.some(c=>compactText(cachedText).includes(c.compact));
  const persistentOcr=(d.imageOcrIndexedAt>0&&(d.type==="image"||String(d.mimeType||"").startsWith("image/")))||(d.pdfOcrIndexedAt>0&&/\.pdf$/i.test(name));
  if(persistentOcr){if(cachedText&&cachedHasRequestedCode){notes.push("Texto OCR previamente salvo de [FONTE "+(i+1)+"] "+name+": "+cachedText.slice(0,10000));return{notes,ocrText:cachedText}}continue}
  if(cached&&cachedHasRequestedCode){notes.push("Texto OCR previamente indexado de [FONTE "+(i+1)+"]: "+cachedText);return{notes,ocrText:cachedText}}
  const exactCode=requestedCodes.some(c=>compactText(text).includes(c.compact));
  // Quando a pergunta é por código e o código não aparece no texto extraído, tenta ler as tabelas como imagem.
  if(text.trim()&&(!needsVisualEvidence||!queryCode||exactCode))continue;
  try{
   const blob=await loadDocumentBlob(d.id);if(stopped||!blob)continue;
   let recognized="";
   if((d.type||"")==="image"||String(d.mimeType||"").startsWith("image/")){
    activeOcrLabel="Lendo imagem relacionada · "+name;recognized=await indexImageForSearch(d,blob);
   }else if(/\.pdf$/i.test(name)){
    await window.ensureOminiPdfJs();let pdf;
    try{
      const pdfTask=window.pdfjsLib.getDocument({data:await blob.arrayBuffer()});activeSearchPdfTask=pdfTask;pdf=await pdfTask.promise;
     const candidates=[];
     // Examina até 24 páginas em busca de tabelas de acessórios, códigos e proteção IP.
     for(let pageNo=1;pageNo<=Math.min(pdf.numPages,queryCode?40:60);pageNo++){
      if(stopped)break;
      const page=await pdf.getPage(pageNo),content=await page.getTextContent(),pageText=content.items.map(x=>x.str||"").join(" "),n=norm(pageText);
      let score=0;
      const requested=queryCodes(q);
      const hasExact=requested.some(c=>compactText(n).includes(c.compact));
      if(queryCode){
       if(hasExact)score+=1000;
       // Sem o código no texto nativo, prioriza páginas com densidade de informação técnica,
       // não páginas de uma marca, família ou acessório específico.
       score+=Math.min((pageText.match(/[A-Z0-9][A-Z0-9._/-]{4,}/g)||[]).length,30)*0.15;
       if(/technical data|datos técnicos|dados técnicos|specifications|especificações|article no|order number|product data|rated current|rated voltage|características técnicas/i.test(pageText))score+=3;
      }else{
       if(/technical data|datos técnicos|dados técnicos|specifications|especificações|article no|order number|product data/i.test(pageText))score+=3;
       score+=Math.min((pageText.match(/[A-Z0-9][A-Z0-9._/-]{4,}/g)||[]).length,20)*0.1;
      }
      if(score>0)candidates.push({pageNo,score});
     }
     candidates.sort((a,b)=>b.score-a.score||a.pageNo-b.pageNo);
     const pages=[...new Set(candidates.slice(0,queryCode?2:5).map(x=>x.pageNo))];
     if(!pages.length)pages.push(1);
     const ocrParts=[];
     for(const pageNo of pages){
      if(stopped)break;
      const page=await pdf.getPage(pageNo),base=page.getViewport({scale:1}),vp=page.getViewport({scale:Math.min(queryCode?1.45:1.8,(queryCode?1350:1800)/base.width)}),canvas=document.createElement("canvas");
      canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
       const renderTask=page.render({canvas,canvasContext:canvas.getContext("2d",{alpha:false}),viewport:vp});activeSearchPdfRender=renderTask;await renderTask.promise;activeSearchPdfRender=null;
      const imageBlob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));canvas.width=canvas.height=1;
      if(imageBlob){const pageOcr=await ocrBlob(imageBlob,`Lendo tabela de ${name} · página ${pageNo}`);if(pageOcr)ocrParts.push("Página "+pageNo+": "+pageOcr)}
     }
     recognized=ocrParts.join("\n\n");
     }finally{activeSearchPdfRender=null;activeSearchPdfTask=null;if(pdf)await pdf.destroy().catch(()=>{})}
   }else if(/\.(docx|xlsx|xlsm|pptx|odt|ods|odp)$/i.test(name)){
    const images=await zipImages(blob);const ocrParts=[];for(const image of images.slice(0,2)){const result=await ocrBlob(image);if(result)ocrParts.push(result)}recognized=ocrParts.join("\n");
   }
   if(recognized){notes.push("Texto reconhecido por OCR em [FONTE "+(i+1)+"] "+name+": "+recognized.slice(0,10000));return{notes,ocrText:recognized.slice(0,10000)}}
  }catch(e){console.warn("Falha no OCR do documento",name,e);if(e?.message?.includes("OCR"))throw e}
 }
 return{notes,ocrText:""}
}
function context(docs,question=""){
 const query=norm(question),queryTerms=terms(question),codes=queryCodes(question).map(x=>x.compact),chunks=[];
 const splitIntoChunks=value=>String(value||"").replace(/\r/g,"\n").replace(/[\t\u00a0]+/g," ").trim().split(/\n+/).map(x=>x.trim()).filter(Boolean);
 const isHeader=line=>/rated power|base.?load current|nominal current|input voltage|output current|frame size|article no|article number|version|fieldbus|communication|technical data|specifications|rated voltage|potencia nominal|corrente nominal|tens[aã]o de entrada|tens[aã]o nominal|n[uú]mero de artigo|tamanho de carcaça|protocolo|dados t[eé]cnicos|especifica[cç][aã]o|manufacturer|fabricante|product description|descri[cç][aã]o/i.test(line);
 docs.slice(0,5).forEach((doc,index)=>{
  const full=String(doc.text||doc.normalizedText||doc.ocrText||"").trim(),lines=splitIntoChunks(full),chosen=new Map();
  const add=(i,reason,weight=0)=>{if(i<0||i>=lines.length)return;const old=chosen.get(i);if(!old||weight>old.weight)chosen.set(i,{i,text:lines[i],reason,weight})};
  if(codes.length){
   const exact=[];
   for(let i=0;i<lines.length;i++){const compact=compactText(norm(lines[i]));if(codes.some(code=>compact.includes(code)))exact.push(i)}
   // Para códigos, não usar ranking semântico para preencher o contexto: isso misturava seções diferentes do catálogo.
   for(const idx of exact){add(idx,"CÓDIGO EXATO",1000);for(let d=-6;d<=6;d++)if(d!==0)add(idx+d,"linha próxima",Math.abs(d)<=2?400:150);}
   // Captura cabeçalhos de tabela próximos, mas não importa parágrafos aleatórios de outras seções.
   for(const idx of exact){for(let j=Math.max(0,idx-35);j<idx;j++)if(isHeader(lines[j]))add(j,"cabeçalho técnico",500);for(let j=idx+1;j<=Math.min(lines.length-1,idx+12);j++)if(isHeader(lines[j]))add(j,"cabeçalho técnico",300)}
   const ordered=[...chosen.values()].sort((a,b)=>a.i-b.i),exactCount=exact.length;
   const excerpt=ordered.slice(0,100).map(x=>x.text).join("\n").slice(0,12000);
   chunks.push(`[FONTE ${index+1}] ${doc.name||"Documento"} | ${doc.path||"caminho indisponível"}\nCÓDIGO PESQUISADO: ${question}\nOcorrências literais do código no texto extraído: ${exactCount}\n${exactCount?"Trechos próximos às ocorrências exatas e cabeçalhos técnicos relacionados. Não presumir que dados de outras seções pertençam ao item.":"O código exato NÃO foi encontrado no texto extraído deste arquivo. O arquivo só pode ser usado como candidato para OCR; seu conteúdo genérico não é evidência de identificação do produto."}\n${excerpt||"Nenhum trecho exato disponível no texto extraído."}`);
   return;
  }
  const scored=lines.map((text,i)=>{const n=norm(text);let score=0;for(const term of queryTerms)if(n.includes(term))score+=term.length>=7?8:3;if(isHeader(text))score+=2;return{i,text,score}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i);
  for(const x of scored.slice(0,28))add(x.i,"relevância textual",x.score);
  const excerpt=[...chosen.values()].sort((a,b)=>a.i-b.i).map(x=>x.text).join("\n").slice(0,9000);
  chunks.push(`[FONTE ${index+1}] ${doc.name||"Documento"} | ${doc.path||"caminho indisponível"}\nTrechos selecionados por relevância textual:\n${excerpt||"Nenhum texto extraído deste arquivo."}`);
 });
 return chunks.join("\n\n").slice(0,24000)||"Nenhum texto extraído; será necessário OCR nas páginas do documento.";
}
async function modelNames(signal){
 const shared=window.OMINI_INSTALLED_MODELS,sharedAt=Number(window.OMINI_MODELS_CHECKED_AT||0);
 if(Array.isArray(shared)&&Date.now()-sharedAt<MODEL_CACHE_MS)return shared;
 if(modelCache&&Date.now()-modelCacheAt<MODEL_CACHE_MS)return modelCache;
 if(modelCachePending)return modelCachePending;
 modelCachePending=(async()=>{
  const request=new AbortController(),cancel=()=>request.abort(signal?.reason||"cancelled");
  if(signal?.aborted)cancel();else signal?.addEventListener("abort",cancel,{once:true});
  const timeout=setTimeout(()=>request.abort("timeout"),8000);
  try{
   const response=await fetch(OLLAMA+"/api/tags",{cache:"no-store",signal:request.signal});
   if(!response.ok)throw Error("Ollama respondeu HTTP "+response.status);
   const data=await response.json();
   modelCache=(data.models||[]).map(item=>item.name||item.model).filter(Boolean);
   modelCacheAt=Date.now();
   window.OMINI_INSTALLED_MODELS=modelCache;
   window.OMINI_MODELS_CHECKED_AT=modelCacheAt;
   return modelCache;
  }catch(error){
   if(signal?.aborted)throw Error("interrompida");
   if(request.signal.aborted)throw Error("Ollama não respondeu à lista de modelos em 8 segundos.");
   if(isOllamaFetchFailure(error))throw Error(ollamaConnectionMessage("api/tags"));
   throw error;
  }finally{
   clearTimeout(timeout);
   signal?.removeEventListener("abort",cancel);
  }
 })().finally(()=>{modelCachePending=null});
 return modelCachePending;
}
async function ask(q,docs,visual,body,priorMemory=""){
if(stopped)throw Error("interrompida");
controller=controller||new AbortController();const timeout=setTimeout(()=>controller?.abort("timeout"),180000);let reader=null,renderFrame=0,requestStage="api/tags";
 try{
 const names=await modelNames(controller.signal);if(stopped)throw Error("interrompida");if(!names.length)throw Error("Nenhum modelo instalado no Ollama.");
const preferred=names.find(name=>name==="qwen3.5:4b")||names.find(name=>name==="qwen3:4b")||names.find(name=>name==="llama3.2:3b")||names.find(name=>name==="gemma3:4b")||names[0],selected=names.includes(model?.value)?model.value:preferred;if(model&&model.value!==selected)model.value=selected;
const system=`A partir de agora, você atuará como um Especialista em Engenharia Reversa e Catálogos Industriais. Sempre que o usuário enviar um código de peça, modelo ou número de série isolado, sua tarefa é identificar o componente exato e gerar um resumo cirúrgico estruturado estritamente no seguinte padrão:

**[NOME COMPLETO DO COMPONENTE EM NEGRITO]**

- **O que realmente é:** [Uma frase direta explicando a categoria exata do produto e sua aplicação na indústria].
- **Fabricante:** [Nome da marca/fabricante original, somente se confirmado pelas fontes].
- **Especificações Principais:**
  - [Característica física 1, por exemplo tamanho de tela, material ou dimensões, se aplicável e documentada]
  - [Característica física 2, por exemplo resolução, capacidade ou amperagem, se aplicável e documentada]
  - [Interfaces/Conexões, por exemplo portas de rede, encaixes ou roscas, se aplicável e documentadas]
  - [Sistema/Software, se aplicável e documentado]
- **Ecossistema:** [Com quais outras peças, CLPs ou sistemas este item trabalha junto, somente se houver evidência nas fontes].

REGRAS OBRIGATÓRIAS:
1. A OMINI é uma IA DE PESQUISA: investigue os documentos locais, compare ocorrências, interprete tabelas e OCR, e diferencie evidência confirmada de ausência de evidência. Nesta resposta, use somente o contexto local e o OCR realmente fornecidos. Não alegue que pesquisou na internet. Se o código exato não aparecer em nenhuma evidência legível, não identifique o produto por associação ou conhecimento presumido: informe que não foi possível confirmar o código nos documentos locais e indique pesquisa externa como próximo passo.
2. Um código literal é a chave principal. Se o código aparece em um documento, isso NÃO autoriza usar qualquer seção desse arquivo como descrição do item. Use apenas a linha do código, a mesma linha de tabela e os cabeçalhos/valores comprovadamente associados. Se o contexto diz que o código exato não foi encontrado, trate o restante daquele arquivo como não comprobatório para identificar o produto.
3. Confira o código literal completo, caractere por caractere, e procure todas as ocorrências exatas. Use cabeçalhos, unidades, notas de rodapé e alinhamento de linhas e colunas para associar dados ao código correto. Não atribua ao item valores de códigos vizinhos ou variantes.
4. Se o código parecer ambíguo ou coincidir com termos de outros catálogos, priorize a identificação exata do componente eletrônico ou mecânico industrial correspondente ao código literal, mas não adivinhe. Não interprete páginas, números ou erros documentais como parte do produto sem evidência.
5. Preencha apenas as características aplicáveis ao tipo de componente. Não invente tela, software, portas, dimensões ou ecossistema quando não fizerem sentido ou não estiverem documentados.
6. Seja direto, mas não corte dados técnicos relevantes que estejam comprovados. Não há limite artificial de linhas para as especificações. Não inclua introdução longa, conclusão genérica ou comentários sobre o próprio processo.
7. Se a fonte não identificar com segurança o componente exato, diga isso claramente e apresente somente os dados efetivamente confirmados. Não apresente informações gerais da família como se fossem específicas do código pesquisado.`;
const user="CÓDIGO/MODELO/NÚMERO DE SÉRIE EXATO: "+q+"\n\nIdentifique o componente literal e responda estritamente no modelo: nome completo em negrito; O que realmente é; Fabricante; Especificações Principais; Ecossistema. Use todas as evidências exatas disponíveis, sem códigos vizinhos, sem adivinhações e sem cortar especificações relevantes. Se não houver evidência legível que vincule o código literal ao produto, não use títulos ou seções aleatórias do PDF para adivinhar: diga que o código não foi confirmado nos documentos locais.\n\nDOCUMENTOS LOCAIS E CONTEXTO EXTRAÍDO:\n"+context(docs,q)+"\n\nTEXTO OCR DAS IMAGENS, SE HOUVER:\n"+(visual.notes.join("\n").slice(0,18000)||"nenhum");
requestStage="api/chat";const r=await fetch(OLLAMA+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({model:selected,messages:[{role:"system",content:system},{role:"user",content:user}],stream:true,think:false,keep_alive:"30m",options:{temperature:0,num_ctx:4096,num_predict:500}})});
if(!r.ok){let detail="";try{detail=(await r.json()).error||""}catch{}throw Error("Ollama respondeu HTTP "+r.status+(detail?": "+detail:"."))}
if(!r.body)throw Error("Ollama não iniciou a resposta em fluxo.");
reader=r.body.getReader();const decoder=new TextDecoder();let buffer="",answer="",done=false,renderPending=false;
const renderAnswer=()=>{if(renderPending)return;renderPending=true;const paint=()=>{renderPending=false;renderFrame=0;body.textContent=answer;chat.scrollTop=0};if(typeof requestAnimationFrame==="function")renderFrame=requestAnimationFrame(paint);else paint()};
const consume=line=>{if(!line.trim())return;let data;try{data=JSON.parse(line)}catch{return}if(data.error)throw Error(data.error);const token=data.message?.content||data.response||"";if(token){answer+=token;renderAnswer()}if(data.done)done=true};
while(!done){const part=await reader.read();buffer+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});const lines=buffer.split("\n");buffer=lines.pop()||"";for(const line of lines)consume(line);if(part.done)done=true}
if(buffer.trim())consume(buffer);if(!answer.trim())throw Error("O modelo selecionado não retornou uma resposta.");return answer.trim()
}catch(e){
 if(renderFrame&&typeof cancelAnimationFrame==="function")cancelAnimationFrame(renderFrame);const timedOut=controller?.signal.aborted&&controller.signal.reason==="timeout"&&!stopped;
 if(reader&&!controller?.signal.aborted)controller?.abort("stream-error");
 try{await reader?.cancel()}catch{}
 if(timedOut)throw Error("Ollama ("+selected+") excedeu o tempo limite de 180 segundos.");
 if(isOllamaFetchFailure(e))throw Error(ollamaConnectionMessage(requestStage));
 throw e;
}finally{
 clearTimeout(timeout);
 try{reader?.releaseLock()}catch{}
}
}
async function learn(docs,q,answer,ocrText=""){
 const weak=/não consegui confirmar|evidência insuficiente|informação[_ ]não[_ ]encontrada/i.test(answer);
 if(weak&&!ocrText)return;
 saveLearnedMemory(q,answer,docs,ocrText);
 const db=await openDB(),updatedFacts=new Map();
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE);
   for(const d of docs){
    const request=store.get(d.id);
    request.onsuccess=()=>{
     const item=request.result;
     if(!item)return;
     const facts=Array.isArray(item.learnedFacts)?item.learnedFacts:[];
     const ocrPrefix="Texto OCR indexado:";
     if(ocrText&&!facts.some(x=>String(x).startsWith(ocrPrefix)&&String(x).includes(ocrText.slice(0,80))))facts.push(`${ocrPrefix} ${ocrText.slice(0,4000)}`);
     const learnedFact=`Pergunta: ${q}\nFato aprendido de ${item.name}: ${answer.slice(0,900)}`;if(!weak&&!facts.includes(learnedFact))facts.push(learnedFact);
     const ocrFacts=facts.filter(x=>String(x).startsWith(ocrPrefix)).slice(-2);
     const answerFacts=facts.filter(x=>!String(x).startsWith(ocrPrefix)).slice(-6);
     item.learnedFacts=[...ocrFacts,...answerFacts];
     updatedFacts.set(String(item.id),item.learnedFacts);
     store.put(item);
    };
    request.onerror=()=>reject(request.error);
   }
   tx.oncomplete=resolve;
   tx.onerror=()=>reject(tx.error);
  });
  if(docCache)for(const item of docCache){const facts=updatedFacts.get(String(item.id));if(facts)item.learnedFacts=facts}
 }finally{db.close()}
}
function quickCodeAnswer(q,docs,visual){
 // Não montar uma resposta automática com uma janela de texto: em tabelas técnicas
 // isso mistura valores de linhas/colunas vizinhas. O modelo deve interpretar a
 // linha do item junto com os cabeçalhos e a descrição da seção.
 return "";
}
function calculateFromEvidence(q,ocr){if(!ocr)return"";const text=norm(ocr).replace(/\b1pk\b/g,"ipk").replace(/\blcw\b/g,"icw").replace(/[·⋅]/g,"×").replace(/\bvezes\b/g,"×"),question=norm(q),number=question.match(/(\d+(?:[.,]\d+)?)\s*(ka|a)\b/i);if(!number)return"";const variable="[a-z][a-z0-9]{1,10}",numeric="(\\d+(?:[.,]\\d+)?)",formulas=[];for(const f of text.matchAll(new RegExp(`\\b(${variable})\\s*(?:\\([^)]{0,20}\\))?\\s*(?:=|:)\\s*(${variable})\\s*([*×x/])\\s*${numeric}`,"gi"))){formulas.push({target:f[1].toLowerCase(),source:f[2].toLowerCase(),op:f[3],factor:f[4]})}for(const f of text.matchAll(new RegExp(`\\b(${variable})\\s*(?:\\([^)]{0,20}\\))?\\s*(?:=|:)\\s*${numeric}\\s*([*×x/])\\s*(${variable})`,"gi"))){formulas.push({target:f[1].toLowerCase(),source:f[4].toLowerCase(),op:f[3],factor:f[2]})}for(const f of formulas){const {target,source,op,factor}=f;if(!question.includes(target))continue;const factorValue=Number(factor.replace(",",".")),value=Number(number[1].replace(",",".")),result=op==="/"?value/factorValue:value*factorValue;if(!Number.isFinite(result)||!Number.isFinite(factorValue))continue;const pretty=n=>Number(n.toFixed(4)).toLocaleString("pt-BR"),unit=number[2].toLowerCase()==="a"?"A":"kA";return`Pela fórmula lida no documento: ${target.toUpperCase()} = ${source.toUpperCase()} ${op==="/"?"÷":"×"} ${factor}. Substituindo ${source.toUpperCase()} = ${number[1]} ${unit}: ${number[1]} ${op==="/"?"÷":"×"} ${factor} = ${pretty(result)} ${unit}. Fonte: documento local [1].`}return""}
function saveHistory(entry){try{const old=JSON.parse(localStorage.getItem(HISTORY)||"[]");localStorage.setItem(HISTORY,JSON.stringify([entry,...old.filter(x=>x.id!==entry.id)].slice(0,30)))}catch{}window.dispatchEvent(new Event("omni:chat-history-updated"))}
async function run(){
const q=input.value.trim();if(window.OMINI_STARTUP_PRESEARCH_ACTIVE&&!window.OMINI_BASE_INDEX_READY){setStatus("Montando o índice inicial · aguarde…","busy");return}if(!q||busy)return;busy=true;window.OMINI_CHAT_BUSY=true;stopped=false;controller=new AbortController();welcome.hidden=true;addUser(q);const reply=makeMessage();const latestAssistant=chat.lastElementChild,latestQuestion=latestAssistant?.previousElementSibling;if(latestQuestion?.classList.contains("omni-chat-user")){chat.insertBefore(latestAssistant,chat.firstElementChild);chat.insertBefore(latestQuestion,chat.firstElementChild)}reply.body.textContent="Pesquisando documentos…";input.value="";send.disabled=true;send.hidden=true;stop.hidden=false;setStatus("Pesquisando documentos locais","busy");chat.scrollTop=0;let sources=[],answer="",visual={notes:[],ocrText:""};
try{
const codeSearch=queryCodes(q).length>0;let docs=[],found=[];if(codeSearch){reply.body.textContent="Consultando o índice em memória para localizar o código exato…";setStatus("Busca por código · consultando o índice local","busy");const workerHits=await workerSearch(q,controller.signal);if(stopped)throw Error("interrompida");if(workerHits?.length){reply.body.textContent="Código localizado no índice · abrindo "+Math.min(workerHits.length,50)+" documento(s) candidato(s)…";setStatus("Resultados por código · carregando somente os manuais encontrados","busy");const records=await loadDocuments(workerHits.slice(0,50));if(stopped)throw Error("interrompida");docs=records.map(searchDocFromRecord);found=await retrieve(docs,q)}if(!found.length){docs=await allDocs();if(stopped)throw Error("interrompida");found=await retrieve(docs,q)}}else{const workerHits=await workerSearch(q,controller.signal);if(stopped)throw Error("interrompida");if(workerHits!==null){found=workerHits;docs=workerHits;sources=[...found,...favoriteSearches(q)];setSources(reply.sources,sources);if(found.length){reply.body.textContent="Encontrei "+found.length+" documento(s). Lendo os arquivos correspondentes…";setStatus("Resultados locais encontrados · abrindo fontes","busy")}}else{docs=await allDocs();if(!window.OMINI_STARTUP_PRESEARCH_ACTIVE)docs=await prepareSearchableDocs(docs);found=await retrieve(docs,q)}}const sites=favoriteSearches(q),learned=memoryMatch(q,docs);if(stopped)throw Error("interrompida");
const cachedAnswer=String(learned?.entry?.answer||"");
// Respostas negativas antigas não são evidência: não reutilizá-las como se fossem conclusivas.
// Isso força uma nova leitura dos documentos quando uma busca anterior respondeu que não encontrou dados.
const cachedAnswerIsNegative=/não encontrei evidências?|não encontrei evidência|não foi encontrado|não encontrado|sem dados específicos|evidência insuficiente|informação[_ ]não[_ ]encontrada|não consegui confirmar/i.test(cachedAnswer);
if(!codeSearch&&learned?.exact&&!cachedAnswerIsNegative){sources=[...found,...learned.sources.filter(saved=>!found.some(item=>String(item.id)===String(saved.id))),...sites];answer=learned.entry.answer;setSources(reply.sources,sources);setStatus("Resposta recuperada da memória local","online")}
else if(!codeSearch&&!found.length&&learned){sources=[...learned.sources,...sites];setSources(reply.sources,sources);const rememberedCalculation=learned.entry.ocrText?calculateFromEvidence(q,learned.entry.ocrText):"";if(rememberedCalculation){answer=rememberedCalculation;setStatus("Cálculo recuperado do aprendizado local","online");void learn(learned.sources,q,answer,learned.entry.ocrText).catch(error=>console.warn("Falha ao atualizar aprendizado local",error))}else{const memoryDocs=await loadDocuments(learned.sources.slice(0,2));visual.ocrText=learned.entry.ocrText||"";visual.notes=visual.ocrText?["Texto recuperado do aprendizado local: "+visual.ocrText.slice(0,1200)]:[];setStatus("Ollama · usando o aprendizado local","busy");answer=await ask(q,memoryDocs,visual,reply.body,"");if(/INFORMAÇÃO[_ ]NÃO[_ ]ENCONTRADA|não encontrei evidência suficiente/i.test(answer)){answer="A memória local contém documentos relacionados, mas não encontrei evidência suficiente para confirmar essa resposta.";setStatus("Evidência insuficiente nos documentos","")}else{setStatus("Resposta baseada no aprendizado local","online");void learn(memoryDocs,q,answer,visual.ocrText).catch(error=>console.warn("Falha ao gravar aprendizado local",error))}}}
else if(!found.length){sources=sites;setSources(reply.sources,sources);answer=codeSearch?`Não consegui localizar evidência legível para o código exato “${q}” nos documentos locais.\n\nPesquisar no Google: https://www.google.com/search?q=${encodeURIComponent(q)}`:((searchWorkerDocumentCount||docs.length)?`Não encontrei documentos locais com evidência relacionada a “${q}”.` :"Não há documentos no banco de dados local.");if(sites.length)answer+="\n\nTambém encontrei estes sites técnicos nos favoritos:";setStatus((searchWorkerDocumentCount||docs.length)?"Nenhum documento correspondente":"Banco local vazio",sites.length?"online":"")}
else{sources=[...found,...sites];setSources(reply.sources,sources);reply.body.textContent=`Encontrei ${found.length} documento(s) relacionado(s). Preparando resposta…`;chat.scrollTop=0;setStatus(`Encontrados ${found.length} documento(s) relevante(s) · lendo conteúdo`,"busy");const answerDocs=await loadDocuments(found.slice(0,5));renderSearchPreview(reply.preview,answerDocs,q);const answerIds=new Set(answerDocs.map(d=>String(d.id))),usefulMemory=!codeSearch&&learned&&learned.sources.some(d=>answerIds.has(String(d.id)))?learned:null,rememberedCalculation=usefulMemory?.entry.ocrText?calculateFromEvidence(q,usefulMemory.entry.ocrText):"";
if(rememberedCalculation){answer=rememberedCalculation;visual.ocrText=usefulMemory.entry.ocrText;setStatus("Cálculo respondido com aprendizado local","online");void learn(answerDocs,q,answer,visual.ocrText).catch(error=>console.warn("Falha ao atualizar aprendizado local",error))}
else{visual=await imagesFor(answerDocs,q);if(stopped)throw Error("interrompida");const exactCodeAnswer=codeSearch?quickCodeAnswer(q,answerDocs,visual):"",quickAnswer=exactCodeAnswer||calculateFromEvidence(q,visual.ocrText);if(quickAnswer){answer=quickAnswer;setStatus(exactCodeAnswer?"Código localizado · resposta direta do documento":"Cálculo conferido com a fórmula do documento","online");void learn(answerDocs,q,answer,visual.ocrText).catch(error=>console.warn("Falha ao gravar aprendizado local",error))}else{setStatus("Ollama · respondendo com base nos arquivos","busy");reply.body.textContent="Documentos encontrados. A IA está preparando a resposta…";answer=await ask(q,answerDocs,visual,reply.body,"");if(/INFORMAÇÃO[_ ]NÃO[_ ]ENCONTRADA|não encontrei evidência suficiente/i.test(answer)){answer="Encontrei arquivos relacionados, mas não consegui confirmar a resposta nas informações legíveis. Confira os documentos listados.";setStatus("Evidência insuficiente nos documentos","");if(visual.ocrText)void learn(answerDocs,q,answer,visual.ocrText).catch(error=>console.warn("Falha ao salvar OCR",error))}else{setStatus("Resposta baseada nos arquivos locais","online");void learn(answerDocs,q,answer,visual.ocrText).catch(error=>console.warn("Falha ao gravar aprendizado local",error))}}}}
setSources(reply.sources,sources);reply.body.textContent=answer;saveHistory({id:Date.now(),question:q,answer,sources:sources.map(d=>d.name||"Documento local"),createdAt:Date.now()})
}catch(e){const wasStopped=stopped||e.message==="interrompida",connectionWarning=isOllamaFetchFailure(e)||/Não foi possível conectar ao Ollama|127\.0\.0\.1:11434/i.test(String(e?.message||e));if(connectionWarning){answer="";reply.body.textContent="";setStatus("","")}else{answer=wasStopped?"Pesquisa interrompida.":": "+(e?.message||String(e));reply.body.textContent=answer;setStatus(wasStopped?"Pesquisa interrompida":"Falha na pesquisa local","")}setSources(reply.sources,sources);saveHistory({id:Date.now(),question:q,answer,sources:sources.map(d=>d.name||"Documento local"),createdAt:Date.now()})}
finally{busy=false;window.OMINI_CHAT_BUSY=false;controller=null;send.disabled=false;send.hidden=false;stop.hidden=true;chat.scrollTop=0;if(window.OMINI_SEARCH_INDEX_DIRTY&&!window.OMINI_STARTUP_PRESEARCH_ACTIVE)void startSearchWorker()}}
let liveSearchTimer=0;input?.addEventListener("input",()=>{clearTimeout(liveSearchTimer);const query=input.value.trim();if(query.length>=2)liveSearchTimer=setTimeout(()=>void workerSearch(query),90)},{passive:true});function onSend(e){e.preventDefault();e.stopImmediatePropagation();run()}send?.addEventListener("click",onSend,true);input?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();e.stopImmediatePropagation();run()}},true);stop?.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();stopped=true;controller?.abort("user");try{activeSearchPdfRender?.cancel?.()}catch{};try{void activeSearchPdfTask?.destroy?.()}catch{};if(activeOcrWorker){const worker=activeOcrWorker;activeOcrWorker=null;ocrWorkerPromise=null;Promise.resolve(worker.terminate()).catch(()=>{})}setStatus("Interrompendo pesquisa…","busy")},true);
window.addEventListener("omni:manuals-updated",()=>{docCache=null;docInvertedIndex=null;workerQueryCache.clear();if(!window.OMINI_FOLDER_PROGRESS||window.OMINI_CANCEL_STARTUP_PRESEARCH)window.OMINI_SEARCH_INDEX_DIRTY=true;if(searchWorker&&!window.OMINI_PRESEARCH_PENDING)setTimeout(async()=>{if(window.OMINI_PRESEARCH_PENDING||window.OMINI_STARTUP_PRESEARCH_ACTIVE)return;await waitForSearchIdle();void startSearchWorker()},250)});
async function presearchAllFiles(){if(!window.OMINI_PRESEARCH_PENDING||window.OMINI_STARTUP_PRESEARCH_ACTIVE)return;window.OMINI_PRESEARCH_PENDING=false;window.OMINI_STARTUP_PRESEARCH_ACTIVE=true;window.OMINI_BASE_INDEX_READY=false;window.OMINI_BACKGROUND_PRESEARCH=true;const files=window.OMINI_STARTUP_FILES||[];try{setStatus("Preparando a leitura completa dos arquivos locais…","busy");window.OMINI_UPDATE_STARTUP_PROGRESS?.("preloading","Restaurando ou atualizando o índice local…",88,files);window.OMINI_BASE_INDEX_READY=searchWorkerAvailable;await startSearchWorker();window.OMINI_BASE_INDEX_READY=searchWorkerAvailable;window.OMINI_UPDATE_STARTUP_PROGRESS?.("preloading","Índice de busca pronto · pré-lendo conteúdo e imagens…",92,files);const docs=await allDocs();const indexed=await prepareSearchableDocs(docs);await waitForSearchIdle();await startSearchWorker();window.OMINI_BACKGROUND_PRESEARCH=false;window.OMINI_FOLDER_PROGRESS=false;window.OMINI_UPDATE_STARTUP_PROGRESS?.("ready",indexed.length?`${indexed.length} arquivo(s) preparado(s) para pesquisa.`:"Biblioteca pronta · nenhum arquivo cadastrado",100,files);setStatus("Arquivos pré-lidos · pesquisa pronta","online")}catch(error){console.warn("A pré-leitura da biblioteca foi interrompida:",error);window.OMINI_BACKGROUND_PRESEARCH=false;window.OMINI_FOLDER_PROGRESS=false;if(!window.OMINI_CANCEL_STARTUP_PRESEARCH)window.OMINI_UPDATE_STARTUP_PROGRESS?.("error","Pré-leitura parcial. Alguns arquivos serão preparados quando forem pesquisados.",100,files)}finally{window.OMINI_STARTUP_PRESEARCH_ACTIVE=false;window.OMINI_BASE_INDEX_READY=false;window.dispatchEvent(new Event("omni:presearch-finished"));if(navigator.onLine&&!window.OMINI_CANCEL_STARTUP_PRESEARCH)setTimeout(()=>void warmupOminiModel(),2500)}}
window.OMINI_CANCEL_STARTUP_PRESEARCH_WORK=()=>{window.OMINI_CANCEL_STARTUP_PRESEARCH=true;window.OMINI_PRESEARCH_PENDING=false;stopped=true};
window.addEventListener("omni:presearch-request",()=>void presearchAllFiles());if(window.OMINI_PRESEARCH_PENDING&&!window.OMINI_CANCEL_STARTUP_PRESEARCH)void presearchAllFiles();else void startSearchWorker();
// Mantém o modelo carregado por mais tempo e faz um aquecimento silencioso quando o navegador estiver ocioso.
let warmupStarted=false;
async function warmupOminiModel(){if(warmupStarted||busy||window.OMINI_STARTUP_PRESEARCH_ACTIVE||!navigator.onLine)return;warmupStarted=true;try{const names=await modelNames();const selected=(names||[]).find(n=>n==="qwen3.5:4b")||(names||[]).find(n=>n==="qwen3:4b")||(names||[]).find(n=>n==="llama3.2:3b")||(names||[]).find(n=>n==="gemma3:4b");if(!selected)return;const response=await fetch(OLLAMA+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:selected,messages:[{role:"user",content:"Responda apenas OK."}],stream:false,keep_alive:"30m",options:{temperature:0,num_ctx:512,num_predict:1}})});if(!response.ok)throw Error("warmup");setStatus("Ollama pronto · memória local preservada","online")}catch(e){/* o aquecimento não deve atrapalhar o uso do site */}finally{warmupStarted=false}}
const scheduleWarmup=()=>{if("requestIdleCallback" in window)requestIdleCallback(()=>{if(!busy)void warmupOminiModel()},{timeout:12000});else setTimeout(()=>{if(!busy)void warmupOminiModel()},5000)};
if(document.readyState==="complete")scheduleWarmup();else window.addEventListener("load",scheduleWarmup,{once:true});
})();
