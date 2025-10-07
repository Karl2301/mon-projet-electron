import { defineConfig } from 'vite';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

export default defineConfig({
  build: {
    target: 'node18',
    minify: false,
    rollupOptions: {
      input: 'src/main.js',
      output: {
        format: 'cjs'
      },
      external: [
        'crypto',
        'fs',
        'path',
        'os',
        'electron',
        'electron-squirrel-startup'
      ]
    },
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  ssr: {
    external: ['electron-squirrel-startup', 'crypto', 'fs', 'path']
  },
  plugins: [
    {
      name: 'copy-oauth-config',
      writeBundle() {
        try {
          const source = resolve('oauth.config.json');
          const dest = resolve('.vite/build/oauth.config.json'); // Copier dans .vite/build/
          
          if (existsSync(source)) {
            // Créer le répertoire de destination s'il n'existe pas
            const destDir = dirname(dest);
            if (!existsSync(destDir)) {
              mkdirSync(destDir, { recursive: true });
            }
            
            copyFileSync(source, dest);
            console.log('✅ oauth.config.json copié dans .vite/build/');
          } else {
            console.warn('⚠️ oauth.config.json non trouvé à la racine');
          }
        } catch (err) {
          console.error('❌ Erreur lors de la copie de oauth.config.json:', err.message);
        }
      }
    }
  ]
});