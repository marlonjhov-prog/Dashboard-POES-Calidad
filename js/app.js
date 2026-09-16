const SUPABASE_URL = 'TU_URL_DE_SUPABASE';
const SUPABASE_ANON_KEY = 'TU_API_KEY';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let parametros = [];
let registros = [];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await cargarDatos();
        procesarKPIs();
        mostrarDashboard();
    } catch (error) {
        console.error("Error crítico:", error);
    }
});

async function cargarDatos() {
    const { data: dataParam, error: errParam } = await supabase.from('parametros_soluciones').select('*');
    if (errParam) throw errParam;
    parametros = dataParam;

    const { data: dataReg, error: errReg } = await supabase
        .from('registros_limpieza')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(1000);
    
    if (errReg) throw errReg;
    registros = dataReg;
}

function procesarKPIs() {
    let conformes = 0;
    let desviosRiesgo = 0; 
    let ineficientes = 0; 

    registros.forEach(registro => {
        const param = parametros.find(p => p.solucion === registro.solucion);
        if (param) {
            const concentracion = parseFloat(registro.concen);
            if (concentracion < param.rango_min) desviosRiesgo++;
            else if (concentracion > param.rango_max) ineficientes++;
            else conformes++;
        }
    });

    const totalAnalizados = registros.length;
    const eficaces = conformes + ineficientes;
    const porcentajeEficacia = totalAnalizados > 0 ? ((eficaces / totalAnalizados) * 100).toFixed(1) : 0;

    document.getElementById('kpi-eficacia').innerText = `${porcentajeEficacia}%`;
    document.getElementById('kpi-desvios').innerText = desviosRiesgo;
    document.getElementById('kpi-excesos').innerText = ineficientes;
    document.getElementById('kpi-total').innerText = totalAnalizados;
}

function mostrarDashboard() {
    document.getElementById('loader').classList.add('hidden');
    const content = document.getElementById('dashboard-content');
    content.classList.remove('hidden');
    setTimeout(() => { content.classList.remove('opacity-0'); }, 50);
}
