import type { NextConfig } from 'next';

const nextConfig = {
  // Keep `next dev` from writing AGENTS.md and CLAUDE.md into this package when an agent runs it.
  // The repo states its agent guidance in the root AGENTS.md.
  agentRules: false,
  reactStrictMode: true,
} satisfies NextConfig;

export default nextConfig;
