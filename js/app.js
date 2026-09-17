// ==========================================
// 1. CREDENCIALES DE SUPABASE
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';
const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

// ==========================================
// 2. CONSTANTES TÉCNICAS
// ==========================================
const PARAMETROS_TECNICOS = [
    { solucion: 'SOSA', min: 1.5, max: 2.5 },
    { solucion: 'SOSA (MADRE)', min: 35, max: 50 },
    { solucion: 'ÁCIDO NÍTRICO', min: 0.8, max: 2.0 },
    { solucion: 'ÁCIDO NÍTRICO MADRE', min: 55, max: 65 },
    { solucion: 'AGUA ENJUAGUE', min: 6.5, max: 7.6 },
    { solucion: 'PEROXIDO', min: 35, max: 45 },
    { solucion: 'ÁCIDO PERACÉTICO', min: 200, max: 450 },
    { solucion: 'BACOXIN', min: 100, max: 200 },
    { solucion: 'SOSA (CENTRO ACOPIO)', min: 20, max: 30 },
    { solucion: 'SOSA (PASIVACIÓN)', min: 2.5, max: 5 },
    { solucion: 'ÁCIDO (PASIVACIÓN)', min: 8, max: 15 },
    { solucion: 'ÁCIDO FOSFÓRICO', min: 0.8, max: 2.0 },
    { solucion: 'CLORO', min: 0, max: 200 }
];

let listaRegistros = [];
let scatterInst = null;
let radarInst = null;
let sparkInst = { ef: null, ri: null, ex: null, to: null };

// ==========================================
// 3. NORMALIZADORES
// ==========================================
function n(t) { return t ? String(t).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : ''; }
function parseConcen(v) { let num = parseFloat(String(v).replace(',', '.')); return isNaN(num) ? 0 : num; }
function estandarizarFechaParaBD(f) {
    if (!f) return new Date().toISOString().split('T')[0];
    if (typeof f === 'number') return new Date((f - 25569) * 86400 * 1000).toISOString().split('T')[0];
    const s = String(f).trim();
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.substring(0, 10);
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return new Date().toISOString().split('T')[0];
}
function estandarizarNombreSolucion(nombre) {
    let l = n(nombre);
    if (l.includes('SOSA (MADRE)')) return 'SOSA (MADRE)';
    if (l.includes('SOSA (CENTRO ACOPIO)')) return 'SOSA (CENTRO ACOPIO)';
    if (l.includes('SOSA (PASIVACION')) return 'SOSA (PASIVACIÓN)';
    if (l.includes('SOSA')) return 'SOSA';
    if (l.includes('ACIDO NITRICO MADRE')) return 'ÁCIDO NÍTRICO MADRE';
    if (l.includes('ACIDO NITRICO')) return 'ÁCIDO NÍTRICO';
    if (l.includes('ACIDO PERACETICO')) return 'ÁCIDO PERACÉTICO';
    if (l.includes('ACIDO FOSFORICO')) return 'ÁCIDO FOSFÓRICO';
    if (l.includes('ACIDO (PASIVACION')) return 'ÁCIDO (PASIVACIÓN)';
    if (l.includes('AGUA ENJUAGUE')) return 'AGUA ENJUAGUE';
    if (l.includes('PEROXIDO')) return 'PEROXIDO';
    if (l.includes('BACOXIN')) return 'BACOXIN';
    if (l.includes('CLORO')) return 'CLORO';
    return String(nombre || 'S/N').trim().toUpperCase();
}

// ==========================================
// 4. INICIO Y DATOS (SUPABASE + EXCEL)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    actualizarBadgeIA();
    try {
        await cargarSupabase();
        poblarFiltros();
        
        ['filtro-solucion', 'filtro-equipo', 'filtro-anio', 'filtro-mes'].forEach(id => {
            document.getElementById(id).addEventListener('change', renderizarCore);
        });

        // Solución robusta al error "Cannot read properties of null" (Línea 76)
        const loader = document.getElementById('loader');
        const content = document.getElementById('dashboard-content');
        
        if (loader) {
            loader.classList.add('opacity-0');
            setTimeout(() => {
                loader.classList.add('hidden');
                if (content) content.classList.remove('opacity-0');
            }, 500);
        }
    } catch (e) { console.error("Error BD:", e); }
});

async function cargarSupabase() {
    let chunkSize = 1000, offset = 0, keepFetching = true, acumulador = [];
    while (keepFetching) {
        const { data, error } = await clienteSupabase.from('registros_limpieza').select('*').range(offset, offset + chunkSize - 1);
        if (error) break;
        if (data && data.length > 0) { acumulador = acumulador.concat(data); offset += chunkSize; if (data.length < chunkSize) keepFetching = false; } else { keepFetching = false; }
    }
    listaRegistros = acumulador.map(r => ({ ...r, solucion: estandarizarNombreSolucion(r.solucion), equipo: String(r.equipo || 'N/A').trim(), proceso: String(r.proceso || 'CIP').trim().toUpperCase() }));
    
    const infoRegistros = document.getElementById('info-registros-totales');
    if (infoRegistros) infoRegistros.innerText = `${listaRegistros.length.toLocaleString()} Registros BD`;
    
    actualizarSelectores();
    renderizarCore();
}

async function importarArchivoExcel(event) {
    const f = event.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if(json.length===0) return;
            alert(`Sincronizando ${json.length} filas...`);
            let records = json.map(row => ({
                fecha: estandarizarFechaParaBD(row.FECHA || row.fecha), mes: n(row.MES || row.mes || 'N/A'), hora: row.HORA || row.hora || '00:00:00',
                solucion: estandarizarNombreSolucion(row.SOLUCION || row.solucion), equipo: String(row.EQUIPO || row.equipo || 'N/A').trim(),
                proceso: n(row.PROCESO || row.proceso || 'CIP'), concen: parseConcen(row.CONCEN || row.concen),
                operario: n(row.OPERARIO || row.operario || 'S/N'), laboratorista: n(row.LABORATORISTA || row.laboratorista || 'S/N')
            }));
            for (let i = 0; i < records.length; i += 500) { await clienteSupabase.from('registros_limpieza').insert(records.slice(i, i + 500)); }
            alert("Sincronización exitosa."); await cargarSupabase();
        } catch (err) { alert("Error Excel"); }
    };
    reader.readAsArrayBuffer(f);
}

// ==========================================
// 5. FILTROS
// ==========================================
function poblarFiltros() {
    const s = document.getElementById('filtro-solucion');
    if(!s) return;
    s.innerHTML = `<option value="TODAS">TODAS LAS SOLUCIONES</option>`;
    [...new Set(PARAMETROS_TECNICOS.map(p => p.solucion))].forEach(sol => s.appendChild(new Option(sol, sol)));
}

function actualizarSelectores() {
    const eq = document.getElementById('filtro-equipo'); const an = document.getElementById('filtro-anio');
    if(!eq || !an) return;
    
    let eqSet = new Set(), anSet = new Set();
    listaRegistros.forEach(r => { if (r.equipo) eqSet.add(r.equipo); if (r.fecha) anSet.add(r.fecha.substring(0, 4)); });
    
    let eqVal = eq.value; eq.innerHTML = `<option value="TODOS">TODOS LOS EQUIPOS</option>`;
    Array.from(eqSet).sort().forEach(e => eq.appendChild(new Option(e, e))); eq.value = eqVal;
    
    let anVal = an.value; an.innerHTML = `<option value="TODOS">AÑO</option>`;
    Array.from(anSet).sort().reverse().forEach(a => an.appendChild(new Option(a, a))); an.value = anVal;
}

function obtenerDatosFiltrados() {
    const elS = document.getElementById('filtro-solucion');
    const elE = document.getElementById('filtro-equipo');
    const elA = document.getElementById('filtro-anio');
    const elM = document.getElementById('filtro-mes');
    
    if(!elS || !elE || !elA || !elM) return [];

    const s = elS.value, e = elE.value, a = elA.value, m = elM.value;
    
    return listaRegistros.filter(r => {
        let mMes = true;
        if(m !== 'TODOS') {
            let mesBD = r.fecha ? r.fecha.substring(5, 7) : '';
            let mapMeses = {'01':'ENERO','02':'FEBRERO','03':'MARZO','04':'ABRIL','05':'MAYO','06':'JUNIO','07':'JULIO','08':'AGOSTO','09':'SEPTIEMBRE','10':'OCTUBRE','11':'NOVIEMBRE','12':'DICIEMBRE'};
            mMes = (mesBD === m || n(r.mes) === mapMeses[m] || n(r.mes).includes(mapMeses[m]));
        }
        return (s === 'TODAS' || r.solucion === s) && (e === 'TODOS' || r.equipo === e) && (a === 'TODOS' || (r.fecha && r.fecha.startsWith(a))) && mMes;
    });
}

// ==========================================
// 6. MOTOR RENDER PRINCIPAL
// ==========================================
function renderizarCore() {
    const datos = obtenerDatosFiltrados();
    let stats = { conformes: 0, riesgo: 0, exceso: 0, desviosList: [] };

    datos.forEach(r => {
        const p = PARAMETROS_TECNICOS.find(x => x.solucion === r.solucion);
        if (p) {
            const val = parseConcen(r.concen);
            if (val < p.min) { stats.riesgo++; stats.desviosList.push({...r, tipo: 'Riesgo (<Min)'}); }
            else if (val > p.max) { stats.exceso++; stats.desviosList.push({...r, tipo: 'Exceso (>Max)'}); }
            else stats.conformes++;
        }
    });

    let total = datos.length;
    let eficacia = total > 0 ? (((stats.conformes) / total) * 100).toFixed(1) : 0;
    
    document.getElementById('kpi-eficacia').innerText = eficacia + '%';
    document.getElementById('kpi-riesgo').innerText = stats.riesgo.toLocaleString();
    document.getElementById('kpi-exceso').innerText = stats.exceso.toLocaleString();
    document.getElementById('kpi-total').innerText = total.toLocaleString();

    drawSparklines(datos);
    drawScatter(datos);
    drawRadar(datos);
    drawHeatmap(datos, stats.desviosList);
    
    // Llamada segura a la IA
    generarPlanAccionIA(stats.desviosList);
}

// ==========================================
// 7. GRÁFICAS (Chart.js y HTML dinámico)
// ==========================================
Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
Chart.defaults.color = '#64748b';

function getLineSpark(ctxId, data, color) {
    if(sparkInst[ctxId]) sparkInst[ctxId].destroy();
    const canvas = document.getElementById(ctxId);
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    sparkInst[ctxId] = new Chart(ctx, {
        type: 'line',
        data: { labels: data.map((_,i)=>i), datasets: [{ data: data, borderColor: color, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
}

function drawSparklines(datos) {
    let trend = datos.slice(0, 50).reverse();
    let dataEf = trend.map(r => { let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(!p)return 0; let v=parseConcen(r.concen); return (v>=p.min && v<=p.max)?1:0; });
    let dataRi = trend.map(r => { let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(!p)return 0; return (parseConcen(r.concen)<p.min)?1:0; });
    let dataEx = trend.map(r => { let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(!p)return 0; return (parseConcen(r.concen)>p.max)?1:0; });
    let dataTo = trend.map(()=> Math.random()*5+5); 
    
    getLineSpark('sparkEficacia', dataEf.length ? dataEf : [1,1,1], '#10b981');
    getLineSpark('sparkRiesgo', dataRi.length ? dataRi : [0,0,0], '#ef4444');
    getLineSpark('sparkExceso', dataEx.length ? dataEx : [0,0,0], '#f59e0b');
    getLineSpark('sparkTotal', dataTo.length ? dataTo : [5,6,7], '#2563eb');
}

function drawScatter(datos) {
    const elS = document.getElementById('filtro-solucion');
    const elLabel = document.getElementById('label-scatter');
    const canvas = document.getElementById('scatterChart');
    if(!elS || !canvas) return;

    let sol = elS.value;
    if(sol === 'TODAS') {
        let count={}; datos.forEach(r => count[r.solucion] = (count[r.solucion]||0)+1);
        sol = Object.keys(count).length ? Object.keys(count).reduce((a,b)=>count[a]>count[b]?a:b) : 'SOSA';
        if(elLabel) elLabel.innerText = `${sol} (Predominante)`;
    } else { 
        if(elLabel) elLabel.innerText = sol; 
    }

    const regla = PARAMETROS_TECNICOS.find(p => p.solucion === sol);
    const subset = datos.filter(r => r.solucion === sol).slice(0, 60).reverse();
    const ctx = canvas.getContext('2d');
    
    if (scatterInst) scatterInst.destroy();
    if(!regla || subset.length===0) { scatterInst = new Chart(ctx, { type:'line', data:{labels:[],datasets:[]} }); return; }

    let min = regla.min, max = regla.max;
    let dataPoints = subset.map(r => parseConcen(r.concen));
    let labels = subset.map(r => r.fecha.substring(5) + ' ' + (r.hora?r.hora.substring(0,5):''));
    let pointColors = dataPoints.map(v => v < min ? '#ef4444' : (v > max ? '#f59e0b' : '#10b981'));
    let pointSizes = dataPoints.map(v => v < min || v > max ? 6 : 4);

    scatterInst = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Muestras ('+sol+')', data: dataPoints, showLine: false, pointBackgroundColor: pointColors, pointBorderColor: '#fff', pointBorderWidth: 1, pointRadius: pointSizes, pointHoverRadius: 8 },
                { label: 'Máx Permitido', data: Array(labels.length).fill(max), borderColor: '#f59e0b', borderWidth: 2, borderDash: [5,5], pointRadius: 0, fill: false },
                { label: 'Mín Requerido', data: Array(labels.length).fill(min), borderColor: '#ef4444', borderWidth: 2, borderDash: [5,5], pointRadius: 0, fill: false }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: function(c) { return `Valor: ${c.raw}`; } } } }, scales: { y: { min: min - (min*0.5), max: max + (max*0.5), grid: { color: '#f1f5f9' } }, x: { ticks: { maxRotation: 45, minRotation: 45, font: {size: 9} }, grid: {display:false} } } }
    });
}

function drawRadar(datos) {
    const canvas = document.getElementById('radarChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if (radarInst) radarInst.destroy();

    let procs = {};
    datos.forEach(r => {
        let pr = r.proceso || 'CIP';
        if(!procs[pr]) procs[pr] = { tot:0, conf:0 };
        procs[pr].tot++;
        let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion);
        if(p) { let v = parseConcen(r.concen); if(v>=p.min && v<=p.max) procs[pr].conf++; }
    });

    let keys = Object.keys(procs).sort((a,b)=>procs[b].tot - procs[a].tot).slice(0, 6);
    if(keys.length === 0) { radarInst = new Chart(ctx, {type:'radar', data:{labels:[],datasets:[]}}); return; }

    let labels = keys;
    let dataPcts = keys.map(k => ((procs[k].conf / procs[k].tot)*100).toFixed(1));

    radarInst = new Chart(ctx, {
        type: 'radar',
        data: { labels: labels, datasets: [{ label: '% Cumplimiento', data: dataPcts, backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: '#10b981', pointBackgroundColor: '#10b981', pointBorderColor: '#fff', pointHoverBackgroundColor: '#fff', pointHoverBorderColor: '#10b981', borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { r: { angleLines: { color: '#e2e8f0' }, grid: { color: '#e2e8f0' }, pointLabels: { font: { size: 10, weight: 'bold' } }, suggestedMin: 0, suggestedMax: 100 } } }
    });
}

function drawHeatmap(datos, desviosList) {
    const container = document.getElementById('heatmap-container');
    if(!container) return;

    if(desviosList.length === 0) { container.innerHTML = `<div class="h-full flex items-center justify-center text-slate-400 italic">No hay desvíos en el periodo para dibujar el mapa de calor.</div>`; return; }

    let heatmapData = {};
    desviosList.forEach(r => {
        let eq = r.equipo || 'N/A'; let h = r.hora ? parseInt(r.hora.substring(0,2)) : 12;
        let turno = h < 6 ? 'Madrugada' : (h < 12 ? 'Mañana' : (h < 18 ? 'Tarde' : 'Noche'));
        if(!heatmapData[eq]) heatmapData[eq] = { 'Madrugada':0, 'Mañana':0, 'Tarde':0, 'Noche':0, total:0 };
        heatmapData[eq][turno]++; heatmapData[eq].total++;
    });

    let topEquipos = Object.keys(heatmapData).sort((a,b)=>heatmapData[b].total - heatmapData[a].total).slice(0, 5);
    let turnos = ['Madrugada', 'Mañana', 'Tarde', 'Noche'];
    let html = `<table class="w-full text-center border-collapse"><thead><tr><th class="py-2 text-left w-1/3">Equipo Crítico</th>`;
    turnos.forEach(t => html += `<th class="py-2 text-[10px] text-slate-400 uppercase tracking-wide font-bold">${t}</th>`);
    html += `</tr></thead><tbody class="divide-y divide-slate-100">`;

    topEquipos.forEach(eq => {
        html += `<tr><td class="py-2.5 text-left text-[11px] font-bold text-slate-700 truncate pr-2" title="${eq}">${eq}</td>`;
        turnos.forEach(t => {
            let count = heatmapData[eq][t];
            let bg = 'bg-slate-50', txt = 'text-slate-300';
            if(count > 0 && count <= 2) { bg = 'bg-amber-100'; txt = 'text-amber-700 font-bold'; }
            else if(count > 2) { bg = 'bg-red-200'; txt = 'text-red-700 font-bold'; }
            html += `<td class="p-1"><div class="${bg} ${txt} rounded-md py-1.5 transition hover:scale-105 cursor-default">${count}</div></td>`;
        });
        html += `</tr>`;
    });
    html += `</tbody></table>`; container.innerHTML = html;
}

// ==========================================
// 8. ASISTENTE IA GEMINI (ACTUALIZADO A MODELO UNIVERSAL)
// ==========================================
function obtenerApiKeySegura() {
    return localStorage.getItem('poes_gemini_key') || '';
}

function actualizarBadgeIA() {
    const badge = document.getElementById('badge-ia-status');
    if(!badge) return;
    const key = obtenerApiKeySegura();
    if (key) {
        badge.innerHTML = `<span class="w-2 h-2 bg-accent-green rounded-full animate-ping inline-block mr-1"></span> IA Activa`;
        badge.className = "bg-accent-green/20 text-accent-green text-[10px] font-bold px-3 py-1 rounded-full border border-accent-green/30 shadow-[0_0_10px_rgba(16,185,129,0.2)] cursor-pointer";
    } else {
        badge.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> IA Inactiva (Falta Clave)`;
        badge.className = "bg-slate-800 text-slate-400 text-[10px] font-bold px-3 py-1 rounded-full border border-slate-600 cursor-pointer";
    }
}

async function generarPlanAccionIA(desviosList) {
    const tbody = document.getElementById('ai-action-plan-tbody');
    if(!tbody) return;
    
    const apiKey = obtenerApiKeySegura();
    
    if(desviosList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-emerald-400 font-medium"><i class="fa-solid fa-check-circle mr-2"></i>Cero desvíos reportados. No se requieren acciones correctivas.</td></tr>`;
        return;
    }

    if(!apiKey) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-500 font-mono italic">Haz clic en <b>"IA Config"</b> en la barra superior para ingresar tu API Key y habilitar la predicción.</td></tr>`;
        return;
    }

    tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-emerald-400/70 font-mono animate-pulse"><i class="fa-solid fa-microchip mr-2"></i>Analizando datos con Google AI...</td></tr>`;

    let muestraIA = desviosList.slice(0, 10).map(r => `Equipo: ${r.equipo} | Solución: ${r.solucion} | Conc: ${r.concen} | Falla: ${r.tipo} | Resp: ${r.operario || r.laboratorista}`);
    const prompt = `Eres un Auditor Jefe de POES. Analiza estos desvíos en planta láctea:\n${muestraIA.join('\n')}\n\nGenera un "Plan de Acciones Correctivas" en formato JSON estricto, sin markdown adicional, con un arreglo de objetos. Usa esta estructura exacta:\n[{"hallazgo": "Resumen del desvío", "causa_raiz": "Causa técnica probable", "accion": "Acción inmediata", "responsable": "Rol o nombre del operador/técnico"}]\nDevuelve máximo 4 acciones críticas consolidadas.`;

    try {
        // ACTUALIZADO: Usamos gemini-1.5-pro-latest para evitar el error 404 globalmente
        const modeloIA = 'gemini-1.5-pro-latest';
        
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modeloIA}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(`Google Error (${res.status}): ${errorData.error?.message || 'Error desconocido'}`);
        }

        const jsonRes = await res.json();
        let rawText = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
        let plan = JSON.parse(rawText);

        let html = '';
        plan.forEach(item => {
            html += `<tr class="hover:bg-slate-700/30 transition">
                        <td class="py-3 px-2 align-top text-red-300 font-semibold text-[11px]"><i class="fa-solid fa-circle-xmark mr-1.5 text-red-500"></i> ${item.hallazgo}</td>
                        <td class="py-3 px-2 align-top text-slate-300 text-[11px]">${item.causa_raiz}</td>
                        <td class="py-3 px-2 align-top text-emerald-300 font-medium text-[11px]">${item.accion}</td>
                        <td class="py-3 px-2 align-top text-slate-400 font-mono text-[10px]"><i class="fa-regular fa-user mr-1"></i> ${item.responsable}</td>
                     </tr>`;
        });
        tbody.innerHTML = html;

    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-4 px-6 text-center text-red-400 font-mono text-[11px]"><i class="fa-solid fa-triangle-exclamation mr-1"></i> <b>Fallo IA:</b> ${err.message}</td></tr>`;
        console.error("Gemini Debug Error:", err);
    }
}

// ==========================================
// 9. MODALES (DETALLE E IA CONFIG)
// ==========================================
function abrirModalDetalle(tipo) {
    const modal = document.getElementById('modal-detalle'); const tbody = document.getElementById('modal-tbody'); 
    if(!modal || !tbody) return;
    
    tbody.innerHTML = '';
    const datos = obtenerDatosFiltrados();
    let rsl = [];
    if(tipo === 'riesgo') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)<p.min;});
    if(tipo === 'exceso') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)>p.max;});
    
    document.getElementById('modal-titulo').innerText = tipo === 'riesgo' ? "Desvíos de Riesgo (< Mínimo)" : "Desvíos por Sobredosificación (> Máximo)";
    if(rsl.length===0) { tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 font-bold">Sin registros de desviación bajo los filtros actuales.</td></tr>`; } 
    else {
        rsl.slice(0, 100).forEach(r => {
            tbody.innerHTML += `<tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="py-3 px-6 whitespace-nowrap">${r.fecha} ${r.hora?r.hora.substring(0,5):''}</td>
                <td class="py-3 px-6 font-bold text-slate-800">${r.equipo}</td>
                <td class="py-3 px-6 text-slate-600">${r.solucion}</td>
                <td class="py-3 px-6 text-center font-black ${tipo==='riesgo'?'text-risk-red':'text-warn-yellow'}">${r.concen}</td>
                <td class="py-3 px-6 text-[10px] text-slate-400">${r.operario || r.laboratorista}</td>
            </tr>`;
        });
    }
    modal.classList.remove('hidden');
}

function cerrarModalDetalle() { 
    const modal = document.getElementById('modal-detalle');
    if(modal) modal.classList.add('hidden'); 
}

function abrirConfigIA() {
    const modal = document.getElementById('modal-config-ia');
    const input = document.getElementById('input-api-key');
    if(!modal || !input) return;
    input.value = obtenerApiKeySegura();
    modal.classList.remove('hidden');
}

function cerrarConfigIA() { 
    const modal = document.getElementById('modal-config-ia');
    if(modal) modal.classList.add('hidden'); 
}

function guardarApiKey() {
    const inputVal = document.getElementById('input-api-key').value.trim();
    if(inputVal) {
        localStorage.setItem('poes_gemini_key', inputVal);
        cerrarConfigIA();
        actualizarBadgeIA();
        renderizarCore(); 
    } else {
        alert("Por favor, ingresa una clave válida.");
    }
}

function limpiarApiKey() {
    localStorage.removeItem('poes_gemini_key');
    const input = document.getElementById('input-api-key');
    if(input) input.value = '';
    cerrarConfigIA();
    actualizarBadgeIA();
    renderizarCore();
}
