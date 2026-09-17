// ==========================================
// 1. CREDENCIALES DE SUPABASE Y GEMINI API
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';

const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

// Coloca aquí tu clave API de Gemini para habilitar el dictamen ejecutivo inteligente en tiempo real
const GEMINI_API_KEY = 'TU_CLAVE_API_DE_GEMINI'; 

// Matriz de Parámetros de Calidad Oficiales (Lácteos San Antonio)
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
let chartStatusInstance = null;
let chartTrendInstance = null;
let chartEquiposSolucionesInstance = null;

// ==========================================
// UTILIDADES DE NORMALIZACIÓN Y PARSÉO
// ==========================================
function normalizarTexto(texto) {
    if (!texto) return '';
    return String(texto).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function estandarizarNombreSolucion(nombre) {
    if (!nombre) return 'S/N';
    let limpio = normalizarTexto(nombre);
    
    if (limpio.includes('SOSA (MADRE)')) return 'SOSA (MADRE)';
    if (limpio.includes('SOSA (CENTRO ACOPIO)')) return 'SOSA (CENTRO ACOPIO)';
    if (limpio.includes('SOSA (PASIVACION')) return 'SOSA (PASIVACIÓN)';
    if (limpio.includes('SOSA')) return 'SOSA';
    
    if (limpio.includes('ACIDO NITRICO MADRE')) return 'ÁCIDO NÍTRICO MADRE';
    if (limpio.includes('ACIDO NITRICO')) return 'ÁCIDO NÍTRICO';
    if (limpio.includes('ACIDO PERACETICO')) return 'ÁCIDO PERACÉTICO';
    if (limpio.includes('ACIDO FOSFORICO')) return 'ÁCIDO FOSFÓRICO';
    if (limpio.includes('ACIDO (PASIVACION')) return 'ÁCIDO (PASIVACIÓN)';
    
    if (limpio.includes('AGUA ENJUAGUE')) return 'AGUA ENJUAGUE';
    if (limpio.includes('PEROXIDO')) return 'PEROXIDO';
    if (limpio.includes('BACOXIN')) return 'BACOXIN';
    if (limpio.includes('CLORO')) return 'CLORO';
    
    return String(nombre).trim().toUpperCase();
}

function parseConcen(val) {
    if (val === null || val === undefined || val === '') return 0;
    const num = parseFloat(String(val).replace(',', '.'));
    return isNaN(num) ? 0 : num;
}

function estandarizarFechaParaBD(fechaIn) {
    if (!fechaIn) return new Date().toISOString().split('T')[0];
    if (typeof fechaIn === 'number') {
        const fechaObj = new Date((fechaIn - (25567 + 2)) * 86400 * 1000); 
        return fechaObj.toISOString().split('T')[0];
    }
    const fechaStr = String(fechaIn).trim();
    if (fechaStr.match(/^\d{4}-\d{2}-\d{2}/)) return fechaStr.substring(0, 10);
    
    const regexEcuador = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
    const match = fechaStr.match(regexEcuador);
    if (match) {
        return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`; 
    }
    return new Date().toISOString().split('T')[0];
}

// ==========================================
// 2. INICIALIZACIÓN Y CARGA DE DATOS
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await descargarTodosLosRegistrosSupabase();
        poblarFiltrosSelectDesdeDatos();
        configurarEventosFiltros();
        revelarInterfazDashboard();
    } catch (error) {
        console.error("Error crítico de inicio:", error);
    }
});

async function descargarTodosLosRegistrosSupabase() {
    let chunkSize = 1000;
    let offset = 0;
    let keepFetching = true;
    let acumulador = [];

    while (keepFetching) {
        const { data, error } = await clienteSupabase
            .from('registros_limpieza')
            .select('*')
            .range(offset, offset + chunkSize - 1);

        if (error) { console.error("Error al descargar bloque:", error); break; }

        if (data && data.length > 0) {
            acumulador = acumulador.concat(data);
            offset += chunkSize;
            if (data.length < chunkSize) keepFetching = false;
        } else {
            keepFetching = false;
        }
    }

    listaRegistros = acumulador.map(r => ({
        ...r,
        solucion: estandarizarNombreSolucion(r.solucion),
        equipo: String(r.equipo || 'GENERAL').trim()
    }));

    document.getElementById('info-registros-totales').innerText = `${listaRegistros.length.toLocaleString()} registros sincronizados`;
    
    actualizarSelectoresDinamicos();
    aplicarFiltrosYRenderizar();
}

async function importarArchivoExcel(event) {
    const archivo = event.target.files[0];
    if (!archivo) return;

    const lector = new FileReader();
    lector.onload = async function(e) {
        try {
            const datosBinarios = new Uint8Array(e.target.result);
            const libro = XLSX.read(datosBinarios, { type: 'array' });
            const hoja = libro.Sheets[libro.SheetNames[0]];
            const filasJson = XLSX.utils.sheet_to_json(hoja);

            if (filasJson.length === 0) { alert("El archivo está vacío."); return; }

            alert(`Procesando y normalizando ${filasJson.length} muestras para Supabase...`);

            let nuevosRegistros = filasJson.map(row => ({
                fecha: estandarizarFechaParaBD(row.FECHA || row.fecha),
                mes: normalizarTexto(row.MES || row.mes || 'N/A'),
                hora: row.HORA || row.hora || '00:00:00',
                solucion: estandarizarNombreSolucion(row.SOLUCION || row.solucion),
                equipo: String(row.EQUIPO || row.equipo || 'GENERAL').trim(),
                proceso: normalizarTexto(row.PROCESO || row.proceso || 'CIP'),
                concen: parseConcen(row.CONCEN || row.concen),
                operario: normalizarTexto(row.OPERARIO || row.operario || 'S/N'),
                laboratorista: normalizarTexto(row.LABORATORISTA || row.laboratorista || 'S/N')
            }));

            let tamañoLoteSubida = 500;
            for (let i = 0; i < nuevosRegistros.length; i += tamañoLoteSubida) {
                let lote = nuevosRegistros.slice(i, i + tamañoLoteSubida);
                await clienteSupabase.from('registros_limpieza').insert(lote);
            }

            alert("¡Importación y normalización finalizadas con éxito!");
            await descargarTodosLosRegistrosSupabase();
        } catch (err) {
            console.error("Fallo de importación Excel:", err);
            alert("Error al leer el archivo Excel.");
        }
    };
    lector.readAsArrayBuffer(archivo);
}

// ==========================================
// 3. FILTROS Y SELECTORES DINÁMICOS
// ==========================================
function poblarFiltrosSelectDesdeDatos() {
    const selectSolucion = document.getElementById('filtro-solucion');
    selectSolucion.innerHTML = `<option value="TODAS">Todas</option>`;
    const solucionesUnicas = [...new Set(PARAMETROS_TECNICOS.map(p => p.solucion))];
    solucionesUnicas.forEach(sol => {
        const opt = document.createElement('option'); opt.value = sol; opt.innerText = sol;
        selectSolucion.appendChild(opt);
    });
}

function actualizarSelectoresDinamicos() {
    const selectEquipo = document.getElementById('filtro-equipo');
    const selectAnio = document.getElementById('filtro-anio');
    let equiposSet = new Set(), aniosSet = new Set();

    listaRegistros.forEach(r => {
        if (r.equipo) equiposSet.add(r.equipo);
        if (r.fecha && r.fecha.length >= 4) aniosSet.add(r.fecha.substring(0, 4));
    });

    let eqActual = selectEquipo.value;
    selectEquipo.innerHTML = `<option value="TODOS">Todos</option>`;
    Array.from(equiposSet).sort().forEach(eq => {
        const opt = document.createElement('option'); opt.value = eq; opt.innerText = eq;
        selectEquipo.appendChild(opt);
    });
    selectEquipo.value = eqActual;

    let anioActual = selectAnio.value;
    selectAnio.innerHTML = `<option value="TODOS">Todos</option>`;
    Array.from(aniosSet).sort().reverse().forEach(an => {
        const opt = document.createElement('option'); opt.value = an; opt.innerText = an;
        selectAnio.appendChild(opt);
    });
    selectAnio.value = anioActual;
}

function configurarEventosFiltros() {
    ['filtro-solucion', 'filtro-equipo', 'filtro-anio', 'filtro-mes'].forEach(id => {
        document.getElementById(id).addEventListener('change', aplicarFiltrosYRenderizar);
    });
}

function obtenerDatosFiltrados() {
    const solSel = document.getElementById('filtro-solucion').value;
    const eqSel = document.getElementById('filtro-equipo').value;
    const anioSel = document.getElementById('filtro-anio').value;
    const mesSel = document.getElementById('filtro-mes').value;

    return listaRegistros.filter(r => {
        let matchSol = (solSel === 'TODAS' || r.solucion === solSel);
        let matchEq = (eqSel === 'TODOS' || r.equipo === eqSel);
        let matchAnio = (anioSel === 'TODOS' || (r.fecha && r.fecha.substring(0, 4) === anioSel));
        
        let matchMes = true;
        if (mesSel !== 'TODOS') {
            let mesBD = (r.fecha && r.fecha.length >= 7) ? r.fecha.substring(5, 7) : ''; 
            let nombreMesBD = normalizarTexto(r.mes); 
            matchMes = (mesBD === mesSel || nombreMesBD.includes(normalizarTexto(mesSel)) || obtenerNombreMes(mesSel) === nombreMesBD);
        }
        
        return matchSol && matchEq && matchAnio && matchMes;
    });
}

function obtenerNombreMes(val) {
    const mesesMap = { 
        '01': 'ENERO', '02': 'FEBRERO', '03': 'MARZO', '04': 'ABRIL', '05': 'MAYO', '06': 'JUNIO', 
        '07': 'JULIO', '08': 'AGOSTO', '09': 'SEPTIEMBRE', '10': 'OCTUBRE', '11': 'NOVIEMBRE', '12': 'DICIEMBRE',
        'ENERO': 'ENERO', 'FEBRERO': 'FEBRERO', 'MARZO': 'MARZO', 'ABRIL': 'ABRIL', 'MAYO': 'MAYO', 'JUNIO': 'JUNIO',
        'JULIO': 'JULIO', 'AGOSTO': 'AGOSTO', 'SEPTIEMBRE': 'SEPTIEMBRE', 'OCTUBRE': 'OCTUBRE', 'NOVIEMBRE': 'NOVIEMBRE', 'DICIEMBRE': 'DICIEMBRE'
    };
    return mesesMap[normalizarTexto(val)] || '';
}

// ==========================================
// 4. PROCESAMIENTO ANALÍTICO Y RENDERIZADO
// ==========================================
function aplicarFiltrosYRenderizar() {
    const datosActivos = obtenerDatosFiltrados();

    let conformes = 0; let riesgoDeficit = 0; let excesoIneficiente = 0; 
    let resumenDesvios = { equiposRiesgo: {}, equiposExceso: {} };

    datosActivos.forEach(fila => {
        const regla = PARAMETROS_TECNICOS.find(p => p.solucion === fila.solucion);
        
        if (regla) {
            const val = parseConcen(fila.concen);
            const min = parseFloat(regla.min);
            const max = parseFloat(regla.max);

            if (val < min) {
                riesgoDeficit++;
                resumenDesvios.equiposRiesgo[fila.equipo] = (resumenDesvios.equiposRiesgo[fila.equipo] || 0) + 1;
            } else if (val > max) {
                excesoIneficiente++;
                resumenDesvios.equiposExceso[fila.equipo] = (resumenDesvios.equiposExceso[fila.equipo] || 0) + 1;
            } else {
                conformes++;
            }
        }
    });

    const total = datosActivos.length;
    const eficaces = conformes + excesoIneficiente;
    const pctEficacia = total > 0 ? ((eficaces / total) * 100).toFixed(1) : 0;

    document.getElementById('kpi-eficacia').innerText = pctEficacia + '%';
    document.getElementById('kpi-desvios').innerText = riesgoDeficit.toLocaleString();
    document.getElementById('kpi-excesos').innerText = excesoIneficiente.toLocaleString();
    document.getElementById('kpi-total').innerText = total.toLocaleString();

    renderizarGraficas(datosActivos, { conformes, excesoIneficiente, riesgoDeficit, total });
    generarDictamenInteligenteIA(datosActivos, { total, eficaces, riesgoDeficit, excesoIneficiente, resumenDesvios });
    renderizarGraficoSolucionesHorizontal(datosActivos);
}

// ==========================================
// 5. MOTOR GRÁFICO ROBUSTO Y SINCRONIZADO
// ==========================================
function renderizarGraficas(registrosFiltrados, kpis) {
    const total = kpis.total > 0 ? kpis.total : 1;
    const pOptimo = ((kpis.conformes / total) * 100).toFixed(1);
    const pExceso = ((kpis.excesoIneficiente / total) * 100).toFixed(1);
    const pRiesgo = ((kpis.riesgoDeficit / total) * 100).toFixed(1);

    document.getElementById('leg-optimo').innerText = `Opt: ${pOptimo}%`;
    document.getElementById('leg-exceso').innerText = `Exc: ${pExceso}%`;
    document.getElementById('leg-riesgo').innerText = `Ries: ${pRiesgo}%`;

    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    if (chartStatusInstance) chartStatusInstance.destroy();

    chartStatusInstance = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: [`Óptimo (${pOptimo}%)`, `Exceso (${pExceso}%)`, `Riesgo (${pRiesgo}%)`],
            datasets: [{
                data: [kpis.conformes, kpis.excesoIneficiente, kpis.riesgoDeficit],
                backgroundColor: ['#10b981', '#f59e0b', '#dc2626'],
                borderWidth: 2, borderColor: '#ffffff', hoverOffset: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10, weight: 'bold' } } } }, cutout: '65%' }
    });

    const solSel = document.getElementById('filtro-solucion').value;
    let quimicoAGraficar = solSel;

    if (solSel === 'TODAS') {
        let conteoSoluciones = {};
        registrosFiltrados.forEach(r => {
            conteoSoluciones[r.solucion] = (conteoSoluciones[r.solucion] || 0) + 1;
        });
        let mayorSol = Object.keys(conteoSoluciones).reduce((a, b) => conteoSoluciones[a] > conteoSoluciones[b] ? a : b, 'SOSA (MADRE)');
        quimicoAGraficar = mayorSol;
        document.getElementById('label-quimico-activo').innerText = `${mayorSol} (Predominante en filtro)`;
    } else {
        document.getElementById('label-quimico-activo').innerText = solSel;
    }

    const reglaTrend = PARAMETROS_TECNICOS.find(p => p.solucion === quimicoAGraficar);
    const regsTrend = registrosFiltrados.filter(r => r.solucion === quimicoAGraficar).slice(0, 45).reverse();

    const canvasEl = document.getElementById('trendChart');
    if (!canvasEl) return;
    const ctxTrend = canvasEl.getContext('2d');
    if (chartTrendInstance) chartTrendInstance.destroy();

    if (!reglaTrend || regsTrend.length === 0) {
        chartTrendInstance = new Chart(ctxTrend, { type: 'line', data: { labels: [], datasets: [] }}); 
        return;
    }

    const min = parseFloat(reglaTrend.min);
    const max = parseFloat(reglaTrend.max);

    const coloresFondoPunto = regsTrend.map(r => {
        const v = parseConcen(r.concen);
        if (v < min) return '#dc2626'; 
        if (v > max) return '#f59e0b'; 
        return '#10b981'; 
    });

    const tamañosPunto = regsTrend.map(r => { const v = parseConcen(r.concen); return (v < min || v > max) ? 7 : 4; });

    chartTrendInstance = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: regsTrend.map(r => (r.fecha || '') + ' ' + (r.hora ? r.hora.substring(0,5) : '')),
            datasets: [
                {
                    label: 'Concentración Real', data: regsTrend.map(r => parseConcen(r.concen)),
                    borderColor: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.1)', borderWidth: 2, tension: 0.3, fill: true,
                    pointBackgroundColor: coloresFondoPunto, pointBorderColor: '#ffffff', pointBorderWidth: 1.5, pointRadius: tamañosPunto, pointHoverRadius: 8
                },
                { label: 'Máx. (' + max + ')', data: Array(regsTrend.length).fill(max), borderColor: '#f59e0b', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false },
                { label: 'Mín. (' + min + ')', data: Array(regsTrend.length).fill(min), borderColor: '#dc2626', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top' },
                tooltip: { callbacks: { label: function(context) {
                    let lbl = context.dataset.label || ''; if (lbl) lbl += ': ';
                    if (context.parsed.y !== null) lbl += context.parsed.y;
                    const v = context.parsed.y;
                    if (context.datasetIndex === 0) { if (v < min) lbl += ' (RIESGO)'; else if (v > max) lbl += ' (EXCESO)'; else lbl += ' (ÓPTIMO)'; }
                    return lbl;
                }}} 
            },
            scales: { y: { grid: { color: '#f1f5f9' }, suggestedMin: min - (min * 0.2), suggestedMax: max + (max * 0.2) }, x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 } } } }
        }
    });
}

function renderizarGraficoSolucionesHorizontal(registros) {
    const ctx = document.getElementById('equiposSolucionesChart').getContext('2d');
    if (chartEquiposSolucionesInstance) chartEquiposSolucionesInstance.destroy();

    let conteoEqSol = {}; let solucionesUnicas = new Set();
    registros.forEach(r => {
        let eq = r.equipo || 'SIN EQUIPO'; let sol = r.solucion || 'OTRA';
        solucionesUnicas.add(sol);
        if (!conteoEqSol[eq]) conteoEqSol[eq] = { total: 0 };
        conteoEqSol[eq][sol] = (conteoEqSol[eq][sol] || 0) + 1; conteoEqSol[eq].total++;
    });

    let equiposLabels = Object.keys(conteoEqSol);
    if (document.getElementById('filtro-equipo').value === 'TODOS') equiposLabels = equiposLabels.slice(0, 10);
    
    let solsArray = Array.from(solucionesUnicas);
    let coloresPalette = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];

    let datasets = solsArray.map((sol, index) => {
        let dataPorEquipo = equiposLabels.map(eq => {
            let totalEq = conteoEqSol[eq].total; let countSol = conteoEqSol[eq][sol] || 0;
            return totalEq > 0 ? parseFloat(((countSol / totalEq) * 100).toFixed(1)) : 0;
        });
        return { label: sol, data: dataPorEquipo, backgroundColor: coloresPalette[index % coloresPalette.length], borderWidth: 1, borderColor: '#ffffff' };
    });

    chartEquiposSolucionesInstance = new Chart(ctx, {
        type: 'bar', data: { labels: equiposLabels, datasets: datasets },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { font: { size: 10, weight: 'bold' } } }, tooltip: { callbacks: { label: function(c) { return ` ${c.dataset.label}: ${c.parsed.x}%`; } } } }, scales: { x: { stacked: true, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#f1f5f9' } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' } } } } }
    });
}

// ==========================================
// 6. ASISTENTE IA INTEGRADO CON GEMINI API
// ==========================================
async function generarDictamenInteligenteIA(registros, metricas) {
    const contenedor = document.getElementById('ai-alerts-container');
    if (!contenedor) return;

    let pRiesgo = metricas.total > 0 ? ((metricas.riesgoDeficit / metricas.total) * 100).toFixed(1) : 0;
    let pExceso = metricas.total > 0 ? ((metricas.excesoIneficiente / metricas.total) * 100).toFixed(1) : 0;

    // Resumen local base en caso de que no haya clave API configurada
    let riesgoHtml = '';
    if (metricas.riesgoDeficit === 0) {
        riesgoHtml = `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 items-start"><i class="fa-solid fa-circle-check text-corporate-green text-lg mt-0.5"></i><div><h4 class="font-bold text-emerald-900 mb-1">Inocuidad Garantizada (0 Desvíos)</h4><p class="text-xs text-slate-700">No se detectan concentraciones inferiores al límite mínimo en el rango seleccionado.</p></div></div>`;
    } else {
        let keysRiesgo = Object.keys(metricas.resumenDesvios.equiposRiesgo);
        let eqCritico = keysRiesgo.length > 0 ? keysRiesgo.reduce((a, b) => metricas.resumenDesvios.equiposRiesgo[a] > metricas.resumenDesvios.equiposRiesgo[b] ? a : b) : 'General';
        riesgoHtml = `<div class="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start"><i class="fa-solid fa-triangle-exclamation text-danger-red text-lg mt-0.5"></i><div><h4 class="font-bold text-red-900 mb-1">Alerta Crítica: Sub-dosificación</h4><p class="text-xs text-slate-700">Validación detecta <b>${metricas.riesgoDeficit.toLocaleString()} desvíos (${pRiesgo}%)</b> bajo el límite. Mayor incidencia en: <b>${eqCritico}</b>.</p></div></div>`;
    }

    let excesoHtml = '';
    if (metricas.excesoIneficiente === 0) {
        excesoHtml = `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 items-start"><i class="fa-solid fa-seedling text-corporate-green text-lg mt-0.5"></i><div><h4 class="font-bold text-emerald-900 mb-1">Eficiencia Operativa (0 Desvíos)</h4><p class="text-xs text-slate-700">Consumo químico controlado sin excesos en el periodo.</p></div></div>`;
    } else {
        let keysExceso = Object.keys(metricas.resumenDesvios.equiposExceso);
        let eqGasto = keysExceso.length > 0 ? keysExceso.reduce((a, b) => metricas.resumenDesvios.equiposExceso[a] > metricas.resumenDesvios.equiposExceso[b] ? a : b) : 'General';
        excesoHtml = `<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start"><i class="fa-solid fa-flask-vial text-alert-yellow text-lg mt-0.5"></i><div><h4 class="font-bold text-amber-900 mb-1">Ineficiencia: Sobredosificación Confirmada</h4><p class="text-xs text-slate-700">El sistema contabiliza <b>${metricas.excesoIneficiente.toLocaleString()} registros (${pExceso}%)</b> sobre el umbral máximo. Mayor fuga en: <b>${eqGasto}</b>.</p></div></div>`;
    }

    contenedor.innerHTML = riesgoHtml + excesoHtml;

    // Si se ha configurado la clave API de Gemini, realizamos la consulta inteligente para enriquecer el dictamen gerencial
    if (GEMINI_API_KEY && GEMINI_API_KEY !== 'TU_CLAVE_API_DE_GEMINI') {
        try {
            const promptGemini = `Actúa como un Auditor Senior de Calidad e Inocuidad en Lácteos San Antonio (Ecuador). Analiza las siguientes métricas actuales del sistema POES:
- Total muestras analizadas: ${metricas.total}
- Eficacia de cumplimiento: ${metricas.eficaces > 0 ? ((metricas.eficaces/metricas.total)*100).toFixed(1) : 0}%
- Sub-dosificaciones (Riesgo < Mín): ${metricas.riesgoDeficit} (${pRiesgo}%)
- Sobredosificaciones (Exceso > Máx): ${metricas.excesoIneficiente} (${pExceso}%)
- Equipos más afectados por riesgo: ${JSON.stringify(metricas.resumenDesvios.equiposRiesgo)}
- Equipos más afectados por exceso: ${JSON.stringify(metricas.resumenDesvios.equiposExceso)}

Genera un dictamen ejecutivo en formato HTML breve (máximo 2 párrafos concisos y profesionales con etiquetas <b>) enfocado en recomendaciones operativas inmediatas para el jefe de planta.`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptGemini }] }] })
            });

            const jsonRes = await response.json();
            const textoIA = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;

            if (textoIA) {
                contenedor.innerHTML += `
                    <div class="bg-slate-900 text-slate-100 border border-slate-800 rounded-xl p-4 flex gap-3 items-start mt-3 col-span-2 shadow-lg">
                        <i class="fa-solid fa-robot text-emerald-400 text-lg mt-0.5"></i>
                        <div>
                            <h4 class="font-bold text-emerald-400 mb-1 flex items-center gap-2">Dictamen Gerencial Gemini IA <span class="text-[10px] bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded-full">En Vivo</span></h4>
                            <div class="text-xs text-slate-300 leading-relaxed">${textoIA}</div>
                        </div>
                    </div>`;
            }
        } catch (err) {
            console.warn("Aviso: No se pudo conectar con la API de Gemini (modo offline activo).", err);
        }
    }
}

// ==========================================
// 7. MODAL INTERACTIVO (DRILL-DOWN)
// ==========================================
function abrirModalDetalle(tipo) {
    const modal = document.getElementById('modal-detalle'); const tbody = document.getElementById('modal-tbody'); tbody.innerHTML = '';
    const datosActivos = obtenerDatosFiltrados();
    let filtradosModal = [];

    if (tipo === 'riesgo') {
        filtradosModal = datosActivos.filter(fila => { const r = PARAMETROS_TECNICOS.find(p => p.solucion === fila.solucion); return r && parseConcen(fila.concen) < parseFloat(r.min); });
        document.getElementById('modal-titulo').innerText = "Desglose de Desvíos por Riesgo (< Mínimo)";
    } else if (tipo === 'exceso') {
        filtradosModal = datosActivos.filter(fila => { const r = PARAMETROS_TECNICOS.find(p => p.solucion === fila.solucion); return r && parseConcen(fila.concen) > parseFloat(r.max); });
        document.getElementById('modal-titulo').innerText = "Desglose de Desvíos por Sobredosificación (> Máximo)";
    }

    if (filtradosModal.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400 font-bold">Sin registros de desviación bajo los filtros actuales.</td></tr>`;
    } else {
        filtradosModal.slice(0, 300).forEach(r => {
            const tr = document.createElement('tr'); tr.className = "hover:bg-slate-50 border-b border-slate-100";
            tr.innerHTML = `<td class="py-2.5 px-3 font-semibold text-slate-600">${r.fecha || ''} ${r.hora || ''}</td><td class="py-2.5 px-3 font-bold text-slate-900">${r.equipo || 'N/A'}</td><td class="py-2.5 px-3 text-slate-700">${r.solucion || 'N/A'}</td><td class="py-2.5 px-3 font-black ${tipo === 'riesgo' ? 'text-danger-red' : 'text-alert-yellow'}">${r.concen || 0}</td><td class="py-2.5 px-3 text-slate-500 text-[11px]">${r.operario || 'N/A'}</td>`;
            tbody.appendChild(tr);
        });
    }
    modal.classList.remove('hidden');
}

function cerrarModalDetalle() { document.getElementById('modal-detalle').classList.add('hidden'); }
function revelarInterfazDashboard() { document.getElementById('loader').classList.add('hidden'); document.getElementById('dashboard-content').classList.remove('hidden'); setTimeout(() => { document.getElementById('dashboard-content').classList.remove('opacity-0'); }, 50); }
