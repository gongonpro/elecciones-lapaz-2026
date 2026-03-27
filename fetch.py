import requests
import json
import os
from datetime import datetime, timezone

BASE = "https://computo.oep.org.bo"
API  = f"{BASE}/api/v1"
DEPT_ID = 2   # La Paz
OUT = "resultados"

os.makedirs(OUT, exist_ok=True)

def guardar(nombre, data):
    path = f"{OUT}/{nombre}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {path}")

def fetch(params):
    r = requests.get(f"{API}/results", params=params, timeout=30)
    r.raise_for_status()
    return r.json()

# ═══════════════════════════════════════════════════════════════
# Geografía La Paz
# ═══════════════════════════════════════════════════════════════
print("=== Cargando geografía de La Paz ===")
geo = requests.get(f"{BASE}/geografiaNacional.json", timeout=30).json()
la_paz = next(d for d in geo[0]['d'] if d['i'] == DEPT_ID)
provincias = la_paz['p']
print(f"  {len(provincias)} provincias encontradas")

# Mapa nombre municipio -> ids para usar en recintos
muni_id_map = {}  # "NombreMuni" -> {province_id, municipality_id}
for prov in provincias:
    for mun in prov['m']:
        muni_id_map[mun['n']] = {
            "province_id": prov['i'],
            "municipality_id": mun['i']
        }

prov_map = {p['i']: {"nombre": p['n'], "municipios": p['m']} for p in provincias}

timestamp = datetime.now(timezone.utc).isoformat()

# ═══════════════════════════════════════════════════════════════
# Gobernador (departamento)
# ═══════════════════════════════════════════════════════════════
print("\n=== Gobernador ===")
data = fetch({"candidacy_type_id": 4, "department_id": DEPT_ID})
guardar("gobernador", {"actualizado": timestamp, "scope": "department", "data": data})

# ═══════════════════════════════════════════════════════════════
# Asambleísta Población (departamento)
# ═══════════════════════════════════════════════════════════════
print("\n=== Asambleísta Población ===")
data = fetch({"candidacy_type_id": 8, "department_id": DEPT_ID})
guardar("asambleista_poblacion", {"actualizado": timestamp, "scope": "department", "data": data})

# ═══════════════════════════════════════════════════════════════
# Asambleísta Territorio (provincia)
# ═══════════════════════════════════════════════════════════════
print("\n=== Asambleísta Territorio ===")
territorio = {"actualizado": timestamp, "scope": "province", "provincias": {}}
for prov in provincias:
    try:
        data = fetch({"candidacy_type_id": 7, "department_id": DEPT_ID, "province_id": prov['i']})
        territorio["provincias"][prov['n']] = {"provincia_id": prov['i'], "data": data}
        print(f"  ✓ {prov['n']}")
    except Exception as e:
        print(f"  ✗ {prov['n']}: {e}")
guardar("asambleista_territorio", territorio)

# ═══════════════════════════════════════════════════════════════
# Alcalde + Concejal (municipio)
# ═══════════════════════════════════════════════════════════════
print("\n=== Alcalde y Concejal ===")
alcaldes   = {"actualizado": timestamp, "scope": "municipality", "municipios": {}}
concejales = {"actualizado": timestamp, "scope": "municipality", "municipios": {}}

for prov in provincias:
    for mun in prov['m']:
        key = f"{prov['n']} / {mun['n']}"
        params_base = {
            "department_id": DEPT_ID,
            "province_id": prov['i'],
            "municipality_id": mun['i']
        }
        meta = {"provincia": prov['n'], "provincia_id": prov['i'], "municipio_id": mun['i']}
        try:
            d = fetch({**params_base, "candidacy_type_id": 13})
            alcaldes["municipios"][key] = {**meta, "data": d}
        except Exception as e:
            print(f"  ✗ Alcalde {key}: {e}")
        try:
            d = fetch({**params_base, "candidacy_type_id": 14})
            concejales["municipios"][key] = {**meta, "data": d}
        except Exception as e:
            print(f"  ✗ Concejal {key}: {e}")
    print(f"  ✓ {prov['n']} ({len(prov['m'])} municipios)")

guardar("alcalde", alcaldes)
guardar("concejal", concejales)

# ═══════════════════════════════════════════════════════════════
# Resultados por RECINTO (para el mapa interactivo)
# Lee recintos.json que ya está en resultados/ y descarga
# gobernador por cada recinto
# ═══════════════════════════════════════════════════════════════
print("\n=== Resultados por recinto (mapa) ===")

recintos_path = f"{OUT}/recintos.json"
if not os.path.exists(recintos_path):
    print(f"  ✗ No se encontró {recintos_path} - saltando descarga por recinto")
    print("    Sube recintos.json a la carpeta resultados/ para activar el mapa")
else:
    with open(recintos_path, encoding="utf-8") as f:
        recintos_base = json.load(f)

    recintos_list = recintos_base.get("recintos", [])
    print(f"  {len(recintos_list)} recintos a consultar")

    resultados_recinto = {}  # key: "locality_id-recinto_id" -> {nombre, coords, resultados por cargo}
    ok = 0
    err = 0

    for rec in recintos_list:
        locality_id = rec["locality_id"]
        recinto_id  = rec["recinto_id"]
        key = f"{locality_id}-{recinto_id}"

        # Obtener province_id y municipality_id desde el mapa geográfico
        muni_info = muni_id_map.get(rec["municipio"], {})
        province_id    = muni_info.get("province_id", 1)
        municipality_id = muni_info.get("municipality_id", 1)

        params = {
            "candidacy_type_id": 4,   # Gobernador para el mapa principal
            "department_id": DEPT_ID,
            "province_id": province_id,
            "municipality_id": municipality_id,
            "locality_id": locality_id,
            "recinto_id": recinto_id,
        }

        try:
            data = fetch(params)
            resultados_recinto[key] = {
                "nombre":   rec["nombre"],
                "municipio": rec["municipio"],
                "provincia": rec["provincia"],
                "lat": rec["lat"],
                "lon": rec["lon"],
                "mesas": rec["mesas"],
                "inscritos": rec["inscritos"],
                "locality_id": locality_id,
                "recinto_id": recinto_id,
                "gobernador": data
            }
            ok += 1
            if ok % 50 == 0:
                print(f"    {ok}/{len(recintos_list)} recintos descargados...")
        except Exception as e:
            err += 1
            # Guardar recinto sin resultados para que el punto aparezca en el mapa
            resultados_recinto[key] = {
                "nombre":   rec["nombre"],
                "municipio": rec["municipio"],
                "provincia": rec["provincia"],
                "lat": rec["lat"],
                "lon": rec["lon"],
                "mesas": rec["mesas"],
                "inscritos": rec["inscritos"],
                "locality_id": locality_id,
                "recinto_id": recinto_id,
                "gobernador": None
            }

    print(f"  ✓ {ok} recintos con datos, {err} sin datos")
    guardar("recintos_resultados", {
        "actualizado": timestamp,
        "total": len(resultados_recinto),
        "recintos": resultados_recinto
    })

# ═══════════════════════════════════════════════════════════════
# Metadata general
# ═══════════════════════════════════════════════════════════════
try:
    titulo = requests.get(f"{BASE}/api/v1/config/titulo", timeout=30).json()
except:
    titulo = {}

meta = {
    "actualizado": timestamp,
    "titulo": titulo,
    "departamento": "La Paz",
    "department_id": DEPT_ID,
    "provincias": [
        {
            "id": p['i'],
            "nombre": p['n'],
            "municipios": [{"id": m['i'], "nombre": m['n']} for m in p['m']]
        }
        for p in provincias
    ]
}
guardar("meta", meta)

print("\n¡Listo! Archivos generados en resultados/")
