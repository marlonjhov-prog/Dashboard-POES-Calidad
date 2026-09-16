// ==========================================
// 1. CREDENCIALES DE BASE DE DATOS
// ==========================================
const PROYECTO_URL = 'https://pemughavmbgcxxahffpn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_oUVzPeOCzi89qXy7Or3GDw_JzcpuKfd';

// IMPORTANTE: Cambiamos el nombre de la variable a 'clienteSupabase' para evitar el SyntaxError
const clienteSupabase = supabase.createClient(PROYECTO_URL, PUBLISHABLE_KEY);

// Variables de estado global
let datosParametros = [];
let datosRegistros = [];

// ==========================================
// 2. INICIO DE LA APLICACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando Dashboard POES...");
    try {
        await cargarInformacionDesdeBD();
        
        if (datosRegistros.length === 0) {
            console.warn("No se encontraron registros en la base de datos.");
            return;
        }

        const kpisAnalizados = calcularIndicadores();
        dibujarGraficos(kpisAnalizados);
        quitarPantallaDeCarga();
        
        console.log("Dashboard cargado exitosamente.");

    } catch (error) {
        console.error("Error al construir el dashboard:", error);
        document.getElementById('loader').innerHTML = `
            <div class="text-danger-red text-center">
                <i class="fa-solid fa-circle-xmark text-4xl mb-2"></i>
                <p class="font-bold">Error de conexión</p>
                <p class="text-sm text-gray-500">No se pudieron cargar los datos de Supabase. Revisa la consola (F12).</p>
            </div>
        `;
    }
});

// ==========================================
// 3. CONSULTAS A SUPABASE (READ)
// ==========================================
async function cargarInformacionDesdeBD() {
    // Leer Parámetros
    const respuestaParametros = await clienteSupabase
        .from('parametros_soluciones')
        .select('*');
    
    if (respuestaParametros.error) throw respuestaParametros.error;
    datosParametros = respuestaParametros.data;

    // Leer Registros (Últimos 500)
    const respuestaRegistros = await clienteSupabase
        .from('registros_limpieza')
        .select('*')
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })
        .limit(500);
    
    if (respuestaRegistros.error) throw respuestaRegistros.error;
    datosRegistros = respuestaRegistros.data;
}

// ==========================================
// 4. MOTOR DE CÁLCULO (KPIs)
// ==========================================
function calcularIndicadores() {
    let conteoConformes = 0;
    let conteoDesvios = 0; 
    let conteoIneficientes = 0; 

    datosRegistros.forEach(fila => {
        // Encontrar los rangos asociados al químico usado en esta fila
        const regla = datosParametros.find(p => p.solucion === fila.solucion);
        
        if (regla) {
            const valor = parseFloat(fila.concen);
            
            if (valor < parseFloat(regla.rango_min)) {
                conteoDesvios++;
            } else if (valor > parseFloat(regla.rango_max)) {
                conteoIneficientes++;
            } else {
                conteoConformes++;
            }
        }
    });

    const total = datosRegistros.length;
    // Eficacia general (Considera conformes y los excesos ineficientes que sí limpian)
    const eficaces = conteoConformes + conteoIneficientes;
    const porcentajeEficacia = total > 0 ? ((eficaces / total) * 100).toFixed(1) : 0;

    // Pintar los números en el HTML
    document.getElementById('kpi-eficacia').innerText = `${porcentajeEficacia}%`;
    document.getElementById('kpi-desvios').innerText = conteoDesvios;
    document.getElementById('kpi-excesos').innerText = conteoIneficientes;
    document.getElementById('kpi-total').innerText = total;

    return { 
        optimos: conteoConformes, 
        excesos: conteoIneficientes, 
        riesgos: conteoDesvios 
    };
}

// ==========================================
// 5. MOTOR GRÁFICO (CHART.JS)
// ==========================================
function dibujarGraficos(kpis) {
    // --- Gráfico Circular (Estado Global) ---
    const lienzoStatus = document.getElementById('statusChart').getContext('2d');
    new Chart(lienzoStatus, {
        type: 'doughnut',
        data: {
            labels: ['Conforme (Óptimo)', 'Ineficiente (Exceso)', 'Desvío (Riesgo)'],
            datasets: [{
                data: [kpis.optimos, kpis.excesos, kpis.riesgos],
                backgroundColor: ['#1f8c22', '#f59e0b', '#dc2626'],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            cutout: '70%'
        }
    });

    // --- Gráfico de Líneas (Tendencia SOSA) ---
    // Aislar la sosa, tomar 30 recientes y ordenarlos del más viejo al más nuevo para el gráfico
    let registrosSosa = datosRegistros.filter(r => r.solucion === 'SOSA').slice(0, 30).reverse();
    const reglaSosa = datosParametros.find(p => p.solucion === 'SOSA');

    if (!reglaSosa || registrosSosa.length === 0) return;

    const ejeX_Fechas = registrosSosa.map(r => {
        let partesFecha = r.fecha.split('-'); // asume formato YYYY-MM-DD
        let horaCorta = r.hora ? r.hora.substring(0,5) : '';
        return `${partesFecha[2]}/${partesFecha[1]} ${horaCorta}`;
    });
    
    const ejeY_Valores = registrosSosa.map(r => parseFloat(r.concen));
    const limiteMinimo = Array(registrosSosa.length).fill(parseFloat(reglaSosa.rango_min));
    const limiteMaximo = Array(registrosSosa.length).fill(parseFloat(reglaSosa.rango_max));

    const lienzoTrend = document.getElementById('trendChart').getContext('2d');
    new Chart(lienzoTrend, {
        type: 'line',
        data: {
            labels: ejeX_Fechas,
            datasets: [
                {
                    label: 'Concentración Real (%)',
                    data: ejeY_Valores,
                    borderColor: '#3b82f6', 
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.3, 
                    fill: true,
                    pointBackgroundColor: '#3b82f6',
                    pointRadius: 3
                },
                {
                    label: 'Límite Máx.',
                    data: limiteMaximo,
                    borderColor: '#f59e0b', 
                    borderWidth: 2,
                    borderDash: [5, 5], 
                    pointRadius: 0
                },
                {
                    label: 'Límite Mín.',
                    data: limiteMinimo,
                    borderColor: '#dc2626', 
                    borderWidth: 2,
                    borderDash: [5, 5],
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
                    suggestedMin: parseFloat(reglaSosa.rango_min) - 0.5,
                    suggestedMax: parseFloat(reglaSosa.rango_max) + 0.5
                }
            }
        }
    });
}

// ==========================================
// 6. TRANSICIONES UI
// ==========================================
function quitarPantallaDeCarga() {
    const cargador = document.getElementById('loader');
    const contenido = document.getElementById('dashboard-content');
    
    cargador.classList.add('hidden');
    contenido.classList.remove('hidden');
    
    // Forzar el repintado antes de cambiar la opacidad
    void contenido.offsetWidth; 
    contenido.classList.remove('opacity-0');
}
