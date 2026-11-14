/// <reference types="vite/client" />

// pdfmake 0.3 ships no type declarations; it is used only in src/pdf.ts (browser build, loaded on demand).
declare module 'pdfmake';
