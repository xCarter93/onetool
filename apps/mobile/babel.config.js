module.exports = function (api) {
	api.cache(true);
	return {
		presets: ["babel-preset-expo"],
		// Reanimated 4 split worklets into its own package; plugin must be last.
		plugins: ["react-native-worklets/plugin"],
	};
};
