// js/mapa.js - Lógica optimizada del mapa

let mapa = null;
let recintosData = null;
let marcadores = [];
let cargoActual = 'gobernador';
let provinciasList = [];
let municipiosList = [];

// Función para obtener color del ganador
function obtenerColorPorGanador(recinto) {
    if (!recinto[cargoActual] || !recinto[cargoActual].grafica) {
        return '#cccccc';
    }
    
    const ganador = recinto[cargoActual].grafica
        .filter(p => p.sigla && p.sigla.trim())
        .sort((a, b) => (b.porcien || 0) - (a.porcien || 0))[0];
    
    if (!ganador) return '#cccccc';
    return ganador.color || '#cccccc';
}

// Función para calcular radio del marcador basado en inscritos
function calcularRadio(inscritos) {
    return Math.max(5, Math.min(14, 5 + Math.log10(inscritos || 100) * 2));
}

// Cargar datos de recintos
async function cargarDatosRecintos() {
    try {
        console.log('Cargando datos de recintos...');
        const response = await fetch('resultados/recintos_light.json');
        if (!response.ok) throw new Error('No se pudo cargar recintos_light.json');
        recintosData = await response.json();
        console.log(`✅ ${Object.keys(recintosData.recintos).length} recintos cargados`);
        return true;
    } catch (error) {
        console.error('Error cargando recintos:', error);
        document.getElementById('mhint-txt').innerHTML = 
            '<span style="color:var(--acento)">Error: No se pudo cargar los datos de recintos</span>';
        return false;
    }
}

// Renderizar todos los recintos en el mapa
function renderizarRecintos() {
    if (!recintosData || !mapa) return;
    
    // Limpiar marcadores existentes
    marcadores.forEach(m => mapa.removeLayer(m));
    marcadores = [];
    
    const recintosList = Object.values(recintosData.recintos);
    
    recintosList.forEach(recinto => {
        const color = obtenerColorPorGanador(recinto);
        const radio = calcularRadio(recinto.inscritos);
        
        const marcador = L.circleMarker([recinto.lat, recinto.lon], {
            radius: radio,
            fillColor: color,
            color: 'rgba(255,255,255,.85)',
            weight: 1.5,
            fillOpacity: 0.85,
            opacity: 0.9
        }).addTo(mapa);
        
        marcador._recinto = recinto;
        marcador.on('click', () => mostrarDetalleRecinto(recinto));
        marcadores.push(marcador);
    });
    
    console.log(`✅ ${marcadores.length} marcadores renderizados`);
    
    // Actualizar leyenda
    actualizarLeyenda();
}

// Actualizar leyenda de colores
function actualizarLeyenda() {
    const leyendaDiv = document.getElementById('li');
    if (!leyendaDiv) return;
    
    // Recolectar partidos únicos de todos los recintos
    const partidos = new Map();
    Object.values(recintosData.recintos).forEach(recinto => {
        if (recinto[cargoActual] && recinto[cargoActual].grafica) {
            const ganador = recinto[cargoActual].grafica
                .filter(p => p.sigla && p.sigla.trim())
                .sort((a, b) => (b.porcien || 0) - (a.porcien || 0))[0];
            if (ganador && ganador.sigla && ganador.color) {
                if (!partidos.has(ganador.sigla)) {
                    partidos.set(ganador.sigla, ganador.color);
                }
            }
        }
    });
    
    // Convertir a array y mostrar los primeros 9
    const partidosList = Array.from(partidos.entries()).slice(0, 9);
    
    if (partidosList.length === 0) {
        leyendaDiv.innerHTML = '<div class="li"><div class="ld" style="background:#ccc"></div>Sin datos</div>';
        return;
    }
    
    leyendaDiv.innerHTML = partidosList.map(([sigla, color]) => `
        <div class="li">
            <div class="ld" style="background:${color}"></div>
            <span>${sigla}</span>
        </div>
    `).join('');
    
    // Agregar opción "Sin datos" al final
    leyendaDiv.innerHTML += '<div class="li"><div class="ld" style="background:#ccc;border:1px solid #bbb"></div>Sin datos</div>';
}

// Mostrar detalle de recinto en panel lateral
function mostrarDetalleRecinto(recinto) {
    // Ocultar hint y mostrar panel detalle
    document.getElementById('mhint').style.display = 'none';
    document.getElementById('rdet').style.display = 'flex';
    
    // Información básica
    document.getElementById('rcn').textContent = recinto.nombre;
    document.getElementById('rcm').innerHTML = `
        ${recinto.municipio} · ${recinto.provincia}<br>
        <em>${recinto.mesas} mesas</em> &nbsp;·&nbsp; ${formatNumber(recinto.inscritos)} inscritos
    `;
    
    // Obtener datos del cargo actual
    const datos = recinto[cargoActual];
    
    if (!datos || !datos.grafica || datos.grafica.length === 0) {
        document.getElementById('rcs').innerHTML = '';
        document.getElementById('rca').style.display = 'none';
        document.getElementById('rcb').innerHTML = '<div class="est" style="padding:14px;font-size:12px">Sin resultados para este recinto</div>';
        return;
    }
    
    // Mostrar actas
    if (datos.tabla) {
        const ac = datos.tabla.find(t => t.nombre === 'Total Actas Computadas');
        const ha = datos.tabla.find(t => t.nombre === 'Total Actas Habilitadas');
        if (ac && ha && ha.valor) {
            const pc = (ac.valor / ha.valor * 100).toFixed(1);
            document.getElementById('rca').style.display = 'block';
            document.getElementById('rcal').textContent = `${formatNumber(ac.valor)} / ${formatNumber(ha.valor)} (${pc}%)`;
            document.getElementById('rcaf').style.width = pc + '%';
        } else {
            document.getElementById('rca').style.display = 'none';
        }
        
        // Estadísticas rápidas
        const stats = ['Votos Válidos', 'Votos Emitidos', 'Votos Blancos', 'Total Votos Nulos'];
        document.getElementById('rcs').innerHTML = stats.map(k => {
            const item = datos.tabla.find(t => t.nombre === k);
            return item ? `<div class="rd-stat">
                <div class="l">${k.replace('Total ', '').replace('Votos ', '')}</div>
                <div class="v">${formatNumber(item.valor)}</div>
                ${item.porcentaje != null ? `<div class="p">${item.porcentaje}%</div>` : ''}
            </div>` : '';
        }).join('');
    } else {
        document.getElementById('rca').style.display = 'none';
        document.getElementById('rcs').innerHTML = '';
    }
    
    // Mostrar candidatos
    const sorted = [...datos.grafica]
        .filter(x => x.sigla && x.sigla.trim())
        .sort((a, b) => (b.porcien || 0) - (a.porcien || 0));
    
    const maxPct = Math.max(...sorted.map(x => x.porcien || 0));
    
    document.getElementById('rcb').innerHTML = sorted.map(x => {
        const color = x.color || '#ccc';
        const width = maxPct > 0 ? (x.porcien / maxPct * 100) : 0;
        return `
            <div class="cr">
                <span class="cr-sigla" title="${x.nombre || x.sigla}">${x.sigla}</span>
                <div class="cr-track">
                    <div class="cr-fill" style="width:${width}%;background:${color}"></div>
                </div>
                <span class="cr-pct" style="color:${color}">${(x.porcien || 0).toFixed(1)}%</span>
            </div>
            <div class="cr-votos">${formatNumber(x.valor)} votos</div>
        `;
    }).join('');
}

// Cerrar panel detalle
function cerrarDet() {
    // Resetear estilos de marcadores
    marcadores.forEach(m => {
        m.setStyle({
            weight: 1.5,
            color: 'rgba(255,255,255,.85)'
        });
    });
    
    document.getElementById('mhint').style.display = 'flex';
    document.getElementById('rdet').style.display = 'none';
}

// Cambiar cargo visualizado en el mapa
async function cambiarCargoMapa() {
    const select = document.getElementById('mc');
    cargoActual = select.value;
    
    // Actualizar botón activo en sidebar
    document.querySelectorAll('.nb').forEach(btn => {
        if (btn.dataset.cargo === cargoActual) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Recargar datos si es necesario (podríamos tener diferentes archivos por cargo)
    // Por ahora, solo recargamos los datos de gobernador que ya tenemos
    if (recintosData) {
        renderizarRecintos();
        // Limpiar panel detalle
        cerrarDet();
    }
}

// Filtrar mapa por provincia y municipio
function filtrarMapa() {
    const provincia = document.getElementById('fp').value;
    const municipio = document.getElementById('fm').value;
    
    // Actualizar lista de municipios según provincia seleccionada
    if (provincia) {
        const municipios = [...new Set(
            Object.values(recintosData.recintos)
                .filter(r => r.provincia === provincia)
                .map(r => r.municipio)
        )].sort();
        
        const fm = document.getElementById('fm');
        fm.innerHTML = '<option value="">Todos los municipios</option>';
        municipios.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            fm.appendChild(opt);
        });
    } else {
        // Si no hay provincia, mostrar todos los municipios
        const todosMunicipios = [...new Set(
            Object.values(recintosData.recintos).map(r => r.municipio)
        )].sort();
        const fm = document.getElementById('fm');
        fm.innerHTML = '<option value="">Todos los municipios</option>';
        todosMunicipios.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            fm.appendChild(opt);
        });
    }
    
    // Filtrar recintos visibles
    const recintosFiltrados = Object.values(recintosData.recintos).filter(r => {
        if (provincia && r.provincia !== provincia) return false;
        if (municipio && r.municipio !== municipio) return false;
        return true;
    });
    
    // Limpiar y volver a renderizar solo los filtrados
    marcadores.forEach(m => mapa.removeLayer(m));
    marcadores = [];
    
    recintosFiltrados.forEach(recinto => {
        const color = obtenerColorPorGanador(recinto);
        const radio = calcularRadio(recinto.inscritos);
        
        const marcador = L.circleMarker([recinto.lat, recinto.lon], {
            radius: radio,
            fillColor: color,
            color: 'rgba(255,255,255,.85)',
            weight: 1.5,
            fillOpacity: 0.85
        }).addTo(mapa);
        
        marcador._recinto = recinto;
        marcador.on('click', () => mostrarDetalleRecinto(recinto));
        marcadores.push(marcador);
    });
    
    // Ajustar vista al área filtrada si hay puntos
    if (recintosFiltrados.length > 0) {
        const bounds = L.latLngBounds(recintosFiltrados.map(r => [r.lat, r.lon]));
        mapa.fitBounds(bounds, { padding: [50, 50] });
    }
}

// Formatear números
function formatNumber(n) {
    if (n === null || n === undefined) return '–';
    return n.toLocaleString('es-BO');
}

// Inicializar mapa
async function iniciarMapa() {
    // Crear mapa
    mapa = L.map('mapa').setView([-16.5, -68.15], 9);
    
    // Capa base
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(mapa);
    
    // Mostrar controles
    document.getElementById('mf').style.display = 'flex';
    document.getElementById('mleg').style.display = 'block';
    
    // Cargar datos
    const cargado = await cargarDatosRecintos();
    if (!cargado) return;
    
    // Poblar select de provincias
    const provincias = [...new Set(Object.values(recintosData.recintos).map(r => r.provincia))].sort();
    const fp = document.getElementById('fp');
    provincias.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        fp.appendChild(opt);
    });
    
    // Poblar select de municipios (todos inicialmente)
    const todosMunicipios = [...new Set(Object.values(recintosData.recintos).map(r => r.municipio))].sort();
    const fm = document.getElementById('fm');
    todosMunicipios.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        fm.appendChild(opt);
    });
    
    // Renderizar recintos
    renderizarRecintos();
    
    console.log('✅ Mapa inicializado correctamente');
}

// Función para selTab (para compatibilidad con el HTML existente)
function selTab(tab) {
    const vt = document.getElementById('vt');
    const vm = document.getElementById('vm');
    const tt = document.getElementById('tt');
    const tm = document.getElementById('tm');
    
    if (tab === 'tabla') {
        vt.classList.add('visible');
        vm.classList.remove('visible');
        tt.classList.add('active');
        tm.classList.remove('active');
        // Recargar tabla si es necesario (ya existe la función renderTabla en el HTML)
        if (typeof renderTabla === 'function') renderTabla();
    } else {
        vt.classList.remove('visible');
        vm.classList.add('visible');
        tt.classList.remove('active');
        tm.classList.add('active');
        // Inicializar mapa si no está listo
        if (!mapa) iniciarMapa();
    }
}

// Función para selCargo (para compatibilidad)
function selCargo(btn) {
    document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cargo = btn.dataset.cargo;
    
    // Actualizar select del mapa si estamos en vista mapa
    if (document.getElementById('vm').classList.contains('visible')) {
        const select = document.getElementById('mc');
        if (select) select.value = cargo;
        cargoActual = cargo;
        if (recintosData) renderizarRecintos();
        cerrarDet();
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Verificar si estamos en vista mapa inicialmente
    const vm = document.getElementById('vm');
    if (vm.classList.contains('visible')) {
        iniciarMapa();
    }
});