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
let fpInstancia = null; 
let fechaInicioGlobal = null; let fechaFinGlobal = null; 

let barSolucionesInst = null, fugaChartInst = null, historicoInst = null, quadrantInst = null, drilldownInst = null;
let turnoQuimInst = null, turnoOpInst = null;
let expandedChartInst = null; // NUEVO: Instancia para el modo enfoque
let sparkInst = { ef: null, co: null, ri: null, ex: null, to: null };
let heatmapCache = {}; 

Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b'; 
Chart.defaults.scale.grid.color = '#f1f5f9';

const quadrantPlugin = {
    id: 'quadrantPlugin',
    beforeDraw(chart) {
        if (!chart.chartArea) return; 
        const { ctx, chartArea: { left, top, right, bottom }, scales: { x } } = chart;
        const midX = x.getPixelForValue(85); const midY = top + ((bottom - top) / 2);
        ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([4, 4]);
        if(midX > left && midX < right) { ctx.beginPath(); ctx.moveTo(midX, top); ctx.lineTo(midX, bottom); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(left, midY); ctx.lineTo(right, midY); ctx.stroke();
        ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 9px Inter'; ctx.textAlign = 'left';
        ctx.fillText('CRÍTICO (ALTO RIESGO)', left + 10, top + 15); ctx.fillText('A MEJORAR (BAJO VOL)', left + 10, midY + 15); 
        if(midX > left) { ctx.textAlign = 'right'; ctx.fillText('LÍDERES (ESTABLES)', right - 10, top + 15); ctx.fillText('NICHO (CONTROLADO)', right - 10, midY + 15); }
        ctx.restore();
    }
};

function n(t) { return t ? String(t).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : ''; }
function parseConcen(v) { let num = parseFloat(String(v).replace(',', '.')); return isNaN(num) ? 0 : num; }
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
    actualizarBadgeIA(); 
    initFiltrosInteligentes(); 
    initRangoFechas(); 
    
    try {
        await cargarSupabase();
        setTimeout(() => { document.getElementById('loader')?.classList.add('opacity-0', 'pointer-events-none'); document.getElementById('dashboard-content')?.classList.remove('opacity-0'); }, 500);
    } catch (e) { 
        console.error("Error BD:", e); 
        setTimeout(() => { document.getElementById('loader')?.classList.add('opacity-0', 'pointer-events-none'); document.getElementById('dashboard-content')?.classList.remove('opacity-0'); }, 500);
    }
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
// 4. NUEVO SISTEMA DE FILTROS (BLINDADO)
// ==========================================
function initFiltrosInteligentes() {
    ['filtro-equipo', 'filtro-solucion'].forEach(id => { 
        const el = document.getElementById(id);
        if(el) { tsInstances[id] = new TomSelect(el, { create: false, sortField: { field: "text", direction: "asc" } }); tsInstances[id].on('change', renderizarCore); }
    });
}

function initRangoFechas() {
    fpInstancia = flatpickr("#filtro-fechas", {
        mode: "range", dateFormat: "Y-m-d", locale: "es",
        onChange: function(selectedDates, dateStr, instance) {
            if (selectedDates.length === 2) {
                fechaInicioGlobal = instance.formatDate(selectedDates[0], "Y-m-d"); fechaFinGlobal = instance.formatDate(selectedDates[1], "Y-m-d");
                limpiarEstilosBotonesRapidos(); renderizarCore();
            } else if (selectedDates.length === 0) {
                fechaInicioGlobal = null; fechaFinGlobal = null;
                pintarBotonRapido('btn-todos'); renderizarCore();
            }
        }
    });
}

function formatoFecha(d) { let ms = d.getMonth() + 1; let dy = d.getDate(); return `${d.getFullYear()}-${ms < 10 ? '0'+ms : ms}-${dy < 10 ? '0'+dy : dy}`; }
function limpiarEstilosBotonesRapidos() { document.querySelectorAll('.rango-btn').forEach(btn => { btn.classList.remove('bg-corporate-blue', 'text-white'); btn.classList.add('bg-slate-100', 'text-slate-600'); }); }
function pintarBotonRapido(idBoton) { limpiarEstilosBotonesRapidos(); const btn = document.getElementById(idBoton); if(btn) { btn.classList.remove('bg-slate-100', 'text-slate-600'); btn.classList.add('bg-corporate-blue', 'text-white'); } }

function setRangoFechas(tipo) {
    let hoyObj = new Date(); pintarBotonRapido(`btn-${tipo}`);
    if (tipo === 'todos') { fechaInicioGlobal = null; fechaFinGlobal = null; if(fpInstancia) fpInstancia.clear(); return; }
    let fechaInicioObj = new Date();
    if (tipo === 'hoy') { fechaInicioObj = hoyObj; } else if (tipo === 'semana') { fechaInicioObj.setDate(hoyObj.getDate() - 6); } else if (tipo === 'quincena') { fechaInicioObj.setDate(hoyObj.getDate() - 14); } else if (tipo === 'mes') { fechaInicioObj.setDate(1); }
    let strInicio = formatoFecha(fechaInicioObj); let strFin = formatoFecha(hoyObj);
    if(fpInstancia) fpInstancia.setDate([strInicio, strFin], false); 
    fechaInicioGlobal = strInicio; fechaFinGlobal = strFin; renderizarCore();
}

function actualizarOpcionesFiltros() {
    let eqSet = new Set(), solSet = new Set();
    listaRegistros.forEach(r => { if (r.equipo) eqSet.add(r.equipo); if (r.solucion) solSet.add(r.solucion); });
    let currEq = tsInstances['filtro-equipo'] ? tsInstances['filtro-equipo'].getValue() : 'TODOS'; 
    let currSol = tsInstances['filtro-solucion'] ? tsInstances['filtro-solucion'].getValue() : 'TODAS';
    if(tsInstances['filtro-equipo']) { tsInstances['filtro-equipo'].clearOptions(); tsInstances['filtro-equipo'].addOption({value: 'TODOS', text: 'Todos los Equipos'}); Array.from(eqSet).sort().forEach(e => tsInstances['filtro-equipo'].addOption({value: e, text: e})); tsInstances['filtro-equipo'].setValue(currEq, true); }
    if(tsInstances['filtro-solucion']) { tsInstances['filtro-solucion'].clearOptions(); tsInstances['filtro-solucion'].addOption({value: 'TODAS', text: 'Todas las Soluciones'}); Array.from(solSet).sort().forEach(s => tsInstances['filtro-solucion'].addOption({value: s, text: s})); tsInstances['filtro-solucion'].setValue(currSol, true); }
}

function obtenerDatosFiltrados() {
    const s = tsInstances['filtro-solucion'] ? tsInstances['filtro-solucion'].getValue() : 'TODAS'; 
    const e = tsInstances['filtro-equipo'] ? tsInstances['filtro-equipo'].getValue() : 'TODOS'; 
    return listaRegistros.filter(r => {
        let pasaEquipo = (!e || e === 'TODOS' || r.equipo === e); let pasaSolucion = (!s || s === 'TODAS' || r.solucion === s);
        let pasaFecha = true; if (fechaInicioGlobal && fechaFinGlobal && r.fecha) pasaFecha = (r.fecha >= fechaInicioGlobal && r.fecha <= fechaFinGlobal);
        return pasaEquipo && pasaSolucion && pasaFecha;
    });
}

// ==========================================
// 5. RENDERIZADO GENERAL Y GRÁFICOS (MODO ENFOQUE APLICADO)
// ==========================================
function renderizarCore() {
    const datos = obtenerDatosFiltrados(); let stats = { conformes: 0, riesgo: 0, exceso: 0, conformesList: [], desviosList: [] };

    datos.forEach(r => {
        const p = PARAMETROS_TECNICOS.find(x => x.solucion === r.solucion);
        if (p) {
            const val = parseConcen(r.concen);
            if (val < p.min) { stats.riesgo++; stats.desviosList.push({...r, tipo: 'Riesgo (<Min)', excesoAbs: 0}); }
            else if (val > p.max) { stats.exceso++; stats.desviosList.push({...r, tipo: 'Exceso (>Max)', excesoAbs: val - p.max}); }
            else { stats.conformes++; stats.conformesList.push({...r, tipo: 'Conforme'}); }
        }
    });

    let total = datos.length; let eficacia = total > 0 ? (((stats.conformes) / total) * 100).toFixed(1) : 0;
    document.getElementById('kpi-eficacia').innerText = eficacia + '%'; document.getElementById('kpi-conformes').innerText = stats.conformes.toLocaleString();
    document.getElementById('kpi-riesgo').innerText = stats.riesgo.toLocaleString(); document.getElementById('kpi-exceso').innerText = stats.exceso.toLocaleString(); document.getElementById('kpi-total').innerText = total.toLocaleString();

    drawSparklines(datos); 
    drawHeatmapOperativo(datos, 'heatmap-container', false); 
    drawEficaciaSoluciones(datos, 'barSolucionesChart', false); 
    drawRadarFugas(stats.desviosList, 'fugaQuimicaChart', false); 
    drawTendenciaHistorica(datos, 'historicoChart', false); 
    drawMagicQuadrant(datos, 'quadrantChart', false); 
    
    desviosUltimoFiltro = stats.desviosList; const tbody = document.getElementById('ai-action-plan-tbody');
    if(tbody) {
        if(desviosUltimoFiltro.length === 0) { tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-green-600 font-medium bg-green-50/50 rounded-lg"><i class="fa-solid fa-check-circle mr-2"></i>Cero desvíos reportados en este periodo.</td></tr>`; } 
        else { tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-500 font-medium bg-slate-50/50 rounded-lg">Hay <b>${desviosUltimoFiltro.length} desvíos</b> detectados. Ejecuta el Motor IA para la auditoría técnica.</td></tr>`; }
    }
}

function getLineSpark(ctxId, data, color) { if(sparkInst[ctxId]) sparkInst[ctxId].destroy(); const ctx = document.getElementById(ctxId)?.getContext('2d'); if(!ctx) return; sparkInst[ctxId] = new Chart(ctx, { type: 'line', data: { labels: data.map((_,i)=>i), datasets: [{ data: data, borderColor: color, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } } }); }
function drawSparklines(datos) { let t = datos.slice(0, 50).reverse(); getLineSpark('sparkEficacia', t.length ? t.map(r=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); return p&&(parseConcen(r.concen)>=p.min&&parseConcen(r.concen)<=p.max)?1:0}) : [1], '#3b82f6'); getLineSpark('sparkConformes', t.length ? t.map(r=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); return p&&(parseConcen(r.concen)>=p.min&&parseConcen(r.concen)<=p.max)?1:0}) : [1], '#10b981'); getLineSpark('sparkRiesgo', t.length ? t.map(r=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); return p&&(parseConcen(r.concen)<p.min)?1:0}) : [0], '#ef4444'); getLineSpark('sparkExceso', t.length ? t.map(r=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); return p&&(parseConcen(r.concen)>p.max)?1:0}) : [0], '#f59e0b'); getLineSpark('sparkTotal', t.length ? t.map(()=>Math.random()) : [1], '#64748b'); }

function drawHeatmapOperativo(datos, containerId = 'heatmap-container', isExpanded = false) {
    const container = document.getElementById(containerId); if(!container) return;
    if(!isExpanded) { const labelTotal = document.getElementById('label-heatmap-total'); if(labelTotal) labelTotal.innerText = `${datos.length} Muestras Mapeadas`; }

    const franjas = [ { key: 'madrugada', label: 'Madrugada [00h - 06h]', test: h => h >= 0 && h < 6 }, { key: 'manana', label: 'Mañana [06h - 14h]', test: h => h >= 6 && h < 14 }, { key: 'tarde', label: 'Tarde [14h - 22h]', test: h => h >= 14 && h < 22 }, { key: 'noche', label: 'Noche [22h - 24h]', test: h => h >= 22 && h <= 23 } ];
    const dias = [ { key: 1, label: 'Lun' }, { key: 2, label: 'Mar' }, { key: 3, label: 'Mié' }, { key: 4, label: 'Jue' }, { key: 5, label: 'Vie' }, { key: 6, label: 'Sáb' }, { key: 0, label: 'Dom' } ];

    let matriz = {}; franjas.forEach(f => { matriz[f.key] = {}; dias.forEach(d => { matriz[f.key][d.key] = []; }); });
    datos.forEach(r => { const p = PARAMETROS_TECNICOS.find(x => x.solucion === r.solucion); if(p) { const val = parseConcen(r.concen); let estado = 'conforme'; if(val < p.min) estado = 'riesgo'; else if(val > p.max) estado = 'exceso'; let horaStr = r.hora || '00:00:00'; let h = parseInt(horaStr.split(':')[0]) || 0; let fechaObj = new Date(r.fecha + "T00:00:00"); let dKey = isNaN(fechaObj.getDay()) ? 1 : fechaObj.getDay(); let fMatch = franjas.find(f => f.test(h)); if(fMatch && matriz[fMatch.key] && matriz[fMatch.key][dKey] !== undefined) { matriz[fMatch.key][dKey].push({ ...r, estado }); } } });

    if(!isExpanded) heatmapCache = matriz; // Solo actualizar caché general si no estamos en modal expandido (aunque los datos sean los mismos)
    
    let baseTextSize = isExpanded ? 'text-sm' : 'text-[10px]';
    let contentTextSize = isExpanded ? 'text-base' : 'text-xs';
    let paddingSize = isExpanded ? 'p-4' : 'p-2.5';

    let html = `<div class="w-full h-full overflow-auto"><table class="w-full text-center border-collapse"><thead><tr class="bg-slate-100 text-slate-600 font-bold ${baseTextSize} uppercase"><th class="${paddingSize} text-left border-b border-slate-200">Turno / Franja</th>`;
    dias.forEach(d => { html += `<th class="${paddingSize} border-b border-slate-200">${d.label}</th>`; }); html += `</tr></thead><tbody class="divide-y divide-slate-100">`;

    franjas.forEach(f => {
        html += `<tr><td class="${paddingSize} text-left font-bold text-slate-700 bg-slate-50 border-r border-slate-100 ${baseTextSize}">${f.label}</td>`;
        dias.forEach(d => {
            let lista = matriz[f.key][d.key]; let count = lista.length; let bgClass = 'bg-slate-50 text-slate-300';
            if(count > 0) {
                let hasRiesgo = lista.some(item => item.estado === 'riesgo'); let hasExceso = lista.some(item => item.estado === 'exceso');
                if(hasRiesgo) bgClass = 'bg-red-100 text-red-800 border border-red-300 font-bold cursor-pointer hover:bg-red-200'; else if(hasExceso) bgClass = 'bg-amber-100 text-amber-800 border border-amber-300 font-bold cursor-pointer hover:bg-amber-200'; else bgClass = 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold cursor-pointer hover:bg-emerald-200';
            }
            html += `<td class="${paddingSize} ${bgClass} transition-all duration-150 rounded" ${count > 0 ? `onclick="clicRadiografiaTurno('${f.key}', ${d.key}, '${d.label}')" title="Clic para ver Radiografía"` : ''}><div class="${contentTextSize}">${count > 0 ? count : ''}</div></td>`;
        });
        html += `</tr>`;
    });
    html += `</tbody></table></div>`; container.innerHTML = html;
}

function drawTendenciaHistorica(datos, canvasId = 'historicoChart', isExpanded = false) {
    let targetInst = isExpanded ? expandedChartInst : historicoInst; if(targetInst) targetInst.destroy();
    let hist = {}; datos.forEach(r => { let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(p) { if(!hist[r.fecha]) hist[r.fecha] = { total:0, conformes:0, excesos:0, riesgos:0 }; hist[r.fecha].total++; let v = parseConcen(r.concen); if(v < p.min) hist[r.fecha].riesgos++; else if(v > p.max) hist[r.fecha].excesos++; else hist[r.fecha].conformes++; } });
    let fechas = Object.keys(hist).sort(); if(fechas.length === 0) return; if(fechas.length > 30 && fechaInicioGlobal == null) fechas = fechas.slice(-30); 
    let arrConformes = fechas.map(f => hist[f].conformes); let arrExcesos = fechas.map(f => hist[f].excesos); let arrRiesgos = fechas.map(f => hist[f].riesgos); let arrEficacias = fechas.map(f => (hist[f].conformes / hist[f].total) * 100);

    let newInst = new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'bar',
        data: { labels: fechas.map(f => f.substring(5)), datasets: [ { type: 'line', label: 'Eficacia (%)', data: arrEficacias, borderColor: '#273c75', borderWidth: isExpanded ? 4 : 2, fill: false, tension: 0.3, pointRadius: isExpanded ? 6 : 4, pointBackgroundColor: '#273c75', yAxisID: 'porcentaje', order: 0 }, { label: 'Conformes', data: arrConformes, backgroundColor: '#10b981', stack: 'Stack 0', yAxisID: 'volumen', order: 1 }, { label: 'Exceso', data: arrExcesos, backgroundColor: '#f59e0b', stack: 'Stack 0', yAxisID: 'volumen', order: 1 }, { label: 'Riesgo', data: arrRiesgos, backgroundColor: '#ef4444', stack: 'Stack 0', yAxisID: 'volumen', order: 1 } ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: {size: isExpanded ? 14 : 10} } }, tooltip: { mode: 'index', intersect: false, titleFont: {size: isExpanded?16:12}, bodyFont: {size: isExpanded?14:12} } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { font: {size: isExpanded?12:10} } }, volumen: { type: 'linear', position: 'left', stacked: true, title: { display: true, text: 'Volumen', font: {size: isExpanded?12:10, weight: 'bold'}, color: '#64748b' }, ticks: { font: {size: isExpanded?12:10} } }, porcentaje: { type: 'linear', position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%', font: {size: isExpanded?12:10} } } } }
    });
    if(isExpanded) expandedChartInst = newInst; else historicoInst = newInst;
}

function drawMagicQuadrant(datos, canvasId = 'quadrantChart', isExpanded = false) {
    let targetInst = isExpanded ? expandedChartInst : quadrantInst; if(targetInst) targetInst.destroy(); if(datos.length === 0) return;
    let evalSoluciones = {}; datos.forEach(r => { let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(p) { if(!evalSoluciones[r.solucion]) evalSoluciones[r.solucion] = { total: 0, ok: 0 }; evalSoluciones[r.solucion].total++; let v = parseConcen(r.concen); if(v >= p.min && v <= p.max) evalSoluciones[r.solucion].ok++; } });
    let scatterData = []; let tooltipsData = []; Object.keys(evalSoluciones).forEach(sol => { let vol = evalSoluciones[sol].total; let efi = (evalSoluciones[sol].ok / vol) * 100; scatterData.push({ x: efi, y: vol }); tooltipsData.push(sol); });
    let newInst = new Chart(document.getElementById(canvasId).getContext('2d'), { type: 'scatter', plugins: [quadrantPlugin], data: { datasets: [{ label: 'Soluciones', data: scatterData, backgroundColor: '#6366f1', borderColor: '#ffffff', borderWidth: 2, pointRadius: isExpanded ? 10 : 7, pointHoverRadius: isExpanded ? 14 : 9 }] }, options: { responsive: true, maintainAspectRatio: false, layout: { padding: { right: 10 } }, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', padding: 12, titleFont: {size: isExpanded?14:11}, bodyFont: {size: isExpanded?14:11}, callbacks: { label: function(ctx) { return `${tooltipsData[ctx.dataIndex]}: Eficacia ${ctx.raw.x.toFixed(1)}% | Muestras: ${ctx.raw.y}`; } } } }, scales: { x: { title: { display: true, text: 'Eficacia Sanitaria (%)', font: {size: isExpanded?12:10, weight: 'bold'}, color: '#64748b' }, min: 0, max: 100, grid: { display: false }, ticks: { font: {size: isExpanded?12:10} } }, y: { title: { display: true, text: 'Volumen Operativo', font: {size: isExpanded?12:10, weight: 'bold'}, color: '#64748b' }, min: 0, grid: { display: false }, ticks: { font: {size: isExpanded?12:10} } } } });
    if(isExpanded) expandedChartInst = newInst; else quadrantInst = newInst;
}

function drawEficaciaSoluciones(datos, canvasId = 'barSolucionesChart', isExpanded = false) {
    let targetInst = isExpanded ? expandedChartInst : barSolucionesInst; if(targetInst) targetInst.destroy();
    let d = {}; datos.forEach(r => { let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(p) { if(!d[r.solucion]) d[r.solucion] = { t:0, c:0 }; d[r.solucion].t++; let v = parseConcen(r.concen); if(v>=p.min && v<=p.max) d[r.solucion].c++; } });
    let res = Object.keys(d).map(k => ({ n: k, p: Number(((d[k].c / d[k].t) * 100).toFixed(1)), t: d[k].t })).sort((a,b)=>b.t - a.t); if(res.length === 0) return; let barColors = res.map(x => x.p >= 90 ? '#10b981' : (x.p >= 70 ? '#f59e0b' : '#ef4444'));
    let newInst = new Chart(document.getElementById(canvasId).getContext('2d'), { type: 'bar', data: { labels: res.map(x => `${x.n} (${x.p}%)`), datasets: [{ data: res.map(x => x.p), backgroundColor: barColors, borderRadius: 4, barThickness: isExpanded ? 24 : 14 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { titleFont: {size: isExpanded?14:12}, bodyFont: {size: isExpanded?14:12}, callbacks: { label: c => ` Clic para aislar y ver diagrama de dispersión.` } } }, scales: { x: { max: 100, grid: { color: '#f1f5f9' }, ticks: { font: {size: isExpanded?12:10} } }, y: { grid: { display: false }, ticks: { color: '#475569', font: {size: isExpanded?12:9, weight: 'bold'} } } }, onHover: (e, elements) => { e.native.target.style.cursor = elements.length ? 'pointer' : 'default'; }, onClick: (e, elements) => { if (elements.length > 0) abrirModalDrilldown(res[elements[0].index].n); } } });
    if(isExpanded) expandedChartInst = newInst; else barSolucionesInst = newInst;
}

function drawRadarFugas(desvios, canvasId = 'fugaQuimicaChart', isExpanded = false) {
    let targetInst = isExpanded ? expandedChartInst : fugaChartInst; if(targetInst) targetInst.destroy();
    let excesos = desvios.filter(d => d.tipo.includes('Exceso'));
    if(!isExpanded) { const msgObj = document.getElementById('fuga-empty-msg'); if(excesos.length === 0) { if(msgObj) msgObj.classList.remove('hidden'); return; } if(msgObj) msgObj.classList.add('hidden'); }
    if(isExpanded && excesos.length === 0) return; // En modal no dibujamos nada si está vacío

    let fugas = {}; excesos.forEach(e => { if(!fugas[e.solucion]) fugas[e.solucion] = 0; fugas[e.solucion] += e.excesoAbs; }); let labels = Object.keys(fugas); let data = Object.values(fugas);
    let newInst = new Chart(document.getElementById(canvasId).getContext('2d'), { type: 'radar', data: { labels: labels, datasets: [{ label: 'Índice de Fuga (Σ%)', data: data, backgroundColor: 'rgba(245, 158, 11, 0.25)', borderColor: '#f59e0b', pointBackgroundColor: '#ffffff', pointBorderColor: '#f59e0b', pointBorderWidth: 2, pointRadius: isExpanded ? 6 : 4, borderWidth: isExpanded ? 3 : 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { titleFont: {size: isExpanded?14:12}, bodyFont: {size: isExpanded?14:12}, callbacks: { label: c => ` Volumen Desperdiciado: ${c.raw.toFixed(2)} Índice de Fuga (Σ%)` } } }, scales: { r: { angleLines: { color: '#e2e8f0' }, grid: { color: '#e2e8f0', circular: true }, pointLabels: { font: { size: isExpanded?12:9, weight: 'bold' }, color: '#475569' }, ticks: { display: false, beginAtZero: true } } } } });
    if(isExpanded) expandedChartInst = newInst; else fugaChartInst = newInst;
}

// ==========================================
// NUEVO: SISTEMA DE EXPANSIÓN (MODO ENFOQUE)
// ==========================================
function expandirGrafico(tipo, titulo) {
    document.getElementById('expandido-titulo').innerHTML = `<i class="fa-solid fa-expand text-blue-500 mr-2"></i> Vista Detallada: ${titulo}`;
    document.getElementById('modal-expandido').classList.remove('hidden');
    
    const canvas = document.getElementById('expandidoChart');
    const div = document.getElementById('expandidoDiv');
    canvas.classList.add('hidden'); div.classList.add('hidden');

    const datos = obtenerDatosFiltrados();
    
    if(tipo === 'heatmap') {
        div.classList.remove('hidden'); drawHeatmapOperativo(datos, 'expandidoDiv', true); 
    } else {
        canvas.classList.remove('hidden');
        if(tipo === 'cuadrante') drawMagicQuadrant(datos, 'expandidoChart', true);
        if(tipo === 'historico') drawTendenciaHistorica(datos, 'expandidoChart', true);
        if(tipo === 'barras') drawEficaciaSoluciones(datos, 'expandidoChart', true);
        if(tipo === 'radar') drawRadarFugas(desviosUltimoFiltro, 'expandidoChart', true);
    }
}

function cerrarModalExpandido() {
    document.getElementById('modal-expandido').classList.add('hidden');
    if(expandedChartInst) { expandedChartInst.destroy(); expandedChartInst = null; }
    document.getElementById('expandidoDiv').innerHTML = '';
}

// Modales Funcionales Existentes (Radiografía, Drilldown, Detalle)
function clicRadiografiaTurno(franjaKey, diaKey, diaLabel) {
    let lista = heatmapCache[franjaKey] && heatmapCache[franjaKey][diaKey] ? heatmapCache[franjaKey][diaKey] : []; if(lista.length === 0) return; let dictQuimicos = {}; let dictOperadores = {}; lista.forEach(r => { dictQuimicos[r.solucion] = (dictQuimicos[r.solucion] || 0) + 1; let op = r.operario || 'Sin nombre'; dictOperadores[op] = (dictOperadores[op] || 0) + 1; }); document.getElementById('turno-titulo').innerHTML = `<i class="fa-solid fa-clipboard-user mr-2"></i> Radiografía Operativa: ${franjaKey.toUpperCase()} (${diaLabel.toUpperCase()})`; document.getElementById('modal-turno').classList.remove('hidden');
    if(turnoQuimInst) turnoQuimInst.destroy(); turnoQuimInst = new Chart(document.getElementById('turnoQuimicosChart').getContext('2d'), { type: 'doughnut', data: { labels: Object.keys(dictQuimicos), datasets: [{ data: Object.values(dictQuimicos), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'], borderWidth: 2, borderColor: '#ffffff' }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: {size: 10, family: 'Inter'} } } } } });
    if(turnoOpInst) turnoOpInst.destroy(); let opsArr = Object.keys(dictOperadores).map(k => ({ nombre: k, cant: dictOperadores[k] })).sort((a,b)=> b.cant - a.cant); turnoOpInst = new Chart(document.getElementById('turnoOperadoresChart').getContext('2d'), { type: 'bar', data: { labels: opsArr.map(o => o.nombre.split(' ').slice(0,2).join(' ')), datasets: [{ data: opsArr.map(o => o.cant), backgroundColor: '#6366f1', borderRadius: 4 }] }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { stepSize: 1 } }, y: { ticks: { font: {size: 9} } } } } });
}
function cerrarModalTurno() { document.getElementById('modal-turno').classList.add('hidden'); }

function abrirModalDrilldown(solucion) {
    document.getElementById('modal-drilldown').classList.remove('hidden'); document.getElementById('drilldown-titulo').innerHTML = `<i class="fa-solid fa-microscope text-indigo-500 mr-2"></i> Dispersión Técnica: ${solucion}`; const datosBase = obtenerDatosFiltrados(); const subset = datosBase.filter(r => r.solucion === solucion).slice(0, 100).reverse(); const regla = PARAMETROS_TECNICOS.find(p => p.solucion === solucion); if(drilldownInst) drilldownInst.destroy(); if(!regla || subset.length === 0) return; let dataPoints = subset.map(r => parseConcen(r.concen)); let colors = dataPoints.map(v => v < regla.min ? '#ef4444' : (v > regla.max ? '#f59e0b' : '#10b981'));
    drilldownInst = new Chart(document.getElementById('drilldownChart').getContext('2d'), { type: 'line', data: { labels: subset.map(r => `${r.fecha.substring(5)} ${r.hora?r.hora.substring(0,5):''}`), datasets: [ { label: 'Muestras', data: dataPoints, showLine: false, pointBackgroundColor: colors, pointBorderColor: '#ffffff', pointBorderWidth: 1.5, pointRadius: 6, pointHoverRadius: 9 }, { label: 'Max', data: Array(subset.length).fill(regla.max), borderColor: '#f59e0b', borderDash: [5,5], pointRadius: 0, fill: false, borderWidth: 2 }, { label: 'Min', data: Array(subset.length).fill(regla.min), borderColor: '#ef4444', borderDash: [5,5], pointRadius: 0, fill: false, borderWidth: 2 } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', padding: 12, callbacks: { label: function(ctx) { let obj = subset[ctx.dataIndex]; return [ `Concentración: ${ctx.raw}%`, `Operador: ${obj.operario || obj.laboratorista}`, `Límites: ${regla.min}% - ${regla.max}%` ]; } } } }, scales: { y: { grid: { color: '#f1f5f9' } }, x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45, font: {size: 10} } } } } });
}
function cerrarModalDrilldown() { document.getElementById('modal-drilldown').classList.add('hidden'); }

function abrirModalDetalle(tipo) {
    const modal = document.getElementById('modal-detalle'); const tbody = document.getElementById('modal-tbody'); if(!modal || !tbody) return; tbody.innerHTML = ''; const datos = obtenerDatosFiltrados(); let rsl = [];
    if(tipo === 'conformes') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)>=p.min && parseConcen(f.concen)<=p.max;});
    if(tipo === 'riesgo') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)<p.min;});
    if(tipo === 'exceso') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)>p.max;});
    document.getElementById('modal-titulo').innerText = tipo === 'conformes' ? "Auditoría: Muestras Conformes (Óptimas)" : (tipo === 'riesgo' ? "Auditoría: Desvíos por Riesgo (< Mínimo)" : "Auditoría: Desvíos por Sobredosificación (> Máximo)");
    if(rsl.length===0) { tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-500 font-bold bg-slate-50">Sin registros en este filtro.</td></tr>`; } 
    else { rsl.slice(0, 100).forEach(r => { let badgeColor = tipo === 'conformes' ? 'text-emerald-600 bg-emerald-50' : (tipo === 'riesgo' ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'); tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-100"><td class="py-3 px-6">${r.fecha} ${r.hora?r.hora.substring(0,5):''}</td><td class="py-3 px-6 font-bold text-slate-800">${r.equipo}</td><td class="py-3 px-6 text-slate-600">${r.solucion}</td><td class="py-3 px-6 text-center font-black ${badgeColor}">${r.concen}</td><td class="py-3 px-6 text-[10px] text-slate-500">${r.operario || r.laboratorista}</td></tr>`; }); }
    modal.classList.remove('hidden');
}
function cerrarModalDetalle() { document.getElementById('modal-detalle').classList.add('hidden'); }

// IA Gemini
async function dispararAnalisisIA() {
    const tbody = document.getElementById('ai-action-plan-tbody'); if(desviosUltimoFiltro.length === 0) return;
    if(!obtenerApiKeySegura()) { tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-500 font-bold bg-slate-50 rounded-lg">Falta API Key.</td></tr>`; return; }
    tbody.innerHTML = `<tr><td colspan="3" class="py-10 text-center text-blue-600 font-bold animate-pulse bg-blue-50/50 rounded-lg"><i class="fa-solid fa-microchip mr-2"></i>Evaluando matemáticas con 3.5 Flash-Lite...</td></tr>`;
    let excesos = desviosUltimoFiltro.filter(d => d.tipo.includes('Exceso')); let totalExcesos = excesos.length; let statsFugas = {}; let opsStats = {};
    excesos.forEach(e => { if(!statsFugas[e.solucion]) statsFugas[e.solucion] = { conteo: 0, volumenPerdido: 0 }; statsFugas[e.solucion].conteo++; statsFugas[e.solucion].volumenPerdido += e.excesoAbs; let op = e.operario || e.laboratorista || 'Desconocido'; opsStats[op] = (opsStats[op] || 0) + 1; });
    let desgloseTexto = `TOTAL EVENTOS: ${totalExcesos}\n`; Object.keys(statsFugas).forEach(sol => { desgloseTexto += `- Químico ${sol}: ${((statsFugas[sol].conteo / totalExcesos) * 100).toFixed(1)}% de eventos. Fuga: ${statsFugas[sol].volumenPerdido.toFixed(2)}.\n`; });
    const prompt = `Eres Analista de Datos en Lácteos San Antonio. Analiza ESTOS DATOS DUROS:\n\n${desgloseTexto}\nOperadores implicados: ${Object.keys(opsStats).map(op => `${op} (${opsStats[op]} eventos)`).join(', ')}\n\nREGLAS ESTRICTAS:\n1. Usa porcentajes provistos.\n2. Explica qué químico representa mayor desperdicio.\n3. PROHIBIDO recomendaciones mecánicas.\n4. Devuelve JSON estricto: [{"desvio": "Hallazgo principal", "analisis_datos": "Análisis", "responsable": "Nombre"}]. Sin markdown.`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${obtenerApiKeySegura()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        if (!res.ok) throw new Error(await res.text());
        const jsonRes = await res.json(); let plan = JSON.parse((jsonRes.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/gi, '').trim());
        tbody.innerHTML = ''; plan.forEach(item => { tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-100"><td class="py-4 px-3 align-top text-amber-600 font-bold text-[11px]">${item.desvio}</td><td class="py-4 px-3 align-top text-slate-600 text-[11px]">${item.analisis_datos}</td><td class="py-4 px-3 align-top text-slate-500 font-mono text-[10px]">${item.responsable}</td></tr>`; });
    } catch(err) { tbody.innerHTML = `<tr><td colspan="3" class="py-6 px-6 text-center text-red-500 font-bold text-[11px] bg-red-50 rounded-lg">Fallo IA: ${err.message}.</td></tr>`; }
}
function obtenerApiKeySegura() { return localStorage.getItem('poes_gemini_key') || ''; }
function actualizarBadgeIA() {
    const b = document.getElementById('badge-ia-status'); if(!b) return;
    if(obtenerApiKeySegura()) { b.innerHTML = `<i class="fa-solid fa-check text-green-500 mr-1"></i> IA Lista`; b.className = "text-[10px] font-bold px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200 shadow-sm"; } 
    else { b.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> Falta API Key`; b.className = "text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-400 border border-slate-200 shadow-sm"; }
}
function abrirConfigIA() { document.getElementById('input-api-key').value = obtenerApiKeySegura(); document.getElementById('modal-config-ia').classList.remove('hidden'); }
function cerrarConfigIA() { document.getElementById('modal-config-ia').classList.add('hidden'); }
function guardarApiKey() { localStorage.setItem('poes_gemini_key', document.getElementById('input-api-key').value.trim()); cerrarConfigIA(); actualizarBadgeIA(); }
function limpiarApiKey() { localStorage.removeItem('poes_gemini_key'); cerrarConfigIA(); actualizarBadgeIA(); }
