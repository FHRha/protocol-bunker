# Windows EXE Launcher

РЎС‚СЂСѓРєС‚СѓСЂР° `win-exe/`:
- `src/` - РёСЃС…РѕРґРЅРёРєРё `ProtocolBunker.Launcher`, `ProtocolBunker.Bootstrapper`, `ProtocolBunker.UpdaterHelper`
- `assets/icons/` - Р»РѕРєР°Р»СЊРЅС‹Рµ РёРєРѕРЅРєРё (РєРѕРїРёСЂСѓСЋС‚СЃСЏ РёР· `client/dist/favicon`)
- `build/` - СЃРєСЂРёРїС‚С‹ СЃР±РѕСЂРєРё
- `dist/` - Р»РѕРєР°Р»СЊРЅС‹Р№ output РґР»СЏ standalone launcher-СЃР±РѕСЂРєРё

## Р›РѕРєР°Р»СЊРЅР°СЏ СЃР±РѕСЂРєР° С‚РѕР»СЊРєРѕ Р»Р°СѓРЅС‡РµСЂР°

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File win-exe/build/build-launcher.ps1
```

Р РµР·СѓР»СЊС‚Р°С‚:
- `win-exe/dist/ProtocolBunker.exe`
- `win-exe/dist/icons/`

## РџРѕР»РЅР°СЏ СЃР±РѕСЂРєР° win-exe СЂРµР»РёР·Р°

```powershell
pnpm run pack:win-exe
```

Р РµР·СѓР»СЊС‚Р°С‚:
- `artifacts/win-exe/protocol-bunker-win-x64-exe-setup-v0.1.2.exe`
- `artifacts/win-exe/Protocol-Bunker/ProtocolBunker.exe`
- `artifacts/win-exe/Protocol-Bunker/icons/`
- `artifacts/win-exe/protocol-bunker-win-x64-exe-v0.1.2.zip`

Р‘С‹СЃС‚СЂР°СЏ РїРµСЂРµСЃР±РѕСЂРєР° (Р±РµР· JS build):

```powershell
pnpm run pack:win-exe -- --skip-build
```
