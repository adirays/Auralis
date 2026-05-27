import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from core.config import get_settings
get_settings.cache_clear()
s = get_settings()

print("CORS origins:")
for o in s.cors_origins_list:
    print(" ", o)

print()
print("5174 covered:", any("5174" in o for o in s.cors_origins_list))
print("5173 covered:", any("5173" in o for o in s.cors_origins_list))
print("127.0.0.1:8000 is backend (not in CORS, correct)")
