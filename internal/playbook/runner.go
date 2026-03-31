package playbook

import (
	"context"
	"fmt"
	"strings"
	"time"

	"nettools/internal/db"
	"nettools/internal/db/models"
	"nettools/internal/ssh"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

// PlaybookDef defines the YAML structure
type PlaybookDef struct {
	Name     string `yaml:"name"`
	Timeout  string `yaml:"timeout"`
	Steps    []Step `yaml:"steps"`
}

type Step struct {
	Name    string   `yaml:"name"`
	Command string   `yaml:"command"`
	Expect  string   `yaml:"expect"`
	OnError string   `yaml:"on_error"` // continue|abort
}

// ExecutionResult holds the result of a playbook run on a device
type ExecutionResult struct {
	DeviceID    string
	DeviceIP    string
	Steps       []StepResult
	Status      string
	TotalMs     int64
}

type StepResult struct {
	Name    string `json:"name"`
	Command string `json:"command"`
	Output  string `json:"output"`
	Passed  bool   `json:"passed"`
	Error   string `json:"error"`
}

// StepEvent is emitted by the progress callback before and after each step.
// Done=false means the step just started; Done=true means it finished.
type StepEvent struct {
	DeviceID    string
	DeviceIP    string
	DeviceLabel string // hostname or IP
	StepIndex   int
	TotalSteps  int
	StepName    string
	Command     string
	Done        bool
	Output      string
	Passed      bool
	Error       string
}

// ProgressFunc receives real-time step events during playbook execution.
type ProgressFunc func(StepEvent)

// Parse parses a YAML playbook
func Parse(content string) (*PlaybookDef, error) {
	var pb PlaybookDef
	if err := yaml.Unmarshal([]byte(content), &pb); err != nil {
		return nil, fmt.Errorf("parse playbook: %w", err)
	}
	if len(pb.Steps) == 0 {
		return nil, fmt.Errorf("playbook has no steps")
	}
	return &pb, nil
}

// Run executes a playbook on a device.
// onProgress is called before each step starts (Done=false) and after it finishes (Done=true).
// Pass nil if no real-time feedback is needed.
func Run(ctx context.Context, pb *PlaybookDef, device models.Device, username, password string, onProgress ProgressFunc) (*ExecutionResult, error) {
	start := time.Now()

	label := device.Hostname
	if label == "" {
		label = device.IP
	}

	emit := func(evt StepEvent) {
		if onProgress != nil {
			onProgress(evt)
		}
	}

	result := &ExecutionResult{
		DeviceID: device.ID,
		DeviceIP: device.IP,
		Status:   "failed",
	}

	// Parse timeout
	timeout := 60 * time.Second
	if pb.Timeout != "" {
		if d, err := time.ParseDuration(pb.Timeout); err == nil {
			timeout = d
		}
	}

	params := ssh.ConnectParams{
		Host:     device.IP,
		Port:     device.SSHPort,
		Username: username,
		Password: password,
		Vendor:   device.Vendor,
		Timeout:  timeout,
	}

	sess, err := ssh.Connect(ctx, params)
	if err != nil {
		return result, fmt.Errorf("connect: %w", err)
	}
	defer sess.Close()

	for i, step := range pb.Steps {
		select {
		case <-ctx.Done():
			return result, ctx.Err()
		default:
		}

		base := StepEvent{
			DeviceID:    device.ID,
			DeviceIP:    device.IP,
			DeviceLabel: label,
			StepIndex:   i,
			TotalSteps:  len(pb.Steps),
			StepName:    step.Name,
			Command:     step.Command,
		}

		// Notify: step starting
		emit(base)

		sr := StepResult{Name: step.Name, Command: step.Command}
		output, cmdErr := sess.RunCommandInteractive(ctx, step.Command)
		sr.Output = output

		if cmdErr != nil {
			sr.Error = cmdErr.Error()
			sr.Passed = false
			result.Steps = append(result.Steps, sr)
			evt := base
			evt.Done, evt.Output, evt.Passed, evt.Error = true, output, false, sr.Error
			emit(evt)
			if step.OnError == "abort" || step.OnError == "" {
				result.TotalMs = time.Since(start).Milliseconds()
				saveExecution(result, device.ID, "")
				return result, fmt.Errorf("step '%s' failed: %w", step.Name, cmdErr)
			}
			continue
		}

		// Check expect pattern if defined
		if step.Expect != "" {
			sr.Passed = strings.Contains(output, step.Expect)
			if !sr.Passed {
				sr.Error = fmt.Sprintf("expected '%s' not found in output", step.Expect)
			}
		} else {
			sr.Passed = true
		}

		result.Steps = append(result.Steps, sr)
		evt := base
		evt.Done, evt.Output, evt.Passed, evt.Error = true, output, sr.Passed, sr.Error
		emit(evt)

		if !sr.Passed && (step.OnError == "abort" || step.OnError == "") {
			result.TotalMs = time.Since(start).Milliseconds()
			saveExecution(result, device.ID, "")
			return result, fmt.Errorf("step '%s' expectation failed", step.Name)
		}
	}

	result.Status = "success"
	result.TotalMs = time.Since(start).Milliseconds()
	saveExecution(result, device.ID, "")
	return result, nil
}

func saveExecution(result *ExecutionResult, deviceID, playbookID string) {
	if db.DB == nil {
		return
	}
	output := formatOutput(result)
	exec := models.PlaybookExecution{
		ID:         uuid.NewString(),
		PlaybookID: playbookID,
		DeviceID:   deviceID,
		Status:     result.Status,
		Output:     output,
		DurationMs: result.TotalMs,
	}
	db.DB.Create(&exec)
}

func formatOutput(result *ExecutionResult) string {
	var sb strings.Builder
	for _, step := range result.Steps {
		sb.WriteString(fmt.Sprintf("=== Step: %s ===\n", step.Name))
		sb.WriteString(fmt.Sprintf("$ %s\n", step.Command))
		sb.WriteString(step.Output)
		if step.Error != "" {
			sb.WriteString(fmt.Sprintf("\nERROR: %s", step.Error))
		}
		sb.WriteString("\n\n")
	}
	return sb.String()
}
