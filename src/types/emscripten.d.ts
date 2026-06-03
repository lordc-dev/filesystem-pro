/**
 * Type augmentation for web-tree-sitter
 *
 * web-tree-sitter's type definitions reference EmscriptenModule
 * without declaring it. This stub satisfies the TypeScript compiler
 * when skipLibCheck is disabled.
 */
declare class EmscriptenModule {
  locateFile?: (path: string, prefix: string) => string;
  instantiateWasm?: (imports: WebAssembly.ModuleImports, successCallback: (instance: WebAssembly.Instance) => void) => boolean;
  mainScriptUrlOrBlob?: string | URL;
  print?: (...args: unknown[]) => void;
  printErr?: (...args: unknown[]) => void;
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  setStatus?: (text: string) => void;
  monitorRunDependencies?: (left: number) => void;
}

interface EmscriptenModuleCtor {
  new(moduleOptions?: Partial<EmscriptenModule>): EmscriptenModule;
  (moduleOptions?: Partial<EmscriptenModule>): EmscriptenModule;
}