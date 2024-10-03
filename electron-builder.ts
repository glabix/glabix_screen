import { Configuration } from "app-builder-lib"

const isReview = process.env.MODE === "review"

const getIconPath = (): string => {
  switch (process.env.MODE) {
    case "dev":
      return "public/logo-square-dev.png"
    case "review":
      return "public/logo-square-review.png"
    case "production":
    default:
      return "public/logo-square.png"
  }
}

const options: Configuration = {
  appId: isReview ? "com.glabix.screen-review" : "com.glabix.screen",
  productName: process.env.PRODUCT_NAME,
  protocols: {
    name: `${process.env.PRODUCT_NAME}`,
    schemes: [`${process.env.PACKAGE_NAME}`],
  },
  // "store" | “normal" | "maximum" - For testing builds, use 'store' to reduce build time significantly.
  compression: "store",
  files: ["!out/"],
  icon: getIconPath(),
  artifactName: "${name}-${os}-${arch}.${ext}",
  executableName: process.env.PRODUCT_NAME,
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
