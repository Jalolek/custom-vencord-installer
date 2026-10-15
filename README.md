# Custom Vencord installer (Jalolek)

Build a Windows installer exe with selected plugins, or ship plugins as `.vencordpack` files.

Needs Node. For the exe build you also need pnpm, git, and Go.
Put your Vencord tree next to this folder as `..\Vencord`, or set `CUSTOM_VENCORD_DIR`.

## Make a pack (one plugin)

```powershell
node .\makePack.mjs vc_chat_encrypt
```

Writes `packs\<id>.vencordpack`.

Pack layout:

- `vencordpack.json` - id, name, description, hashes
- `plugin/` - source (`work/`, `.git`, `node_modules` skipped)

### Install a pack into Vencord

```powershell
node .\installPack.mjs .\packs\vc_chat_encrypt.vencordpack
```

Then rebuild and inject Vencord yourself.

### Pack every plugin from the public list

```powershell
node .\packPublic.mjs
```

## Build the installer exe

```powershell
node .\buildInstaller.mjs
```

Output: `bin\CustomVencordInstaller.exe`

Or run `.\install.ps1`.

GUI: pick plugins from the list, or **Add custom pack** for a local `.vencordpack`.

## Releases

Public packs go on GitHub Releases for this repo. Download a pack, then use **Add custom pack** or `installPack.mjs`.
