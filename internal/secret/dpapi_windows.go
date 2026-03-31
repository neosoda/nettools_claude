//go:build windows

package secret

import (
	"encoding/hex"

	"github.com/billgraziano/dpapi"
)

func encryptPlatform(plaintext string) ([]byte, error) {
	// dpapi.Encrypt returns an encrypted hex string
	encrypted, err := dpapi.Encrypt(plaintext)
	if err != nil {
		return nil, err
	}
	return []byte(encrypted), nil
}

func decryptPlatform(ciphertext []byte) (string, error) {
	// dpapi.Decrypt expects the encrypted hex string
	result, err := dpapi.Decrypt(string(ciphertext))
	if err != nil {
		return "", ErrDecryptFailed
	}
	_ = hex.EncodeToString // keep import
	return result, nil
}
