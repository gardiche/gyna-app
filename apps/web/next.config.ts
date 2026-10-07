import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@gyna/schemas"],
  // Les fiches des agents (infra/hermes/agents/*.md) sont intégrées telles quelles au build :
  // l'app affiche exactement ce que Hermes utilise.
  webpack(config) {
    config.module.rules.push({ test: /\.md$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
