package secret

import "errors"

// Manager handles encryption/decryption of secrets.
// Uses DPAPI on Windows, AES-256-GCM fallback elsewhere.
type Manager struct{}

func New() *Manager {
	return &Manager{}
}

func (m *Manager) Encrypt(plaintext string) ([]byte, error) {
	if plaintext == "" {
		return nil, nil
	}
	return encryptPlatform(plaintext)
}

func (m *Manager) Decrypt(ciphertext []byte) (string, error) {
	if len(ciphertext) == 0 {
		return "", nil
	}
	return decryptPlatform(ciphertext)
}

var ErrDecryptFailed = errors.New("failed to decrypt secret")
