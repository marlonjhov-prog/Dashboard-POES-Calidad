// ==========================================
// 1. CREDENCIALES DE SUPABASE Y TABLA ESTRICTA
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';

const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

// Tabla dura de rangos para garantizar precisión analítica exacta
const PARAMETROS_TECNICOS = [
    { solucion: 'SOSA', min: 1.5, max: 2.5 },
    { solucion: 'SOSA (MADRE)', min: 35, max: 50 },
    { solucion: 'ÁCIDO NITRICO', min: 0.8, max: 2.0 },
    { solucion: 'ACIDO NITRICO', min: 0.8, max: 2.0 }, 
    { solucion: 'ACIDO NITRICO MADRE', min: 55, max: 65 },
    { solucion: 'AGUA ENJUAGUE', min: 6.5, max: 7.6 },
    { solucion: 'PEROXIDO', min: 35, max: 45 },
    { solucion: 'ÁCIDO PERACÉTICO', min: 200, max: 450 },
    { solucion: 'ACIDO PERACETICO', min: 200, max: 450 }, 
    { solucion: 'BACOXIN', min: 100, max: 200 },
    { solucion: 'SOSA (CENTRO ACOPIO)', min: 20, max: 30 },
    { solucion: 'SOSA (PASIVACIÓN)', min: 2.5, max: 5 },
    { solucion: 'SOSA (PASIVACION)', min: 2.5, max: 5 }, 
    { solucion: 'ÁCIDO (PASIVACIÓN)', min: 8, max: 15 },
    { solucion: 'ACIDO (PASIVACION)', min: 8, max: 15 }, 
    { solucion: 'ACIDO FOSFORICO', min: 0.8, max: 2.0 },
    { solucion: 'CLORO', min: 0, max: 200 }
];

let listaRegistros = [];
let loteActualCarga = 0;
const tamañoLoteBloque = 4000;

let chartStatusInstance = null;
let chartTrendInstance = null;
let chartEquiposSolucionesInstance = null;

// ==========================================
// FUNCIONES AUXILIARES DE LIMPIEZA DE DATOS
// ==========================================
function normalizarTexto(texto) {
    if (!texto) return '';
    return texto.trim().toUpperCase();
}

// CORRECCIÓN CRÍTICA: Convierte comas a puntos para evitar que 50,64 se lea como 50
function parseConcen(val) {
    if (val === null || val === undefined || val === '') return 0;
    const num = parseFloat(String(val).replace(',', '.'));
    return isNaN(num) ? 0 : num;
}

// ==========================================
// 2. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando motor analítico con sanitización decimal...");
    try {
        await cargarMasDatosSupabase();
        poblarFiltrosSelectDesdeDatos();
        configurarEventosFiltros();
        revelarInterfazDashboard();
    } catch (error) {
        console.error("Error crítico:", error);
        document.getElementById('loader').innerHTML = `
            <div class="text-red-600 text-center p-6 bg-red-50 rounded-2xl border border-red-200">
                <i class="fa-solid fa-triangle-exclamation text-4xl mb-2"></i>
                <p class="font-bold text-lg">Error de Carga en Supabase</p>
                <p class="text-sm text-slate-600 mt-1">Verifica tu conexión a internet.</p>
            </div>
        `;
    }
});

// ==========================================
// 3. CARGA DESDE SUPABASE Y EXCEL
// ==========================================
async function cargarMasDatosSupabase() {
    const btnCargar = document.getElementById('btn-cargar-mas');
    if (btnCargar) {
        btnCargar.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Descargando...`;
        btnCargar.disabled = true;
    }

    const inicio = loteActualCarga * tamañoLoteBloque;
    const fin = inicio + tamañoLoteBloque - 1;

    const { data, error } = await clienteSupabase
        .from('registros_limpieza')
        .select('*')
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })
        .range(inicio, fin);

    if (error) {
        console.error("Error al cargar bloque:", error);
        if (btnCargar) { btnCargar.innerHTML = `Error al cargar`; btnCargar.disabled = false; }
        return;
    }

    if (data && data.length > 0) {
        listaRegistros = listaRegistros.concat(data);
        loteActualCarga++;
        document.getElementById('info-registros-totales').innerText = `${listaRegistros.length.toLocaleString()} registros en memoria`;
        
        actualizarSelectoresDinamicos();
        aplicarFiltrosYRenderizar();
    }

    if (btnCargar) {
        if (!data || data.length < tamañoLoteBloque) {
            btnCargar.innerHTML = `<i class="fa-solid fa-check mr-2"></i> Todo Cargado`;
            btnCargar.classList.replace('bg-blue-600', 'bg-slate-600');
        } else {
            btnCargar.innerHTML = `<i class="fa-solid fa-cloud-arrow-down mr-2"></i> Cargar Servidor (+10k)`;
            btnCargar.disabled = false;
        }
    }
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

            if (filasJson.length === 0) {
                alert("El archivo está vacío.");
                return;
            }

            alert(`Procesando ${filasJson.length} registros...`);

            let nuevosRegistros = filasJson.map(row => ({
                fecha: row.FECHA || row.fecha || new Date().toISOString().split('T')[0],
                mes: row.MES || row.mes || 'enero',
                hora: row.HORA || row.hora || '00:00:00',
                solucion: row.SOLUCION || row.solucion || 'SOSA',
                equipo: row.EQUIPO || row.equipo || 'GENERAL',
                proceso: row.PROCESO || row.proceso || 'CIP',
                concen: parseConcen(row.CONCEN || row.concen),
                operario: row.OPERARIO || row.operario || 'S/N',
                laboratorista: row.LABORATORISTA || row.laboratorista || 'S/N'
            }));

            let tamañoLoteSubida = 500;
            for (let i = 0; i < nuevosRegistros.length; i += tamañoLoteSubida) {
                let lote = nuevosRegistros.slice(i, i + tamañoLoteSubida);
                await clienteSupabase.from('registros_limpieza').insert(lote);
            }

            alert("¡Importación exitosa a Supabase!");
            listaRegistros = [];
            loteActualCarga = 0;
            await cargarMasDatosSupabase();
        } catch (err) {
            console.error("Error:", err);
            alert("Error al procesar el archivo Excel.");
        }
    };
    lector.readAsArrayBuffer(archivo);
}

// ==========================================
// 4. FILTROS Y SELECTORES DINÁMICOS
// ==========================================
function poblarFiltrosSelectDesdeDatos() {
    const selectSolucion = document.getElementById('filtro-solucion');
    const solucionesUnicas = [...new Set(PARAMETROS_TECNICOS.map(p => p.solucion))];
    
    solucionesUnicas.forEach(sol => {
        const opt = document.createElement('option');
        opt.value = sol;
        opt.innerText = sol;
        selectSolucion.appendChild(opt);
    });
}

function actualizarSelectoresDinamicos() {
    const selectEquipo = document.getElementById('filtro-equipo');
    const selectAnio = document.getElementById('filtro-anio');
    
    let equiposSet = new Set();
    let aniosSet = new Set();

    listaRegistros.forEach(r => {
        if (r.equipo) equiposSet.add(r.equipo);
        if (r.fecha && r.fecha.length >= 4) aniosSet.add(r.fecha.substring(0, 4));
    });

    let eqActual = selectEquipo.value;
    selectEquipo.innerHTML = `<option value="TODOS">Todos</option>`;
    Array.from(equiposSet).sort().forEach(eq => {
        const opt = document.createElement('option');
        opt.value = eq; opt.innerText = eq;
        selectEquipo.appendChild(opt);
    });
    selectEquipo.value = eqActual;

    let anioActual = selectAnio.value;
    selectAnio.innerHTML = `<option value="TODOS">Todos</option>`;
    Array.from(aniosSet).sort().reverse().forEach(an => {
        const opt = document.createElement('option');
        opt.value = an; opt.innerText = an;
        selectAnio.appendChild(opt);
    });
    selectAnio.value = anioActual;
}

function configurarEventosFiltros() {
    document.getElementById('filtro-solucion').addEventListener('change', aplicarFiltrosYRenderizar);
    document.getElementById('filtro-equipo').addEventListener('change', aplicarFiltrosYRenderizar);
    document.getElementById('filtro-anio').addEventListener('change', aplicarFiltrosYRenderizar);
    document.getElementById('filtro-mes').addEventListener('change', aplicarFiltrosYRenderizar);
}

function obtenerDatosFiltrados() {
    const solSel = document.getElementById('filtro-solucion').value;
    const eqSel = document.getElementById('filtro-equipo').value;
    const anioSel = document.getElementById('filtro-anio').value;
    const mesSel = document.getElementById('filtro-mes').value;

    return listaRegistros.filter(r => {
        let matchSol = (solSel === 'TODAS' || normalizarTexto(r.solucion) === solSel);
        let matchEq = (eqSel === 'TODOS' || r.equipo === eqSel);
        let matchAnio = (anioSel === 'TODOS' || (r.fecha && r.fecha.substring(0, 4) === anioSel));
        let matchMes = (mesSel === 'TODOS' || (r.fecha && r.fecha.substring(5, 7) === mesSel));
        return matchSol && matchEq && matchAnio && matchMes;
    });
}

// ==========================================
// 5. PROCESAMIENTO ANALÍTICO EXACTO
// ==========================================
function aplicarFiltrosYRenderizar() {
    const datosActivos = obtenerDatosFiltrados();

    let conformes = 0;
    let riesgoDeficit = 0;   
    let excesoIneficiente = 0; 
    let resumenDesvios = { equiposRiesgo: {}, equiposExceso: {} };

    datosActivos.forEach(fila => {
        const solFila = normalizarTexto(fila.solucion);
        const regla = PARAMETROS_TECNICOS.find(p => p.solucion === solFila);
        
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
    generarAlertasIA(datosActivos, { total, eficaces, riesgoDeficit, excesoIneficiente, resumenDesvios });
    renderizarGraficoSolucionesHorizontal(datosActivos);
}

// ==========================================
// 6. MOTOR GRÁFICO (DONA, TENDENCIA INTELIGENTE, BARRAS)
// ==========================================
function renderizarGraficas(registros, kpis) {
    const total = kpis.total > 0 ? kpis.total : 1;
    const pOptimo = ((kpis.conformes / total) * 100).toFixed(1);
    const pExceso = ((kpis.excesoIneficiente / total) * 100).toFixed(1);
    const pRiesgo = ((kpis.riesgoDeficit / total) * 100).toFixed(1);

    document.getElementById('leg-optimo').innerText = `Opt: ${pOptimo}%`;
    document.getElementById('leg-exceso').innerText = `Exc: ${pExceso}%`;
    document.getElementById('leg-riesgo').innerText = `Ries: ${pRiesgo}%`;

    // Gráfico Dona
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    if (chartStatusInstance) chartStatusInstance.destroy();

    chartStatusInstance = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: [`Óptimo (${pOptimo}%)`, `Exceso (${pExceso}%)`, `Riesgo (${pRiesgo}%)`],
            datasets: [{
                data: [kpis.conformes, kpis.excesoIneficiente, kpis.riesgoDeficit],
                backgroundColor: ['#10b981', '#f59e0b', '#dc2626'],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10, weight: 'bold' } } } },
            cutout: '65%'
        }
    });

    // Gráfico Líneas (Tendencia Inteligente)
    const solActiva = document.getElementById('filtro-solucion').value;
    const quimico = solActiva === 'TODAS' ? 'SOSA (MADRE)' : solActiva;
    document.getElementById('label-quimico-activo').innerText = quimico;

    const reglaTrend = PARAMETROS_TECNICOS.find(p => p.solucion === normalizarTexto(quimico));
    const regsTrend = registros.filter(r => normalizarTexto(r.solucion) === normalizarTexto(quimico)).slice(0, 45).reverse();

    const ctxTrend = document.getElementById('trendChart').getContext('2d');
    if (chartTrendInstance) chartTrendInstance.destroy();

    if (!reglaTrend || regsTrend.length === 0) {
        chartTrendInstance = new Chart(ctxTrend, { type: 'line', data: { labels: [], datasets: [] }});
        return;
    }

    const min = parseFloat(reglaTrend.min);
    const max = parseFloat(reglaTrend.max);

    // Mapeo dinámico de colores y tamaños asegurando la conversión a punto decimal
    const coloresFondoPunto = regsTrend.map(r => {
        const v = parseConcen(r.concen);
        if (v < min) return '#dc2626'; // Rojo (Riesgo)
        if (v > max) return '#f59e0b'; // Naranja (Exceso)
        return '#10b981'; // Verde (Óptimo)
    });

    const tamañosPunto = regsTrend.map(r => {
        const v = parseConcen(r.concen);
        return (v < min || v > max) ? 7 : 4; 
    });

    chartTrendInstance = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: regsTrend.map(r => (r.fecha || '') + ' ' + (r.hora ? r.hora.substring(0,5) : '')),
            datasets: [
                {
                    label: 'Concentración Real',
                    data: regsTrend.map(r => parseConcen(r.concen)),
                    borderColor: '#94a3b8',
                    backgroundColor: 'rgba(148, 163, 184, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: coloresFondoPunto,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: tamañosPunto,
                    pointHoverRadius: 8
                },
                {
                    label: 'Máx. (' + max + ')',
                    data: Array(regsTrend.length).fill(max),
                    borderColor: '#f59e0b', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false
                },
                {
                    label: 'Mín. (' + min + ')',
                    data: Array(regsTrend.length).fill(min),
                    borderColor: '#dc2626', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top' },
                tooltip: { 
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) label += context.parsed.y;
                            const v = context.parsed.y;
                            if (context.datasetIndex === 0) {
                                if (v < min) label += ' (RIESGO)';
                                else if (v > max) label += ' (EXCESO)';
                                else label += ' (ÓPTIMO)';
                            }
                            return label;
                        }
                    }
                } 
            },
            scales: {
                y: { grid: { color: '#f1f5f9' }, suggestedMin: min - (min * 0.2), suggestedMax: max + (max * 0.2) },
                x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 } } }
            }
        }
    });
}

function renderizarGraficoSolucionesHorizontal(registros) {
    const ctx = document.getElementById('equiposSolucionesChart').getContext('2d');
    if (chartEquiposSolucionesInstance) chartEquiposSolucionesInstance.destroy();

    let conteoEqSol = {};
    let solucionesUnicas = new Set();

    registros.forEach(r => {
        let eq = r.equipo || 'SIN EQUIPO';
        let sol = normalizarTexto(r.solucion) || 'OTRA';
        solucionesUnicas.add(sol);
        
        if (!conteoEqSol[eq]) conteoEqSol[eq] = { total: 0 };
        conteoEqSol[eq][sol] = (conteoEqSol[eq][sol] || 0) + 1;
        conteoEqSol[eq].total++;
    });

    let equiposLabels = Object.keys(conteoEqSol);
    if (document.getElementById('filtro-equipo').value === 'TODOS') {
        equiposLabels = equiposLabels.slice(0, 10);
    }
    
    let solsArray = Array.from(solucionesUnicas);
    let coloresPalette = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];

    let datasets = solsArray.map((sol, index) => {
        let dataPorEquipo = equiposLabels.map(eq => {
            let totalEq = conteoEqSol[eq].total;
            let countSol = conteoEqSol[eq][sol] || 0;
            return totalEq > 0 ? parseFloat(((countSol / totalEq) * 100).toFixed(1)) : 0;
        });
        return {
            label: sol,
            data: dataPorEquipo,
            backgroundColor: coloresPalette[index % coloresPalette.length],
            borderWidth: 1,
            borderColor: '#ffffff'
        };
    });

    chartEquiposSolucionesInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: equiposLabels, datasets: datasets },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top', labels: { font: { size: 10, weight: 'bold' } } },
                tooltip: { callbacks: { label: function(context) { return ` ${context.dataset.label}: ${context.parsed.x}%`; } } }
            },
            scales: {
                x: { stacked: true, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#f1f5f9' } },
                y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' } } }
            }
        }
    });
}

// ==========================================
// 7. ASISTENTE IA (LÓGICA MATEMÁTICA EXACTA)
// ==========================================
function generarAlertasIA(registros, metricas) {
    const contenedor = document.getElementById('ai-alerts-container');
    let pRiesgo = metricas.total > 0 ? ((metricas.riesgoDeficit / metricas.total) * 100).toFixed(1) : 0;
    let pExceso = metricas.total > 0 ? ((metricas.excesoIneficiente / metricas.total) * 100).toFixed(1) : 0;

    let riesgoHtml = '';
    if (metricas.riesgoDeficit === 0) {
        riesgoHtml = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 items-start">
                <i class="fa-solid fa-circle-check text-corporate-green text-lg mt-0.5"></i>
                <div>
                    <h4 class="font-bold text-emerald-900 mb-1">Inocuidad Garantizada (0 Desvíos)</h4>
                    <p class="text-xs text-slate-700">Validación de rangos mínima superada. No se detectan concentraciones inferiores al límite operativo establecido en la matriz POES.</p>
                </div>
            </div>`;
    } else {
        let equipoCritico = Object.keys(metricas.resumenDesvios.equiposRiesgo).reduce((a, b) => metricas.resumenDesvios.equiposRiesgo[a] > metricas.resumenDesvios.equiposRiesgo[b] ? a : b);
        riesgoHtml = `
            <div class="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start">
                <i class="fa-solid fa-triangle-exclamation text-danger-red text-lg mt-0.5"></i>
                <div>
                    <h4 class="font-bold text-red-900 mb-1">Alerta Crítica: Sub-dosificación</h4>
                    <p class="text-xs text-slate-700">Validación detecta <b>${metricas.riesgoDeficit} desvíos exactos (${pRiesgo}%)</b> por debajo del límite mínimo. Principal incidencia en equipo: <b>${equipoCritico}</b>. Riesgo microbiológico activo.</p>
                </div>
            </div>`;
    }

    let excesoHtml = '';
    if (metricas.excesoIneficiente === 0) {
        excesoHtml = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 items-start">
                <i class="fa-solid fa-seedling text-corporate-green text-lg mt-0.5"></i>
                <div>
                    <h4 class="font-bold text-emerald-900 mb-1">Eficiencia Operativa (0 Desvíos)</h4>
                    <p class="text-xs text-slate-700">Consumo químico controlado. La validación matemática descarta eventos de sobredosificación por encima del máximo permitido.</p>
                </div>
            </div>`;
    } else {
        let equipoGasto = Object.keys(metricas.resumenDesvios.equiposExceso).reduce((a, b) => metricas.resumenDesvios.equiposExceso[a] > metricas.resumenDesvios.equiposExceso[b] ? a : b);
        excesoHtml = `
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
                <i class="fa-solid fa-flask-vial text-alert-yellow text-lg mt-0.5"></i>
                <div>
                    <h4 class="font-bold text-amber-900 mb-1">Ineficiencia: Sobredosificación Confirmada</h4>
                    <p class="text-xs text-slate-700">El sistema contabiliza <b>${metricas.excesoIneficiente} registros (${pExceso}%)</b> que superan el umbral máximo técnico. La mayor fuga se ubica en: <b>${equipoGasto}</b>.</p>
                </div>
            </div>`;
    }

    contenedor.innerHTML = riesgoHtml + excesoHtml;
}

// ==========================================
// 8. MODAL INTERACTIVO (DRILL-DOWN EXACTO)
// ==========================================
function abrirModalDetalle(tipo) {
    const modal = document.getElementById('modal-detalle');
    const titulo = document.getElementById('modal-titulo');
    const tbody = document.getElementById('modal-tbody');
    tbody.innerHTML = '';

    const datosActivos = obtenerDatosFiltrados();
    let filtradosModal = [];

    if (tipo === 'riesgo') {
        titulo.innerText = "Desglose de Desvíos por Riesgo (< Mínimo)";
        filtradosModal = datosActivos.filter(fila => {
            const regla = PARAMETROS_TECNICOS.find(p => p.solucion === normalizarTexto(fila.solucion));
            return regla && parseConcen(fila.concen) < parseFloat(regla.min);
        });
    } else if (tipo === 'exceso') {
        titulo.innerText = "Desglose de Desvíos por Sobredosificación (> Máximo)";
        filtradosModal = datosActivos.filter(fila => {
            const regla = PARAMETROS_TECNICOS.find(p => p.solucion === normalizarTexto(fila.solucion));
            return regla && parseConcen(fila.concen) > parseFloat(regla.max);
        });
    }

    if (filtradosModal.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400 font-bold">Sin registros de desviación bajo los parámetros actuales.</td></tr>`;
    } else {
        filtradosModal.slice(0, 300).forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-semibold text-slate-600">${r.fecha || ''} ${r.hora || ''}</td>
                <td class="py-2.5 px-3 font-bold text-slate-900">${r.equipo || 'N/A'}</td>
                <td class="py-2.5 px-3 text-slate-700">${r.solucion || 'N/A'}</td>
                <td class="py-2.5 px-3 font-black ${tipo === 'riesgo' ? 'text-danger-red' : 'text-alert-yellow'}">${r.concen || 0}</td>
                <td class="py-2.5 px-3 text-slate-500 text-[11px]">${r.operario || 'N/A'}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    modal.classList.remove('hidden');
}

function cerrarModalDetalle() {
    document.getElementById('modal-detalle').classList.add('hidden');
}

// ==========================================
// 9. REVELAR UI
// ==========================================
function revelarInterfazDashboard() {
    const loader = document.getElementById('loader');
    const contenido = document.getElementById('dashboard-content');
    
    loader.classList.add('hidden');
    contenido.classList.remove('hidden');
    setTimeout(() => { contenido.classList.remove('opacity-0'); }, 50);
}
