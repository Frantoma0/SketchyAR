declare module 'eruda' {
  const eruda: { init(): void };
  export default eruda;
}
declare module '*.py?raw' { const source: string; export default source; }
