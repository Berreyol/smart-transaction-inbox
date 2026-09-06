import type { ExpoConfig } from "expo/config";

// Lets the same codebase produce two installable apps side by side on a
// device: the real one (prod backend) and a "Dev" one (dev backend), each
// with its own bundle identifier so installing one doesn't overwrite the
// other. Set per eas.json build profile via `env.APP_VARIANT`.
const IS_DEV = process.env.APP_VARIANT === "development";

const config: ExpoConfig = {
  name: IS_DEV ? "Berry Cash (Dev)" : "Berry Cash",
  slug: "smart-transaction-inbox",
  version: "1.0.0",
  orientation: "portrait",
  icon: IS_DEV ? "./assets/icon-dev.png" : "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    bundleIdentifier: IS_DEV
      ? "com.berreyol.smarttransactioninbox.dev"
      : "com.berreyol.smarttransactioninbox",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: IS_DEV
      ? "com.berreyol.smarttransactioninbox.dev"
      : "com.berreyol.smarttransactioninbox",
  },
  plugins: ["expo-notifications", "expo-font", "expo-localization"],
  extra: {
    eas: {
      projectId: "31549ac4-c3f2-4cdd-b865-28a32852e10b",
    },
  },
  owner: "berreyol",
};

export default config;
