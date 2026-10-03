// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The Anthropic SDK's ESM build has a circular import that Metro's module transform turns into
// "Cannot access 'BETA_CLIENT_TOOL_UNION_KEYS' before initialization" at startup.
// Its CommonJS build uses lazy getters for the same exports, so resolve the SDK via "require".
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@anthropic-ai/sdk" || moduleName.startsWith("@anthropic-ai/sdk/")) {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ["require", "react-native", "default"] },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
