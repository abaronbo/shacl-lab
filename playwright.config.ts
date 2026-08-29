import { defineConfig } from '@playwright/test';

// The spike must run against a production build served under the Pages
// sub-path (vite preview honors `base`), never just the dev server.
export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:4173/shacl-lab/',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/shacl-lab/',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
