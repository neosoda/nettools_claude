package logger

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"nettools/internal/db"
	"nettools/internal/db/models"

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

	logPath := filepath.Join(logDir, fmt.Sprintf("nettools-%s.log", time.Now().Format("2006-01")))
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

// CleanOldFiles removes log files older than the given number of days
func CleanOldFiles(logDir string, retentionDays int) {
	if retentionDays <= 0 {
		return
	}
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	entries, err := os.ReadDir(logDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".log") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			os.Remove(filepath.Join(logDir, e.Name()))
			Info(fmt.Sprintf("ancien fichier journal supprimé: %s", e.Name()))
		}
	}
}
