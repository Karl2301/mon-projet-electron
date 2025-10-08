# Assets Directory

Ce dossier contient les icônes et ressources de l'application.

## Icônes requises

- `icon.png` : Icône principale (512x512 px recommandé)
- `icon.ico` : Icône Windows (format ICO)
- `icon.icns` : Icône macOS (format ICNS)

## Générer les icônes

Vous pouvez utiliser des outils en ligne comme :
- https://convertio.co/png-ico/
- https://cloudconvert.com/png-to-icns

Ou installer electron-icon-builder :
```bash
npm install -g electron-icon-builder
electron-icon-builder --input=./icon.png --output=./
```

## Tailles recommandées

- PNG : 512x512, 256x256, 128x128, 64x64, 32x32, 16x16
- ICO : Multi-tailles intégrées
- ICNS : Multi-tailles intégrées
