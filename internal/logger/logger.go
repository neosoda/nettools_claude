package logger

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"networktools/internal/db"
	"networktools/internal/db/models"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

var (
	appLogger zerolog.Logger
	logFile   *os.File
)

func Init(logDir string) error {
	if err := os.MkdirAll(logDir, 0700); err != nil {
		return fmt.Errorf("failed to create log dir: %w", err)
	}

	logPath := filepath.Join(logDir, fmt.Sprintf("networktools-%s.log", time.Now().Format("2006-01")))
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}
	logFile = f

	multi := zerolog.MultiLevelWriter(
		zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339},
		f,
	)
	appLogger = zerolog.New(multi).With().Timestamp().Logger()
	log.Logger = appLogger
	return nil
}

func Close() {
	if logFile != nil {
		logFile.Close()
	}
}

func Info(msg string) {
	appLogger.Info().Msg(msg)
}

func Error(msg string, err error) {
	appLogger.Error().Err(err).Msg(msg)
}

func CleanupOldLogs(logDir string, retentionDays int) error {
	if retentionDays <= 0 {
		return nil
	}
	entries, err := os.ReadDir(logDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".log" {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(logDir, entry.Name()))
		}
	}
	if db.DB != nil {
		db.DB.Where("created_at < ?", cutoff).Delete(&models.AuditLog{})
	}
	return nil
}

// AuditAction logs an action to the audit_logs table
func AuditAction(ctx context.Context, action, entityType, entityID, details, status string, durationMs int64) {
	entry := models.AuditLog{
		ID:         uuid.NewString(),
		Action:     action,
		EntityType: entityType,
		EntityID:   entityID,
		Details:    details,
		Status:     status,
		DurationMs: durationMs,
	}
	if db.DB != nil {
		db.DB.Create(&entry)
	}
	appLogger.Info().
		Str("action", action).
		Str("entity_type", entityType).
		Str("entity_id", entityID).
		Str("status", status).
		Int64("duration_ms", durationMs).
		Msg("audit")
}
