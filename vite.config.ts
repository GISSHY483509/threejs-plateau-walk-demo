// vite.config.ts
import { defineConfig } from 'vite';

const repo = "threejs-plateau-walk-demo"; // ← あなたの公開用リポ名に置換（例: "plateau-walk-demo"）

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? `/${repo}/` : '/', // devは"/"、Pages本番は"/<REPO>/"
}));