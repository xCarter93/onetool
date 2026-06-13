// Expo SDK 56+ pnpm monorepo configuration
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so hoisted/workspace deps resolve
config.watchFolders = [workspaceRoot];

// Resolve from the app first, then the hoisted root store.
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(workspaceRoot, "node_modules"),
];

// react-dom is never executed on native, but isomorphic deps (expo-router,
// @clerk/*) import it, and at module load it asserts its version equals react's
// (React error #527). pnpm scatters react-dom@19.2.7 peer copies inside those
// packages' node_modules that a non-clean install can't collapse, and Expo's
// resolver resolves them relative to the importer (ignoring originModulePath).
// So resolve react-dom directly from the hoisted root copy (pinned to react's
// version via root pnpm.overrides) and hand metro the concrete file path.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === "react-dom" || moduleName.startsWith("react-dom/")) {
		return {
			type: "sourceFile",
			filePath: require.resolve(moduleName, { paths: [workspaceRoot] }),
		};
	}
	return (defaultResolveRequest ?? context.resolveRequest)(
		context,
		moduleName,
		platform
	);
};

module.exports = config;
