// ==========================================
// 1. CREDENCIALES DE SUPABASE
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';

const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

let listaParametros = [];
let listaRegistros = [];

// ==========================================
// 2. INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando Dashboard POES Premium...");
    try {
        await descargarBaseDeDatosCompleta();
        
        if (listaRegistros.length === 0) {
            console.warn("No hay registros disponibles en Supabase.");
            return;
        }

        const resultadosKpi = procesarKPIsYMetricas();
        renderizarGraficosAvanzados(resultadosKpi);
        generarMatrizAccionesIA();
        revelarInterfazDashboard();
        
        console.log("Dashboard renderizado al 100%.");

    } catch (error) {
        console.error("Error crítico durante la carga:", error);
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
// 3. DESCARGA TOTAL DE DATOS (SIN LÍMITE)
// ==========================================
async function descargarBaseDeDatosCompleta() {
    // 3.1 Cargar Parámetros de la Hoja 2
    const resParam = await clienteSupabase.from('parametros_soluciones').select('*');
    if (resParam.error) throw resParam.error;
    listaParametros = resParam.data;

    // 3.2 Cargar TODOS los Registros Históricos de la Hoja 1 (Paginación interna para asegurar 100% de los datos)
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
    console.log(`Total de registros cargados desde Supabase: ${listaRegistros.length}`);
}

// ==========================================
// 4. MOTOR DE CÁLCULO DE KPIS
// ==========================================
function procesarKPIsYMetricas() {
    let conformes = 0;
    let desviosRiesgo = 0;   // CONCEN < min (Peligro microbiológico)
    let ineficientes = 0;    // CONCEN > max (Desperdicio técnico / exceso)

    listaRegistros.forEach(fila => {
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

    const totalMuestras = listaRegistros.length;
    
    // Eficacia: Las muestras conformes + las ineficientes (excesos) limpian de forma efectiva.
    const totalEficaces = conformes + ineficientes;
    const porcentajeEficacia = totalMuestras > 0 ? ((totalEficaces / totalMuestras) * 100).toFixed(1) : 0;

    // Inyectar en el DOM
    document.getElementById('kpi-eficacia').innerText = `${porcentajeEficacia}%`;
    document.getElementById('kpi-desvios').innerText = desviosRiesgo.toLocaleString();
    document.getElementById('kpi-excesos').innerText = ineficientes.toLocaleString();
    document.getElementById('kpi-total').innerText = totalMuestras.toLocaleString();

    return { conformes, ineficientes, desviosRiesgo };
}

// ==========================================
// 5. RENDERIZADO DE GRÁFICAS AVANZADAS
// ==========================================
function renderizarGraficosAvanzados(kpis) {
    // --- Gráfico Circular de Estado General ---
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Conforme (Óptimo)', 'Ineficiente (Exceso Químico)', 'Desvío (Riesgo Microbiológico)'],
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
            plugins: {
                legend: { display: false }
            },
            cutout: '72%'
        }
    });

    // --- Gráfico de Líneas: Tendencia Histórica de SOSA ---
    const registrosSosa = listaRegistros.filter(r => r.solucion === 'SOSA').slice(0, 40).reverse();
    const reglaSosa = listaParametros.find(p => p.solucion === 'SOSA');

    if (!reglaSosa || registrosSosa.length === 0) return;

    const etiquetasFechas = registrosSosa.map(r => {
        let partes = r.fecha.split('-');
        let horaCorta = r.hora ? r.hora.substring(0,5) : '';
        return partes.length === 3 ? `${partes[2]/${partes[1]} ${horaCorta}` : `${r.fecha} ${horaCorta}`;
    });

    const valoresConcentracion = registrosSosa.map(r => parseFloat(r.concen));
    const lineaMinima = Array(registrosSosa.length).fill(parseFloat(reglaSosa.rango_min));
    const lineaMaxima = Array(registrosSosa.length).fill(parseFloat(reglaSosa.rango_max));

    const ctxTrend = document.getElementById('trendChart').getContext('2d');
    new Chart(ctxTrend, {
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
                    label: `Límite Máx. (${reglaSosa.rango_max}%)`,
                    data: lineaMaxima,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    pointRadius: 0
                },
                {
                    label: `Límite Mín. (${reglaSosa.rango_min}%)`,
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
                    suggestedMin: parseFloat(reglaSosa.rango_min) - 0.4,
                    suggestedMax: parseFloat(reglaSosa.rango_max) + 0.4
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// ==========================================
// 6. MATRIZ DE ACCIONES TÉCNICAS ASISTIDA POR IA
// ==========================================
function generarMatrizAccionesIA() {
    const tbody = document.getElementById('ia-matrix-body');
    tbody.innerHTML = '';

    // Analizamos equipos con más desviaciones para generar diagnósticos automáticos inteligentes
    let conteoEquiposDesvio = {};
    listaRegistros.forEach(r => {
        const regla = listaParametros.find(p => p.solucion === r.solucion);
        if (regla) {
            const val = parseFloat(r.concen);
            if (val < parseFloat(regla.rango_min) || val > parseFloat(regla.rango_max)) {
                conteoEquiposDesvio[r.equipo] = (conteoEquiposDesvio[r.equipo] || 0) + 1;
            }
        }
    });

    // Ordenar equipos con más desvíos
    let equiposOrdenados = Object.entries(conteoEquiposDesvio).sort((a, b) => b[1] - a[1]);

    // Casos de diagnóstico generados por el motor de IA basados en los datos reales
    let accionesSimuladas = [];

    if (equiposOrdenados.length > 0) {
        let eqTop = equiposOrdenados[0][0];
        accionesSimuladas.push({
            hallazgo: `Desvío de Concentración en ${eqTop}`,
            porQue: `Evitar fatiga de materiales y asegurar rango óptimo de limpieza CIP.`,
            accion: `Calibración de la bomba dosificadora automática y revisión de la válvula de retención.`,
            quando: `Inmediato (Próximo ciclo CIP)`,
            equipo: eqTop,
            responsable: `Supervisor de Higiene`,
            estado: `En Acción`,
            badgeColor: `bg-amber-100 text-amber-800 border border-amber-300`
        });
    }

    if (equiposOrdenados.length > 1) {
        let eqSec = equiposOrdenados[1][0];
        accionesSimuladas.push({
            hallazgo: `Exceso recurrente de químico en ${eqSec}`,
            porQue: `Controlar el sobreconsumo de solución y mitigar impacto técnico en tuberías.`,
            accion: `Ajuste de parámetros en el PLC del lazo de conductividad y reentrenamiento de operarios.`,
            quando: `Durante las próximas 24 horas`,
            equipo: eqSec,
            responsable: `Líder de Higiene`,
            estado: `Programado`,
            badgeColor: `bg-blue-100 text-blue-800 border border-blue-300`
        });
    }

    // Fila estándar del sistema de calidad
    accionesSimuladas.push({
        hallazgo: `Validación General de Soluciones Madre`,
        porQue: `Garantizar la estabilidad bromatológica y la correcta preparación inicial de productos químicos.`,
        accion: `Inspección visual de válvulas de paso y titulación manual de respaldo en laboratorio.`,
        quando: `Semanalmente`,
        equipo: `Toda la Planta`,
        responsable: `Jefe de Calidad`,
        estado: `Conforme`,
        badgeColor: `bg-emerald-100 text-emerald-800 border border-emerald-300`
    });

    accionesSimuladas.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition border-b border-slate-50 text-xs";
        tr.innerHTML = `
            <td class="py-3 px-4 font-bold text-slate-900">${item.hallazgo}</td>
            <td class="py-3 px-4 text-slate-500">${item.porQue}</td>
            <td class="py-3 px-4 text-slate-700 font-medium">${item.accion}</td>
            <td class="py-3 px-4 text-slate-600">${item.quando}</td>
            <td class="py-3 px-4 font-semibold text-slate-800">${item.equipo}</td>
            <td class="py-3 px-4 text-slate-600">${item.responsable}</td>
            <td class="py-3 px-4 text-center">
                <span class="px-2.5 py-1 rounded-full font-bold text-[11px] ${item.badgeColor}">${item.estado}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 7. CONTROL DE INTERFAZ
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
