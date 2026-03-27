# fetch_completo.py
import requests
import json
import time
from datetime import datetime, timezone
import os

BASE = "https://computo.oep.org.bo"
API = f"{BASE}/api/v1"
DEPT_ID = 2
OUT = "resultados"

os.makedirs(OUT, exist_ok=True)

def guardar(nombre, data):
    path = f"{OUT}/{nombre}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {path}")

def fetch(params, retries=3):
    """Fetch con reintentos y backoff"""
    for i in range(retries):
        try:
            r = requests.get(f"{API}/results", params=params, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if i == retries - 1:
                raise e
            time.sleep(2 ** i)  # backoff exponencial
    return None

# ============================================================
# 1. Descargar lista de recintos
# ============================================================
print("\n=== 1. Descargando lista de recintos de La Paz ===")
try:
    r = requests.get(f"{API}/recintos?department_id={DEPT_ID}", timeout=30)
    r.raise_for_status()
    recintos_base = r.json()
    recintos_list = recintos_base.get("recintos", [])
    print(f"✅ {len(recintos_list)} recintos encontrados")
    guardar("recintos", recintos_base)
except Exception as e:
    print(f"❌ Error: {e}")
    print("⚠️ Usando recintos.json existente...")
    with open(f"{OUT}/recintos.json", encoding="utf-8") as f:
        recintos_base = json.load(f)
    recintos_list = recintos_base.get("recintos", [])

# ============================================================
# 2. Descargar resultados por recinto (Gobernador)
# ============================================================
print("\n=== 2. Descargando resultados por recinto (Gobernador) ===")

# Mapa de municipios a IDs (necesario para el API)
# Primero obtenemos geografía completa
geo = requests.get(f"{BASE}/geografiaNacional.json", timeout=30).json()
la_paz = next(d for d in geo[0]['d'] if d['i'] == DEPT_ID)

# Crear mapa de nombres a IDs
municipio_map = {}
for provincia in la_paz['p']:
    for municipio in provincia['m']:
        key = municipio['n']
        municipio_map[key] = {
            "province_id": provincia['i'],
            "municipality_id": municipio['i']
        }

print(f"  ✅ Mapa de {len(municipio_map)} municipios cargado")

# Procesar recintos con rate limiting
resultados_recinto = {}
total = len(recintos_list)
batch_size = 10  # Procesar de a 10 para no saturar

for i, recinto in enumerate(recintos_list):
    locality_id = recinto["locality_id"]
    recinto_id = recinto["recinto_id"]
    key = f"{locality_id}-{recinto_id}"
    
    # Obtener IDs de municipio
    muni_info = municipio_map.get(recinto["municipio"])
    if not muni_info:
        print(f"  ⚠️ Municipio no encontrado: {recinto['municipio']}")
        resultados_recinto[key] = {
            **recinto,
            "gobernador": None
        }
        continue
    
    params = {
        "candidacy_type_id": 4,  # Gobernador
        "department_id": DEPT_ID,
        "province_id": muni_info["province_id"],
        "municipality_id": muni_info["municipality_id"],
        "locality_id": locality_id,
        "recinto_id": recinto_id,
    }
    
    try:
        data = fetch(params)
        resultados_recinto[key] = {
            **recinto,
            "gobernador": data
        }
        
        if (i + 1) % 50 == 0:
            print(f"    Progreso: {i+1}/{total} recintos")
            
        # Rate limiting - pausa cada 50 requests
        if (i + 1) % 50 == 0:
            print("    ⏸️ Pausa de 2 segundos...")
            time.sleep(2)
            
    except Exception as e:
        print(f"  ❌ Error en recinto {recinto['nombre']}: {e}")
        resultados_recinto[key] = {
            **recinto,
            "gobernador": None
        }

# ============================================================
# 3. Guardar resultados consolidados
# ============================================================
print("\n=== 3. Guardando archivos finales ===")

timestamp = datetime.now(timezone.utc).isoformat()

# Guardar recintos con resultados
recintos_con_resultados = {
    "actualizado": timestamp,
    "total": len(resultados_recinto),
    "recintos": resultados_recinto
}
guardar("recintos_resultados", recintos_con_resultados)

# También guardar una versión optimizada (solo datos esenciales para el mapa)
recintos_light = {
    "actualizado": timestamp,
    "total": len(resultados_recinto),
    "recintos": {}
}

for key, recinto in resultados_recinto.items():
    recintos_light["recintos"][key] = {
        "nombre": recinto["nombre"],
        "municipio": recinto["municipio"],
        "provincia": recinto["provincia"],
        "lat": recinto["lat"],
        "lon": recinto["lon"],
        "mesas": recinto["mesas"],
        "inscritos": recinto["inscritos"],
        "gobernador": recinto.get("gobernador")
    }

guardar("recintos_light", recintos_light)

print("\n✅ ¡Completado!")
print(f"📊 Total recintos procesados: {len(resultados_recinto)}")
print(f"📁 Archivos generados:")
print(f"   - recintos.json (lista base)")
print(f"   - recintos_resultados.json (completo)")
print(f"   - recintos_light.json (optimizado para mapa)")