/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_Developer_Name?: string;
  readonly VITE_Developer_Email?: string;
  readonly VITE_Developer_LinkedIn?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
