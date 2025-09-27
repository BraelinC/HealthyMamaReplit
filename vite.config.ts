import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "client", "src"),
        "@shared": path.resolve(__dirname, "shared"),
      },
    },
    root: path.resolve(__dirname, "client"),
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            // Separate vendor libraries into their own chunks for better caching
            'react-vendor': ['react', 'react-dom'],
            'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs'],
            'form-vendor': ['react-hook-form', '@hookform/resolvers'],
            'utils-vendor': ['axios', 'date-fns', 'clsx']
          }
        }
      },
      target: 'esnext',
      minify: 'terser',
      sourcemap: false,
      chunkSizeWarningLimit: 500 // Warn if chunks exceed 500kb
    },
    server: {
      host: "0.0.0.0",
      port: 5000,
      strictPort: true,
      allowedHosts: true,
      hmr: {
        overlay: true,
        port: 5000,
        // Allow overriding via env if running behind a proxy (e.g., vercel dev)
        host: env.VITE_HMR_HOST || "0.0.0.0",
        clientPort: env.VITE_HMR_CLIENT_PORT ? Number(env.VITE_HMR_CLIENT_PORT) : 5000,
        protocol: env.VITE_HMR_PROTOCOL || "ws",
      },
      proxy: {
        '/api': {
          // Match the Express+Vite integrated dev server
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  };
});
