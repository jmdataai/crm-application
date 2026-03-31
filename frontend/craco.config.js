// craco.config.js
const path = require("path");
require("dotenv").config();

const isHealthCheckEnabled = process.env.ENABLE_HEALTH_CHECK === "true";

let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (isHealthCheckEnabled) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

const webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (config) => {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/build/**",
          "**/dist/**",
          "**/coverage/**",
          "**/public/**",
        ],
      };

      if (isHealthCheckEnabled && healthPluginInstance) {
        config.plugins.push(healthPluginInstance);
      }

      return config;
    },
  },
  devServer: (devServerConfig) => {
    if (isHealthCheckEnabled && setupHealthEndpoints && healthPluginInstance) {
      const orig = devServerConfig.setupMiddlewares;
      devServerConfig.setupMiddlewares = (middlewares, devServer) => {
        if (orig) middlewares = orig(middlewares, devServer);
        setupHealthEndpoints(devServer, healthPluginInstance);
        return middlewares;
      };
    }
    return devServerConfig;
  },
};

module.exports = webpackConfig;
