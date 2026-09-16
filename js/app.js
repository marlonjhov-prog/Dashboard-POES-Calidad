// ==========================================
// 1. CREDENCIALES DE SUPABASE
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';

const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

let listaParametros = [];
let listaRegistros = [];

// Instancias globales para destruir y recrear gráficas al filtrar
let chartStatusInstance = null;
let chartTrendInstance = null;

// ==========================================
// 2. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando Dashboard POES Gerencial...");
    try {
        await descargarBaseDeDatosCompleta();
        poblarFiltrosSelect();
        configurarEventosFiltros();
        
        aplicarFiltrosYRenderizar();
        revelarInterfazDashboard();
        
    } catch (error) {
        console.error("Error crítico:", error);
        document.getElementById('loader').innerHTML = `
            <div class="text-red-600 text-center p-6 bg-red-50 rounded-2xl border border-red-200">
                <i class="fa-solid fa-triangle-exclamation text-4xl mb-2"></i>
                <p class="font-bold text-lg">Error de Carga en Supabase</p>
                <p class="text-sm text-slate-600 mt-1">Verifica tu conexión a internet o los permisos de las tablas.</p>
            </div>
        `;
    }
});

// ==========================================
// 3. DESCARGA TOTAL DE DATOS
// ==========================================
async function descargarBaseDeDatosCompleta() {
    const resParam = await clienteSupabase.from('parametros_soluciones').select('*');
    if (resParam.error) throw resParam.error;
    listaParametros = resParam.data;

    let registrosAcumulados = [];
    let rangoInicio = 0;
    let tamañoLote = 1000;
    let continuarCargando = true;

    while (continuarCargando) {
        const resReg = await clienteSupabase
            .from('registros_limpieza')
            .select('*')
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false })
            .range(rangoInicio, rangoInicio + tamañoLote - 1);

        if (resReg.error) throw resReg.error;
        
        if (resReg.data.length > 0) {
            registrosAcumulados = registrosAcumulados.concat(resReg.data);
            rangoInicio += tamañoLote;
            if (resReg.data.length < tamañoLote) continuarCargando = false;
        } else {
            continuarCargando = false;
        }
    }

    listaRegistros = registrosAcumulados;
    console.log(`Total registros en memoria: ${listaRegistros.length}`);
}

// ==========================================
// 4. CONFIGURACIÓN DE FILTROS
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

function configurarEventosFiltros() {
    document.getElementById('filtro-solucion').addEventListener('change', aplicarFiltrosYRenderizar);
    document.getElementById('filtro-periodo').addEventListener('change', aplicarFiltrosYRenderizar);
}

function obtenerDatosFiltrados() {
    const solucionSeleccionada = document.getElementById('filtro-solucion').value;
    const periodoSeleccionado = document.getElementById('filtro-periodo').value;

    let filtrados = [...listaRegistros];

    // Filtrar por Solución
    if (solucionSeleccionada !== 'TODAS') {
        filtrados = filtrados.filter(r => r.solucion === solucionSeleccionada);
    }

    // Filtrar por Período (Cantidad de registros)
    if (periodoSeleccionado !== 'TODO') {
        const limite = parseInt(periodoSeleccionado);
        filtrados = filtrados.slice(0, limite);
    }

    return filtrados;
}

// ==========================================
// 5. PROCESAMIENTO Y RENDERIZADO GENERAL
// ==========================================
function aplicarFiltrosYRenderizar() {
    const registrosActivos = obtenerDatosFiltrados();

    let conformes = 0;
    let desviosRiesgo = 0; // < min
    let ineficientes = 0;  // > max

    registrosActivos.forEach(fila => {
        const regla = listaParametros.find(p => p.solucion === fila.solucion);
        if (regla) {
            const valorConcen = parseFloat(fila.concen);
            const minVal = parseFloat(regla.rango_min);
            const maxVal = parseFloat(regla.rango_max);

            if (valorConcen < minVal) {
                desviosRiesgo++;
            } else if (valorConcen > maxVal) {
                ineficientes++;
            } else {
                conformes++;
            }
        }
    });

    const totalMuestras = registrosActivos.length;
    const totalEficaces = conformes + ineficientes;
    const porcentajeEficacia = totalMuestras > 0 ? ((totalEficaces / totalMuestras) * 100).toFixed(1) : 0;

    // Actualizar KPIs en el DOM
    document.getElementById('kpi-eficacia').innerText = porcentajeEficacia + '%';
    document.getElementById('kpi-desvios').innerText = desviosRiesgo.toLocaleString();
    document.getElementById('kpi-excesos').innerText = ineficientes.toLocaleString();
    document.getElementById('kpi-total').innerText = totalMuestras.toLocaleString();

    // Actualizar Gráficas y Matriz
    renderizarGraficas(registrosActivos, { conformes, ineficientes, desviosRiesgo });
    generarMatrizAcciones(registrosActivos);
}

// ==========================================
// 6. MOTOR GRÁFICO AVANZADO
// ==========================================
function renderizarGraficas(registros, kpis) {
    // --- GRÁFICO 1: DONA ---
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    if (chartStatusInstance) chartStatusInstance.destroy();

    chartStatusInstance = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Óptimo', 'Exceso', 'Riesgo'],
            datasets: [{
                data: [kpis.conformes, kpis.ineficientes, kpis.desviosRiesgo],
                backgroundColor: ['#1f8c22', '#f59e0b', '#dc2626'],
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            cutout: '72%'
        }
    });

    // --- GRÁFICO 2: TENDENCIA ---
    const solucionActual = document.getElementById('filtro-solucion').value;
    const quimicoObjetivo = solucionActual === 'TODAS' ? 'SOSA' : solucionActual;
    document.getElementById('label-quimico-activo').innerText = quimicoObjetivo;

    const registrosTrend = registros.filter(r => r.solucion === quimicoObjetivo).slice(0, 40).reverse();
    const reglaTrend = listaParametros.find(p => p.solucion === quimicoObjetivo);

    const ctxTrend = document.getElementById('trendChart').getContext('2d');
    if (chartTrendInstance) chartTrendInstance.destroy();

    if (!reglaTrend || registrosTrend.length === 0) {
        // Si no hay datos para graficar la tendencia con ese filtro
        return;
    }

    const etiquetasFechas = registrosTrend.map(r => {
        let partes = r.fecha.split('-');
        let horaCorta = r.hora ? r.hora.substring(0, 5) : '';
        return partes.length === 3 ? partes[2] + '/' + partes[1] + ' ' + horaCorta : r.fecha + ' ' + horaCorta;
    });

    const valoresConcentracion = registrosTrend.map(r => parseFloat(r.concen));
    const lineaMinima = Array(registrosTrend.length).fill(parseFloat(reglaTrend.rango_min));
    const lineaMaxima = Array(registrosTrend.length).fill(parseFloat(reglaTrend.rango_max));

    chartTrendInstance = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: etiquetasFechas,
            datasets: [
                {
                    label: 'Concentración Real (%)',
                    data: valoresConcentracion,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true,
                    pointBackgroundColor: '#2563eb',
                    pointRadius: 4
                },
                {
                    label: 'Límite Máx. (' + reglaTrend.rango_max + '%)',
                    data: lineaMaxima,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    pointRadius: 0
                },
                {
                    label: 'Límite Mín. (' + reglaTrend.rango_min + '%)',
                    data: lineaMinima,
                    borderColor: '#dc2626',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { weight: 'bold' } } },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                y: {
                    grid: { color: '#f1f5f9' },
                    suggestedMin: parseFloat(reglaTrend.rango_min) - 0.4,
                    suggestedMax: parseFloat(reglaTrend.rango_max) + 0.4
                },
                x: { grid: { display: false } }
            }
        }
    });
}

// ==========================================
// 7. MATRIZ DE ACCIONES TÉCNICAS
// ==========================================
function generarMatrizAcciones(registros) {
    const tbody = document.getElementById('matrix-body');
    tbody.innerHTML = '';

    let conteoEquiposDesvio = {};
    registros.forEach(r => {
        const regla = listaParametros.find(p => p.solucion === r.solucion);
        if (regla) {
            const val = parseFloat(r.concen);
            if (val < parseFloat(regla.rango_min) || val > parseFloat(regla.rango_max)) {
                conteoEquiposDesvio[r.equipo] = (conteoEquiposDesvio[r.equipo] || 0) + 1;
            }
        }
    });

    let equiposOrdenados = Object.entries(conteoEquiposDesvio).sort((a, b) => b[1] - a[1]);
    let acciones = [];

    if (equiposOrdenados.length > 0) {
        let eqTop = equiposOrdenados[0][0];
        acciones.push({
            hallazgo: 'Desvío Crítico en ' + eqTop,
            accion: 'Calibración inmediata de la bomba dosificadora y revisión de conductividad.',
            equipo: eqTop,
            responsable: 'Supervisor de Higiene',
            estado: 'En Acción',
            badge: 'bg-amber-100 text-amber-800 border border-amber-300'
        });
    }

    if (equiposOrdenados.length > 1) {
        let eqSec = equiposOrdenados[1][0];
        acciones.push({
            hallazgo: 'Sobreconsumo químico en ' + eqSec,
            accion: 'Ajuste de parámetros en el PLC del lazo de enjuague y dosificación.',
            equipo: eqSec,
            responsable: 'Líder de Higiene',
            estado: 'Programado',
            badge: 'bg-blue-100 text-blue-800 border border-blue-300'
        });
    }

    acciones.push({
        hallazgo: 'Validación de Soluciones Madre',
        accion: 'Titulación manual de respaldo en laboratorio y control de válvulas.',
        equipo: 'Toda la Planta',
        responsable: 'Jefe de Calidad',
        estado: 'Conforme',
        badge: 'bg-emerald-100 text-emerald-800 border border-emerald-300'
    });

    acciones.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition border-b border-slate-50 text-xs";
        tr.innerHTML = `
            <td class="py-3 px-4 font-bold text-slate-900">${item.hallazgo}</td>
            <td class="py-3 px-4 text-slate-700 font-medium">${item.accion}</td>
            <td class="py-3 px-4 font-semibold text-slate-800">${item.equipo}</td>
            <td class="py-3 px-4 text-slate-600">${item.responsable}</td>
            <td class="py-3 px-4 text-center">
                <span class="px-2.5 py-1 rounded-full font-bold text-[11px] ${item.badge}">${item.estado}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 8. CONTROL DE INTERFAZ
// ==========================================
function revelarInterfazDashboard() {
    const loader = document.getElementById('loader');
    const contenido = document.getElementById('dashboard-content');
    
    loader.classList.add('hidden');
    contenido.classList.remove('hidden');
    setTimeout(() => {
        contenido.classList.remove('opacity-0');
    }, 50);
}
