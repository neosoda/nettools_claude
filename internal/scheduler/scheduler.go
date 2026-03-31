package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"nettools/internal/db"
	"nettools/internal/db/models"
	"nettools/internal/logger"

	"github.com/robfig/cron/v3"
)

// JobRunner is a callback type for executing a job
type JobRunner func(ctx context.Context, jobType string, payload map[string]interface{}) error

// Scheduler wraps robfig/cron with DB persistence
type Scheduler struct {
	cron     *cron.Cron
	mu       sync.Mutex
	runner   JobRunner
	entryIDs map[string]cron.EntryID // jobID -> cron.EntryID
}

var instance *Scheduler

func Init(runner JobRunner) *Scheduler {
	instance = &Scheduler{
		cron:     cron.New(cron.WithSeconds()),
		runner:   runner,
		entryIDs: make(map[string]cron.EntryID),
	}
	return instance
}

func Get() *Scheduler {
	return instance
}

func (s *Scheduler) Start(ctx context.Context) {
	s.cron.Start()
	s.loadFromDB(ctx)
}

func (s *Scheduler) Stop() {
	ctx := s.cron.Stop()
	<-ctx.Done()
}

func (s *Scheduler) loadFromDB(ctx context.Context) {
	var jobs []models.ScheduledJob
	if err := db.DB.Where("enabled = ?", true).Find(&jobs).Error; err != nil {
		logger.Error("failed to load scheduled jobs", err)
		return
	}
	for _, job := range jobs {
		j := job
		s.schedule(ctx, &j)
	}
}

// scheduleUnlocked registers a job in the cron engine. Must be called with s.mu held.
func (s *Scheduler) scheduleUnlocked(ctx context.Context, job *models.ScheduledJob) {
	if id, ok := s.entryIDs[job.ID]; ok {
		s.cron.Remove(id)
		delete(s.entryIDs, job.ID)
	}

	entryID, err := s.cron.AddFunc(job.CronExpression, func() {
		s.executeJob(ctx, job)
	})
	if err != nil {
		logger.Error(fmt.Sprintf("failed to schedule job %s: invalid cron expression '%s'", job.Name, job.CronExpression), err)
		return
	}
	s.entryIDs[job.ID] = entryID
}

func (s *Scheduler) schedule(ctx context.Context, job *models.ScheduledJob) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.scheduleUnlocked(ctx, job)
}

func (s *Scheduler) executeJob(ctx context.Context, job *models.ScheduledJob) {
	start := time.Now()
	logger.Info(fmt.Sprintf("executing scheduled job: %s (%s)", job.Name, job.JobType))

	var payload map[string]interface{}
	if job.Payload != "" {
		if err := json.Unmarshal([]byte(job.Payload), &payload); err != nil {
			logger.Error(fmt.Sprintf("invalid payload for job %s", job.Name), err)
		}
	}

	status := "success"
	err := s.runner(ctx, job.JobType, payload)
	if err != nil {
		status = "failed"
		logger.Error(fmt.Sprintf("scheduled job %s failed", job.Name), err)
	}

	now := time.Now()
	updates := map[string]interface{}{
		"last_run_at": now,
		"last_status": status,
	}

	// Auto-disable one-time jobs after execution
	if once, ok := payload["once"]; ok {
		if onceBool, ok := once.(bool); ok && onceBool {
			updates["enabled"] = false
			// Remove from cron scheduler
			s.mu.Lock()
			if id, ok := s.entryIDs[job.ID]; ok {
				s.cron.Remove(id)
				delete(s.entryIDs, job.ID)
			}
			s.mu.Unlock()
		}
	}

	db.DB.Model(job).Updates(updates)

	logger.AuditAction(ctx, "job_executed", "scheduled_job", job.ID,
		fmt.Sprintf(`{"type":"%s","status":"%s"}`, job.JobType, status),
		status, time.Since(start).Milliseconds())
}

// AddJob persists and schedules a job (create or update)
func (s *Scheduler) AddJob(ctx context.Context, job *models.ScheduledJob) error {
	if err := db.DB.Save(job).Error; err != nil {
		return err
	}
	s.schedule(ctx, job)
	return nil
}

// RemoveJob removes a job from DB and the cron scheduler
func (s *Scheduler) RemoveJob(jobID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if id, ok := s.entryIDs[jobID]; ok {
		s.cron.Remove(id)
		delete(s.entryIDs, jobID)
	}
	return db.DB.Delete(&models.ScheduledJob{}, "id = ?", jobID).Error
}

// ToggleJob enables or disables a job
func (s *Scheduler) ToggleJob(ctx context.Context, jobID string, enabled bool) error {
	var job models.ScheduledJob
	if err := db.DB.First(&job, "id = ?", jobID).Error; err != nil {
		return err
	}
	job.Enabled = enabled
	if err := db.DB.Save(&job).Error; err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if !enabled {
		if id, ok := s.entryIDs[jobID]; ok {
			s.cron.Remove(id)
			delete(s.entryIDs, jobID)
		}
	} else {
		// Call scheduleUnlocked directly — mutex is already held
		s.scheduleUnlocked(ctx, &job)
	}
	return nil
}
