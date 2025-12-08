const { defineConfig } = require("vite");

module.exports = defineConfig({
  // Ensure assets resolve correctly when served from GitHub Pages at /fireplace/
  base: "/fireplace/"
});
