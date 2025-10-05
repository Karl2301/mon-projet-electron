import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
import path from 'node:path';
// https://vitejs.dev/config
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: [
            { find: 'react', replacement: path.resolve(__dirname, 'node_modules/react') },
            { find: 'react-dom', replacement: path.resolve(__dirname, 'node_modules/react-dom') }
        ]
    }
});
