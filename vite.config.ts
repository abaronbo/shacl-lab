import { defineConfig } from 'vite';

export default defineConfig({
  // The site deploys under a GitHub Pages project sub-path; every asset URL
  // (pyodide runtime and wheels included) must resolve base-relative.
  base: '/shacl-playground/',
  worker: {
    format: 'es',
  },
});
