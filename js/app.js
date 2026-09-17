// ==========================================
// 1. CREDENCIALES
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';
const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

// Pon tu API Key aquí para habilitar la Tabla de Acción IA
// Sistema seguro para la API de Gemini (Evita el bloqueo de GitHub)
let GEMINI_API_KEY = localStorage.getItem('gemini_poes_key');

if (!GEMINI_API_KEY || GEMINI_API_KEY === 'TU_CLAVE_API_DE_GEMINI') {
    GEMINI_API_KEY = prompt("Seguridad Gerencial: Ingresa tu clave API de Gemini para habilitar el Plan de Acción (se guardará en tu navegador):");
    if (GEMINI_API_KEY) {
        localStorage.setItem('gemini_poes_key', GEMINI_API_KEY.trim());
    }
} 

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
// Instancias de Gráficas
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
// 4. INICIO Y DATOS
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await cargarSupabase();
        poblarFiltros();
        ['filtro-solucion', 'filtro-equipo', 'filtro-anio', 'filtro-mes'].forEach(id => {
            document.getElementById(id).addEventListener('change', renderizarCore);
        });
        document.getElementById('loader').classList.add('opacity-0');
        setTimeout(() => { document.getElementById('loader').classList.add('hidden'); document.getElementById('dashboard-content').classList.remove('opacity-0'); }, 500);
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
    document.getElementById('info-registros-totales').innerText = `${listaRegistros.length.toLocaleString()} Registros BD`;
    actualizarSelectores();
    renderizarCore();
}

// Importar Excel
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
// 5. FILTROS Y LÓGICA
// ==========================================
function poblarFiltros() {
    const s = document.getElementById('filtro-solucion');
    s.innerHTML = `<option value="TODAS">TODAS LAS SOLUCIONES</option>`;
    [...new Set(PARAMETROS_TECNICOS.map(p => p.solucion))].forEach(sol => s.appendChild(new Option(sol, sol)));
}
function actualizarSelectores() {
    const eq = document.getElementById('filtro-equipo'); const an = document.getElementById('filtro-anio');
    let eqSet = new Set(), anSet = new Set();
    listaRegistros.forEach(r => { if (r.equipo) eqSet.add(r.equipo); if (r.fecha) anSet.add(r.fecha.substring(0, 4)); });
    
    let eqVal = eq.value; eq.innerHTML = `<option value="TODOS">TODOS LOS EQUIPOS</option>`;
    Array.from(eqSet).sort().forEach(e => eq.appendChild(new Option(e, e))); eq.value = eqVal;
    
    let anVal = an.value; an.innerHTML = `<option value="TODOS">AÑO</option>`;
    Array.from(anSet).sort().reverse().forEach(a => an.appendChild(new Option(a, a))); an.value = anVal;
}
function obtenerDatosFiltrados() {
    const s = document.getElementById('filtro-solucion').value, e = document.getElementById('filtro-equipo').value, 
          a = document.getElementById('filtro-anio').value, m = document.getElementById('filtro-mes').value;
    
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
// 6. MOTOR RENDER PRINCIPAL (CORE)
// ==========================================
function renderizarCore() {
    const datos = obtenerDatosFiltrados();
    let stats = { conformes: 0, riesgo: 0, exceso: 0, desviosList: [] };

    // Analisis Muestra por Muestra
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

    // Dibujar Sparklines (Últimos 10 puntos para ver tendencia visual)
    drawSparklines(datos, stats);
    
    // Dibujar Dispersión
    drawScatter(datos);

    // Dibujar Radar (Procesos)
    drawRadar(datos);

    // Dibujar Mapa de Calor
    drawHeatmap(datos, stats.desviosList);

    // Llamar Inteligencia Artificial
    generarPlanAccionIA(stats.desviosList);
}

// ==========================================
// 7. GRÁFICAS DE VANGUARDIA
// ==========================================
Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
Chart.defaults.color = '#64748b';

function getLineSpark(ctxId, data, color) {
    if(sparkInst[ctxId]) sparkInst[ctxId].destroy();
    const ctx = document.getElementById(ctxId).getContext('2d');
    sparkInst[ctxId] = new Chart(ctx, {
        type: 'line',
        data: { labels: data.map((_,i)=>i), datasets: [{ data: data, borderColor: color, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
}

function drawSparklines(datos) {
    // Simulamos la tendencia cortando los datos cronológicamente
    let trend = datos.slice(0, 50).reverse();
    let dataEf = trend.map(r => { let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(!p)return 0; let v=parseConcen(r.concen); return (v>=p.min && v<=p.max)?1:0; });
    let dataRi = trend.map(r => { let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(!p)return 0; return (parseConcen(r.concen)<p.min)?1:0; });
    let dataEx = trend.map(r => { let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(!p)return 0; return (parseConcen(r.concen)>p.max)?1:0; });
    let dataTo = trend.map(()=> Math.random()*5+5); // Dummy trend for volume
    
    getLineSpark('sparkEficacia', dataEf.length ? dataEf : [1,1,1], '#10b981');
    getLineSpark('sparkRiesgo', dataRi.length ? dataRi : [0,0,0], '#ef4444');
    getLineSpark('sparkExceso', dataEx.length ? dataEx : [0,0,0], '#f59e0b');
    getLineSpark('sparkTotal', dataTo.length ? dataTo : [5,6,7], '#2563eb');
}

function drawScatter(datos) {
    const solFiltro = document.getElementById('filtro-solucion').value;
    let sol = solFiltro;
    if(sol === 'TODAS') {
        let count={}; datos.forEach(r => count[r.solucion] = (count[r.solucion]||0)+1);
        sol = Object.keys(count).length ? Object.keys(count).reduce((a,b)=>count[a]>count[b]?a:b) : 'SOSA';
        document.getElementById('label-scatter').innerText = `${sol} (Predominante)`;
    } else { document.getElementById('label-scatter').innerText = sol; }

    const regla = PARAMETROS_TECNICOS.find(p => p.solucion === sol);
    const subset = datos.filter(r => r.solucion === sol).slice(0, 60).reverse(); // max 60 puntos para visibilidad
    
    const ctx = document.getElementById('scatterChart').getContext('2d');
    if (scatterInst) scatterInst.destroy();
    
    if(!regla || subset.length===0) {
        scatterInst = new Chart(ctx, { type:'line', data:{labels:[],datasets:[]} }); return;
    }

    let min = regla.min, max = regla.max;
    let dataPoints = subset.map(r => parseConcen(r.concen));
    let labels = subset.map(r => r.fecha.substring(5) + ' ' + (r.hora?r.hora.substring(0,5):''));

    // Colores dinámicos
    let pointColors = dataPoints.map(v => v < min ? '#ef4444' : (v > max ? '#f59e0b' : '#10b981'));
    let pointSizes = dataPoints.map(v => v < min || v > max ? 6 : 4);

    scatterInst = new Chart(ctx, {
        type: 'line', // Usamos line sin línea que las una para efecto scatter estético + bandas
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Muestras ('+sol+')',
                    data: dataPoints,
                    showLine: false, // ¡Efecto Scatter!
                    pointBackgroundColor: pointColors,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                    pointRadius: pointSizes,
                    pointHoverRadius: 8
                },
                // Línea Max
                { label: 'Máx Permitido', data: Array(labels.length).fill(max), borderColor: '#f59e0b', borderWidth: 2, borderDash: [5,5], pointRadius: 0, fill: false },
                // Línea Min
                { label: 'Mín Requerido', data: Array(labels.length).fill(min), borderColor: '#ef4444', borderWidth: 2, borderDash: [5,5], pointRadius: 0, fill: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { tooltip: { callbacks: { label: function(c) { return `Valor: ${c.raw}`; } } } },
            scales: { 
                y: { min: min - (min*0.5), max: max + (max*0.5), grid: { color: '#f1f5f9' } },
                x: { ticks: { maxRotation: 45, minRotation: 45, font: {size: 9} }, grid: {display:false} }
            }
        }
    });
}

function drawRadar(datos) {
    const ctx = document.getElementById('radarChart').getContext('2d');
    if (radarInst) radarInst.destroy();

    let procs = {};
    datos.forEach(r => {
        let pr = r.proceso || 'CIP';
        if(!procs[pr]) procs[pr] = { tot:0, conf:0 };
        procs[pr].tot++;
        let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion);
        if(p) { let v = parseConcen(r.concen); if(v>=p.min && v<=p.max) procs[pr].conf++; }
    });

    // Top 5 procesos
    let keys = Object.keys(procs).sort((a,b)=>procs[b].tot - procs[a].tot).slice(0, 6);
    if(keys.length === 0) { radarInst = new Chart(ctx, {type:'radar', data:{labels:[],datasets:[]}}); return; }

    let labels = keys;
    let dataPcts = keys.map(k => ((procs[k].conf / procs[k].tot)*100).toFixed(1));

    radarInst = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: '% Cumplimiento',
                data: dataPcts,
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                borderColor: '#10b981',
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#10b981',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { r: { angleLines: { color: '#e2e8f0' }, grid: { color: '#e2e8f0' }, pointLabels: { font: { size: 10, weight: 'bold' } }, suggestedMin: 0, suggestedMax: 100 } }
        }
    });
}

function drawHeatmap(datos, desviosList) {
    const container = document.getElementById('heatmap-container');
    
    if(desviosList.length === 0) {
        container.innerHTML = `<div class="h-full flex items-center justify-center text-slate-400 italic">No hay desvíos en el periodo para dibujar el mapa de calor.</div>`;
        return;
    }

    // Clasificar turnos por hora (00-06 Madrugada, 06-12 Mañana, 12-18 Tarde, 18-24 Noche)
    let heatmapData = {};
    desviosList.forEach(r => {
        let eq = r.equipo || 'N/A';
        let h = r.hora ? parseInt(r.hora.substring(0,2)) : 12;
        let turno = h < 6 ? 'Madrugada' : (h < 12 ? 'Mañana' : (h < 18 ? 'Tarde' : 'Noche'));
        
        if(!heatmapData[eq]) heatmapData[eq] = { 'Madrugada':0, 'Mañana':0, 'Tarde':0, 'Noche':0, total:0 };
        heatmapData[eq][turno]++;
        heatmapData[eq].total++;
    });

    // Obtener los top 5 equipos con mas desvios para no saturar
    let topEquipos = Object.keys(heatmapData).sort((a,b)=>heatmapData[b].total - heatmapData[a].total).slice(0, 5);
    
    let turnos = ['Madrugada', 'Mañana', 'Tarde', 'Noche'];
    
    let html = `<table class="w-full text-center border-collapse"><thead><tr><th class="py-2 text-left w-1/3">Equipo Crítico</th>`;
    turnos.forEach(t => html += `<th class="py-2 text-[10px] text-slate-400 uppercase tracking-wide font-bold">${t}</th>`);
    html += `</tr></thead><tbody class="divide-y divide-slate-100">`;

    topEquipos.forEach(eq => {
        html += `<tr><td class="py-2.5 text-left text-[11px] font-bold text-slate-700 truncate pr-2" title="${eq}">${eq}</td>`;
        turnos.forEach(t => {
            let count = heatmapData[eq][t];
            let bg = 'bg-slate-50'; let txt = 'text-slate-300';
            if(count > 0 && count <= 2) { bg = 'bg-amber-100'; txt = 'text-amber-700 font-bold'; }
            else if(count > 2) { bg = 'bg-red-200'; txt = 'text-red-700 font-bold'; }
            
            html += `<td class="p-1"><div class="${bg} ${txt} rounded-md py-1.5 transition hover:scale-105 cursor-default">${count}</div></td>`;
        });
        html += `</tr>`;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
}

// ==========================================
// 8. ASISTENTE IA GEMINI (TABLA DE ACCIÓN)
// ==========================================
async function generarPlanAccionIA(desviosList) {
    const tbody = document.getElementById('ai-action-plan-tbody');
    
    if(desviosList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-emerald-400 font-medium"><i class="fa-solid fa-check-circle mr-2"></i>Cero desvíos reportados. No se requieren acciones correctivas.</td></tr>`;
        return;
    }

    if(!GEMINI_API_KEY || GEMINI_API_KEY === 'TU_CLAVE_API_DE_GEMINI') {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-500 font-mono italic">Modo offline. Ingresa tu API Key de Gemini en el código para habilitar la predicción.</td></tr>`;
        return;
    }

    tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-emerald-400/70 font-mono animate-pulse"><i class="fa-solid fa-microchip mr-2"></i>Sintetizando Plan de Acción con Gemini 1.5 Flash...</td></tr>`;

    // Preparar muestra de datos para la IA (Top 10 peores para no saturar token)
    let muestraIA = desviosList.slice(0, 10).map(r => `Equipo: ${r.equipo} | Sol: ${r.solucion} | Conc: ${r.concen} | Falla: ${r.tipo} | Resp: ${r.operario || r.laboratorista}`);

    const prompt = `Eres un Auditor Jefe de POES. Analiza estos desvíos en planta láctea:\n${muestraIA.join('\n')}\n\nGenera un "Plan de Acciones Correctivas" en formato JSON estricto, sin markdown adicional, con un arreglo de objetos. Usa esta estructura exacta:\n[{"hallazgo": "Resumen del desvío", "causa_raiz": "Causa técnica probable", "accion": "Acción inmediata", "responsable": "Rol o nombre del operador/técnico"}]\nDevuelve máximo 4 acciones críticas consolidadas.`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const jsonRes = await res.json();
        let rawText = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Limpiar JSON
        rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
        let plan = JSON.parse(rawText);

        let html = '';
        plan.forEach(item => {
            html += `<tr class="hover:bg-slate-700/30 transition">
                        <td class="py-3 px-2 align-top text-red-300 font-semibold"><i class="fa-solid fa-circle-xmark mr-1.5 text-red-500"></i> ${item.hallazgo}</td>
                        <td class="py-3 px-2 align-top text-slate-300">${item.causa_raiz}</td>
                        <td class="py-3 px-2 align-top text-emerald-300 font-medium">${item.accion}</td>
                        <td class="py-3 px-2 align-top text-slate-400 font-mono"><i class="fa-regular fa-user mr-1"></i> ${item.responsable}</td>
                     </tr>`;
        });
        tbody.innerHTML = html;

    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-red-400">Error al contactar con la API de IA. Revisa consola.</td></tr>`;
        console.error("Gemini Error:", err);
    }
}

// ==========================================
// 9. MODAL INTERACTIVO
// ==========================================
function abrirModalDetalle(tipo) {
    const modal = document.getElementById('modal-detalle'); const tbody = document.getElementById('modal-tbody'); tbody.innerHTML = '';
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
function cerrarModalDetalle() { document.getElementById('modal-detalle').classList.add('hidden'); }
