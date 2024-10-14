import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import path, { resolve } from "path"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@main": path.resolve(__dirname, "./src/main"),
        "@preload": path.resolve(__dirname, "./src/preload"),
        "@renderer": path.resolve(__dirname, "./src/renderer"),
        "@shared": path.resolve(__dirname, "./src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@main": path.resolve(__dirname, "./src/main"),
        "@preload": path.resolve(__dirname, "./src/preload"),
        "@renderer": path.resolve(__dirname, "./src/renderer"),
        "@shared": path.resolve(__dirname, "./src/shared"),
      },
    },
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
    resolve: {
      alias: {
        "@main": path.resolve(__dirname, "./src/main"),
        "@preload": path.resolve(__dirname, "./src/preload"),
        "@renderer": path.resolve(__dirname, "./src/renderer"),
        "@shared": path.resolve(__dirname, "./src/shared"),
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
