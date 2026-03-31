// Wails backend bindings wrapper
// These functions call Go methods via the Wails bridge

declare global {
  interface Window {
    go: any
    runtime: any
    WailsInvoke: any
  }
}

// Re-export from generated wailsjs bindings
// The actual import happens in each page component
export {}
