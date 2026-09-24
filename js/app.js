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

let listaRegistros = []; 
let desviosUltimoFiltro = []; 
let tsInstances = {}; 
let fpInstancia = null; 
let fechaInicioGlobal = null; 
let fechaFinGlobal = null; 

let barSolucionesInst = null;
let fugaChartInst = null;
let historicoInst = null;
let quadrantInst = null;
let drilldownInst = null;
let turnoQuimInst = null;
let turnoOpInst = null;
let turnoEqInst = null; 
let expandedChartInst = null; 
let sparkInst = { ef: null, co: null, ri: null, ex: null, fuga: null, severidad: null };
let heatmapCache = {}; 

Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b'; 
Chart.defaults.scale.grid.color = '#f8fafc';

const quadrantPlugin = {
    id: 'quadrantPlugin',
    beforeDraw(chart) {
        if (!chart.chartArea) return; 
        const { ctx, chartArea: { left, top, right, bottom }, scales: { x, y } } = chart;
        const midX = x.getPixelForValue(85); const yMax = y.max; const midY = y.getPixelForValue(yMax / 2);
        ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([5, 5]); 
        if(midX > left && midX < right) { ctx.beginPath(); ctx.moveTo(midX, top); ctx.lineTo(midX, bottom); ctx.stroke(); }
        if(midY > top && midY < bottom) { ctx.beginPath(); ctx.moveTo(left, midY); ctx.lineTo(right, midY); ctx.stroke(); }
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

document.addEventListener('DOMContentLoaded', async () => {
    actualizarBadgeIA(); initFiltrosInteligentes(); initRangoFechas(); 
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
    let labelReg = document.getElementById('info-registros-totales');
    if(labelReg) labelReg.innerText = `${listaRegistros.length.toLocaleString()} Registros BD`;
    actualizarOpcionesFiltros(); renderizarCore();
}

function initFiltrosInteligentes() {
    ['filtro-equipo', 'filtro-solucion'].forEach(id => { 
        const el = document.getElementById(id);
        if(el) { tsInstances[id] = new TomSelect(el, { create: false, sortField: [{field: '$order'}] }); tsInstances[id].on('change', renderizarCore); }
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
                fechaInicioGlobal = null; fechaFinGlobal = null; pintarBotonRapido('btn-todos'); renderizarCore();
            }
        }
    });
}

function formatoFecha(d) { let ms = d.getMonth() + 1; let dy = d.getDate(); return `${d.getFullYear()}-${ms < 10 ? '0'+ms : ms}-${dy < 10 ? '0'+dy : dy}`; }
function limpiarEstilosBotonesRapidos() { document.querySelectorAll('.rango-btn').forEach(btn => { btn.classList.remove('bg-corporate-blue', 'text-white'); btn.classList.add('bg-slate-100', 'text-slate-600'); }); }
function pintarBotonRapido(idBoton) { limpiarEstilosBotonesRapidos(); const btn = document.getElementById(idBoton); if(btn) { btn.classList.remove('bg-slate-100', 'text-slate-600'); btn.classList.add('bg-corporate-blue', 'text-white'); } }

function setRangoFechas(tipo) {
    let hoyObj = new Date(); pintarBotonRapido(`btn-${tipo}`);
    if (tipo === 'todos') { fechaInicioGlobal = null; fechaFinGlobal = null; if(fpInstancia) fpInstancia.clear(); renderizarCore(); return; }
    let fechaInicioObj = new Date();
    if (tipo === 'hoy') { fechaInicioObj = hoyObj; } else if (tipo === 'semana') { fechaInicioObj.setDate(hoyObj.getDate() - 6); } else if (tipo === 'quincena') { fechaInicioObj.setDate(hoyObj.getDate() - 14); } else if (tipo === 'mes') { fechaInicioObj.setDate(1); }
    let strInicio = formatoFecha(fechaInicioObj); let strFin = formatoFecha(hoyObj);
    if(fpInstancia) fpInstancia.setDate([strInicio, strFin], false); 
    fechaInicioGlobal = strInicio; fechaFinGlobal = strFin; renderizarCore();
}

function actualizarOpcionesFiltros() {
    let eqSet = new Set(); let solSet = new Set();
    listaRegistros.forEach(r => { if (r.equipo) eqSet.add(r.equipo); if (r.solucion) solSet.add(r.solucion); });
    let currEq = tsInstances['filtro-equipo'] ? tsInstances['filtro-equipo'].getValue() : 'TODOS'; let currSol = tsInstances['filtro-solucion'] ? tsInstances['filtro-solucion'].getValue() : 'TODAS';
    
    if(tsInstances['filtro-equipo']) { tsInstances['filtro-equipo'].clearOptions(); tsInstances['filtro-equipo'].addOption({value: 'TODOS', text: 'Todos los Equipos'}); Array.from(eqSet).sort().forEach(e => tsInstances['filtro-equipo'].addOption({value: e, text: e})); tsInstances['filtro-equipo'].setValue(currEq, true); }
    if(tsInstances['filtro-solucion']) { tsInstances['filtro-solucion'].clearOptions(); tsInstances['filtro-solucion'].addOption({value: 'TODAS', text: 'Todas las Soluciones'}); Array.from(solSet).sort().forEach(s => tsInstances['filtro-solucion'].addOption({value: s, text: s})); tsInstances['filtro-solucion'].setValue(currSol, true); }
}

function obtenerDatosFiltrados(inicio = fechaInicioGlobal, fin = fechaFinGlobal) {
    const s = tsInstances['filtro-solucion'] ? tsInstances['filtro-solucion'].getValue() : 'TODAS'; const e = tsInstances['filtro-equipo'] ? tsInstances['filtro-equipo'].getValue() : 'TODOS'; 
    return listaRegistros.filter(r => {
        let pasaEquipo = (!e || e === 'TODOS' || r.equipo === e); let pasaSolucion = (!s || s === 'TODAS' || r.solucion === s); let pasaFecha = true; 
        if (inicio && fin && r.fecha) { pasaFecha = (r.fecha >= inicio && r.fecha <= fin); }
        return pasaEquipo && pasaSolucion && pasaFecha;
    });
}

function renderizarCore() {
    const datos = obtenerDatosFiltrados(); 
    let stats = { conformes: 0, riesgo: 0, exceso: 0, conformesList: [], desviosList: [] };
    
    let totalFuga = 0; 
    let totalSeveridadAbs = 0; 

    datos.forEach(r => {
        const p = PARAMETROS_TECNICOS.find(x => x.solucion === r.solucion);
        if (p) {
            const val = parseConcen(r.concen);
            if (val < p.min) { 
                stats.riesgo++; 
                let dif = p.min - val; 
                totalSeveridadAbs += dif; 
                stats.desviosList.push({...r, dif: dif}); 
            } 
            else if (val > p.max) { 
                stats.exceso++; 
                let dif = val - p.max; 
                totalFuga += dif; 
                stats.desviosList.push({...r, dif: dif}); 
            } 
            else { 
                stats.conformes++; 
                stats.conformesList.push({...r}); 
            }
        }
    });

    let total = datos.length; 
    let eficacia = total > 0 ? ((stats.conformes / total) * 100) : 0;
    let severidadPromedio = stats.riesgo > 0 ? (totalSeveridadAbs / stats.riesgo) : 0;

    document.getElementById('kpi-eficacia').innerText = eficacia.toFixed(1) + '%'; 
    document.getElementById('kpi-conformes').innerText = stats.conformes.toLocaleString();
    document.getElementById('kpi-conformes-pct').innerText = `(${total > 0 ? ((stats.conformes / total) * 100).toFixed(1) : '0.0'}%)`;
    document.getElementById('kpi-riesgo').innerText = stats.riesgo.toLocaleString(); 
    document.getElementById('kpi-riesgo-pct').innerText = `(${total > 0 ? ((stats.riesgo / total) * 100).toFixed(1) : '0.0'}%)`;
    document.getElementById('kpi-exceso').innerText = stats.exceso.toLocaleString(); 
    document.getElementById('kpi-exceso-pct').innerText = `(${total > 0 ? ((stats.exceso / total) * 100).toFixed(1) : '0.0'}%)`;
    
    document.getElementById('kpi-fuga').innerText = totalFuga.toFixed(1);
    document.getElementById('kpi-severidad').innerText = severidadPromedio.toFixed(2) + '%';
    document.getElementById('kpi-total-top').innerText = total.toLocaleString();

    calcularTendencias(eficacia, stats.conformes, stats.riesgo, stats.exceso, total, totalFuga, severidadPromedio);

    const iconRiesgo = document.getElementById('icon-riesgo'); const iconExceso = document.getElementById('icon-exceso');
    if(iconRiesgo) { stats.riesgo > 0 ? iconRiesgo.classList.add('anim-risk-active') : iconRiesgo.classList.remove('anim-risk-active'); }
    if(iconExceso) { stats.exceso > 0 ? iconExceso.classList.add('anim-warn-active') : iconExceso.classList.remove('anim-warn-active'); }

    drawSparklines(datos); drawHeatmapOperativo(datos, 'heatmap-container', false); drawEficaciaSoluciones(datos, 'barSolucionesChart', false); drawRadarFugas(stats.desviosList, 'fugaQuimicaChart', false); drawTendenciaHistorica(datos, 'historicoChart', false); drawMagicQuadrant(datos, 'quadrantChart', false); 
    desviosUltimoFiltro = stats.desviosList; 
    
    const tbody = document.getElementById('ai-action-plan-tbody');
    if(tbody) {
        if(desviosUltimoFiltro.length === 0) { tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-green-600 font-medium bg-green-50/50 rounded-lg"><i class="fa-solid fa-check-circle mr-2"></i>Cero desvíos reportados en este periodo.</td></tr>`; } 
        else { tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-500 font-medium bg-slate-50/50 rounded-lg">Hay <b>${desviosUltimoFiltro.length} desvíos</b> detectados. Ejecuta el Motor IA para el desglose financiero y técnico.</td></tr>`; }
    }
}

function calcularTendencias(efActual, confActual, riesActual, excActual, totActual, fugaActual, sevActual) {
    const renderClear = (containerId, topId = null) => {
        let c = document.getElementById(containerId);
        if(c) { c.innerHTML = `<span class="text-[9px] font-bold text-slate-400">Histórico Completo</span>`; }
        if(topId) { let t = document.getElementById(topId); if(t) { t.innerHTML = `<span class="text-[10px] font-bold text-slate-400">Histórico Completo</span>`; t.className = "text-[10px] font-bold mt-1 hidden lg:inline-flex items-center"; } }
    };

    if(!fechaInicioGlobal || !fechaFinGlobal) {
        renderClear('trend-eficacia-container'); renderClear('trend-conformes-container'); renderClear('trend-riesgo-container'); renderClear('trend-exceso-container', 'trend-total-top');
        renderClear('trend-fuga-container'); renderClear('trend-severidad-container');
        return;
    }

    let d1 = new Date(fechaInicioGlobal + "T00:00:00"); let d2 = new Date(fechaFinGlobal + "T00:00:00");
    let diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
    let pFin = new Date(d1); pFin.setDate(pFin.getDate() - 1);
    let pInicio = new Date(pFin); pInicio.setDate(pInicio.getDate() - diffDays);
    
    let prevDatos = obtenerDatosFiltrados(formatoFecha(pInicio), formatoFecha(pFin));
    let pStats = { c: 0, r: 0, e: 0 };
    let pFuga = 0; let pSeveridadAbs = 0;

    prevDatos.forEach(r => { 
        const p = PARAMETROS_TECNICOS.find(x => x.solucion === r.solucion); 
        if (p) { 
            const val = parseConcen(r.concen); 
            if (val < p.min) { pStats.r++; pSeveridadAbs += (p.min - val); } 
            else if (val > p.max) { pStats.e++; pFuga += (val - p.max); } 
            else { pStats.c++; } 
        } 
    });
    
    let pTot = prevDatos.length; let pEf = pTot > 0 ? (pStats.c / pTot) * 100 : 0;
    let pSev = pStats.r > 0 ? (pSeveridadAbs / pStats.r) : 0;

    const render = (containerId, actual, prev, isPct, invertColors = false, isTop = false) => {
        const c = document.getElementById(containerId); if(!c) return;
        if(pTot === 0) { c.innerHTML = `<span class="text-[9px] font-bold text-slate-400">Sin prev.</span>`; if(isTop) c.className = "text-[10px] font-bold hidden lg:inline-flex items-center ml-2 !mt-0"; return; }
        
        let diff = actual - prev;
        let prefix = diff > 0 ? '▲ +' : (diff < 0 ? '▼ ' : '■ ');
        let colorClass = 'text-slate-400';
        
        if (diff !== 0) { colorClass = invertColors ? (diff > 0 ? 'text-red-500' : 'text-emerald-500') : (diff > 0 ? 'text-emerald-500' : 'text-red-500'); }
        
        let valStr = isPct ? diff.toFixed(1) + '%' : diff.toFixed(0);
        let prevStr = isPct ? prev.toFixed(1) + '%' : prev.toLocaleString();
        
        c.innerHTML = `<div class="trend-wrap"><span class="trend-prev-value">Ant: ${prevStr} | </span><span class="text-[10px] font-bold ${colorClass}">${prefix}${valStr}</span></div>`;
        if(isTop) c.className = "text-[10px] font-bold hidden lg:inline-flex items-center ml-2 !mt-0";
    };

    render('trend-eficacia-container', efActual, pEf, true, false);
    render('trend-conformes-container', confActual, pStats.c, false, false);
    render('trend-riesgo-container', riesActual, pStats.r, false, true); 
    render('trend-exceso-container', excActual, pStats.e, false, true); 
    render('trend-fuga-container', fugaActual, pFuga, false, true); 
    render('trend-severidad-container', sevActual, pSev, true, true); 
    render('trend-total-top', totActual, pTot, false, false, true); 
}

function drawSparklines(datos) {
    if(datos.length === 0) { ['sparkEficacia', 'sparkConformes', 'sparkRiesgo', 'sparkExceso', 'sparkFuga', 'sparkSeveridad'].forEach(id => { if(sparkInst[id]) sparkInst[id].destroy(); }); return; }
    let agrupaPorHora = [...new Set(datos.map(d => d.fecha))].length === 1; let grouped = {};
    
    datos.forEach(r => {
        let key = agrupaPorHora ? (r.hora ? r.hora.substring(0,2) + 'h' : '00h') : (r.fecha ? r.fecha.substring(5) : 'N/A');
        if(!grouped[key]) grouped[key] = { t: 0, c: 0, r: 0, e: 0, severidadAbs: 0, fugaAbs: 0 };
        grouped[key].t++; let p = PARAMETROS_TECNICOS.find(x => x.solucion === r.solucion);
        if(p) { 
            let v = parseConcen(r.concen); 
            if(v < p.min) { 
                grouped[key].r++; 
                grouped[key].severidadAbs += (p.min - v); 
            } else if(v > p.max) { 
                grouped[key].e++; 
                let dif = v - p.max; 
                grouped[key].fugaAbs += dif; 
            } else { grouped[key].c++; } 
        }
    });

    let keys = Object.keys(grouped).sort(); if(keys.length > 30 && !agrupaPorHora) keys = keys.slice(-30);
    let dConf = keys.map(k => grouped[k].c); let dRies = keys.map(k => grouped[k].r); let dExc = keys.map(k => grouped[k].e); let dEfi = keys.map(k => (grouped[k].c / grouped[k].t) * 100);
    let dFuga = keys.map(k => grouped[k].fugaAbs);
    let dImpacto = keys.map(k => grouped[k].r > 0 ? (grouped[k].severidadAbs / grouped[k].r) : 0);

    const baseOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: true, mode: 'index', intersect: false, displayColors: false, titleFont: {size: 9}, bodyFont: {size: 10, weight: 'bold'}, padding: 6, backgroundColor: 'rgba(30, 41, 59, 0.9)' } }, scales: { x: { display: false }, y: { display: false, min: 0 } } };

    function renderSpark(id, type, data, color, isFill = false) {
        if(sparkInst[id]) sparkInst[id].destroy(); const ctx = document.getElementById(id)?.getContext('2d'); if(!ctx) return;
        let ds = { data: data, borderWidth: type === 'bar' ? 0 : 2, borderRadius: type === 'bar' ? 2 : 0, pointRadius: 0, pointHoverRadius: type === 'line' ? 4 : 0, tension: 0.4 };
        if (type === 'line' && isFill) { let grad = ctx.createLinearGradient(0, 0, 0, 40); grad.addColorStop(0, color.replace('1)', '0.3)')); grad.addColorStop(1, color.replace('1)', '0)')); ds.backgroundColor = grad; ds.borderColor = color; ds.fill = true; } else { ds.backgroundColor = color; ds.borderColor = color; }
        sparkInst[id] = new Chart(ctx, { type: type, data: { labels: keys, datasets: [ds] }, options: baseOpts });
    }

    renderSpark('sparkEficacia', 'line', dEfi, 'rgba(59, 130, 246, 1)', true); 
    renderSpark('sparkConformes', 'bar', dConf, 'rgba(16, 185, 129, 1)'); 
    renderSpark('sparkRiesgo', 'bar', dRies, 'rgba(239, 68, 68, 1)'); 
    renderSpark('sparkExceso', 'bar', dExc, 'rgba(245, 158, 11, 1)'); 
    renderSpark('sparkFuga', 'line', dFuga, 'rgba(245, 158, 11, 1)', true); 
    renderSpark('sparkSeveridad', 'line', dImpacto, 'rgba(239, 68, 68, 1)', true); 
}

function drawHeatmapOperativo(datos, containerId = 'heatmap-container', isExpanded = false) {
    const container = document.getElementById(containerId); if(!container) return;
    if(!isExpanded) { const labelTotal = document.getElementById('label-heatmap-total'); if(labelTotal) labelTotal.innerText = `${datos.length} Muestras Mapeadas`; }
    const franjas = [ { key: 'madrugada', label: 'Madrugada [00h - 06h]', test: h => h >= 0 && h < 6 }, { key: 'manana', label: 'Mañana [06h - 14h]', test: h => h >= 6 && h < 14 }, { key: 'tarde', label: 'Tarde [14h - 22h]', test: h => h >= 14 && h < 22 }, { key: 'noche', label: 'Noche [22h - 24h]', test: h => h >= 22 && h <= 23 } ];
    const dias = [ { key: 1, label: 'Lun' }, { key: 2, label: 'Mar' }, { key: 3, label: 'Mié' }, { key: 4, label: 'Jue' }, { key: 5, label: 'Vie' }, { key: 6, label: 'Sáb' }, { key: 0, label: 'Dom' } ];
    let matriz = {}; franjas.forEach(f => { matriz[f.key] = {}; dias.forEach(d => { matriz[f.key][d.key] = []; }); });
    datos.forEach(r => { 
        const p = PARAMETROS_TECNICOS.find(x => x.solucion === r.solucion); 
        if(p) { 
            const val = parseConcen(r.concen); let estado = 'conforme'; 
            if(val < p.min) estado = 'riesgo'; else if(val > p.max) estado = 'exceso'; 
            let horaStr = r.hora || '00:00:00'; let h = parseInt(horaStr.split(':')[0]) || 0; 
            let fechaObj = new Date(r.fecha + "T00:00:00"); let dKey = isNaN(fechaObj.getDay()) ? 1 : fechaObj.getDay(); 
            let fMatch = franjas.find(f => f.test(h)); 
            if(fMatch && matriz[fMatch.key] && matriz[fMatch.key][dKey] !== undefined) { matriz[fMatch.key][dKey].push({ ...r, estado }); } 
        } 
    });

    if(!isExpanded) heatmapCache = matriz;
    let baseTextSize = isExpanded ? 'text-sm' : 'text-[10px]'; let contentTextSize = isExpanded ? 'text-base' : 'text-xs'; let paddingSize = isExpanded ? 'p-4' : 'p-2.5';
    let html = `<div class="w-full h-full overflow-auto"><table class="w-full text-center border-collapse"><thead><tr class="bg-slate-100 text-slate-600 font-bold ${baseTextSize} uppercase"><th class="${paddingSize} text-left border-b border-slate-200">Turno / Franja</th>`;
    dias.forEach(d => { html += `<th class="${paddingSize} border-b border-slate-200">${d.label}</th>`; }); html += `</tr></thead><tbody class="divide-y divide-slate-100">`;
    franjas.forEach(f => {
        html += `<tr><td class="${paddingSize} text-left font-bold text-slate-700 bg-slate-50 border-r border-slate-100 ${baseTextSize}">${f.label}</td>`;
        dias.forEach(d => {
            let lista = matriz[f.key][d.key]; let count = lista.length; let bgClass = 'bg-slate-50 text-slate-300';
            if(count > 0) {
                let hasRiesgo = lista.some(item => item.estado === 'riesgo'); let hasExceso = lista.some(item => item.estado === 'exceso');
                if(hasRiesgo) bgClass = 'bg-red-100 text-red-800 border border-red-300 font-bold cursor-pointer hover:bg-red-200'; 
                else if(hasExceso) bgClass = 'bg-amber-100 text-amber-800 border border-amber-300 font-bold cursor-pointer hover:bg-amber-200'; 
                else bgClass = 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold cursor-pointer hover:bg-emerald-200';
            }
            html += `<td class="${paddingSize} ${bgClass} transition-all duration-150 rounded" ${count > 0 ? `onclick="clicRadiografiaTurno('${f.key}', ${d.key}, '${d.label}')" title="Clic para ver Radiografía"` : ''}><div class="${contentTextSize}">${count > 0 ? count : ''}</div></td>`;
        }); html += `</tr>`;
    }); html += `</tbody></table></div>`; container.innerHTML = html;
}

function drawTendenciaHistorica(datos, canvasId = 'historicoChart', isExpanded = false) {
    let targetInst = isExpanded ? expandedChartInst : historicoInst; if(targetInst) targetInst.destroy();
    let hist = {}; datos.forEach(r => { let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(p) { if(!hist[r.fecha]) hist[r.fecha] = { total:0, conformes:0, excesos:0, riesgos:0 }; hist[r.fecha].total++; let v = parseConcen(r.concen); if(v < p.min) hist[r.fecha].riesgos++; else if(v > p.max) hist[r.fecha].excesos++; else hist[r.fecha].conformes++; } });
    let fechas = Object.keys(hist).sort(); if(fechas.length === 0) return; if(fechas.length > 30 && !fechaInicioGlobal) fechas = fechas.slice(-30); 
    let arrConformes = fechas.map(f => hist[f].conformes); let arrExcesos = fechas.map(f => hist[f].excesos); let arrRiesgos = fechas.map(f => hist[f].riesgos); let arrEficacias = fechas.map(f => (hist[f].conformes / hist[f].total) * 100);

    let newInst = new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'bar', data: { labels: fechas.map(f => f.substring(5)), datasets: [ { type: 'line', label: 'Eficacia (%)', data: arrEficacias, borderColor: '#273c75', borderWidth: isExpanded ? 4 : 2, fill: false, tension: 0.3, pointRadius: isExpanded ? 6 : 4, pointBackgroundColor: '#273c75', yAxisID: 'porcentaje', order: 0 }, { label: 'Conformes', data: arrConformes, backgroundColor: '#10b981', stack: 'Stack 0', yAxisID: 'volumen', order: 1 }, { label: 'Exceso', data: arrExcesos, backgroundColor: '#f59e0b', stack: 'Stack 0', yAxisID: 'volumen', order: 1 }, { label: 'Riesgo', data: arrRiesgos, backgroundColor: '#ef4444', stack: 'Stack 0', yAxisID: 'volumen', order: 1 } ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: {size: isExpanded ? 14 : 10} } }, tooltip: { mode: 'index', intersect: false, titleFont: {size: isExpanded?16:12}, bodyFont: {size: isExpanded?14:12} } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { font: {size: isExpanded?12:10} } }, volumen: { type: 'linear', position: 'left', stacked: true, title: { display: true, text: 'Volumen', font: {size: isExpanded?12:10, weight: 'bold'}, color: '#64748b' }, ticks: { font: {size: isExpanded?12:10} } }, porcentaje: { type: 'linear', position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%', font: {size: isExpanded?12:10} } } } }
    });
    if(isExpanded) expandedChartInst = newInst; else historicoInst = newInst;
}

function drawMagicQuadrant(datos, canvasId = 'quadrantChart', isExpanded = false) {
    let targetInst = isExpanded ? expandedChartInst : quadrantInst; if(targetInst) targetInst.destroy(); if(datos.length === 0) return;
    let evalSoluciones = {}; datos.forEach(r => { let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(p) { if(!evalSoluciones[r.solucion]) evalSoluciones[r.solucion] = { total: 0, ok: 0 }; evalSoluciones[r.solucion].total++; let v = parseConcen(r.concen); if(v >= p.min && v <= p.max) evalSoluciones[r.solucion].ok++; } });
    let scatterData = []; let tooltipsData = []; Object.keys(evalSoluciones).forEach(sol => { let vol = evalSoluciones[sol].total; let efi = (evalSoluciones[sol].ok / vol) * 100; scatterData.push({ x: efi, y: vol }); tooltipsData.push(sol); });
    
    let newInst = new Chart(document.getElementById(canvasId).getContext('2d'), { 
        type: 'scatter', plugins: [quadrantPlugin], data: { datasets: [{ label: 'Soluciones', data: scatterData, backgroundColor: '#6366f1', borderColor: '#ffffff', borderWidth: 2, pointRadius: isExpanded ? 10 : 7, pointHoverRadius: isExpanded ? 14 : 9 }] }, 
        options: { responsive: true, maintainAspectRatio: false, layout: { padding: { right: 10, top: 10 } }, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', padding: 12, titleFont: {size: isExpanded?14:11}, bodyFont: {size: isExpanded?14:11}, callbacks: { label: function(ctx) { return `${tooltipsData[ctx.dataIndex]}: Eficacia ${ctx.raw.x.toFixed(1)}% | Muestras: ${ctx.raw.y}`; } } } }, scales: { x: { title: { display: true, text: 'Eficacia Sanitaria (%)', font: {size: isExpanded?12:10, weight: 'bold'}, color: '#64748b' }, min: 0, max: 100, grid: { display: true, color: '#f1f5f9' }, ticks: { font: {size: isExpanded?12:10} } }, y: { title: { display: true, text: 'Volumen Operativo', font: {size: isExpanded?12:10, weight: 'bold'}, color: '#64748b' }, min: 0, grid: { display: true, color: '#f1f5f9' }, ticks: { font: {size: isExpanded?12:10} } } } } 
    });
    if(isExpanded) expandedChartInst = newInst; else quadrantInst = newInst;
}

// ==========================================
// CONFORMIDAD TÉCNICA CON VALORES PERMANENTES
// ==========================================
function drawEficaciaSoluciones(datos, canvasId = 'barSolucionesChart', isExpanded = false) {
    let targetInst = isExpanded ? expandedChartInst : barSolucionesInst; if(targetInst) targetInst.destroy();
    let d = {}; datos.forEach(r => { let p = PARAMETROS_TECNICOS.find(x=>x.solucion===r.solucion); if(p) { if(!d[r.solucion]) d[r.solucion] = { t:0, c:0 }; d[r.solucion].t++; let v = parseConcen(r.concen); if(v>=p.min && v<=p.max) d[r.solucion].c++; } });
    let res = Object.keys(d).map(k => ({ n: k, p: Number(((d[k].c / d[k].t) * 100).toFixed(1)), t: d[k].t })).sort((a,b)=>b.t - a.t); if(res.length === 0) return; 
    let barColors = res.map(x => x.p >= 90 ? '#10b981' : (x.p >= 70 ? '#f59e0b' : '#ef4444'));
    
    let newInst = new Chart(document.getElementById(canvasId).getContext('2d'), { 
        type: 'bar', 
        data: { 
            labels: res.map(x => x.n), // Nombres limpios en el eje Y
            datasets: [{ 
                data: res.map(x => x.p), 
                backgroundColor: barColors, 
                borderRadius: 4, 
                barThickness: isExpanded ? 24 : 14 
            }] 
        }, 
        options: { 
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false }, 
                tooltip: { 
                    titleFont: {size: isExpanded?14:12}, 
                    bodyFont: {size: isExpanded?14:12}, 
                    callbacks: { label: c => ` Eficacia: ${c.raw}% | Clic para aislar y ver diagrama de dispersión.` } 
                } 
            }, 
            scales: { 
                x: { max: 100, grid: { color: '#f1f5f9' }, ticks: { font: {size: isExpanded?12:10}, callback: v => v + '%' } }, 
                y: { grid: { display: false }, ticks: { color: '#475569', font: {size: isExpanded?12:9, weight: 'bold'} } } 
            },
            onHover: (e, elements) => { e.native.target.style.cursor = elements.length ? 'pointer' : 'default'; }, 
            onClick: (e, elements) => { if (elements.length > 0) abrirModalDrilldown(res[elements[0].index].n); }
        },
        plugins: [{
            id: 'barValuesEficacia',
            afterDatasetsDraw(chart) {
                const {ctx} = chart;
                chart.data.datasets.forEach((dataset, i) => {
                    chart.getDatasetMeta(i).data.forEach((bar, index) => {
                        let value = dataset.data[index] + '%';
                        ctx.save();
                        ctx.font = 'bold 10px Inter';
                        ctx.fillStyle = '#475569';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(value, bar.x + 6, bar.y);
                        ctx.restore();
                    });
                });
            }
        }]
    });
    if(isExpanded) expandedChartInst = newInst; else barSolucionesInst = newInst;
}

function drawRadarFugas(desvios, canvasId = 'fugaQuimicaChart', isExpanded = false) {
    let targetInst = isExpanded ? expandedChartInst : fugaChartInst; if(targetInst) targetInst.destroy();
    
    let excesos = desvios.filter(d => { let p=PARAMETROS_TECNICOS.find(x=>x.solucion===d.solucion); return p && parseConcen(d.concen)>p.max; });
    
    if(!isExpanded) { const msgObj = document.getElementById('fuga-empty-msg'); if(excesos.length === 0) { if(msgObj) msgObj.classList.remove('hidden'); return; } if(msgObj) msgObj.classList.add('hidden'); }
    if(isExpanded && excesos.length === 0) return;
    
    let fugas = {}; excesos.forEach(e => { 
        if(!fugas[e.solucion]) fugas[e.solucion] = 0; 
        let p=PARAMETROS_TECNICOS.find(x=>x.solucion===e.solucion);
        fugas[e.solucion] += (parseConcen(e.concen) - p.max); 
    }); 
    
    let newInst = new Chart(document.getElementById(canvasId).getContext('2d'), { 
        type: 'radar', data: { labels: Object.keys(fugas), datasets: [{ label: 'Índice de Fuga (Σ%)', data: Object.values(fugas), backgroundColor: 'rgba(245, 158, 11, 0.25)', borderColor: '#f59e0b', pointBackgroundColor: '#ffffff', pointBorderColor: '#f59e0b', pointBorderWidth: 2, pointRadius: isExpanded ? 6 : 4, borderWidth: isExpanded ? 3 : 2 }] }, 
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { titleFont: {size: isExpanded?14:12}, bodyFont: {size: isExpanded?14:12}, callbacks: { label: c => ` Volumen Desperdiciado: ${c.raw.toFixed(2)} Índice de Fuga (Σ%)` } } }, scales: { r: { angleLines: { color: '#e2e8f0' }, grid: { color: '#e2e8f0', circular: true }, pointLabels: { font: { size: isExpanded?12:9, weight: 'bold' }, color: '#475569' }, ticks: { display: false, beginAtZero: true } } } } 
    });
    if(isExpanded) expandedChartInst = newInst; else fugaChartInst = newInst;
}

function expandirGrafico(tipo, titulo) { document.getElementById('expandido-titulo').innerHTML = `<i class="fa-solid fa-expand text-blue-500 mr-2"></i> Vista Detallada: ${titulo}`; document.getElementById('modal-expandido').classList.remove('hidden'); const canvas = document.getElementById('expandidoChart'); const div = document.getElementById('expandidoDiv'); canvas.classList.add('hidden'); div.classList.add('hidden'); const datos = obtenerDatosFiltrados(); if(tipo === 'heatmap') { div.classList.remove('hidden'); drawHeatmapOperativo(datos, 'expandidoDiv', true); } else { canvas.classList.remove('hidden'); if(tipo === 'cuadrante') drawMagicQuadrant(datos, 'expandidoChart', true); if(tipo === 'historico') drawTendenciaHistorica(datos, 'expandidoChart', true); if(tipo === 'barras') drawEficaciaSoluciones(datos, 'expandidoChart', true); if(tipo === 'radar') drawRadarFugas(desviosUltimoFiltro, 'expandidoChart', true); } }
function cerrarModalExpandido() { document.getElementById('modal-expandido').classList.add('hidden'); if(expandedChartInst) { expandedChartInst.destroy(); expandedChartInst = null; } document.getElementById('expandidoDiv').innerHTML = ''; }

// ==========================================
// RADIOGRAFÍA OPERATIVA: GRÁFICAS CON ETIQUETAS VISIBLES (%) Y (VALORES)
// ==========================================
function clicRadiografiaTurno(franjaKey, diaKey, diaLabel) { 
    let lista = heatmapCache[franjaKey] && heatmapCache[franjaKey][diaKey] ? heatmapCache[franjaKey][diaKey] : []; 
    if(lista.length === 0) return; 
    
    let dictQuimicos = {}; let dictOperadores = {}; let dictEquipos = {}; 
    lista.forEach(r => { 
        dictQuimicos[r.solucion] = (dictQuimicos[r.solucion] || 0) + 1; 
        dictOperadores[r.operario || 'Sin nombre'] = (dictOperadores[r.operario || 'Sin nombre'] || 0) + 1; 
        dictEquipos[r.equipo || 'Sin equipo'] = (dictEquipos[r.equipo || 'Sin equipo'] || 0) + 1; 
    }); 
    
    document.getElementById('turno-titulo').innerHTML = `<i class="fa-solid fa-clipboard-user mr-2"></i> Radiografía Operativa: ${franjaKey.toUpperCase()} (${diaLabel.toUpperCase()})`; 
    document.getElementById('modal-turno').classList.remove('hidden'); 
    
    // 1. GRÁFICA DE DONA (QUÍMICOS) CON PORCENTAJES EN LAS ETIQUETAS DIRECTAS
    if(turnoQuimInst) turnoQuimInst.destroy(); 
    let totalQuimicosMuestras = lista.length;
    turnoQuimInst = new Chart(document.getElementById('turnoQuimicosChart').getContext('2d'), { 
        type: 'doughnut', 
        data: { 
            labels: Object.keys(dictQuimicos), 
            datasets: [{ 
                data: Object.values(dictQuimicos), 
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'], 
                borderWidth: 2, 
                borderColor: '#ffffff' 
            }] 
        }, 
        options: { 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { 
                    position: 'right', 
                    labels: { boxWidth: 10, font: {size: 9, family: 'Inter'} } 
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let val = context.raw;
                            let percentage = ((val / totalQuimicosMuestras) * 100).toFixed(1);
                            return ` ${context.label}: ${val} muestras (${percentage}%)`;
                        }
                    }
                }
            } 
        },
        plugins: [{
            id: 'piePercentageLabels',
            afterDraw(chart) {
                const {ctx, chartArea: {width, height}} = chart;
                chart.data.datasets.forEach((dataset, i) => {
                    chart.getDatasetMeta(i).data.forEach((datapoint, index) => {
                        const {x, y} = datapoint.tooltipPosition();
                        let val = dataset.data[index];
                        let percentage = ((val / totalQuimicosMuestras) * 100).toFixed(0) + '%';
                        if ((val / totalQuimicosMuestras) >= 0.04) {
                            ctx.save();
                            ctx.font = 'bold 9px Inter';
                            ctx.fillStyle = '#ffffff';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(percentage, x, y);
                            ctx.restore();
                        }
                    });
                });
            }
        }]
    }); 

    // 2. GRÁFICA DE BARRAS HORIZONTALES (OPERADORES) CON VALORES NUMÉRICOS AL EXTREMO
    if(turnoOpInst) turnoOpInst.destroy(); 
    let opsArr = Object.keys(dictOperadores).map(k => ({ nombre: k, cant: dictOperadores[k] })).sort((a,b)=> b.cant - a.cant); 
    turnoOpInst = new Chart(document.getElementById('turnoOperadoresChart').getContext('2d'), { 
        type: 'bar', 
        data: { 
            labels: opsArr.map(o => o.nombre.split(' ').slice(0,2).join(' ')), 
            datasets: [{ 
                data: opsArr.map(o => o.cant), 
                backgroundColor: '#6366f1', 
                borderRadius: 4 
            }] 
        }, 
        options: { 
            indexAxis: 'y', 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) { return ` Eventos: ${context.raw}`; }
                    }
                }
            }, 
            scales: { 
                x: { ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } }, 
                y: { ticks: { font: {size: 9} }, grid: { display: false } } 
            } 
        },
        plugins: [{
            id: 'barValuesOperator',
            afterDatasetsDraw(chart) {
                const {ctx} = chart;
                chart.data.datasets.forEach((dataset, i) => {
                    chart.getDatasetMeta(i).data.forEach((bar, index) => {
                        let value = dataset.data[index];
                        ctx.save();
                        ctx.font = 'bold 10px Inter';
                        ctx.fillStyle = '#475569';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(value, bar.x + 6, bar.y);
                        ctx.restore();
                    });
                });
            }
        }]
    }); 

    // 3. GRÁFICA DE BARRAS HORIZONTALES (EQUIPOS) CON VALORES NUMÉRICOS AL EXTREMO
    if(turnoEqInst) turnoEqInst.destroy(); 
    let eqArr = Object.keys(dictEquipos).map(k => ({ nombre: k, cant: dictEquipos[k] })).sort((a,b)=> b.cant - a.cant).slice(0, 10); 
    turnoEqInst = new Chart(document.getElementById('turnoEquiposChart').getContext('2d'), { 
        type: 'bar', 
        data: { 
            labels: eqArr.map(e => e.nombre.substring(0, 15) + (e.nombre.length > 15 ? '...' : '')), 
            datasets: [{ 
                data: eqArr.map(e => e.cant), 
                backgroundColor: '#0ea5e9', 
                borderRadius: 4 
            }] 
        }, 
        options: { 
            indexAxis: 'y', 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) { return ` Muestras auditadas: ${context.raw}`; }
                    }
                }
            }, 
            scales: { 
                x: { ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } }, 
                y: { ticks: { font: {size: 9} }, grid: { display: false } } 
            } 
        },
        plugins: [{
            id: 'barValuesEquipment',
            afterDatasetsDraw(chart) {
                const {ctx} = chart;
                chart.data.datasets.forEach((dataset, i) => {
                    chart.getDatasetMeta(i).data.forEach((bar, index) => {
                        let value = dataset.data[index];
                        ctx.save();
                        ctx.font = 'bold 10px Inter';
                        ctx.fillStyle = '#475569';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(value, bar.x + 6, bar.y);
                        ctx.restore();
                    });
                });
            }
        }]
    }); 
}

function cerrarModalTurno() { document.getElementById('modal-turno').classList.add('hidden'); }
function abrirModalDrilldown(solucion) { document.getElementById('modal-drilldown').classList.remove('hidden'); document.getElementById('drilldown-titulo').innerHTML = `<i class="fa-solid fa-microscope text-indigo-500 mr-2"></i> Dispersión Técnica: ${solucion}`; const datosBase = obtenerDatosFiltrados(); const subset = datosBase.filter(r => r.solucion === solucion).slice(0, 100).reverse(); const regla = PARAMETROS_TECNICOS.find(p => p.solucion === solucion); if(drilldownInst) drilldownInst.destroy(); if(!regla || subset.length === 0) return; let dataPoints = subset.map(r => parseConcen(r.concen)); let colors = dataPoints.map(v => v < regla.min ? '#ef4444' : (v > regla.max ? '#f59e0b' : '#10b981')); drilldownInst = new Chart(document.getElementById('drilldownChart').getContext('2d'), { type: 'line', data: { labels: subset.map(r => `${r.fecha.substring(5)} ${r.hora?r.hora.substring(0,5):''}`), datasets: [ { label: 'Muestras', data: dataPoints, showLine: false, pointBackgroundColor: colors, pointBorderColor: '#ffffff', pointBorderWidth: 1.5, pointRadius: 6, pointHoverRadius: 9 }, { label: 'Max', data: Array(subset.length).fill(regla.max), borderColor: '#f59e0b', borderDash: [5,5], pointRadius: 0, fill: false, borderWidth: 2 }, { label: 'Min', data: Array(subset.length).fill(regla.min), borderColor: '#ef4444', borderDash: [5,5], pointRadius: 0, fill: false, borderWidth: 2 } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', padding: 12, callbacks: { label: function(ctx) { let obj = subset[ctx.dataIndex]; return [ `Concentración: ${ctx.raw}%`, `Operador: ${obj.operario || obj.laboratorista}`, `Límites: ${regla.min}% - ${regla.max}%` ]; } } } }, scales: { y: { grid: { color: '#f1f5f9' } }, x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45, font: {size: 10} } } } } }); }
function cerrarModalDrilldown() { document.getElementById('modal-drilldown').classList.add('hidden'); }
function abrirModalDetalle(tipo) { const modal = document.getElementById('modal-detalle'); const tbody = document.getElementById('modal-tbody'); if(!modal || !tbody) return; tbody.innerHTML = ''; const datos = obtenerDatosFiltrados(); let rsl = []; if(tipo === 'conformes') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)>=p.min && parseConcen(f.concen)<=p.max;}); if(tipo === 'riesgo') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)<p.min;}); if(tipo === 'exceso') rsl = datos.filter(f=>{let p=PARAMETROS_TECNICOS.find(x=>x.solucion===f.solucion); return p && parseConcen(f.concen)>p.max;}); document.getElementById('modal-titulo').innerText = tipo === 'conformes' ? "Auditoría: Muestras Conformes (Óptimas)" : (tipo === 'riesgo' ? "Auditoría: Desvíos por Riesgo (< Mínimo)" : "Auditoría: Desvíos por Sobredosificación (> Máximo)"); if(rsl.length===0) { tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-500 font-bold bg-slate-50">Sin registros en este filtro.</td></tr>`; } else { rsl.slice(0, 100).forEach(r => { let badgeColor = tipo === 'conformes' ? 'text-emerald-600 bg-emerald-50' : (tipo === 'riesgo' ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'); tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-100"><td class="py-3 px-6">${r.fecha} ${r.hora?r.hora.substring(0,5):''}</td><td class="py-3 px-6 font-bold text-slate-800">${r.equipo}</td><td class="py-3 px-6 text-slate-600">${r.solucion}</td><td class="py-3 px-6 text-center font-black ${badgeColor}">${r.concen}</td><td class="py-3 px-6 text-[10px] text-slate-500">${r.operario || r.laboratorista}</td></tr>`; }); } modal.classList.remove('hidden'); }
function cerrarModalDetalle() { document.getElementById('modal-detalle').classList.add('hidden'); }

// ==========================================
// MODAL DE IMPACTO INDEPENDIENTE Y SEGURO
// ==========================================
function abrirModalImpacto(tipo = 'fuga') {
    const modal = document.getElementById('modal-impacto'); 
    const thead = document.getElementById('modal-impacto-thead');
    const tbody = document.getElementById('modal-impacto-tbody');
    const tituloModal = document.getElementById('modal-impacto-titulo');
    const subtituloModal = document.getElementById('modal-impacto-subtitulo');
    
    if(!modal || !tbody || !thead) return; 
    tbody.innerHTML = '';
    
    let datosAnalisis = [];
    if (tipo === 'fuga') {
        datosAnalisis = desviosUltimoFiltro.filter(d => {
            let p = PARAMETROS_TECNICOS.find(x => x.solucion === d.solucion);
            return p && parseConcen(d.concen) > p.max; 
        });
    } else if (tipo === 'severidad') {
        datosAnalisis = desviosUltimoFiltro.filter(d => {
            let p = PARAMETROS_TECNICOS.find(x => x.solucion === d.solucion);
            return p && parseConcen(d.concen) < p.min; 
        });
    }

    if(datosAnalisis.length === 0) {
        thead.innerHTML = `<tr><th class="py-3 px-4">Análisis de Desvíos</th></tr>`;
        tbody.innerHTML = `<tr><td class="py-8 text-center text-slate-500 font-bold bg-slate-50">No hay eventos que apliquen a este criterio.</td></tr>`;
        modal.classList.add('flex'); modal.classList.remove('hidden'); return;
    }

    let agrupado = {};
    datosAnalisis.forEach(d => {
        if(!agrupado[d.solucion]) { agrupado[d.solucion] = { conteo: 0, valorAcumulado: 0 }; }
        agrupado[d.solucion].conteo++;
        
        let p = PARAMETROS_TECNICOS.find(x => x.solucion === d.solucion);
        let val = parseConcen(d.concen);
        
        if (tipo === 'fuga') {
            agrupado[d.solucion].valorAcumulado += (val - p.max);
        } else if (tipo === 'severidad') {
            agrupado[d.solucion].valorAcumulado += (p.min - val);
        }
    });

    let ranking = Object.keys(agrupado).map(k => ({ 
        sol: k, 
        c: agrupado[k].conteo, 
        val: agrupado[k].valorAcumulado
    }));

    if (tipo === 'severidad') {
        ranking.sort((a, b) => (b.val / b.c) - (a.val / a.c));
        if(tituloModal) tituloModal.innerHTML = `<i class="fa-solid fa-gauge-high text-red-500 mr-2"></i> Desglose de Severidad Técnica`;
        if(subtituloModal) subtituloModal.innerText = `Soluciones que incurrieron en Riesgo (< Mínimo), ordenadas por gravedad.`;
        
        thead.innerHTML = `
            <tr class="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                <th class="py-3 px-4">Solución Química (Riesgo)</th>
                <th class="py-3 px-4 text-center">Muestras Desviadas</th>
                <th class="py-3 px-4 text-center text-red-600"><i class="fa-solid fa-gauge-high mr-1"></i> Severidad Prom.</th>
            </tr>
        `;
    } else {
        ranking.sort((a, b) => b.val - a.val);
        if(tituloModal) tituloModal.innerHTML = `<i class="fa-solid fa-hand-holding-dollar text-amber-600 mr-2"></i> Desglose de Fuga Financiera (Σ%)`;
        if(subtituloModal) subtituloModal.innerText = `Soluciones Sobredosificadas (> Máximo), agrupadas por la pérdida de químicos.`;
        
        thead.innerHTML = `
            <tr class="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                <th class="py-3 px-4">Solución Química (Sobredosis)</th>
                <th class="py-3 px-4 text-center">Muestras Desviadas</th>
                <th class="py-3 px-4 text-center text-amber-600"><i class="fa-solid fa-hand-holding-dollar mr-1"></i> Fuga Acumulada</th>
            </tr>
        `;
    }

    ranking.forEach(item => {
        let celdaDinamica = '';
        if (tipo === 'severidad') {
            let promedio = item.val / item.c;
            celdaDinamica = `<td class="py-4 px-4 text-center font-bold text-red-500 bg-red-50/80">${promedio.toFixed(2)}%</td>`;
        } else {
            celdaDinamica = `<td class="py-4 px-4 text-center font-black text-amber-600 bg-amber-50/80">$ ${item.val.toFixed(2)}</td>`;
        }
        
        tbody.innerHTML += `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="py-4 px-4 font-bold text-slate-700">${item.sol}</td>
            <td class="py-4 px-4 text-center text-slate-500 font-bold">${item.c} <span class="text-[9px] font-normal text-slate-400 block">eventos</span></td>
            ${celdaDinamica}
        </tr>`;
    });
    
    modal.classList.add('flex');
    modal.classList.remove('hidden');
}

function cerrarModalImpacto() { 
    const modal = document.getElementById('modal-impacto');
    if(modal) { modal.classList.remove('flex'); modal.classList.add('hidden'); }
}

async function dispararAnalisisIA() { 
    const tbody = document.getElementById('ai-action-plan-tbody'); 
    if(desviosUltimoFiltro.length === 0) return; 
    if(!obtenerApiKeySegura()) { tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-500 font-bold bg-slate-50 rounded-lg">Falta API Key.</td></tr>`; return; } 
    tbody.innerHTML = `<tr><td colspan="3" class="py-10 text-center text-blue-600 font-bold animate-pulse bg-blue-50/50 rounded-lg"><i class="fa-solid fa-microchip mr-2"></i>Evaluando matemáticas operativas con 3.5 Flash-Lite...</td></tr>`; 
    
    let excesos = desviosUltimoFiltro.filter(d => { let p=PARAMETROS_TECNICOS.find(x=>x.solucion===d.solucion); return p && parseConcen(d.concen)>p.max; });
    
    let totalExcesos = excesos.length; let statsFugas = {}; let opsStats = {}; 
    excesos.forEach(e => { 
        if(!statsFugas[e.solucion]) statsFugas[e.solucion] = { conteo: 0, volumenPerdido: 0 }; 
        statsFugas[e.solucion].conteo++; 
        let p=PARAMETROS_TECNICOS.find(x=>x.solucion==e.solucion);
        statsFugas[e.solucion].volumenPerdido += (parseConcen(e.concen) - p.max); 
        let op = e.operario || e.laboratorista || 'Desconocido'; opsStats[op] = (opsStats[op] || 0) + 1; 
    }); 
    
    let desgloseTexto = `TOTAL EVENTOS EXCESO: ${totalExcesos}\n`; 
    Object.keys(statsFugas).forEach(sol => { desgloseTexto += `- Químico ${sol}: ${((statsFugas[sol].conteo / totalExcesos) * 100).toFixed(1)}% de eventos. Costo de Fuga acumulada: ${statsFugas[sol].volumenPerdido.toFixed(2)}.\n`; }); 
    
    const prompt = `Eres Analista de Datos Ejecutivo en Lácteos San Antonio. Analiza ESTOS DATOS DUROS referidos a mermas químicas:\n\n${desgloseTexto}\nOperadores implicados: ${Object.keys(opsStats).map(op => `${op} (${opsStats[op]} eventos)`).join(', ')}\n\nREGLAS ESTRICTAS:\n1. Explica qué químico representa la mayor fuga/costo desperdiciado de inventario.\n2. Incluye siempre una "Alerta de Impacto en Costos" clara en el análisis.\n3. PROHIBIDO recomendaciones mecánicas o teóricas de mantenimiento general.\n4. Devuelve el resultado en JSON estricto: [{"desvio": "Hallazgo principal", "analisis_datos": "Análisis con Alerta de Costos", "responsable": "Nombre"}]. Sin markdown.`; 
    
    try { 
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${obtenerApiKeySegura()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }); 
        if (!res.ok) throw new Error(await res.text()); 
        const jsonRes = await res.json(); 
        let plan = JSON.parse((jsonRes.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/gi, '').trim()); 
        tbody.innerHTML = ''; 
        plan.forEach(item => { tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-100"><td class="py-4 px-3 align-top text-amber-600 font-bold text-[11px]">${item.desvio}</td><td class="py-4 px-3 align-top text-slate-600 text-[11px] leading-relaxed">${item.analisis_datos}</td><td class="py-4 px-3 align-top text-slate-500 font-mono text-[10px]">${item.responsable}</td></tr>`; }); 
    } catch(err) { tbody.innerHTML = `<tr><td colspan="3" class="py-6 px-6 text-center text-red-500 font-bold text-[11px] bg-red-50 rounded-lg">Fallo IA: ${err.message}.</td></tr>`; } 
}

function obtenerApiKeySegura() { return localStorage.getItem('poes_gemini_key') || ''; }
function actualizarBadgeIA() { const b = document.getElementById('badge-ia-status'); if(!b) return; if(obtenerApiKeySegura()) { b.innerHTML = `<i class="fa-solid fa-check text-green-500 mr-1"></i> IA Lista`; b.className = "text-[10px] font-bold px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200 shadow-sm"; } else { b.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> Falta API Key`; b.className = "text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-400 border border-slate-200 shadow-sm"; } }
function abrirConfigIA() { document.getElementById('input-api-key').value = obtenerApiKeySegura(); document.getElementById('modal-config-ia').classList.remove('hidden'); }
function cerrarConfigIA() { document.getElementById('modal-config-ia').classList.add('hidden'); }
function guardarApiKey() { localStorage.setItem('poes_gemini_key', document.getElementById('input-api-key').value.trim()); cerrarConfigIA(); actualizarBadgeIA(); }
function limpiarApiKey() { localStorage.removeItem('poes_gemini_key'); cerrarConfigIA(); actualizarBadgeIA(); }

// ==========================================
// MÓDULO DE IMPORTACIÓN DE EXCEL (BLINDAJE TOTAL ANTI-NULL)
// ==========================================
async function importarArchivoExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const loader = document.getElementById('loader');
    const loaderText = loader ? loader.querySelector('p') : null;
    if(loader) {
        loader.classList.remove('opacity-0', 'pointer-events-none');
        if(loaderText) loaderText.innerText = 'EXTRAYENDO Y LIMPIANDO DATOS DEL EXCEL...';
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: null });
            
            if(rawData.length === 0) {
                alert('El archivo Excel está vacío o no tiene el formato correcto.');
                if(loader) loader.classList.add('opacity-0', 'pointer-events-none');
                return;
            }

            const parseExcelDate = (val) => {
                if (!val) return null;
                if (typeof val === 'number') {
                    let utc_days = Math.floor(val - 25569);
                    let date_info = new Date(utc_days * 86400 * 1000);
                    let y = date_info.getUTCFullYear();
                    let m = String(date_info.getUTCMonth() + 1).padStart(2, '0');
                    let d = String(date_info.getUTCDate()).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                }
                
                let strVal = String(val).trim();
                let datePart = strVal.split(' ')[0]; 
                let parts = datePart.split(/[/\-]/);
                
                if (parts.length === 3) {
                    if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                }
                
                let fallback = new Date(strVal);
                if (!isNaN(fallback)) return fallback.toISOString().split('T')[0];
                return null;
            };

            const parseExcelTime = (val) => {
                if (val === null || val === undefined || val === '') return '00:00:00';
                let strVal = String(val).trim();
                if (typeof val === 'number') {
                    let frac = val - Math.floor(val);
                    let totalSeconds = Math.floor(frac * 86400 + 0.5);
                    let h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
                    let m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
                    let s = String(totalSeconds % 60).padStart(2, '0');
                    return `${h}:${m}:${s}`;
                }
                if (strVal.includes(' ')) {
                    let timePart = strVal.split(' ')[1];
                    if (timePart) strVal = timePart;
                }
                if (strVal.includes(':')) {
                    let parts = strVal.split(':');
                    let h = parts[0].padStart(2, '0');
                    let m = (parts[1] || '00').padStart(2, '0');
                    let s = (parts[2] || '00').padStart(2, '0');
                    return `${h}:${m}:${s}`;
                }
                return '00:00:00';
            };

            const findValue = (row, keywords) => {
                const foundKey = Object.keys(row).find(k => keywords.some(kw => k.includes(kw)));
                return foundKey ? row[foundKey] : null;
            };

            const registrosNuevos = rawData.map(row => {
                let cleanRow = {};
                Object.keys(row).forEach(key => {
                    let cleanKey = key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    cleanRow[cleanKey] = row[key];
                });

                let f = findValue(cleanRow, ['fecha', 'date', 'creado']);
                let h = findValue(cleanRow, ['hora', 'time']);
                if (!h && String(f).includes(' ')) h = String(f).split(' ')[1];

                let eq = findValue(cleanRow, ['equipo', 'maquina', 'linea']);
                let sol = findValue(cleanRow, ['solucion', 'quimico', 'producto']);
                let conc = findValue(cleanRow, ['concen', 'resultado', 'valor']);
                
                let op = findValue(cleanRow, ['operario', 'operador', 'responsable']);
                let lab = findValue(cleanRow, ['laboratorista', 'analista', 'calidad']);
                
                let proc = findValue(cleanRow, ['proceso', 'tipo']);
                let mesRaw = findValue(cleanRow, ['mes', 'month']);

                let fechaParsed = parseExcelDate(f);
                let mesFinal = "N/A";

                if (mesRaw) {
                    mesFinal = String(mesRaw).trim().toUpperCase();
                } else if (fechaParsed) {
                    const nombresMeses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
                    let parts = fechaParsed.split('-');
                    if (parts.length === 3) {
                        let mIndex = parseInt(parts[1], 10) - 1;
                        if (mIndex >= 0 && mIndex < 12) {
                            mesFinal = nombresMeses[mIndex];
                        }
                    }
                }

                return {
                    fecha: fechaParsed,
                    hora: parseExcelTime(h),
                    mes: mesFinal,
                    equipo: String(eq || 'N/A').trim(),
                    solucion: estandarizarSolucion(String(sol || 'S/N').trim()), 
                    concen: String(conc || '0').replace('%', '').replace(',', '.').replace(/[^\d.-]/g, '').trim(),
                    operario: String(op || lab || 'Desconocido').trim(), 
                    laboratorista: String(lab || op || 'Desconocido').trim(), 
                    proceso: String(proc || 'CIP').trim().toUpperCase()
                };
            }).filter(r => r.fecha && r.solucion !== 'S/N'); 

            if(registrosNuevos.length === 0) {
                alert('No se encontraron registros tras la limpieza. Revisa que tu Excel tenga fechas válidas.');
                if(loader) loader.classList.add('opacity-0', 'pointer-events-none');
                return;
            }

            if (loaderText) loaderText.innerText = `SUBIENDO ${registrosNuevos.length} REGISTROS SANITIZADOS...`;

            const chunkSize = 500;
            let huboError = false;
            
            for (let i = 0; i < registrosNuevos.length; i += chunkSize) {
                const lote = registrosNuevos.slice(i, i + chunkSize);
                const { error } = await clienteSupabase.from('registros_limpieza').insert(lote);
                
                if (error) {
                    console.error('Error insertando lote en Supabase:', error);
                    huboError = true;
                    alert(`Fallo en la nube: ${error.message}.`);
                    break;
                }
            }

            if (!huboError) {
                alert(`¡Auditoría cargada con éxito! Se inyectaron ${registrosNuevos.length} registros a la base de datos.`);
            }

            if (loaderText) loaderText.innerText = 'CONSOLIDANDO DASHBOARD...';
            await cargarSupabase(); 
            
        } catch (error) {
            console.error("Error crítico de JS durante la lectura:", error);
            alert("Error procesando Excel. Verifica formato.");
        } finally {
            event.target.value = ''; 
            if(loader) loader.classList.add('opacity-0', 'pointer-events-none');
            if(loaderText) loaderText.innerText = 'CARGANDO MÓDULO POES...';
        }
    };
    
    reader.readAsArrayBuffer(file);
}
