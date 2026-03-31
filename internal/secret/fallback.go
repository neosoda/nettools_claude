//go:build !windows

package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"os"
)

func encryptPlatform(plaintext string) ([]byte, error) {
	key := fallbackKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ct := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return []byte(base64.StdEncoding.EncodeToString(ct)), nil
}

func decryptPlatform(ciphertext []byte) (string, error) {
	key := fallbackKey()
	decoded, err := base64.StdEncoding.DecodeString(string(ciphertext))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrDecryptFailed, err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	ns := gcm.NonceSize()
	if len(decoded) < ns {
		return "", ErrDecryptFailed
	}
	data, err := gcm.Open(nil, decoded[:ns], decoded[ns:], nil)
	if err != nil {
		return "", ErrDecryptFailed
	}
	return string(data), nil
}

func fallbackKey() []byte {
	seed := os.Getenv("NETTOOLS_SECRET_KEY")
	if seed == "" {
		hostname, _ := os.Hostname()
		seed = "nettools-" + hostname
		// WARNING: Using hostname-based key derivation. Set NETTOOLS_SECRET_KEY for production security.
		fmt.Fprintf(os.Stderr, "WARNING: NETTOOLS_SECRET_KEY not set, using hostname-derived key. Credentials encryption is weak.\n")
	}
	h := sha256.Sum256([]byte(seed))
	return h[:]
}
