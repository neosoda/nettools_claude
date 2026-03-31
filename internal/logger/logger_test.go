package logger

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCleanOldFilesZeroRetention(t *testing.T) {
	dir := t.TempDir()
	f, _ := os.Create(filepath.Join(dir, "test.log"))
	f.Close()

	CleanOldFiles(dir, 0)

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Errorf("expected file to remain with 0 retention, got %d files", len(entries))
	}
}

func TestCleanOldFilesNegativeRetention(t *testing.T) {
	dir := t.TempDir()
	f, _ := os.Create(filepath.Join(dir, "test.log"))
	f.Close()

	CleanOldFiles(dir, -1)

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Errorf("expected file to remain with negative retention, got %d files", len(entries))
	}
}

func TestCleanOldFilesRemovesOldLogs(t *testing.T) {
	dir := t.TempDir()

	// Create an old log file
	oldFile := filepath.Join(dir, "old.log")
	f, _ := os.Create(oldFile)
	f.Close()
	// Set modification time to 100 days ago
	oldTime := time.Now().AddDate(0, 0, -100)
	os.Chtimes(oldFile, oldTime, oldTime)

	// Create a recent log file
	recentFile := filepath.Join(dir, "recent.log")
	f2, _ := os.Create(recentFile)
	f2.Close()

	CleanOldFiles(dir, 30)

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Errorf("expected 1 file remaining, got %d", len(entries))
	}
	if entries[0].Name() != "recent.log" {
		t.Errorf("expected recent.log to remain, got %s", entries[0].Name())
	}
}

func TestCleanOldFilesSkipsNonLogFiles(t *testing.T) {
	dir := t.TempDir()

	// Create an old non-log file
	txtFile := filepath.Join(dir, "data.txt")
	f, _ := os.Create(txtFile)
	f.Close()
	oldTime := time.Now().AddDate(0, 0, -100)
	os.Chtimes(txtFile, oldTime, oldTime)

	CleanOldFiles(dir, 30)

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Errorf("expected non-log file to remain, got %d files", len(entries))
	}
}

func TestCleanOldFilesSkipsDirectories(t *testing.T) {
	dir := t.TempDir()

	// Create a subdirectory (should be skipped)
	os.Mkdir(filepath.Join(dir, "subdir"), 0700)

	CleanOldFiles(dir, 1)

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Errorf("expected directory to remain, got %d entries", len(entries))
	}
}

func TestCleanOldFilesInvalidDir(t *testing.T) {
	// Should not panic on invalid directory
	CleanOldFiles("/nonexistent/path/12345", 30)
}
