import { Configuration } from "app-builder-lib"

const isReview = process.env.MODE === "review"

const getIconPath = (): string => {
  switch (process.env.MODE) {
    case "dev":
      return "resources/icons/logo-square-dev.png"
    case "review":
      return "resources/icons/logo-square-review.png"
    case "production":
    default:
      return "resources/icons/logo-square.png"
  }
}

const options: Configuration = {
  appId: process.env.APP_ID,
  productName: process.env.PRODUCT_NAME,
  protocols: {
    name: `${process.env.PRODUCT_NAME}`,
    schemes: [`${process.env.PACKAGE_NAME}`],
  },
  // "store" | “normal" | "maximum" - For testing builds, use 'store' to reduce build time significantly.
  compression: "store",
  files: [
    "!**/.vscode/*",
    "!src/*",
    "!docs/*",
    "!electron.vite.config.{js,ts,mjs,cjs}",
    "!{.eslintignore,.eslintrc.js,.prettierignore,.prettierrc.yaml,devappupdate.yml,CHANGELOG.md,README.md}",
    "!{.env,.env.*,electron-builder.env,electron-builder.env.*,.npmrc,pnpmlock.yaml}",
    "!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}",
  ],
  icon: getIconPath(),
  artifactName: "${name}-${os}-${arch}.${ext}",
  executableName: process.env.PRODUCT_NAME,
  nativeRebuilder: "legacy",
  win: {
    target: [{ target: "nsis-web", arch: ["x64", "ia32"] }],
  },
  mac: {
    target: [{ target: "default", arch: ["arm64", "x64"] }],
    category: "public.app-category.productivity",
    hardenedRuntime: true,
    gatekeeperAssess: true,
    extendInfo: {
      NSScreenCaptureDescription: "Предоставьте доступ к записи экрана",
      NSMicrophoneUsageDescription: "Предоставьте доступ к микрофону",
      NSCameraUsageDescription: "Предоставьте доступ к камере",
    },
    notarize: true,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
  },
  nsisWeb: {
    shortcutName: process.env.PRODUCT_NAME,
  },
  publish: [
    {
      provider: "generic",
      url: `${process.env.UPDATE_URL}`,
    },
    "github",
  ],
}

export default options
