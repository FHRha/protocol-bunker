# Windows EXE Launcher

Структура `win-exe/`:
- `src/` — исходники `ProtocolBunker.Launcher`, `ProtocolBunker.Bootstrapper`, `ProtocolBunker.UpdaterHelper`
- `assets/icons/` — локальные иконки (синхронизируются из корневой папки `icons/`)
- `build/` — скрипты сборки
- `dist/` — локальный output для standalone-сборки лаунчера

## Локальная сборка только лаунчера

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File win-exe/build/build-launcher.ps1
```

Результат:
- `win-exe/dist/ProtocolBunker.exe`
- `win-exe/dist/icons/`

## Полная сборка win-exe релиза

```powershell
pnpm run pack:win-exe
```

Результат:
- `artifacts/win-exe/protocol-bunker-win-x64-exe-setup-v0.2.1.exe`
- `artifacts/win-exe/Protocol-Bunker/ProtocolBunker.exe`
- `artifacts/win-exe/Protocol-Bunker/icons/`
- `artifacts/win-exe/protocol-bunker-win-x64-exe-v0.2.1.zip`

Быстрая пересборка (без JS build):

```powershell
pnpm run pack:win-exe -- --skip-build
```
