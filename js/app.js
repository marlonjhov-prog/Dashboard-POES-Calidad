// ==========================================
// 1. CREDENCIALES DE SUPABASE Y MATRIZ CANÓNICA
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';

const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

// Matriz de Parámetros de Calidad Oficiales
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
// UTILIDADES DE NORMALIZACIÓN
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
// 2. INICIALIZACIÓN Y DESCARGA TOTAL (100%)
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
            let mesSelNorm = normalizarTexto(mesSel);
            
            matchMes = (mesBD === mesSel || nombreMesBD.includes(mesSelNorm) || obtenerNombreMes(mesSel) === nombreMesBD);
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
    generarAlertasIA(datosActivos, { total, eficaces, riesgoDeficit, excesoIneficiente, resumenDesvios });
    renderizarGraficoSolucionesHorizontal(datosActivos);
}

// ==========================================
// 5. MOTOR GRÁFICO (TENDENCIA O MATRIZ DE SEMÁFOROS)
// ==========================================
function renderizarGraficas(registros, kpis) {
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

    const solActiva = document.getElementById('filtro-solucion').value;
    const containerTrend = document.getElementById('trendChart').parentNode;

    // SI SELECCIONA "TODAS" LAS SOLUCIONES: Mostrar Matriz de Semáforos Ejecutivos basada en los datos filtrados
    if (solActiva === 'TODAS') {
        document.getElementById('label-quimico-activo').innerText = "TODAS LAS SOLUCIONES";
        if (chartTrendInstance) { chartTrendInstance.destroy(); chartTrendInstance = null; }

        let resumenSoluciones = {};
        registros.forEach(r => {
            let sol = r.solucion;
            if (!resumenSoluciones[sol]) resumenSoluciones[sol] = { total: 0, conformes: 0, exceso: 0, riesgo: 0 };
            resumenSoluciones[sol].total++;
            
            const regla = PARAMETROS_TECNICOS.find(p => p.solucion === sol);
            if (regla) {
                const v = parseConcen(r.concen);
                if (v < parseFloat(regla.min)) resumenSoluciones[sol].riesgo++;
                else if (v > parseFloat(regla.max)) resumenSoluciones[sol].exceso++;
                else resumenSoluciones[sol].conformes++;
            }
        });

        let htmlSemafaro = `
            <div class="overflow-y-auto h-60 w-full pr-2">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                            <th class="pb-2">Solución Química</th>
                            <th class="pb-2 text-center">Muestras</th>
                            <th class="pb-2 text-center">Óptimo</th>
                            <th class="pb-2 text-center">Desvíos</th>
                            <th class="pb-2 text-right">Estado (Semáforo)</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 text-xs">`;

        let keys = Object.keys(resumenSoluciones);
        if (keys.length === 0) {
            htmlSemafaro += `<tr><td colspan="5" class="py-8 text-center text-slate-400 font-bold">No hay registros con los filtros actuales.</td></tr>`;
        } else {
            keys.sort().forEach(sol => {
                let data = resumenSoluciones[sol];
                let desviosTotales = data.riesgo + data.exceso;
                let pctOptimo = data.total > 0 ? ((data.conformes / data.total) * 100).toFixed(0) : 0;
                
                let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                let iconSem = 'fa-circle-check text-emerald-600';
                let textEstado = 'Óptimo (100%)';

                if (data.riesgo > 0) {
                    badgeColor = 'bg-red-100 text-red-800 border-red-300';
                    iconSem = 'fa-triangle-exclamation text-red-600';
                    textEstado = `Riesgo Crítico (${data.riesgo})`;
                } else if (data.exceso > 0) {
                    badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
                    iconSem = 'fa-flask-vial text-amber-600';
                    textEstado = `Exceso (${data.exceso})`;
                }

                htmlSemafaro += `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="py-2.5 font-bold text-slate-800">${sol}</td>
                        <td class="py-2.5 text-center font-semibold text-slate-600">${data.total}</td>
                        <td class="py-2.5 text-center text-emerald-600 font-bold">${pctOptimo}%</td>
                        <td class="py-2.5 text-center font-bold ${desviosTotales > 0 ? 'text-amber-600' : 'text-slate-400'}">${desviosTotales}</td>
                        <td class="py-2.5 text-right">
                            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeColor}">
                                <i class="fa-solid ${iconSem} mr-1.5"></i> ${textEstado}
                            </span>
                        </td>
                    </tr>`;
            });
        }

        htmlSemafaro += `</tbody></table></div>`;
        containerTrend.innerHTML = htmlSemafaro;
        return;
    }

    // SI SELECCIONA UN QUÍMICO ESPECÍFICO: Renderizar Gráfica de Tendencia sincronizada con el mes y equipo filtrado
    document.getElementById('label-quimico-activo').innerText = solActiva;
    
    if (!document.getElementById('trendChart')) {
        containerTrend.innerHTML = `<canvas id="trendChart"></canvas>`;
    }

    const reglaTrend = PARAMETROS_TECNICOS.find(p => p.solucion === solActiva);
    const regsTrend = registros.filter(r => r.solucion === solActiva).slice(0, 45).reverse();

    const ctxTrend = document.getElementById('trendChart').getContext('2d');
    if (chartTrendInstance) chartTrendInstance.destroy();

    if (!reglaTrend || regsTrend.length === 0) {
        chartTrendInstance = new Chart(ctxTrend, { type: 'line', data: { labels: [], datasets: [] }}); return;
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
// 6. ASISTENTE IA (DICTAMEN ESTRICTAMENTE FILTRADO)
// ==========================================
function generarAlertasIA(registros, metricas) {
    const contenedor = document.getElementById('ai-alerts-container');
    if (!contenedor) return;

    let pRiesgo = metricas.total > 0 ? ((metricas.riesgoDeficit / metricas.total) * 100).toFixed(1) : 0;
    let pExceso = metricas.total > 0 ? ((metricas.excesoIneficiente / metricas.total) * 100).toFixed(1) : 0;

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
