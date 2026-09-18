// ==========================================
// 1. CREDENCIALES Y CONFIGURACIÓN
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';
const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

const PARAMETROS_TECNICOS = [
    { solucion: 'SOSA', min: 1.5, max: 2.5 }, { solucion: 'SOSA (MADRE)', min: 35, max: 50 },
    { solucion: 'ÁCIDO NÍTRICO', min: 0.8, max: 2.0 }, { solucion: 'ÁCIDO NÍTRICO MADRE', min: 55, max: 65 },
    { solucion: 'AGUA ENJUAGUE', min: 6.5, max: 7.6 }, { solucion: 'PEROXIDO', min: 35, max: 45 },
    { solucion: 'ÁCIDO PERACÉTICO', min: 200, max: 450 }, { solucion: 'BACOXIN', min: 100, max: 200 },
    { solucion: 'SOSA (CENTRO ACOPIO)', min: 20, max: 30 }, { solucion: 'SOSA (PASIVACIÓN)', min: 2.5, max: 5 },
    { solucion: 'ÁCIDO (PASIVACIÓN)', min: 8, max: 15 }, { solucion: 'ÁCIDO FOSFÓRICO', min: 0.8, max: 2.0 },
    { solucion: 'CLORO', min: 0, max: 200 }
];

let listaRegistros = []; let desviosUltimoFiltro = []; let tsInstances = {}; 
let scatterInst = null, barSolucionesInst = null, fugaChartInst = null, historicoInst = null, quadrantInst = null;
let sparkInst = { ef: null, ri: null, ex: null, to: null };

Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b'; 
Chart.defaults.scale.grid.color = '#f1f5f9';

// PLUGIN: Cuadrante Mágico (Estilo Gartner)
const quadrantPlugin = {
    id: 'quadrantPlugin',
    beforeDraw(chart) {
        if(chart.config.options.plugins.quadrantPlugin === false) return;
        const { ctx, chartArea: { left, top, right, bottom }, scales: { x, y } } = chart;
        
        // Línea vertical en 85% de Eficacia (Límite aceptable)
        const midX = x.getPixelForValue(85); 
        // Línea horizontal en la mitad del eje Y dinámico
        const midY = y.getPixelForValue((y.max + y.min) / 2);
        
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#cbd5e1'; // slate-300
        ctx.setLineDash([4, 4]);
        
        // Eje vertical (X)
        if(midX > left && midX < right) { ctx.beginPath(); ctx.moveTo(midX, top); ctx.lineTo(midX, bottom); ctx.stroke(); }
        // Eje horizontal (Y)
        if(midY > top && midY < bottom) { ctx.beginPath(); ctx.moveTo(left, midY); ctx.lineTo(right, midY); ctx.stroke(); }
        
        // Textos Estratégicos (Background Quadrants)
        ctx.fillStyle = '#94a3b8'; // slate-400
        ctx.font = 'bold 9px Inter';
        ctx.fillText('CRÍTICO (ALTO RIESGO)', left + 10, top + 15); // Top Left
        ctx.fillText('LÍDERES (ESTABLES)', midX + 10, top + 15); // Top Right
        ctx.fillText('A MEJORAR (BAJO VOL)', left + 10, midY + 15); // Bottom Left
        ctx.fillText('NICHO (CONTROLADO)', midX + 10, midY + 15); // Bottom Right
        
        ctx.restore();
    }
};
Chart.register(quadrantPlugin);

// ==========================================
// 2. UTILIDADES
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
    if (l.includes('SOSA (MADRE)')) return 'SOSA (MADRE)'; if (l.includes('CENTRO ACOPIO')) return 'SOSA (CENTRO ACOPIO)';
    if (l.includes('SOSA (PASIVACION')) return 'SOSA (PASIVACIÓN)'; if (l.includes('SOSA')) return 'SOSA';
    if (l.includes('NITRICO MADRE')) return 'ÁCIDO NÍTRICO MADRE'; if (l.includes('ACIDO NITRICO')) return 'ÁCIDO NÍTRICO';
    if (l.includes('PERACETICO')) return 'ÁCIDO PERACÉTICO'; if (l.includes('FOSFORICO')) return 'ÁCIDO FOSFÓRICO';
    if (l.includes('ACIDO (PASIVACION')) return 'ÁCIDO (PASIVACIÓN)'; if (l.includes('ENJUAGUE')) return 'AGUA ENJUAGUE';
    if (l.includes('PEROXIDO')) return 'PEROXIDO'; if (l.includes('BACOXIN')) return 'BACOXIN';
    if (l.includes('CLORO')) return 'CLORO'; return String(nombre || 'S/N').trim().toUpperCase();
}

// ==========================================
// 3. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    actualizarBadgeIA(); initFiltrosInteligentes(); 
    try {
        await cargarSupabase();
        setTimeout(() => { document.getElementById('loader')?.classList.add('opacity-0', 'pointer-events-none'); document.getElementById('dashboard-content')?.classList.remove('opacity-0'); }, 500);
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
    actualizarOpcionesFiltros(); renderizarCore();
}

// ==========================================
// 4. FILTROS TOM SELECT
// ==========================================
function initFiltrosInteligentes() {
    ['filtro-equipo', 'filtro-solucion', 'filtro-anio', 'filtro-mes'].forEach(id => {
        tsInstances[id] = new TomSelect(`#${id}`, { create: false, sortField: { field: "text", direction: "asc" } });
        tsInstances[id].on('change', renderizarCore);
    });
}
function actualizarOpcionesFiltros() {
    let eqSet = new Set(), solSet = new Set(), anSet = new Set();
    listaRegistros.forEach(r => { if (r.equipo) eqSet.add(r.equipo); if (r.solucion) solSet.add(r.solucion); if (r.fecha) anSet.add(r.fecha.substring(0, 4)); });
    
    let currEq = tsInstances['filtro-equipo'].getValue() || 'TODOS'; let currSol = tsInstances['filtro-solucion'].getValue() || 'TODAS'; let currAn = tsInstances['filtro-anio'].getValue() || 'TODOS';
    
    tsInstances['filtro-equipo'].clearOptions(); tsInstances['filtro-equipo'].addOption({value: 'TODOS', text: 'Todos los Equipos'});
    Array.from(eqSet).sort().forEach(e => tsInstances['filtro-equipo'].addOption({value: e, text: e})); tsInstances['filtro-equipo'].setValue(currEq, true);
    
    tsInstances['filtro-solucion'].clearOptions(); tsInstances['filtro-solucion'].addOption({value: 'TODAS', text: 'Todas las Soluciones'});
    Array.from(solSet).sort().forEach(s => tsInstances['filtro-solucion'].addOption({value: s, text: s})); tsInstances['filtro-solucion'].setValue(currSol, true);
    
    tsInstances['filtro-anio'].clearOptions(); tsInstances['filtro-anio'].addOption({value: 'TODOS', text: 'Todos los Años'});
    Array.from(anSet).sort().reverse().forEach(a => tsInstances['filtro-anio'].addOption({value: a, text: a})); tsInstances['filtro-anio'].setValue(currAn, true);
}
function obtenerDatosFiltrados() {
    const s = tsInstances['filtro-solucion'].getValue(); const e = tsInstances['filtro-equipo'].getValue(); const a = tsInstances['filtro-anio'].getValue(); const m = tsInstances['filtro-mes'].getValue();
    return listaRegistros.filter(r => {
        let mMes = true;
        if(m && m !== 'TODOS') {
            let mesBD = r.fecha ? r.fecha.substring(5, 7) : ''; let mapMeses = {'01':'ENERO','02':'FEBRERO','03':'MARZO','04':'ABRIL','05':'MAYO','06':'JUNIO','07':'JULIO','08':'AGOSTO','09':'SEPTIEMBRE','10':'OCTUBRE','11':'NOVIEMBRE','12':'DICIEMBRE'};
            mMes = (mesBD === m || n(r.mes) === mapMeses[m] || n(r.mes).includes(mapMeses[m]));
        }
        return (!s || s === 'TODAS' || r.solucion === s) && (!e || e === 'TODOS' || r.equipo === e) && (!a || a === 'TODOS' || (r.fecha && r.fecha.startsWith(a))) && mMes;
    });
}

// ==========================================
// 5. RENDERIZADO GENERAL Y KPIs
// ==========================================
function renderizarCore() {
    const datos = obtenerDatosFiltrados();
    let stats = { conformes: 0, riesgo: 0, exceso: 0, desviosList: [] };

    datos.forEach(r => {
        const p = PARAMETROS_TECNICOS.find(x => x.solucion === r.solucion);
        if (p) {
            const val = parseConcen(r.concen);
            if (val < p.min) { stats.riesgo++; stats.desviosList.push({...r, tipo: 'Riesgo (<Min)', excesoAbs: 0}); }
            else if (val > p.max) { stats.exceso++; stats.desviosList.push({...r, tipo: 'Exceso (>Max)', excesoAbs: val - p.max}); }
            else { stats.conformes++; }
        }
    });

    let total = datos.length; let eficacia = total > 0 ? (((stats.conformes) / total) * 100).toFixed(1) : 0;
    document.getElementById('kpi-eficacia').innerText = eficacia + '%'; document.getElementById('kpi-riesgo').innerText = stats.riesgo.toLocaleString();
    document.getElementById('kpi-exceso').innerText = stats.exceso.toLocaleString(); document.getElementById('kpi-total').innerText = total.toLocaleString();

    drawSparklines(datos); drawScatterPremium(datos); drawEficaciaSoluciones(datos); drawRadarFugas(stats.desviosList); 
    drawTendenciaHistorica(datos); drawMagicQuadrant(datos); // NUEVOS GRÁFICOS
    
    desviosUltimoFiltro = stats.desviosList;
    const tbody = document.getElementById('ai-action-plan-tbody');
    if(tbody) {
        if(desviosUltimoFiltro.length === 0) { tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-green-600 font-medium bg-green-50/50 rounded-lg"><i class="fa-solid fa-check-circle mr-2"></i>Cero desvíos reportados.</td></tr>`; } 
        else { tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-500 font-medium bg-slate-50/50 rounded-lg">Hay <b>${desviosUltimoFiltro.length} desvíos</b> detectados. Ejecuta el Motor IA para la auditoría técnica.</td></tr>`; }
    }
}

// ==========================================
// 6. LIBRERÍA DE GRÁFICAS (CHART.JS)
// ==========================================
function getLineSpark(ctxId, data, color) {
    if(sparkInst[ctxId]) sparkInst[ctxId].destroy(); const ctx = document.getElementById(ctxId)?.getContext('2d'); if(!ctx) return;
    sparkInst[ctxId] = new Chart(ctx, { type: 'line', data: { labels: data.map((_,i)=>i), datasets: [{ data: data, borderColor: color, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false }, quadrantPlugin: false }, scales: { x: { display: false }, y: { display: false } } } });
}
function drawSparklines(datos) {
    let t = datos.slice(0, 50).reverse();
    getLineSpark('sparkEficacia', t.length ? t.map(r=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); return p&&(parseConcen(r.concen)>=p.min&&parseConcen(r.concen)<=p.max)?1:0}) : [1], '#10b981');
    getLineSpark('sparkRiesgo', t.length ? t.map(r=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); return p&&(parseConcen(r.concen)<p.min)?1:0}) : [0], '#ef4444');
    getLineSpark('sparkExceso', t.length ? t.map(r=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); return p&&(parseConcen(r.concen)>p.max)?1:0}) : [0], '#f59e0b');
    getLineSpark('sparkTotal', t.length ? t.map(()=>Math.random()) : [1], '#273c75');
}

// 6.1. SCATTER PREMIUM (TOOLTIPS MEJORADOS)
function drawScatterPremium(datos) {
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
                { label: 'Muestras', data: dataPoints, showLine: false, pointBackgroundColor: colors, pointBorderColor: '#ffffff', pointBorderWidth: 1.5, pointRadius: 5, pointHoverRadius: 8, hoverBorderWidth: 2 },
                { label: 'Max', data: Array(subset.length).fill(regla.max), borderColor: '#f59e0b', borderDash: [5,5], pointRadius: 0, fill: false, borderWidth: 1.5 },
                { label: 'Min', data: Array(subset.length).fill(regla.min), borderColor: '#ef4444', borderDash: [5,5], pointRadius: 0, fill: false, borderWidth: 1.5 }
            ]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { 
                quadrantPlugin: false, // Desactivar plugin aquí
                legend: { display: false },
                tooltip: { 
                    backgroundColor: '#ffffff', titleColor: '#273c75', bodyColor: '#475569', 
                    borderColor: '#e2e8f0', borderWidth: 1, padding: 12, boxPadding: 6,
                    titleFont: { size: 12, family: 'Inter', weight: 'bold' }, bodyFont: { size: 11, family: 'Inter' },
                    displayColors: false, cornerRadius: 8,
                    callbacks: { 
                        title: function(ctx) { return `Fecha: ${subset[ctx[0].dataIndex].fecha}`; },
                        label: function(ctx) { 
                            let obj = subset[ctx.dataIndex];
                            return [
                                `Químico: ${obj.solucion} (${ctx.raw}%)`, 
                                `Límites: Min ${regla.min}% - Max ${regla.max}%`, 
                                `Hora: ${obj.hora ? obj.hora.substring(0,5) : 'N/A'}`, 
                                `Operador: ${obj.operario || obj.laboratorista || 'N/A'}`
                            ];
                        } 
                    } 
                }
            }, 
            scales: { y: { grid: { color: '#f8fafc' } }, x: { grid: { display: false } } } 
        }
    });
}

// 6.2 MATRIZ MÁGICA (GARTNER) PARA SOLUCIONES
function drawMagicQuadrant(datos) {
    if(quadrantInst) quadrantInst.destroy();
    if(datos.length === 0) return;

    let evalSoluciones = {};
    datos.forEach(r => {
        let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion);
        if(p) {
            if(!evalSoluciones[r.solucion]) evalSoluciones[r.solucion] = { total: 0, ok: 0 };
            evalSoluciones[r.solucion].total++;
            let v = parseConcen(r.concen);
            if(v >= p.min && v <= p.max) evalSoluciones[r.solucion].ok++;
        }
    });

    let scatterData = []; let tooltipsData = [];
    Object.keys(evalSoluciones).forEach(sol => {
        let vol = evalSoluciones[sol].total;
        let efi = (evalSoluciones[sol].ok / vol) * 100;
        scatterData.push({ x: efi, y: vol });
        tooltipsData.push(sol);
    });

    quadrantInst = new Chart(document.getElementById('quadrantChart').getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Soluciones', data: scatterData, 
                backgroundColor: '#6366f1', borderColor: '#ffffff', borderWidth: 2, pointRadius: 7, pointHoverRadius: 9
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                quadrantPlugin: true, // Plugin Activo
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b', titleFont: { size: 11 }, bodyFont: { size: 11 }, padding: 10,
                    callbacks: {
                        label: function(ctx) { return `${tooltipsData[ctx.dataIndex]}: Eficacia ${ctx.raw.x.toFixed(1)}% | Muestras: ${ctx.raw.y}`; }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Eficacia Sanitaria (%)', font: {size: 10, weight: 'bold'}, color: '#64748b' }, min: 0, max: 100, grid: { display: false } },
                y: { title: { display: true, text: 'Volumen Operativo (Muestras)', font: {size: 10, weight: 'bold'}, color: '#64748b' }, min: 0, grid: { display: false } }
            }
        }
    });
}

// 6.3 TENDENCIA HISTÓRICA (ÁREA)
function drawTendenciaHistorica(datos) {
    if(historicoInst) historicoInst.destroy();
    
    // Agrupar por fecha
    let hist = {};
    datos.forEach(r => {
        let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion);
        if(p) {
            if(!hist[r.fecha]) hist[r.fecha] = { t:0, c:0 };
            hist[r.fecha].t++;
            let v = parseConcen(r.concen); if(v>=p.min && v<=p.max) hist[r.fecha].c++;
        }
    });

    let fechas = Object.keys(hist).sort(); // Orden cronológico
    if(fechas.length === 0) return;
    
    // Si hay muchos días, tomar los últimos 30
    fechas = fechas.slice(-30); 
    let eficacias = fechas.map(f => (hist[f].c / hist[f].t) * 100);

    let ctx = document.getElementById('historicoChart').getContext('2d');
    
    // Crear Gradiente
    let gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)'); // Verde suave
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    historicoInst = new Chart(ctx, {
        type: 'line',
        data: { labels: fechas.map(f => f.substring(5)), datasets: [{ label: 'Conformidad Diaria', data: eficacias, borderColor: '#10b981', backgroundColor: gradient, borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3 }] },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { quadrantPlugin: false, legend: { display: false }, tooltip: { callbacks: { label: c => ` Eficacia: ${c.raw.toFixed(1)}%` } } },
            scales: { y: { min: 0, max: 100, grid: { color: '#f1f5f9' }, ticks: { callback: v => v + '%' } }, x: { grid: { display: false } } }
        }
    });
}

function drawEficaciaSoluciones(datos) {
    if(barSolucionesInst) barSolucionesInst.destroy();
    let d = {}; datos.forEach(r => { let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(p) { if(!d[r.solucion]) d[r.solucion] = { t:0, c:0 }; d[r.solucion].t++; let v = parseConcen(r.concen); if(v>=p.min && v<=p.max) d[r.solucion].c++; } });
    let res = Object.keys(d).map(k => ({ n: k, p: Number(((d[k].c / d[k].t) * 100).toFixed(1)), t: d[k].t })).sort((a,b)=>b.t - a.t).slice(0, 5); if(res.length === 0) return;
    let barColors = res.map(x => x.p >= 90 ? '#10b981' : (x.p >= 70 ? '#f59e0b' : '#ef4444'));
    barSolucionesInst = new Chart(document.getElementById('barSolucionesChart').getContext('2d'), { type: 'bar', data: { labels: res.map(x => `${x.n} (${x.p}%)`), datasets: [{ data: res.map(x => x.p), backgroundColor: barColors, borderRadius: 4, barThickness: 16 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { quadrantPlugin: false, legend: { display: false } }, scales: { x: { max: 100, grid: { color: '#f1f5f9' } }, y: { grid: { display: false }, ticks: { color: '#475569', font: {size: 10, weight: '600'} } } } } });
}

function drawRadarFugas(desvios) {
    if(fugaChartInst) fugaChartInst.destroy(); const msgObj = document.getElementById('fuga-empty-msg');
    let excesos = desvios.filter(d => d.tipo.includes('Exceso'));
    if(excesos.length === 0) { if(msgObj) msgObj.classList.remove('hidden'); return; } if(msgObj) msgObj.classList.add('hidden');
    let fugas = {}; excesos.forEach(e => { if(!fugas[e.solucion]) fugas[e.solucion] = 0; fugas[e.solucion] += e.excesoAbs; });
    let labels = Object.keys(fugas); let data = Object.values(fugas);
    fugaChartInst = new Chart(document.getElementById('fugaQuimicaChart').getContext('2d'), { type: 'radar', data: { labels: labels, datasets: [{ label: 'Índice de Fuga (Σ%)', data: data, backgroundColor: 'rgba(245, 158, 11, 0.25)', borderColor: '#f59e0b', pointBackgroundColor: '#ffffff', pointBorderColor: '#f59e0b', pointBorderWidth: 2, pointRadius: 4, borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { quadrantPlugin: false, legend: { display: false }, tooltip: { callbacks: { label: c => ` Volumen Desperdiciado: ${c.raw.toFixed(2)} Índice de Fuga (Σ%)` } } }, scales: { r: { angleLines: { color: '#e2e8f0' }, grid: { color: '#e2e8f0', circular: true }, pointLabels: { font: { size: 9, weight: 'bold' }, color: '#475569' }, ticks: { display: false, beginAtZero: true } } } } });
}

// ==========================================
// 7. MOTOR MATEMÁTICO + GEMINI 3.5 FLASH-LITE
// ==========================================
function obtenerApiKeySegura() { return localStorage.getItem('poes_gemini_key') || ''; }
function actualizarBadgeIA() {
    const b = document.getElementById('badge-ia-status'); if(!b) return;
    if(obtenerApiKeySegura()) { b.innerHTML = `<i class="fa-solid fa-check text-green-500 mr-1"></i> IA Lista`; b.className = "text-[10px] font-bold px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200 shadow-sm"; } 
    else { b.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> Falta API Key`; b.className = "text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-400 border border-slate-200 shadow-sm"; }
}

async function dispararAnalisisIA() {
    const tbody = document.getElementById('ai-action-plan-tbody');
    if(desviosUltimoFiltro.length === 0) return;
    if(!obtenerApiKeySegura()) { tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-500 font-bold bg-slate-50 rounded-lg">Haz clic en <b>"IA Config"</b> arriba para ingresar tu API Key.</td></tr>`; return; }
    tbody.innerHTML = `<tr><td colspan="3" class="py-10 text-center text-blue-600 font-bold animate-pulse bg-blue-50/50 rounded-lg"><i class="fa-solid fa-microchip mr-2"></i>Evaluando matemáticas de fuga con 3.5 Flash-Lite...</td></tr>`;

    let excesos = desviosUltimoFiltro.filter(d => d.tipo.includes('Exceso'));
    let totalExcesos = excesos.length;
    let statsFugas = {}; let opsStats = {};
    
    excesos.forEach(e => {
        if(!statsFugas[e.solucion]) statsFugas[e.solucion] = { conteo: 0, volumenPerdido: 0 };
        statsFugas[e.solucion].conteo++; statsFugas[e.solucion].volumenPerdido += e.excesoAbs;
        let op = e.operario || e.laboratorista || 'Desconocido'; opsStats[op] = (opsStats[op] || 0) + 1;
    });

    let desgloseTexto = `TOTAL EVENTOS POR EXCESO (SOBREDOSIFICACIÓN): ${totalExcesos}\n`;
    Object.keys(statsFugas).forEach(sol => {
        let pct = ((statsFugas[sol].conteo / totalExcesos) * 100).toFixed(1);
        desgloseTexto += `- Químico ${sol}: Responsable del ${pct}% de los eventos (ocurrió ${statsFugas[sol].conteo} veces). Volumen Desperdiciado Acumulado: ${statsFugas[sol].volumenPerdido.toFixed(2)}.\n`;
    });
    let opsArray = Object.keys(opsStats).map(op => `${op} (${opsStats[op]} eventos)`).join(', ');

    const prompt = `Eres Analista de Datos en Lácteos San Antonio. El sistema calculó la matemática exacta de las fugas. NO recalcules, usa ESTOS DATOS DUROS:\n\n${desgloseTexto}\nOperadores implicados: ${opsArray}\n\nREGLAS ESTRICTAS:\n1. Usa los porcentajes exactos provistos.\n2. Redacta el análisis explicando qué químico representa el mayor desperdicio.\n3. PROHIBIDO dar recomendaciones operativas mecánicas (no digas calibrar, ajustar equipos).\n4. Devuelve un JSON estricto con un arreglo de objetos (máx 3). Formato:\n[{"desvio": "Hallazgo principal", "analisis_datos": "Análisis estadístico", "responsable": "Nombre del operario"}]\nSin markdown adicional.`;
    const modeloIA = 'gemini-3.5-flash-lite'; // VERSIÓN EXIGIDA

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modeloIA}:generateContent?key=${obtenerApiKeySegura()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        if (!res.ok) { const errData = await res.json(); throw new Error(errData.error?.message || `Error HTTP ${res.status}`); }
        const jsonRes = await res.json(); let rawText = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim(); let plan = JSON.parse(rawText);
        
        let html = '';
        plan.forEach(item => { html += `<tr class="hover:bg-slate-50 border-b border-slate-100 last:border-0"><td class="py-4 px-3 align-top text-amber-600 font-bold text-[11px]"><i class="fa-solid fa-magnifying-glass-chart mr-1.5"></i> ${item.desvio}</td><td class="py-4 px-3 align-top text-slate-600 text-[11px] leading-relaxed">${item.analisis_datos}</td><td class="py-4 px-3 align-top text-slate-500 font-mono text-[10px]"><i class="fa-regular fa-user mr-1"></i> ${item.responsable}</td></tr>`; });
        tbody.innerHTML = html;
    } catch(err) { tbody.innerHTML = `<tr><td colspan="3" class="py-6 px-6 text-center text-red-500 font-bold text-[11px] bg-red-50 rounded-lg"><i class="fa-solid fa-triangle-exclamation mr-1"></i> <b>Fallo IA:</b> ${err.message}.</td></tr>`; }
}

// ==========================================
// 8. MODALES
// ==========================================
function abrirModalDetalle(tipo) {
    const modal = document.getElementById('modal-detalle'); const tbody = document.getElementById('modal-tbody'); if(!modal || !tbody) return; tbody.innerHTML = ''; const datos = obtenerDatosFiltrados(); let rsl = [];
    if(tipo === 'riesgo') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)<p.min;});
    if(tipo === 'exceso') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)>p.max;});
    document.getElementById('modal-titulo').innerText = tipo === 'riesgo' ? "Desvíos por Riesgo (< Mínimo)" : "Desvíos por Sobredosificación (> Máximo)";
    if(rsl.length===0) { tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-500 font-bold bg-slate-50">Sin registros.</td></tr>`; } 
    else { rsl.slice(0, 100).forEach(r => { tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-100 last:border-0"><td class="py-3 px-6">${r.fecha} ${r.hora?r.hora.substring(0,5):''}</td><td class="py-3 px-6 font-bold text-slate-800">${r.equipo}</td><td class="py-3 px-6 text-slate-600">${r.solucion}</td><td class="py-3 px-6 text-center font-black ${tipo==='riesgo'?'text-red-500':'text-amber-500'}">${r.concen}</td><td class="py-3 px-6 text-[10px] text-slate-500">${r.operario || r.laboratorista}</td></tr>`; }); }
    modal.classList.remove('hidden');
}
function cerrarModalDetalle() { document.getElementById('modal-detalle').classList.add('hidden'); }
function abrirConfigIA() { document.getElementById('input-api-key').value = obtenerApiKeySegura(); document.getElementById('modal-config-ia').classList.remove('hidden'); }
function cerrarConfigIA() { document.getElementById('modal-config-ia').classList.add('hidden'); }
function guardarApiKey() { localStorage.setItem('poes_gemini_key', document.getElementById('input-api-key').value.trim()); cerrarConfigIA(); actualizarBadgeIA(); }
function limpiarApiKey() { localStorage.removeItem('poes_gemini_key'); cerrarConfigIA(); actualizarBadgeIA(); }
