import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import { resolve } from "path"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          main_window: resolve(__dirname, "src/renderer/index.html"),
          modal_window: resolve(__dirname, "src/renderer/modal.html"),
          login_window: resolve(__dirname, "src/renderer/login.html"),
          dropdown_window: resolve(__dirname, "src/renderer/dropdown.html"),
        },
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern",
        },
      },
    },
  },
})
