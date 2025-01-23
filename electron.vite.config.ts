import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import { resolve } from "path"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@main": resolve(import.meta.dirname, "./src/main"),
        "@preload": resolve(import.meta.dirname, "./src/preload"),
        "@renderer": resolve(import.meta.dirname, "./src/renderer"),
        "@shared": resolve(import.meta.dirname, "./src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@main": resolve(import.meta.dirname, "./src/main"),
        "@preload": resolve(import.meta.dirname, "./src/preload"),
        "@renderer": resolve(import.meta.dirname, "./src/renderer"),
        "@shared": resolve(import.meta.dirname, "./src/shared"),
      },
    },
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          main_window: resolve(import.meta.dirname, "src/renderer/index.html"),
          modal_window: resolve(import.meta.dirname, "src/renderer/modal.html"),
          dialog_window: resolve(
            import.meta.dirname,
            "src/renderer/dialog.html"
          ),
          login_window: resolve(import.meta.dirname, "src/renderer/login.html"),
          dropdown_window: resolve(
            import.meta.dirname,
            "src/renderer/dropdown.html"
          ),
          screenshot_window: resolve(
            import.meta.dirname,
            "src/renderer/screenshot.html"
          ),
        },
      },
    },
    resolve: {
      alias: {
        "@main": resolve(import.meta.dirname, "./src/main"),
        "@preload": resolve(import.meta.dirname, "./src/preload"),
        "@renderer": resolve(import.meta.dirname, "./src/renderer"),
        "@shared": resolve(import.meta.dirname, "./src/shared"),
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
