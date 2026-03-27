// js/mapa.js - Lógica del mapa con soporte para todos los cargos

let mapa = null;
let recintosData = null;
let marcadores = [];
let cargoActual = 'gobernador';

// ── Lookups para cargos sin datos por recinto ──────────────────────────────
let alcaldeLookup = {};
let concejalLookup = {};
let asTerritLookup = {};
let asPoblWinner = null;

function _ganadorDe(grafica) {
    if (!grafica || !grafica.length) return null;
    return grafica
        .filter(p => p.sigla && p.sigla.trim())
        .sort((a, b) => (b.porcien || 0) - (a.porcien || 0))[0] || null;
}

async function cargarLookupsCargos() {
    try {
        const [rAlc, rCon, rAt, rAp] = await Promise.all([
            fetch('resultados/alcalde.json'),
            fetch('resultados/concejal.json'),
            fetch('resultados/asambleista_territorio.json'),
            fetch('resultados/asambleista_poblacion.json'),
        ]);
        const [alc, con, at, ap] = await Promise.all([
            rAlc.json(), rCon.json(), rAt.json(), rAp.json()
        ]);
        for (const [k, v] of Object.entries(alc.municipios || {})) {
            const g = _ganadorDe(v.data && v.data.grafica);
            if (g) alcaldeLookup[k] = g;
        }
        for (const [k, v] of Object.entries(con.municipios || {})) {
            const g = _ganadorDe(v.data && v.data.grafica);
            if (g) concejalLookup[k] = g;
        }
        for (const [k, v] of Object.entries(at.provincias || {})) {
            const g = _ganadorDe(v.data && v.data.grafica);
            if (g) asTerritLookup[k] = g;
        }
        asPoblWinner = _ganadorDe(ap.data && ap.data.grafica);
        console.log('Lookups cargados:', Object.keys(alcaldeLookup).length, 'municipios,', Object.keys(asTerritLookup).length, 'provincias');
    } catch (e) {
        console.error('Error cargando lookups:', e);
    }
}

// ── Color del ganador ──────────────────────────────────────────────────────
function obtenerColorPorGanador(recinto) {
    switch (cargoActual) {
        case 'gobernador': {
            const g = recinto.gobernador;
            if (!g || !g.grafica) return '#cccccc';
            const gan = _ganadorDe(g.grafica);
            return gan ? (gan.color || '#cccccc') : '#cccccc';
        }
        case 'asambleista_poblacion':
            return asPoblWinner ? (asPoblWinner.color || '#cccccc') : '#cccccc';
        case 'asambleista_territorio': {
            const gan = asTerritLookup[recinto.provincia];
            return gan ? (gan.color || '#cccccc') : '#cccccc';
        }
        case 'alcalde': {
            const gan = alcaldeLookup[`${recinto.provincia} / ${recinto.municipio}`];
            return gan ? (gan.color || '#cccccc') : '#cccccc';
        }
        case 'concejal': {
            const gan = concejalLookup[`${recinto.provincia} / ${recinto.municipio}`];
            return gan ? (gan.color || '#cccccc') : '#cccccc';
        }
        default: return '#cccccc';
    }
}

function calcularRadio(inscritos) {
    return Math.max(5, Math.min(14, 5 + Math.log10(inscritos || 100) * 2));
}

// ── Cargar recintos ────────────────────────────────────────────────────────
async function cargarDatosRecintos() {
    try {
        const response = await fetch('resultados/recintos_light.json');
        if (!response.ok) throw new Error('No se pudo cargar recintos_light.json');
        recintosData = await response.json();
        console.log(Object.keys(recintosData.recintos).length, 'recintos cargados');
        return true;
    } catch (error) {
        console.error('Error cargando recintos:', error);
        document.getElementById('mhint-txt').innerHTML =
            '<span style="color:var(--acento)">Error: No se pudo cargar los datos</span>';
        return false;
    }
}

// ── Renderizar recintos ────────────────────────────────────────────────────
function renderizarRecintos() {
    if (!recintosData || !mapa) return;
    marcadores.forEach(m => mapa.removeLayer(m));
    marcadores = [];

    Object.values(recintosData.recintos).forEach(recinto => {
        const marcador = L.circleMarker([recinto.lat, recinto.lon], {
            radius: calcularRadio(recinto.inscritos),
            fillColor: obtenerColorPorGanador(recinto),
            color: 'rgba(255,255,255,.85)',
            weight: 1.5,
            fillOpacity: 0.85,
            opacity: 0.9
        }).addTo(mapa);
        marcador._recinto = recinto;
        marcador.on('click', () => mostrarDetalleRecinto(recinto));
        marcadores.push(marcador);
    });

    actualizarLeyenda();
}

// ── Leyenda ────────────────────────────────────────────────────────────────
function actualizarLeyenda() {
    const leyendaDiv = document.getElementById('li');
    if (!leyendaDiv) return;
    const partidos = new Map();

    if (cargoActual === 'gobernador') {
        Object.values(recintosData.recintos).forEach(r => {
            if (r.gobernador && r.gobernador.grafica) {
                const g = _ganadorDe(r.gobernador.grafica);
                if (g && g.sigla && !partidos.has(g.sigla)) partidos.set(g.sigla, g.color);
            }
        });
    } else if (cargoActual === 'asambleista_poblacion' && asPoblWinner) {
        partidos.set(asPoblWinner.sigla, asPoblWinner.color);
    } else if (cargoActual === 'asambleista_territorio') {
        Object.values(asTerritLookup).forEach(g => {
            if (g.sigla && !partidos.has(g.sigla)) partidos.set(g.sigla, g.color);
        });
    } else if (cargoActual === 'alcalde') {
        Object.values(alcaldeLookup).forEach(g => {
            if (g.sigla && !partidos.has(g.sigla)) partidos.set(g.sigla, g.color);
        });
    } else if (cargoActual === 'concejal') {
        Object.values(concejalLookup).forEach(g => {
            if (g.sigla && !partidos.has(g.sigla)) partidos.set(g.sigla, g.color);
        });
    }

    leyendaDiv.innerHTML = Array.from(partidos.entries()).slice(0, 12).map(([sigla, color]) => `
        <div class="li"><div class="ld" style="background:${color || '#ccc'}"></div><span>${sigla}</span></div>
    `).join('') + '<div class="li"><div class="ld" style="background:#ccc;border:1px solid #bbb"></div>Sin datos</div>';
}

// ── Detalle recinto ────────────────────────────────────────────────────────
function mostrarDetalleRecinto(recinto) {
    document.getElementById('mhint').style.display = 'none';
    document.getElementById('rdet').style.display = 'flex';
    document.getElementById('rcn').textContent = recinto.nombre;
    document.getElementById('rcm').innerHTML = `
        ${recinto.municipio} · ${recinto.provincia}<br>
        <em>${recinto.mesas} mesas</em> &nbsp;·&nbsp; ${formatNumber(recinto.inscritos)} inscritos
    `;

    // Para cargos sin datos por recinto, mostrar info del nivel superior
    if (cargoActual !== 'gobernador') {
        document.getElementById('rca').style.display = 'none';
        document.getElementById('rcs').innerHTML = '';

        let gan = null;
        let nivel = '';

        if (cargoActual === 'asambleista_poblacion') {
            gan = asPoblWinner;
            nivel = 'Nivel departamental';
        } else if (cargoActual === 'asambleista_territorio') {
            gan = asTerritLookup[recinto.provincia];
            nivel = `Provincia ${recinto.provincia}`;
        } else if (cargoActual === 'alcalde') {
            gan = alcaldeLookup[`${recinto.provincia} / ${recinto.municipio}`];
            nivel = `Municipio ${recinto.municipio}`;
        } else if (cargoActual === 'concejal') {
            gan = concejalLookup[`${recinto.provincia} / ${recinto.municipio}`];
            nivel = `Municipio ${recinto.municipio} (1er lugar)`;
        }

        if (gan) {
            document.getElementById('rcb').innerHTML = `
                <div style="padding:12px 15px">
                    <div style="font-family:var(--font-m);font-size:9px;color:var(--texto3);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">${nivel}</div>
                    <div class="cr">
                        <span class="cr-sigla" title="${gan.nombre||gan.sigla}">${gan.sigla}</span>
                        <div class="cr-track"><div class="cr-fill" style="width:100%;background:${gan.color||'#ccc'}"></div></div>
                        <span class="cr-pct" style="color:${gan.color||'#ccc'}">${(gan.porcien||0).toFixed(1)}%</span>
                    </div>
                    <div class="cr-votos">${formatNumber(gan.valor)} votos</div>
                </div>
            `;
        } else {
            document.getElementById('rcb').innerHTML = '<div class="est" style="padding:14px;font-size:12px">Sin resultados disponibles</div>';
        }
        return;
    }

    // Gobernador: datos por recinto
    const datos = recinto.gobernador;
    if (!datos || !datos.grafica || datos.grafica.length === 0) {
        document.getElementById('rcs').innerHTML = '';
        document.getElementById('rca').style.display = 'none';
        document.getElementById('rcb').innerHTML = '<div class="est" style="padding:14px;font-size:12px">Sin resultados para este recinto</div>';
        return;
    }

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

    const sorted = [...datos.grafica].filter(x => x.sigla && x.sigla.trim()).sort((a, b) => (b.porcien || 0) - (a.porcien || 0));
    const maxPct = Math.max(...sorted.map(x => x.porcien || 0));
    document.getElementById('rcb').innerHTML = sorted.map(x => {
        const color = x.color || '#ccc';
        const width = maxPct > 0 ? (x.porcien / maxPct * 100) : 0;
        return `
            <div class="cr">
                <span class="cr-sigla" title="${x.nombre || x.sigla}">${x.sigla}</span>
                <div class="cr-track"><div class="cr-fill" style="width:${width}%;background:${color}"></div></div>
                <span class="cr-pct" style="color:${color}">${(x.porcien || 0).toFixed(1)}%</span>
            </div>
            <div class="cr-votos">${formatNumber(x.valor)} votos</div>
        `;
    }).join('');
}

function cerrarDet() {
    marcadores.forEach(m => m.setStyle({ weight: 1.5, color: 'rgba(255,255,255,.85)' }));
    document.getElementById('mhint').style.display = 'flex';
    document.getElementById('rdet').style.display = 'none';
}

// ── Filtros ────────────────────────────────────────────────────────────────
function filtrarMapa() {
    const provincia = document.getElementById('fp').value;
    const municipio = document.getElementById('fm').value;

    if (provincia) {
        const municipios = [...new Set(Object.values(recintosData.recintos).filter(r => r.provincia === provincia).map(r => r.municipio))].sort();
        const fm = document.getElementById('fm');
        fm.innerHTML = '<option value="">Todos los municipios</option>';
        municipios.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; fm.appendChild(o); });
    }

    const filtrados = Object.values(recintosData.recintos).filter(r => {
        if (provincia && r.provincia !== provincia) return false;
        if (municipio && r.municipio !== municipio) return false;
        return true;
    });

    marcadores.forEach(m => mapa.removeLayer(m));
    marcadores = [];

    filtrados.forEach(recinto => {
        const marcador = L.circleMarker([recinto.lat, recinto.lon], {
            radius: calcularRadio(recinto.inscritos),
            fillColor: obtenerColorPorGanador(recinto),
            color: 'rgba(255,255,255,.85)', weight: 1.5, fillOpacity: 0.85
        }).addTo(mapa);
        marcador._recinto = recinto;
        marcador.on('click', () => mostrarDetalleRecinto(recinto));
        marcadores.push(marcador);
    });

    if (filtrados.length > 0) mapa.fitBounds(L.latLngBounds(filtrados.map(r => [r.lat, r.lon])), { padding: [50, 50] });
}

async function cambiarCargoMapa() {
    cargoActual = document.getElementById('mc').value;
    document.querySelectorAll('.nb').forEach(btn => btn.classList.toggle('active', btn.dataset.cargo === cargoActual));
    if (recintosData) { renderizarRecintos(); cerrarDet(); }
}

function formatNumber(n) {
    if (n === null || n === undefined) return '–';
    return n.toLocaleString('es-BO');
}

// ── Inicializar mapa ───────────────────────────────────────────────────────
async function iniciarMapa() {
    mapa = L.map('mapa').setView([-16.5, -68.15], 9);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd', maxZoom: 19
    }).addTo(mapa);

    document.getElementById('mf').style.display = 'flex';
    document.getElementById('mleg').style.display = 'block';

    const [cargado] = await Promise.all([cargarDatosRecintos(), cargarLookupsCargos()]);
    if (!cargado) return;

    const provincias = [...new Set(Object.values(recintosData.recintos).map(r => r.provincia))].sort();
    const fp = document.getElementById('fp');
    provincias.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; fp.appendChild(o); });

    renderizarRecintos();
}

// ── selTab / selCargo ──────────────────────────────────────────────────────
function selTab(tab) {
    const vt = document.getElementById('vt');
    const vm = document.getElementById('vm');
    document.getElementById('tt').classList.toggle('active', tab === 'tabla');
    document.getElementById('tm').classList.toggle('active', tab === 'mapa');
    vt.classList.toggle('visible', tab === 'tabla');
    vm.classList.toggle('visible', tab === 'mapa');
    if (tab === 'tabla') { if (typeof renderTabla === 'function') renderTabla(); }
    else { if (!mapa) iniciarMapa(); }
}

function selCargo(btn) {
    document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cargoActual = btn.dataset.cargo;
    const select = document.getElementById('mc');
    if (select) select.value = cargoActual;
    if (document.getElementById('vm').classList.contains('visible')) {
        if (recintosData) { renderizarRecintos(); cerrarDet(); }
    } else {
        if (typeof renderTabla === 'function') renderTabla();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('vm').classList.contains('visible')) iniciarMapa();
    if (typeof renderTabla === 'function') renderTabla();
});
