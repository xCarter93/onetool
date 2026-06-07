// Expo SDK 56+ monorepo configuration
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Force React to always resolve from mobile app's node_modules
// (pnpm hoists multiple React copies; pin to one to avoid runtime errors)
const reactPath = path.resolve(projectRoot, "node_modules/react");

config.resolver.extraNodeModules = {
	react: reactPath,
};

// Block ALL nested React copies except the one in mobile/node_modules
config.resolver.blockList = [
	// Block react in workspace root node_modules
	new RegExp(`${workspaceRoot}/node_modules/react/`),
	// Block any nested React in other packages
	/.*\/node_modules\/.*\/node_modules\/react\/.*/,
];

// Custom resolver to aggressively redirect all React imports
config.resolver.resolveRequest = (context, moduleName, platform) => {
	// Intercept any React import and force it to mobile's React
	if (
		moduleName === "react" ||
		moduleName === "react/jsx-runtime" ||
		moduleName === "react/jsx-dev-runtime"
	) {
		return {
			filePath:
				moduleName === "react"
					? path.join(reactPath, "index.js")
					: path.join(reactPath, moduleName.replace("react/", "") + ".js"),
			type: "sourceFile",
		};
	}

	// Use default resolution for everything else
	return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
