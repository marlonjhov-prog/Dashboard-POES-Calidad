// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE
// ==========================================
// URL base del proyecto y Publishable Key inyectadas
const SUPABASE_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let parametros = [];
let registros = [];

// ==========================================
// 2. INICIALIZACIÓN DEL DASHBOARD
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await cargarDatos();
        const resultados = procesarKPIs();
        renderizarGraficos(resultados.conformes, resultados.ineficientes, resultados.desvios);
        mostrarDashboard();
    } catch (error) {
        console.error("Error crítico al iniciar:", error);
        alert("Hubo un error al cargar los datos desde Supabase. Revisa la consola.");
    }
});

// ==========================================
// 3. OBTENER DATOS (LECTURA)
// ==========================================
async function cargarDatos() {
    // 3.1 Cargar Parámetros de Soluciones (Rangos Min/Max)
    const { data: dataParam, error: errParam } = await supabase
        .from('parametros_soluciones')
        .select('*');
    
    if (errParam) throw errParam;
    parametros = dataParam;

    // 3.2 Cargar Registros Históricos (Traemos los últimos 500 para el análisis)
    const { data: dataReg, error: errReg } = await supabase
        .from('registros_limpieza')
        .select('*')
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })
        .limit(500);
    
    if (errReg) throw errReg;
    registros = dataReg;
}

// ==========================================
// 4. LÓGICA DE NEGOCIO (KPIs MATEMÁTICOS)
// ==========================================
function procesarKPIs() {
    let conformes = 0;
    let desviosRiesgo = 0; // Peligro microbiológico (Por debajo del min)
    let ineficientes = 0;  // Desperdicio económico (Por encima del max)

    registros.forEach(registro => {
        // Buscar los parámetros correspondientes a la solución de este registro
        const param = parametros.find(p => p.solucion === registro.solucion);
        
        if (param) {
            const concentracion = parseFloat(registro.concen);
            
            if (concentracion < param.rango_min) {
                desviosRiesgo++;
            } else if (concentracion > param.rango_max) {
                ineficientes++;
            } else {
                conformes++;
            }
        }
    });

    const totalAnalizados = registros.length;
    
    // Cálculo de Eficacia: 
    // Los excesos (ineficientes) SÍ limpian, por lo tanto son eficaces microbiológicamente.
    const eficaces = conformes + ineficientes;
    const porcentajeEficacia = totalAnalizados > 0 ? ((eficaces / totalAnalizados) * 100).toFixed(1) : 0;

    // Inyectar resultados en las tarjetas HTML
    document.getElementById('kpi-eficacia').innerText = `${porcentajeEficacia}%`;
    document.getElementById('kpi-desvios').innerText = desviosRiesgo;
    document.getElementById('kpi-excesos').innerText = ineficientes;
    document.getElementById('kpi-total').innerText = totalAnalizados;

    return { conformes, ineficientes, desvios: desviosRiesgo };
}

// ==========================================
// 5. RENDERIZADO DE GRÁFICAS (CHART.JS)
// ==========================================
function renderizarGraficos(conformes, ineficientes, desvios) {
    // --- GRÁFICO 1: Distribución General del Estado (Doughnut) ---
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Conforme (Óptimo)', 'Ineficiente (Exceso Químico)', 'Desvío (Riesgo Microbiológico)'],
            datasets: [{
                data: [conformes, ineficientes, desvios],
                backgroundColor: ['#1f8c22', '#f59e0b', '#dc2626'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            cutout: '75%'
        }
    });

    // --- GRÁFICO 2: Tendencia de Concentración de SOSA (Líneas) ---
    // Filtramos solo los registros de la solución 'SOSA' y tomamos los últimos 30 en orden cronológico (reverse)
    const registrosSosa = registros.filter(r => r.solucion === 'SOSA').slice(0, 30).reverse();
    const paramSosa = parametros.find(p => p.solucion === 'SOSA');

    // Si no hay parámetros o registros de sosa, abortamos este gráfico para evitar errores
    if (!paramSosa || registrosSosa.length === 0) return; 

    // Preparar etiquetas del Eje X (Fechas cortas)
    const labelsFechas = registrosSosa.map(r => {
        const dateObj = new Date(r.fecha + 'T' + r.hora);
        // Formato: "15/9 09:30"
        return `${dateObj.getDate()}/${dateObj.getMonth() + 1} ${r.hora.substring(0,5)}`;
    });
    
    // Preparar datos de concentración
    const dataConcentracion = registrosSosa.map(r => parseFloat(r.concen));
    
    // Generar líneas estáticas para los límites Min y Max a lo largo del Eje X
    const minLine = Array(registrosSosa.length).fill(paramSosa.rango_min);
    const maxLine = Array(registrosSosa.length).fill(paramSosa.rango_max);

    const ctxTrend = document.getElementById('trendChart').getContext('2d');
    new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: labelsFechas,
            datasets: [
                {
                    label: 'Concentración Real (%)',
                    data: dataConcentracion,
                    borderColor: '#3b82f6', // Azul claro
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    borderWidth: 2,
                    tension: 0.4, // Curvatura suave
                    fill: true
                },
                {
                    label: `Límite Máximo (${paramSosa.rango_max}%)`,
                    data: maxLine,
                    borderColor: '#f59e0b', // Amarillo de alerta
                    borderWidth: 2,
                    borderDash: [6, 6], // Línea punteada
                    pointRadius: 0
                },
                {
                    label: `Límite Mínimo (${paramSosa.rango_min}%)`,
                    data: minLine,
                    borderColor: '#dc2626', // Rojo de peligro
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
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    // Ajustamos el eje Y para que los límites no queden pegados a los bordes
                    suggestedMin: paramSosa.rango_min - 1,
                    suggestedMax: paramSosa.rango_max + 1
                }
            }
        }
    });
}

// ==========================================
// 6. CONTROL DE UI (OCULTAR CARGADOR)
// ==========================================
function mostrarDashboard() {
    document.getElementById('loader').classList.add('hidden');
    const content = document.getElementById('dashboard-content');
    content.classList.remove('hidden');
    // Pequeño retardo (50ms) para que la transición CSS de opacidad sea suave
    setTimeout(() => { 
        content.classList.remove('opacity-0'); 
    }, 50);
}
