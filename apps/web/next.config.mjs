/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build du runtime : sorties autonomes copiées dans l'image Docker (stage runtime).
  output: "standalone",
  // Consomme @caisseflow/shared (mono-repo npm workspaces).
  transpilePackages: ["@caisseflow/shared"],
};

export default nextConfig;
