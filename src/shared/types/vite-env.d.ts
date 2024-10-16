/// <reference types="vite/client" />

/**
 * Describes all existing environment variables and their types.
 * Required for Code completion/intellisense and type checking.
 *
 * Note: To prevent accidentally leaking env variables to the client, only variables prefixed with `VITE_` are exposed to your Vite-processed code.
 *
 * @see https://github.com/vitejs/vite/blob/0a699856b248116632c1ac18515c0a5c7cf3d1db/packages/vite/types/importMeta.d.ts#L7-L14 Base Interface.
 * @see https://vitejs.dev/guide/env-and-mode.html#env-files Vite Env Variables Doc.
 */
interface ImportMetaEnv {
  readonly VITE_API_PATH: string
  readonly VITE_AUTH_APP_URL: string
  readonly VITE_LOGIN_IS_REQUIRED: number
  readonly VITE_MODE: "dev" | "review" | "production"
  readonly VITE_PROTOCOL_SCHEME: string
  readonly VITE_PRODUCT_NAME: string
  readonly VITE_APP_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
