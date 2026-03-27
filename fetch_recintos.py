# fetch_recintos.py
import requests
import json

# Descargar recintos de La Paz directamente del API
url = "https://computo.oep.org.bo/api/v1/recintos?department_id=2"

try:
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    data = response.json()
    
    # Guardar el archivo recintos.json
    with open("resultados/recintos.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Recintos descargados: {len(data.get('recintos', []))} recintos")
    print(f"📁 Guardado en: resultados/recintos.json")
    
except Exception as e:
    print(f"❌ Error: {e}")