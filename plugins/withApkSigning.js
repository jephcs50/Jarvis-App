// Sign test APKs with both the v1 (JAR) and v2/v3 schemes. Android Gradle Plugin skips v1 when
// minSdk >= 24, and some device installers then reject the APK as "invalid package".
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "enableV1Signing true";

module.exports = function withApkSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    const pattern = /(signingConfigs\s*\{\s*debug\s*\{[^}]*?keyPassword\s+'android')/;
    if (!pattern.test(cfg.modResults.contents)) {
      throw new Error("withApkSigning: couldn't find the debug signingConfig in app/build.gradle");
    }
    cfg.modResults.contents = cfg.modResults.contents.replace(
      pattern,
      `$1\n            ${MARKER}\n            enableV2Signing true\n            enableV3Signing true`,
    );
    return cfg;
  });
};
