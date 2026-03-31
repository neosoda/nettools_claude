// Singleton backend module - avoids repeated dynamic imports
import * as App from '../../wailsjs/go/main/App'

let _backend: typeof App | null = null

export async function getBackend() {
  if (!_backend) {
    _backend = await import('../../wailsjs/go/main/App')
  }
  return _backend
}

// Default export for synchronous access (Wails functions are always available at runtime)
export default App
