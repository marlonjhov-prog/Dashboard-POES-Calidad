// ==========================================
// 1. CREDENCIALES DE SUPABASE
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';

const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

let listaParametros = [];
let listaRegistros = [];
let loteActualCarga = 0;
const tamañoLoteBloque = 4000;

let chartStatusInstance = null;
let chartTrendInstance = null;
let chartEquiposSolucionesInstance = null;

// ==========================================
// 2. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando Dashboard POES Gerencial Masivo...");
    try {
        await descargarParametros();
        await cargarMasDatosSupabase();
        poblarFiltrosSelect();
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
async function descargarParametros() {
    const res = await clienteSupabase.from('parametros_soluciones').select('*');
    if (res.error) throw res.error;
    listaParametros = res.data;
}

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
                concen: parseFloat(row.CONCEN || row.concen || 0),
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
function poblarFiltrosSelect() {
    const selectSolucion = document.getElementById('filtro-solucion');
    listaParametros.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.solucion;
        opt.innerText = p.solucion;
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
        let matchSol = (solSel === 'TODAS' || r.solucion === solSel);
        let matchEq = (eqSel === 'TODOS' || r.equipo === eqSel);
        let matchAnio = (anioSel === 'TODOS' || (r.fecha && r.fecha.substring(0, 4) === anioSel));
        let matchMes = (mesSel === 'TODOS' || (r.fecha && r.fecha.substring(5, 7) === mesSel));
        return matchSol && matchEq && matchAnio && matchMes;
    });
}

// ==========================================
// 5. PROCESAMIENTO ANALÍTICO
// ==========================================
function aplicarFiltrosYRenderizar() {
    const datosActivos = obtenerDatosFiltrados();

    let conformes = 0;
    let riesgoDeficit = 0;   
    let excesoIneficiente = 0; 
    let resumenDesvios = { equiposRiesgo: {}, equiposExceso: {} };

    datosActivos.forEach(fila => {
        const regla = listaParametros.find(p => p.solucion === fila.solucion);
        if (regla) {
            const val = parseFloat(fila.concen);
            const min = parseFloat(regla.rango_min);
            const max = parseFloat(regla.rango_max);

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
// 6. MOTOR GRÁFICO (DONA, TENDENCIA, BARRAS HORIZONTALES)
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
                backgroundColor: ['#1f8c22', '#f59e0b', '#dc2626'],
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

    // Gráfico Líneas (Tendencia)
    const solActiva = document.getElementById('filtro-solucion').value;
    const quimico = solActiva === 'TODAS' ? 'SOSA' : solActiva;
    document.getElementById('label-quimico-activo').innerText = quimico;

    const regsTrend = registros.filter(r => r.solucion === quimico).slice(0, 30).reverse();
    const reglaTrend = listaParametros.find(p => p.solucion === quimico);

    const ctxTrend = document.getElementById('trendChart').getContext('2d');
    if (chartTrendInstance) chartTrendInstance.destroy();

    if (!reglaTrend || regsTrend.length === 0) return;

    chartTrendInstance = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: regsTrend.map(r => (r.fecha || '') + ' ' + (r.hora ? r.hora.substring(0,5) : '')),
            datasets: [
                {
                    label: 'Concentración Real (%)',
                    data: regsTrend.map(r => parseFloat(r.concen)),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    pointRadius: 3
                },
                {
                    label: 'Máx. (' + reglaTrend.rango_max + '%)',
                    data: Array(regsTrend.length).fill(parseFloat(reglaTrend.rango_max)),
                    borderColor: '#f59e0b', borderWidth: 2, borderDash: [5, 5], pointRadius: 0
                },
                {
                    label: 'Mín. (' + reglaTrend.rango_min + '%)',
                    data: Array(regsTrend.length).fill(parseFloat(reglaTrend.rango_min)),
                    borderColor: '#dc2626', borderWidth: 2, borderDash: [5, 5], pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } },
            scales: {
                y: { grid: { color: '#f1f5f9' }, suggestedMin: parseFloat(reglaTrend.rango_min) - 0.4, suggestedMax: parseFloat(reglaTrend.rango_max) + 0.4 },
                x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 } } }
            }
        }
    });
}

// BARRAS HORIZONTALES 100% APILADAS POR EQUIPO (Estilo Imagen Referencia)
function renderizarGraficoSolucionesHorizontal(registros) {
    const ctx = document.getElementById('equiposSolucionesChart').getContext('2d');
    if (chartEquiposSolucionesInstance) chartEquiposSolucionesInstance.destroy();

    let conteoEqSol = {};
    let solucionesUnicas = new Set();

    registros.forEach(r => {
        let eq = r.equipo || 'SIN EQUIPO';
        let sol = r.solucion || 'OTRA';
        solucionesUnicas.add(sol);
        
        if (!conteoEqSol[eq]) conteoEqSol[eq] = { total: 0 };
        conteoEqSol[eq][sol] = (conteoEqSol[eq][sol] || 0) + 1;
        conteoEqSol[eq].total++;
    });

    let equiposLabels = Object.keys(conteoEqSol);
    // Limitar a 10 equipos para legibilidad si no hay filtro de equipo específico
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
            indexAxis: 'y', // Barra Horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top', labels: { font: { size: 10, weight: 'bold' } } },
                tooltip: {
                    callbacks: {
                        label: function(context) { return ` ${context.dataset.label}: ${context.parsed.x}%`; }
                    }
                }
            },
            scales: {
                x: { stacked: true, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#f1f5f9' } },
                y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' } } }
            }
        }
    });
}

// ==========================================
// 7. ASISTENTE IA (LÓGICA CONTEXTUAL)
// ==========================================
function generarAlertasIA(registros, metricas) {
    const contenedor = document.getElementById('ai-alerts-container');
    let pRiesgo = metricas.total > 0 ? ((metricas.riesgoDeficit / metricas.total) * 100).toFixed(1) : 0;
    let pExceso = metricas.total > 0 ? ((metricas.excesoIneficiente / metricas.total) * 100).toFixed(1) : 0;

    // Lógica dinámica Inocuidad
    let riesgoHtml = '';
    if (metricas.riesgoDeficit === 0) {
        riesgoHtml = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 items-start">
                <i class="fa-solid fa-circle-check text-corporate-green text-lg mt-0.5"></i>
                <div>
                    <h4 class="font-bold text-emerald-900 mb-1">Inocuidad Garantizada (Eficacia 100%)</h4>
                    <p class="text-xs text-slate-700">No se detectan sub-dosificaciones en el periodo y equipos seleccionados. Los parámetros de esterilización CIP se mantienen dentro de los límites operativos seguros.</p>
                </div>
            </div>`;
    } else {
        let equipoCritico = Object.keys(metricas.resumenDesvios.equiposRiesgo).reduce((a, b) => metricas.resumenDesvios.equiposRiesgo[a] > metricas.resumenDesvios.equiposRiesgo[b] ? a : b);
        riesgoHtml = `
            <div class="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start">
                <i class="fa-solid fa-triangle-exclamation text-danger-red text-lg mt-0.5"></i>
                <div>
                    <h4 class="font-bold text-red-900 mb-1">Alerta Crítica Microbiológica</h4>
                    <p class="text-xs text-slate-700">Se detectan <b>${metricas.riesgoDeficit} desvíos (${pRiesgo}%)</b> por debajo del límite técnico. Mayor incidencia crítica localizada en: <b>${equipoCritico}</b>. Se requiere revisión inmediata del lazo de dosificación.</p>
                </div>
            </div>`;
    }

    // Lógica dinámica Costos/Eficiencia
    let excesoHtml = '';
    if (metricas.excesoIneficiente === 0) {
        excesoHtml = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 items-start">
                <i class="fa-solid fa-seedling text-corporate-green text-lg mt-0.5"></i>
                <div>
                    <h4 class="font-bold text-emerald-900 mb-1">Eficiencia Operativa Óptima</h4>
                    <p class="text-xs text-slate-700">Consumo de químicos estable. No se registran eventos de sobredosificación, mitigando costos por desperdicio y fatiga prematura de materiales en la línea.</p>
                </div>
            </div>`;
    } else {
        let equipoGasto = Object.keys(metricas.resumenDesvios.equiposExceso).reduce((a, b) => metricas.resumenDesvios.equiposExceso[a] > metricas.resumenDesvios.equiposExceso[b] ? a : b);
        excesoHtml = `
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
                <i class="fa-solid fa-flask-vial text-alert-yellow text-lg mt-0.5"></i>
                <div>
                    <h4 class="font-bold text-amber-900 mb-1">Ineficiencia por Sobreconsumo Químico</h4>
                    <p class="text-xs text-slate-700">Se registran <b>${metricas.excesoIneficiente} eventos (${pExceso}%)</b> de exceso químico. El mayor índice de desperdicio ocurre en: <b>${equipoGasto}</b>. Sugerencia: Recalibrar parámetros PLC de conductividad.</p>
                </div>
            </div>`;
    }

    contenedor.innerHTML = riesgoHtml + excesoHtml;
}

// ==========================================
// 8. MODAL INTERACTIVO (DRILL-DOWN)
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
            const regla = listaParametros.find(p => p.solucion === fila.solucion);
            return regla && parseFloat(fila.concen) < parseFloat(regla.rango_min);
        });
    } else if (tipo === 'exceso') {
        titulo.innerText = "Desglose de Desvíos por Sobredosificación (> Máximo)";
        filtradosModal = datosActivos.filter(fila => {
            const regla = listaParametros.find(p => p.solucion === fila.solucion);
            return regla && parseFloat(fila.concen) > parseFloat(regla.rango_max);
        });
    }

    if (filtradosModal.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400">No hay registros en esta categoría con los filtros actuales.</td></tr>`;
    } else {
        filtradosModal.slice(0, 300).forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-semibold">${r.fecha || ''} ${r.hora || ''}</td>
                <td class="py-2.5 px-3 font-bold text-slate-900">${r.equipo || 'N/A'}</td>
                <td class="py-2.5 px-3 text-slate-600">${r.solucion || 'N/A'}</td>
                <td class="py-2.5 px-3 font-bold text-blue-600">${r.concen || 0}</td>
                <td class="py-2.5 px-3 text-slate-500">${r.operario || 'N/A'}</td>
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
