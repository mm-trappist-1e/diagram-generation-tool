import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
  },
  base: `/`, // WARNING: Sync this setting with other files.
  build: {
    outDir: `diagram-generation-tool`,
  },
});
