import requests
import json
import time
import random
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

def fetch_con_reintentos(params, max_reintentos=5):
    """Fetch con reintentos y backoff exponencial"""
    for intento in range(max_reintentos):
        try:
            # Aumentar timeout y añadir headers
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'es-BO,es;q=0.9'
            }
            r = requests.get(
                f"{API}/results", 
                params=params, 
                timeout=30,
                headers=headers
            )
            r.raise_for_status()
            return r.json()
        except requests.exceptions.Timeout:
            print(f"    ⏰ Timeout (intento {intento+1}/{max_reintentos})")
            if intento == max_reintentos - 1:
                raise
            time.sleep(2 ** intento + random.uniform(0, 1))
        except requests.exceptions.ConnectionError:
            print(f"    🔌 Error de conexión (intento {intento+1}/{max_reintentos})")
            if intento == max_reintentos - 1:
                raise
            time.sleep(3 ** intento)
        except Exception as e:
            if intento == max_reintentos - 1:
                raise
            print(f"    ⚠️ Error: {e}, reintentando...")
            time.sleep(2 ** intento)
    return None

# ============================================================
# 1. Cargar recintos existentes (no descargar de API)
# ============================================================
print("\n=== 1. Cargando recintos desde archivo local ===")
recintos_path = f"{OUT}/recintos.json"
if os.path.exists(recintos_path):
    with open(recintos_path, encoding="utf-8") as f:
        recintos_base = json.load(f)
    recintos_list = recintos_base.get("recintos", [])
    print(f"✅ {len(recintos_list)} recintos cargados desde archivo local")
else:
    print("❌ No se encontró recintos.json")
    exit(1)

# ============================================================
# 2. Crear mapa de municipios a IDs desde meta.json
# ============================================================
print("\n=== 2. Creando mapa de municipios ===")
meta_path = f"{OUT}/meta.json"
if os.path.exists(meta_path):
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    
    municipio_map = {}
    for provincia in meta["provincias"]:
        for municipio in provincia["municipios"]:
            key = municipio["nombre"]
            municipio_map[key] = {
                "province_id": provincia["id"],
                "municipality_id": municipio["id"]
            }
    print(f"✅ Mapa de {len(municipio_map)} municipios cargado")
else:
    print("⚠️ No se encontró meta.json, usando mapa manual...")
    # Mapa manual de algunos municipios si es necesario
    municipio_map = {
        "Achacachi": {"province_id": 2, "municipality_id": 1},
        "El Alto": {"province_id": 1, "municipality_id": 5},
        "Nuestra Señora de La Paz": {"province_id": 1, "municipality_id": 1},
        # Agregar más según necesidad
    }

# ============================================================
# 3. Procesar recintos con rate limiting mejorado
# ============================================================
print("\n=== 3. Descargando resultados por recinto (Gobernador) ===")

resultados_recinto = {}
total = len(recintos_list)
procesados = 0
errores = 0

# Cargar resultados previos si existen
resultados_previos = {}
previos_path = f"{OUT}/recintos_resultados.json"
if os.path.exists(previos_path):
    with open(previos_path, encoding="utf-8") as f:
        previos = json.load(f)
        resultados_previos = previos.get("recintos", {})

for i, recinto in enumerate(recintos_list):
    locality_id = recinto["locality_id"]
    recinto_id = recinto["recinto_id"]
    key = f"{locality_id}-{recinto_id}"
    
    # Si ya tenemos resultados previos y no ha pasado mucho tiempo, usarlos
    if key in resultados_previos and resultados_previos[key].get("gobernador"):
        resultados_recinto[key] = resultados_previos[key]
        procesados += 1
        if (i + 1) % 100 == 0:
            print(f"    Progreso: {i+1}/{total} recintos (usando caché)")
        continue
    
    # Obtener IDs de municipio
    muni_info = municipio_map.get(recinto["municipio"])
    if not muni_info:
        print(f"  ⚠️ Municipio no encontrado: {recinto['municipio']}")
        resultados_recinto[key] = {**recinto, "gobernador": None}
        errores += 1
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
        print(f"  📍 Descargando: {recinto['nombre'][:40]}...")
        data = fetch_con_reintentos(params, max_reintentos=3)
        resultados_recinto[key] = {
            **recinto,
            "gobernador": data
        }
        procesados += 1
        
        # Mostrar progreso cada 10 recintos
        if (i + 1) % 10 == 0:
            print(f"    Progreso: {i+1}/{total} recintos (✅ {procesados} nuevos, ❌ {errores} errores)")
        
        # Rate limiting más agresivo
        if (i + 1) % 20 == 0:
            print("    ⏸️ Pausa de 5 segundos...")
            time.sleep(5)
        else:
            time.sleep(0.5)  # 500ms entre requests
            
    except Exception as e:
        print(f"  ❌ Error en {recinto['nombre'][:30]}: {str(e)[:50]}")
        resultados_recinto[key] = {
            **recinto,
            "gobernador": None
        }
        errores += 1
        time.sleep(2)  # Pausa extra después de error

# ============================================================
# 4. Guardar resultados
# ============================================================
print("\n=== 4. Guardando archivos finales ===")

timestamp = datetime.now(timezone.utc).isoformat()

# Guardar recintos con resultados
recintos_con_resultados = {
    "actualizado": timestamp,
    "total": len(resultados_recinto),
    "recintos": resultados_recinto
}
guardar("recintos_resultados", recintos_con_resultados)

# Versión light para el mapa
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

print(f"\n✅ ¡Procesamiento completado!")
print(f"📊 Total recintos: {total}")
print(f"✅ Procesados exitosamente: {procesados}")
print(f"❌ Errores: {errores}")
print(f"📁 Archivos actualizados en {OUT}/")
