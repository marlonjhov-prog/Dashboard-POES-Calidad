// ==========================================
// 1. CREDENCIALES Y CONFIGURACIÓN
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';
const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

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
let desviosUltimoFiltro = [];
let scatterInst = null, barSolucionesInst = null, fugaChartInst = null;
let sparkInst = { ef: null, ri: null, ex: null, to: null };
let tsInstances = {}; 

// Configuración Global Chart.js (Estética Light Premium)
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b'; 
Chart.defaults.scale.grid.color = '#e2e8f0';

// ==========================================
// 2. UTILIDADES Y NORMALIZACIÓN
// ==========================================
function n(t) { return t ? String(t).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : ''; }
function parseConcen(v) { let num = parseFloat(String(v).replace(',', '.')); return isNaN(num) ? 0 : num; }
function estandarizarFecha(f) {
    if (!f) return new Date().toISOString().split('T')[0];
    if (typeof f === 'number') return new Date((f - 25569) * 86400 * 1000).toISOString().split('T')[0];
    const s = String(f).trim();
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.substring(0, 10);
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return new Date().toISOString().split('T')[0];
}
function estandarizarSolucion(nombre) {
    let l = n(nombre);
    if (l.includes('SOSA (MADRE)')) return 'SOSA (MADRE)';
    if (l.includes('CENTRO ACOPIO')) return 'SOSA (CENTRO ACOPIO)';
    if (l.includes('SOSA (PASIVACION')) return 'SOSA (PASIVACIÓN)';
    if (l.includes('SOSA')) return 'SOSA';
    if (l.includes('NITRICO MADRE')) return 'ÁCIDO NÍTRICO MADRE';
    if (l.includes('ACIDO NITRICO')) return 'ÁCIDO NÍTRICO';
    if (l.includes('PERACETICO')) return 'ÁCIDO PERACÉTICO';
    if (l.includes('FOSFORICO')) return 'ÁCIDO FOSFÓRICO';
    if (l.includes('ACIDO (PASIVACION')) return 'ÁCIDO (PASIVACIÓN)';
    if (l.includes('ENJUAGUE')) return 'AGUA ENJUAGUE';
    if (l.includes('PEROXIDO')) return 'PEROXIDO';
    if (l.includes('BACOXIN')) return 'BACOXIN';
    if (l.includes('CLORO')) return 'CLORO';
    return String(nombre || 'S/N').trim().toUpperCase();
}

// ==========================================
// 3. INICIALIZACIÓN Y CARGA DE DATOS
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    actualizarBadgeIA();
    initFiltrosInteligentes(); 
    try {
        await cargarSupabase();
        setTimeout(() => {
            document.getElementById('loader')?.classList.add('opacity-0', 'pointer-events-none');
            document.getElementById('dashboard-content')?.classList.remove('opacity-0');
        }, 500);
    } catch (e) { console.error("Error BD:", e); }
});

async function cargarSupabase() {
    let chunkSize = 1000, offset = 0, keepFetching = true, acumulador = [];
    while (keepFetching) {
        const { data, error } = await clienteSupabase.from('registros_limpieza').select('*').range(offset, offset + chunkSize - 1);
        if (error) break;
        if (data && data.length > 0) { acumulador = acumulador.concat(data); offset += chunkSize; if (data.length < chunkSize) keepFetching = false; } else { keepFetching = false; }
    }
    listaRegistros = acumulador.map(r => ({ ...r, solucion: estandarizarSolucion(r.solucion), equipo: String(r.equipo || 'N/A').trim(), proceso: String(r.proceso || 'CIP').trim().toUpperCase() }));
    
    document.getElementById('info-registros-totales').innerText = `${listaRegistros.length.toLocaleString()} Registros BD`;
    actualizarOpcionesFiltros(); 
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
                fecha: estandarizarFecha(row.FECHA || row.fecha), mes: n(row.MES || row.mes || 'N/A'), hora: row.HORA || row.hora || '00:00:00',
                solucion: estandarizarSolucion(row.SOLUCION || row.solucion), equipo: String(row.EQUIPO || row.equipo || 'N/A').trim(),
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
// 4. FILTROS INTELIGENTES (TOM SELECT)
// ==========================================
function initFiltrosInteligentes() {
    ['filtro-equipo', 'filtro-solucion', 'filtro-anio', 'filtro-mes'].forEach(id => {
        tsInstances[id] = new TomSelect(`#${id}`, {
            create: false,
            sortField: { field: "text", direction: "asc" }
        });
        tsInstances[id].on('change', () => { renderizarCore(); });
    });
}

function actualizarOpcionesFiltros() {
    let eqSet = new Set(), solSet = new Set(), anSet = new Set();
    listaRegistros.forEach(r => { 
        if (r.equipo) eqSet.add(r.equipo); 
        if (r.solucion) solSet.add(r.solucion);
        if (r.fecha) anSet.add(r.fecha.substring(0, 4)); 
    });

    let currEq = tsInstances['filtro-equipo'].getValue() || 'TODOS';
    let currSol = tsInstances['filtro-solucion'].getValue() || 'TODAS';
    let currAn = tsInstances['filtro-anio'].getValue() || 'TODOS';

    tsInstances['filtro-equipo'].clearOptions();
    tsInstances['filtro-equipo'].addOption({value: 'TODOS', text: 'Todos los Equipos'});
    Array.from(eqSet).sort().forEach(e => tsInstances['filtro-equipo'].addOption({value: e, text: e}));
    tsInstances['filtro-equipo'].setValue(currEq, true);

    tsInstances['filtro-solucion'].clearOptions();
    tsInstances['filtro-solucion'].addOption({value: 'TODAS', text: 'Todas las Soluciones'});
    Array.from(solSet).sort().forEach(s => tsInstances['filtro-solucion'].addOption({value: s, text: s}));
    tsInstances['filtro-solucion'].setValue(currSol, true);

    tsInstances['filtro-anio'].clearOptions();
    tsInstances['filtro-anio'].addOption({value: 'TODOS', text: 'Todos los Años'});
    Array.from(anSet).sort().reverse().forEach(a => tsInstances['filtro-anio'].addOption({value: a, text: a}));
    tsInstances['filtro-anio'].setValue(currAn, true);
}

function obtenerDatosFiltrados() {
    const s = tsInstances['filtro-solucion'].getValue();
    const e = tsInstances['filtro-equipo'].getValue();
    const a = tsInstances['filtro-anio'].getValue();
    const m = tsInstances['filtro-mes'].getValue();
    
    return listaRegistros.filter(r => {
        let mMes = true;
        if(m && m !== 'TODOS') {
            let mesBD = r.fecha ? r.fecha.substring(5, 7) : '';
            let mapMeses = {'01':'ENERO','02':'FEBRERO','03':'MARZO','04':'ABRIL','05':'MAYO','06':'JUNIO','07':'JULIO','08':'AGOSTO','09':'SEPTIEMBRE','10':'OCTUBRE','11':'NOVIEMBRE','12':'DICIEMBRE'};
            mMes = (mesBD === m || n(r.mes) === mapMeses[m] || n(r.mes).includes(mapMeses[m]));
        }
        return (!s || s === 'TODAS' || r.solucion === s) && 
               (!e || e === 'TODOS' || r.equipo === e) && 
               (!a || a === 'TODOS' || (r.fecha && r.fecha.startsWith(a))) && 
               mMes;
    });
}

// ==========================================
// 5. MOTOR DE RENDERIZADO Y CÁLCULOS
// ==========================================
function renderizarCore() {
    const datos = obtenerDatosFiltrados();
    let stats = { conformes: 0, riesgo: 0, exceso: 0, desviosList: [] };

    datos.forEach(r => {
        const p = PARAMETROS_TECNICOS.find(x => x.solucion === r.solucion);
        if (p) {
            const val = parseConcen(r.concen);
            if (val < p.min) { 
                stats.riesgo++; 
                stats.desviosList.push({...r, tipo: 'Riesgo (<Min)', excesoAbs: 0}); 
            }
            else if (val > p.max) { 
                stats.exceso++; 
                stats.desviosList.push({...r, tipo: 'Exceso (>Max)', excesoAbs: val - p.max}); 
            }
            else {
                stats.conformes++;
            }
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
    drawEficaciaSoluciones(datos); // Drill-down dinámico reactivo
    drawRadarFugas(stats.desviosList); // Índice de Fuga Química en Red/Radar
    
    desviosUltimoFiltro = stats.desviosList;
    const tbody = document.getElementById('ai-action-plan-tbody');
    if(tbody) {
        if(desviosUltimoFiltro.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-green-600 font-medium bg-green-50/50 rounded-lg"><i class="fa-solid fa-check-circle mr-2"></i>Cero desvíos reportados en esta selección.</td></tr>`;
        } else {
            tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-500 font-medium bg-slate-50/50 rounded-lg">Hay <b>${desviosUltimoFiltro.length} desvíos</b> detectados. Ejecuta el Análisis de IA para diagnosticar las fugas y excesos.</td></tr>`;
        }
    }
}

// ==========================================
// 6. GRÁFICAS (Chart.js)
// ==========================================
function getLineSpark(ctxId, data, color) {
    if(sparkInst[ctxId]) sparkInst[ctxId].destroy();
    const ctx = document.getElementById(ctxId)?.getContext('2d');
    if(!ctx) return;
    sparkInst[ctxId] = new Chart(ctx, {
        type: 'line', data: { labels: data.map((_,i)=>i), datasets: [{ data: data, borderColor: color, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
}

function drawSparklines(datos) {
    let t = datos.slice(0, 50).reverse();
    getLineSpark('sparkEficacia', t.length ? t.map(r=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); return p&&(parseConcen(r.concen)>=p.min&&parseConcen(r.concen)<=p.max)?1:0}) : [1], '#10b981');
    getLineSpark('sparkRiesgo', t.length ? t.map(r=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); return p&&(parseConcen(r.concen)<p.min)?1:0}) : [0], '#ef4444');
    getLineSpark('sparkExceso', t.length ? t.map(r=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); return p&&(parseConcen(r.concen)>p.max)?1:0}) : [0], '#f59e0b');
    getLineSpark('sparkTotal', t.length ? t.map(()=>Math.random()) : [1], '#273c75');
}

function drawScatter(datos) {
    let sol = tsInstances['filtro-solucion'].getValue() || 'TODAS';
    if(sol === 'TODAS') {
        let count={}; datos.forEach(r => count[r.solucion] = (count[r.solucion]||0)+1);
        sol = Object.keys(count).length ? Object.keys(count).reduce((a,b)=>count[a]>count[b]?a:b) : 'SOSA';
        document.getElementById('label-scatter').innerText = `${sol} (Predominante)`;
    } else { document.getElementById('label-scatter').innerText = sol; }

    const regla = PARAMETROS_TECNICOS.find(p => p.solucion === sol);
    const subset = datos.filter(r => r.solucion === sol).slice(0, 60).reverse();
    if(scatterInst) scatterInst.destroy();
    
    if(!regla || subset.length===0) return;
    let dataPoints = subset.map(r => parseConcen(r.concen));
    let colors = dataPoints.map(v => v < regla.min ? '#ef4444' : (v > regla.max ? '#f59e0b' : '#10b981'));

    scatterInst = new Chart(document.getElementById('scatterChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: subset.map(r => r.fecha.substring(5)),
            datasets: [
                { label: 'Muestras', data: dataPoints, showLine: false, pointBackgroundColor: colors, pointBorderColor: '#ffffff', pointBorderWidth: 1.5, pointRadius: 5, pointHoverRadius: 7 },
                { label: 'Max', data: Array(subset.length).fill(regla.max), borderColor: '#f59e0b', borderDash: [5,5], pointRadius: 0, fill: false },
                { label: 'Min', data: Array(subset.length).fill(regla.min), borderColor: '#ef4444', borderDash: [5,5], pointRadius: 0, fill: false }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }
    });
}

// DRILL-DOWN DINÁMICO DE EFICACIA POR SOLUCIÓN
function drawEficaciaSoluciones(datos) {
    if(barSolucionesInst) barSolucionesInst.destroy();
    let d = {};
    datos.forEach(r => {
        let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion);
        if(p) {
            if(!d[r.solucion]) d[r.solucion] = { t:0, c:0 };
            d[r.solucion].t++;
            let v = parseConcen(r.concen); if(v>=p.min && v<=p.max) d[r.solucion].c++;
        }
    });
    
    let res = Object.keys(d).map(k => ({ 
        n: k, 
        p: Number(((d[k].c / d[k].t) * 100).toFixed(1)), 
        t: d[k].t 
    })).sort((a,b)=>b.t - a.t).slice(0, 5);

    if(res.length === 0) return;

    // Colores dinámicos según el % de eficacia (Verde >=90%, Amarillo 70-89%, Rojo <70%)
    let barColors = res.map(x => x.p >= 90 ? '#10b981' : (x.p >= 70 ? '#f59e0b' : '#ef4444'));

    barSolucionesInst = new Chart(document.getElementById('barSolucionesChart').getContext('2d'), {
        type: 'bar',
        data: { 
            labels: res.map(x => `${x.n} (${x.p}%)`), 
            datasets: [{ 
                data: res.map(x => x.p), 
                backgroundColor: barColors, 
                borderRadius: 4,
                barThickness: 16
            }] 
        },
        options: { 
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                tooltip: { callbacks: { label: function(c) { return ` Conformidad: ${c.raw}%`; } } }
            }, 
            scales: { 
                x: { max: 100, grid: { color: '#f1f5f9' }, ticks: { callback: v => v + '%' } }, 
                y: { grid: { display: false }, ticks: { color: '#475569', font: {size: 10, weight: '600'} } } 
            } 
        }
    });
}

// ÍNDICE DE FUGA QUÍMICA (GRÁFICA DE RED / RADAR)
function drawRadarFugas(desvios) {
    if(fugaChartInst) fugaChartInst.destroy();
    const msgObj = document.getElementById('fuga-empty-msg');
    
    let excesos = desvios.filter(d => d.tipo.includes('Exceso'));
    if(excesos.length === 0) { if(msgObj) msgObj.classList.remove('hidden'); return; }
    if(msgObj) msgObj.classList.add('hidden');

    let fugas = {};
    excesos.forEach(e => {
        if(!fugas[e.solucion]) fugas[e.solucion] = 0;
        fugas[e.solucion] += e.excesoAbs; // Sumatoria matemática de exceso
    });

    let labels = Object.keys(fugas); 
    let data = Object.values(fugas);

    fugaChartInst = new Chart(document.getElementById('fugaQuimicaChart').getContext('2d'), {
        type: 'radar',
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Volumen Excedente', 
                data: data, 
                backgroundColor: 'rgba(245, 158, 11, 0.25)', 
                borderColor: '#f59e0b',
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#f59e0b',
                pointBorderWidth: 2,
                pointRadius: 4,
                borderWidth: 2
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                tooltip: { callbacks: { label: function(c) { return ` Exceso Acumulado: ${c.raw.toFixed(2)} pts`; } } }
            },
            scales: {
                r: {
                    angleLines: { color: '#e2e8f0' },
                    grid: { color: '#e2e8f0', circular: true },
                    pointLabels: { font: { size: 9, weight: 'bold' }, color: '#475569' },
                    ticks: { display: false, beginAtZero: true }
                }
            }
        }
    });
}

// ==========================================
// 7. ANÁLISIS DE IA CON DATOS DE FUGAS (ROBUSTO)
// ==========================================
function obtenerApiKeySegura() { return localStorage.getItem('poes_gemini_key') || ''; }

function actualizarBadgeIA() {
    const b = document.getElementById('badge-ia-status'); if(!b) return;
    if(obtenerApiKeySegura()) {
        b.innerHTML = `<i class="fa-solid fa-check text-green-500 mr-1"></i> IA Lista`;
        b.className = "text-[10px] font-bold px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200 shadow-sm";
    } else {
        b.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> Falta API Key`;
        b.className = "text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-400 border border-slate-200 shadow-sm";
    }
}

async function dispararAnalisisIA() {
    const tbody = document.getElementById('ai-action-plan-tbody');
    if(desviosUltimoFiltro.length === 0) return;
    if(!obtenerApiKeySegura()) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-500 font-bold bg-slate-50 rounded-lg">Haz clic en <b>"IA Config"</b> arriba para ingresar tu API Key de Google AI Studio.</td></tr>`;
        return;
    }

    tbody.innerHTML = `<tr><td colspan="3" class="py-10 text-center text-blue-600 font-bold animate-pulse bg-blue-50/50 rounded-lg"><i class="fa-solid fa-microchip mr-2"></i>Procesando índices de fuga con 3.5 Flash-Lite...</td></tr>`;

    let muestraIA = desviosUltimoFiltro.slice(0, 20).map(r => `EQ: ${r.equipo} | SOL: ${r.solucion} \vert{} FALLA:${r.tipo} | HR: ${r.hora} \vert{} OP:${r.operario}`);
    
    const prompt = `Eres un Analista de Datos y Pérdidas POES en Lácteos San Antonio. Analiza esta muestra estadística de desvíos y excesos:\n${muestraIA.join('\n')}\n\nREGLAS ESTRICTAS DE NEGOCIO:\n1. Tu tarea es EXCLUSIVAMENTE analizar los datos estadísticos y porcentajes de sobredosificación (ej: "El X% de tus pérdidas químicas provienen de...").\n2. ESTÁ TOTAL Y ABSOLUTAMENTE PROHIBIDO dar recomendaciones mecánicas, operativas o de mantenimiento (no digas ajustar bombas ni calibrar equipos).\n3. Devuelve un JSON estricto con un arreglo de objetos (máximo 3). Estructura exacta:\n[{"desvio": "Hallazgo principal", "analisis_datos": "Análisis estadístico del impacto o distribución de la fuga", "responsable": "Nombre del rol u operario implicado"}]\nSin texto adicional ni markdown (\`\`\`json).`;

    // CAMBIO DE MODELO APLICADO: 3.5 Flash-Lite
    const modeloIA = 'gemini-3.5-flash-lite';

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modeloIA}:generateContent?key=${obtenerApiKeySegura()}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error?.message || `Error HTTP ${res.status}`);
        }
        
        const jsonRes = await res.json();
        let rawText = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
        
        let plan = JSON.parse(rawText);

        let html = '';
        plan.forEach(item => {
            html += `<tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0">
                        <td class="py-4 px-3 align-top text-amber-600 font-bold text-[11px]"><i class="fa-solid fa-magnifying-glass-chart mr-1.5"></i> ${item.desvio}</td>
                        <td class="py-4 px-3 align-top text-slate-600 text-[11px] leading-relaxed">${item.analisis_datos}</td>
                        <td class="py-4 px-3 align-top text-slate-500 font-mono text-[10px]"><i class="fa-regular fa-user mr-1"></i> ${item.responsable}</td>
                     </tr>`;
        });
        tbody.innerHTML = html;

    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-6 px-6 text-center text-red-500 font-bold text-[11px] bg-red-50 rounded-lg"><i class="fa-solid fa-triangle-exclamation mr-1"></i> <b>Fallo IA:</b> ${err.message}. Verifica tu API Key.</td></tr>`;
    }
}
// ==========================================
// 8. MODALES
// ==========================================
function abrirModalDetalle(tipo) {
    const modal = document.getElementById('modal-detalle'); const tbody = document.getElementById('modal-tbody'); 
    if(!modal || !tbody) return;
    tbody.innerHTML = ''; const datos = obtenerDatosFiltrados(); let rsl = [];
    if(tipo === 'riesgo') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)<p.min;});
    if(tipo === 'exceso') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)>p.max;});
    
    document.getElementById('modal-titulo').innerText = tipo === 'riesgo' ? "Desvíos por Riesgo (< Mínimo)" : "Desvíos por Sobredosificación (> Máximo)";
    if(rsl.length===0) { tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-500 font-bold bg-slate-50">Sin registros de desviación en esta selección.</td></tr>`; } 
    else {
        rsl.slice(0, 100).forEach(r => {
            tbody.innerHTML += `<tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0">
                <td class="py-3 px-6 whitespace-nowrap">${r.fecha} ${r.hora?r.hora.substring(0,5):''}</td><td class="py-3 px-6 font-bold text-slate-800">${r.equipo}</td>
                <td class="py-3 px-6 text-slate-600">${r.solucion}</td><td class="py-3 px-6 text-center font-black ${tipo==='riesgo'?'text-red-500':'text-amber-500'}">${r.concen}</td>
                <td class="py-3 px-6 text-[10px] text-slate-500">${r.operario || r.laboratorista}</td>
            </tr>`;
        });
    }
    modal.classList.remove('hidden');
}
function cerrarModalDetalle() { document.getElementById('modal-detalle').classList.add('hidden'); }
function abrirConfigIA() { document.getElementById('input-api-key').value = obtenerApiKeySegura(); document.getElementById('modal-config-ia').classList.remove('hidden'); }
function cerrarConfigIA() { document.getElementById('modal-config-ia').classList.add('hidden'); }
function guardarApiKey() { localStorage.setItem('poes_gemini_key', document.getElementById('input-api-key').value.trim()); cerrarConfigIA(); actualizarBadgeIA(); }
function limpiarApiKey() { localStorage.removeItem('poes_gemini_key'); cerrarConfigIA(); actualizarBadgeIA(); }
