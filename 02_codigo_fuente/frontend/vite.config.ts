import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const BACKEND_LOCAL = "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      // Permite importar con "@/services/api" en vez de "../../services/api".
      // Se resuelve con import.meta.url y no con __dirname: Vite dejará de
      // proveer __dirname cuando cargue la configuración como módulo ES nativo.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  server: {
    port: 5173,
    proxy: {
      // En desarrollo, el backend se alcanza a través de Vite. Así el
      // navegador ve todo en el mismo origen y no hay problemas de CORS.
      "/api": { target: BACKEND_LOCAL, changeOrigin: true },
      // El dashboard consulta /health/db, que no cuelga de /api
      "/health": { target: BACKEND_LOCAL, changeOrigin: true },
    },
  },
});
