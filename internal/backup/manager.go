package backup

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"networktools/internal/db"
	"networktools/internal/db/models"
	"networktools/internal/ssh"

	"github.com/google/uuid"
)

// Windows-unsafe characters and control characters
var unsafeChars = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)

// Maximum filename length (conservative for Windows compatibility)
const maxFilenameLen = 200

// Manager handles device configuration backups
type Manager struct {
	backupDir string
}

func New(backupDir string) *Manager {
	os.MkdirAll(backupDir, 0700)
	return &Manager{backupDir: backupDir}
}

// GetBackupDir returns the current backup directory path
func (m *Manager) GetBackupDir() string {
	return m.backupDir
}

type BackupRequest struct {
	Device     models.Device
	ConfigType string // running|startup
	Username   string
	Password   string
	PrivateKey string
}

// BackupResult extends backup with progress information
type BackupResult struct {
	Backup *models.Backup
	Error  error
}

// Run performs a backup for a single device
func (m *Manager) Run(ctx context.Context, req BackupRequest) (*models.Backup, error) {
	start := time.Now()
	backup := &models.Backup{
		ID:         uuid.NewString(),
		DeviceID:   req.Device.ID,
		ConfigType: req.ConfigType,
		Status:     "failed",
	}

	// Determine command based on vendor
	vcfg := map[string]map[string]string{
		"cisco":   {"running": "show running-config", "startup": "show startup-config"},
		"aruba":   {"running": "show running-config", "startup": "show startup-config"},
		"hp":      {"running": "show running-config", "startup": "show startup-config"},
		"hpe":     {"running": "display current-configuration", "startup": "display saved-configuration"},
		"allied":  {"running": "show running-config", "startup": "show startup-config"},
		"unknown": {"running": "show running-config", "startup": "show startup-config"},
	}
	vendor := strings.ToLower(req.Device.Vendor)
	if vendor == "" {
		vendor = "unknown"
	}
	command := "show running-config"
	if cmds, ok := vcfg[vendor]; ok {
		if cmd, ok := cmds[req.ConfigType]; ok {
			command = cmd
		}
	}

	params := ssh.ConnectParams{
		Host:       req.Device.IP,
		Port:       req.Device.SSHPort,
		Username:   req.Username,
		Password:   req.Password,
		PrivateKey: req.PrivateKey,
		Vendor:     vendor,
		Timeout:    60 * time.Second,
	}

	sess, err := ssh.Connect(ctx, params)
	if err != nil {
		backup.ErrorMessage = err.Error()
		backup.DurationMs = time.Since(start).Milliseconds()
		db.DB.Create(backup)
		return backup, err
	}
	defer sess.Close()

	output, err := sess.RunCommandInteractive(ctx, command)
	if err != nil {
		backup.ErrorMessage = err.Error()
		backup.DurationMs = time.Since(start).Milliseconds()
		db.DB.Create(backup)
		return backup, err
	}

	// Deep-clean the output: remove any remaining ANSI/control artifacts
	output = deepCleanConfig(output)

	// Validate output is not empty or too short
	if len(strings.TrimSpace(output)) < 10 {
		backup.ErrorMessage = "backup output is empty or too short"
		backup.DurationMs = time.Since(start).Milliseconds()
		db.DB.Create(backup)
		return backup, fmt.Errorf("backup output is empty or too short for %s", req.Device.IP)
	}

	// Save to disk with Windows-safe filename
	filename := m.buildFilename(req.Device, req.ConfigType)
	filePath := filepath.Join(m.backupDir, filename)

	// Handle long paths on Windows
	if runtime.GOOS == "windows" {
		filePath = ensureWindowsLongPath(filePath)
	}

	if err := os.WriteFile(filePath, []byte(output), 0600); err != nil {
		backup.ErrorMessage = fmt.Sprintf("write file: %v", err)
		backup.DurationMs = time.Since(start).Milliseconds()
		db.DB.Create(backup)
		return backup, err
	}

	// Compute hash
	hash := sha256Sum([]byte(output))

	backup.FilePath = filePath
	backup.FileSizeBytes = int64(len(output))
	backup.SHA256Hash = hash
	backup.Status = "success"
	backup.DurationMs = time.Since(start).Milliseconds()

	db.DB.Create(backup)
	return backup, nil
}

// RunConcurrent performs backups on multiple devices concurrently
func (m *Manager) RunConcurrent(ctx context.Context, requests []BackupRequest, workers int, progressCb func(result BackupResult, done, total int)) []BackupResult {
	if workers <= 0 {
		workers = 5
	}
	if workers > 20 {
		workers = 20
	}

	total := len(requests)
	results := make([]BackupResult, 0, total)
	var mu sync.Mutex
	done := 0

	sem := make(chan struct{}, workers)
	var wg sync.WaitGroup

	for _, req := range requests {
		wg.Add(1)
		go func(r BackupRequest) {
			defer wg.Done()

			// Acquire semaphore
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				mu.Lock()
				done++
				br := BackupResult{
					Backup: &models.Backup{DeviceID: r.Device.ID, Status: "failed", ErrorMessage: "cancelled"},
					Error:  ctx.Err(),
				}
				results = append(results, br)
				if progressCb != nil {
					progressCb(br, done, total)
				}
				mu.Unlock()
				return
			}

			backup, err := m.Run(ctx, r)
			mu.Lock()
			done++
			br := BackupResult{Backup: backup, Error: err}
			results = append(results, br)
			if progressCb != nil {
				progressCb(br, done, total)
			}
			mu.Unlock()
		}(req)
	}

	wg.Wait()
	return results
}

func (m *Manager) buildFilename(device models.Device, configType string) string {
	hostname := device.Hostname
	if hostname == "" {
		hostname = device.IP
	}
	// Sanitize hostname for Windows filesystem
	safe := unsafeChars.ReplaceAllString(hostname, "_")
	// Remove leading/trailing dots and spaces (Windows restriction)
	safe = strings.Trim(safe, ". ")
	if safe == "" {
		safe = "device"
	}

	ts := time.Now().Format("20060102-150405")
	ip := strings.ReplaceAll(device.IP, ":", "-") // Handle IPv6
	filename := fmt.Sprintf("%s_%s_%s_%s.txt", safe, ip, configType, ts)

	// Truncate if too long for Windows MAX_PATH
	if len(filename) > maxFilenameLen {
		ext := filepath.Ext(filename)
		filename = filename[:maxFilenameLen-len(ext)] + ext
	}

	return filename
}

// deepCleanConfig performs thorough cleaning of configuration output
func deepCleanConfig(raw string) string {
	// Use the SSH package's comprehensive ANSI cleaner first
	cleaned := ssh.CleanOutput(raw)

	// Remove pagination artifacts that might remain
	paginationRe := regexp.MustCompile(`(?i)^\s*--\s*More\s*--\s*$`)
	lines := strings.Split(cleaned, "\n")
	var result []string
	for _, line := range lines {
		if paginationRe.MatchString(line) {
			continue
		}
		result = append(result, line)
	}

	return strings.TrimSpace(strings.Join(result, "\n"))
}

// ensureWindowsLongPath prefixes paths with \\?\ for Windows long path support
func ensureWindowsLongPath(path string) string {
	if len(path) < 260 {
		return path
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	if !strings.HasPrefix(abs, `\\?\`) {
		return `\\?\` + abs
	}
	return abs
}

func sha256Sum(data []byte) string {
	h := sha256.Sum256(data)
	return fmt.Sprintf("%x", h)
}

// ExportZip creates a ZIP archive of selected backups with integrity validation
func (m *Manager) ExportZip(backupIDs []string, destPath string) error {
	var backups []models.Backup
	db.DB.Where("id IN ?", backupIDs).Find(&backups)

	if len(backups) == 0 {
		return fmt.Errorf("no backups found for the given IDs")
	}

	f, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("create zip: %w", err)
	}

	w := zip.NewWriter(f)
	filesAdded := 0
	var errors []string

	for _, b := range backups {
		if b.FilePath == "" {
			errors = append(errors, fmt.Sprintf("backup %s: no file path", b.ID))
			continue
		}
		content, err := os.ReadFile(b.FilePath)
		if err != nil {
			errors = append(errors, fmt.Sprintf("backup %s: %v", b.ID, err))
			continue
		}

		// Verify file integrity if hash is available
		if b.SHA256Hash != "" {
			actualHash := sha256Sum(content)
			if actualHash != b.SHA256Hash {
				errors = append(errors, fmt.Sprintf("backup %s: integrity check failed (expected %s, got %s)", b.ID, b.SHA256Hash[:8], actualHash[:8]))
				continue
			}
		}

		entry, err := w.Create(filepath.Base(b.FilePath))
		if err != nil {
			errors = append(errors, fmt.Sprintf("backup %s: zip entry: %v", b.ID, err))
			continue
		}
		if _, err := entry.Write(content); err != nil {
			errors = append(errors, fmt.Sprintf("backup %s: write: %v", b.ID, err))
			continue
		}
		filesAdded++
	}

	if err := w.Close(); err != nil {
		f.Close()
		os.Remove(destPath)
		return fmt.Errorf("finalize zip: %w", err)
	}
	f.Close()

	if filesAdded == 0 {
		os.Remove(destPath)
		return fmt.Errorf("no files could be added to zip: %s", strings.Join(errors, "; "))
	}

	// Validate the ZIP by reading it back
	if err := validateZip(destPath); err != nil {
		os.Remove(destPath)
		return fmt.Errorf("zip validation failed: %w", err)
	}

	return nil
}

// validateZip opens and reads a ZIP to verify its integrity
func validateZip(path string) error {
	r, err := zip.OpenReader(path)
	if err != nil {
		return fmt.Errorf("cannot open zip: %w", err)
	}
	defer r.Close()

	for _, f := range r.File {
		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("cannot open entry %s: %w", f.Name, err)
		}
		// Read entire entry to validate CRC
		if _, err := io.Copy(io.Discard, rc); err != nil {
			rc.Close()
			return fmt.Errorf("corrupt entry %s: %w", f.Name, err)
		}
		rc.Close()
	}
	return nil
}

// GetContent reads the content of a backup file
func (m *Manager) GetContent(backupID string) (string, error) {
	var backup models.Backup
	if err := db.DB.First(&backup, "id = ?", backupID).Error; err != nil {
		return "", err
	}
	if backup.FilePath == "" {
		return "", fmt.Errorf("no file path for backup %s", backupID)
	}
	content, err := os.ReadFile(backup.FilePath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// ListForDevice returns all backups for a device
func (m *Manager) ListForDevice(deviceID string) ([]models.Backup, error) {
	var backups []models.Backup
	err := db.DB.Where("device_id = ?", deviceID).Order("created_at DESC").Find(&backups).Error
	return backups, err
}
