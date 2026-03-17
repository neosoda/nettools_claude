package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"networktools/internal/audit"
	"networktools/internal/backup"
	"networktools/internal/db"
	"networktools/internal/db/models"
	"networktools/internal/diff"
	"networktools/internal/logger"
	"networktools/internal/playbook"
	"networktools/internal/scheduler"
	"networktools/internal/secret"
	"networktools/internal/snmp"
	"networktools/internal/ssh"
	"networktools/internal/topology"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gorm.io/gorm"
)

// App is the main Wails application struct
type App struct {
	ctx         context.Context
	dataDir     string
	secretMgr   *secret.Manager
	backupMgr   *backup.Manager
	auditEngine *audit.Engine
	sched       *scheduler.Scheduler
}

func NewApp() *App {
	return &App{}
}

// startup is called at application start
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Determine data directory
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, _ := os.UserHomeDir()
		appData = home
	}
	a.dataDir = filepath.Join(appData, "NetworkTools")

	// Initialize logger
	logDir := filepath.Join(a.dataDir, "logs")
	if err := logger.Init(logDir); err != nil {
		fmt.Println("logger init error:", err)
	}

	// Initialize database
	if err := db.Init(a.dataDir); err != nil {
		logger.Error("database init failed", err)
		runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Database Error",
			Message: "Failed to initialize database: " + err.Error(),
		})
		return
	}

	// Initialize services
	a.secretMgr = secret.New()
	a.backupMgr = backup.New(filepath.Join(a.dataDir, "backups"))
	a.auditEngine = audit.New()

	// Initialize scheduler
	a.sched = scheduler.Init(func(ctx context.Context, jobType string, payload map[string]interface{}) error {
		return a.runScheduledJob(ctx, jobType, payload)
	})
	a.sched.Start(ctx)

	logger.Info("NetworkTools started")
}

func (a *App) shutdown(ctx context.Context) {
	if a.sched != nil {
		a.sched.Stop()
	}
	logger.Close()
}

// ─────────────────────────────────────────────
// DEVICES
// ─────────────────────────────────────────────

func (a *App) GetDevices() ([]models.Device, error) {
	if !db.Ready() {
		return []models.Device{}, nil
	}
	var devices []models.Device
	err := db.DB.Order("hostname, ip").Find(&devices).Error
	return devices, err
}

func (a *App) GetDevice(id string) (*models.Device, error) {
	var device models.Device
	err := db.DB.First(&device, "id = ?", id).Error
	return &device, err
}

func (a *App) SaveDevice(device models.Device) (*models.Device, error) {
	if device.ID == "" {
		device.ID = uuid.NewString()
		if err := db.DB.Create(&device).Error; err != nil {
			return nil, err
		}
		logger.AuditAction(a.ctx, "device_created", "device", device.ID, device.IP, "success", 0)
	} else {
		if err := db.DB.Save(&device).Error; err != nil {
			return nil, err
		}
		logger.AuditAction(a.ctx, "device_updated", "device", device.ID, device.IP, "success", 0)
	}
	return &device, nil
}

func (a *App) DeleteDevice(id string) error {
	err := db.DB.Delete(&models.Device{}, "id = ?", id).Error
	if err == nil {
		logger.AuditAction(a.ctx, "device_deleted", "device", id, "", "success", 0)
	}
	return err
}

// TestDeviceConnection tests SSH connectivity to a device
func (a *App) TestDeviceConnection(deviceID string) map[string]interface{} {
	var device models.Device
	if err := db.DB.First(&device, "id = ?", deviceID).Error; err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}

	username, password, _, err := a.getCredentials(device.CredentialID)
	if err != nil {
		return map[string]interface{}{"success": false, "error": "credentials not found: " + err.Error()}
	}

	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()

	sess, err := ssh.Connect(ctx, ssh.ConnectParams{
		Host:     device.IP,
		Port:     device.SSHPort,
		Username: username,
		Password: password,
		Vendor:   device.Vendor,
		Timeout:  10 * time.Second,
	})
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	sess.Close()
	return map[string]interface{}{"success": true}
}

// ─────────────────────────────────────────────
// CREDENTIALS
// ─────────────────────────────────────────────

func (a *App) GetCredentials() ([]models.CredentialView, error) {
	if !db.Ready() {
		return []models.CredentialView{}, nil
	}
	var creds []models.Credential
	if err := db.DB.Find(&creds).Error; err != nil {
		return nil, err
	}
	views := make([]models.CredentialView, 0, len(creds))
	for _, c := range creds {
		views = append(views, models.CredentialView{
			ID:               c.ID,
			Name:             c.Name,
			Username:         c.Username,
			HasPassword:      len(c.PasswordEnc) > 0,
			HasPrivateKey:    len(c.PrivateKeyEnc) > 0,
			HasSNMPCommunity: len(c.SNMPCommunityEnc) > 0,
			SNMPVersion:      c.SNMPVersion,
			SNMPAuthProtocol: c.SNMPAuthProtocol,
			SNMPPrivProtocol: c.SNMPPrivProtocol,
			SNMPUsername:     c.SNMPUsername,
			CreatedAt:        c.CreatedAt,
		})
	}
	return views, nil
}

// CredentialInput is the input type for creating/updating credentials
type CredentialInput struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Username         string `json:"username"`
	Password         string `json:"password"`
	PrivateKey       string `json:"private_key"`
	SNMPCommunity    string `json:"snmp_community"`
	SNMPAuthKey      string `json:"snmp_auth_key"`
	SNMPPrivKey      string `json:"snmp_priv_key"`
	SNMPVersion      string `json:"snmp_version"`
	SNMPAuthProtocol string `json:"snmp_auth_protocol"`
	SNMPPrivProtocol string `json:"snmp_priv_protocol"`
	SNMPUsername     string `json:"snmp_username"`
}

func (a *App) SaveCredential(input CredentialInput) (*models.CredentialView, error) {
	cred := models.Credential{
		Name:             input.Name,
		Username:         input.Username,
		SNMPVersion:      input.SNMPVersion,
		SNMPAuthProtocol: input.SNMPAuthProtocol,
		SNMPPrivProtocol: input.SNMPPrivProtocol,
		SNMPUsername:     input.SNMPUsername,
	}

	if input.ID != "" {
		cred.ID = input.ID
	} else {
		cred.ID = uuid.NewString()
	}

	var err error
	if input.Password != "" {
		cred.PasswordEnc, err = a.secretMgr.Encrypt(input.Password)
		if err != nil {
			return nil, fmt.Errorf("encrypt password: %w", err)
		}
	}
	if input.PrivateKey != "" {
		cred.PrivateKeyEnc, err = a.secretMgr.Encrypt(input.PrivateKey)
		if err != nil {
			return nil, fmt.Errorf("encrypt private key: %w", err)
		}
	}
	if input.SNMPCommunity != "" {
		cred.SNMPCommunityEnc, err = a.secretMgr.Encrypt(input.SNMPCommunity)
		if err != nil {
			return nil, fmt.Errorf("encrypt snmp community: %w", err)
		}
	}
	if input.SNMPAuthKey != "" {
		cred.SNMPAuthEnc, err = a.secretMgr.Encrypt(input.SNMPAuthKey)
		if err != nil {
			return nil, fmt.Errorf("encrypt snmp auth key: %w", err)
		}
	}
	if input.SNMPPrivKey != "" {
		cred.SNMPPrivEnc, err = a.secretMgr.Encrypt(input.SNMPPrivKey)
		if err != nil {
			return nil, fmt.Errorf("encrypt snmp priv key: %w", err)
		}
	}

	if err := db.DB.Save(&cred).Error; err != nil {
		return nil, err
	}

	view := &models.CredentialView{
		ID:               cred.ID,
		Name:             cred.Name,
		Username:         cred.Username,
		HasPassword:      len(cred.PasswordEnc) > 0,
		HasPrivateKey:    len(cred.PrivateKeyEnc) > 0,
		HasSNMPCommunity: len(cred.SNMPCommunityEnc) > 0,
		SNMPVersion:      cred.SNMPVersion,
		SNMPAuthProtocol: cred.SNMPAuthProtocol,
		SNMPPrivProtocol: cred.SNMPPrivProtocol,
		SNMPUsername:     cred.SNMPUsername,
		CreatedAt:        cred.CreatedAt,
	}
	return view, nil
}

func (a *App) DeleteCredential(id string) error {
	return db.DB.Delete(&models.Credential{}, "id = ?", id).Error
}

// getCredentials decrypts credentials for internal use
func (a *App) getCredentials(credentialID string) (username, password, privateKey string, err error) {
	if credentialID == "" {
		return "", "", "", fmt.Errorf("no credential ID")
	}
	var cred models.Credential
	if err = db.DB.First(&cred, "id = ?", credentialID).Error; err != nil {
		return
	}
	username = cred.Username
	if len(cred.PasswordEnc) > 0 {
		password, err = a.secretMgr.Decrypt(cred.PasswordEnc)
		if err != nil {
			return
		}
	}
	if len(cred.PrivateKeyEnc) > 0 {
		privateKey, err = a.secretMgr.Decrypt(cred.PrivateKeyEnc)
	}
	return
}

func (a *App) getSNMPCommunity(credentialID string) (string, error) {
	var cred models.Credential
	if err := db.DB.First(&cred, "id = ?", credentialID).Error; err != nil {
		return "", err
	}
	if len(cred.SNMPCommunityEnc) == 0 {
		return "TICE", nil
	}
	return a.secretMgr.Decrypt(cred.SNMPCommunityEnc)
}

// ─────────────────────────────────────────────
// SNMP DISCOVERY
// ─────────────────────────────────────────────

// ScanRequest is the input for a network scan
type ScanRequest struct {
	CIDR         string `json:"cidr"`
	Community    string `json:"community"`
	CredentialID string `json:"credential_id"`
	Workers      int    `json:"workers"`
	TimeoutSec   int    `json:"timeout_sec"`
}

func (a *App) ScanNetwork(req ScanRequest) ([]models.Device, error) {
	community := "TICE"
	version := "v2c"

	// Priority: explicit community > credential > default
	if req.Community != "" {
		community = req.Community
	} else if req.CredentialID != "" {
		comm, err := a.getSNMPCommunity(req.CredentialID)
		if err == nil {
			community = comm
		}
	}

	ctx, cancel := context.WithTimeout(a.ctx, 5*time.Minute)
	defer cancel()

	workers := req.Workers
	if workers <= 0 {
		workers = 50
	}

	timeoutSec := req.TimeoutSec
	if timeoutSec <= 0 {
		timeoutSec = 3
	}

	params := snmp.ScanParams{
		CIDR:      req.CIDR,
		Community: community,
		Version:   version,
		Workers:   workers,
		Timeout:   time.Duration(timeoutSec) * time.Second,
		RateDelay: 50 * time.Millisecond, // 50ms between probes per worker — avoids SNMP rate-limiting on switches
	}

	results, err := snmp.Scan(ctx, params, func(ip string, done, total int) {
		pct := 0
		if total > 0 {
			pct = done * 100 / total
		}
		runtime.EventsEmit(a.ctx, "scan:progress", map[string]interface{}{
			"ip":      ip,
			"done":    done,
			"total":   total,
			"percent": pct,
		})
	})
	if err != nil {
		return nil, err
	}

	// Persist discovered devices
	var discovered []models.Device
	for _, r := range results {
		if !r.Reachable {
			continue
		}
		device := a.resultToDevice(r, req.CredentialID, version)
		now := time.Now()
		device.LastSeenAt = &now

		var existing models.Device
		dbErr := db.DB.Where("ip = ?", r.IP).First(&existing).Error
		if dbErr == gorm.ErrRecordNotFound {
			db.DB.Create(&device)
			discovered = append(discovered, device)
		} else {
			existing.Hostname = device.Hostname
			existing.Description = device.Description
			existing.Vendor = device.Vendor
			existing.Model = device.Model
			existing.Location = device.Location
			existing.LastSeenAt = &now
			db.DB.Save(&existing)
			discovered = append(discovered, existing)
		}
	}

	logger.AuditAction(a.ctx, "network_scan", "scan", req.CIDR,
		fmt.Sprintf(`{"found":%d}`, len(discovered)), "success", 0)
	runtime.EventsEmit(a.ctx, "scan:complete", map[string]interface{}{"found": len(discovered)})

	return discovered, nil
}

// SNMPTestResult is the result of a single-IP SNMP test
type SNMPTestResult struct {
	IP        string            `json:"ip"`
	Reachable bool              `json:"reachable"`
	Data      map[string]string `json:"data"`
	Error     string            `json:"error"`
}

func (a *App) TestSNMPHost(ip, community, version string, timeoutSec int) SNMPTestResult {
	if community == "" {
		community = "TICE"
	}
	if timeoutSec <= 0 {
		timeoutSec = 5
	}
	// Use ProbeIPWithFallback: tries community v2c → v1 → public v1.
	// Does NOT go through the mass scanner to avoid flooding the network.
	r := snmp.ProbeIPWithFallback(ip, 161, community, timeoutSec, snmp.ScanParams{})
	errStr := ""
	if r.Error != nil {
		errStr = r.Error.Error()
	}
	return SNMPTestResult{
		IP:        r.IP,
		Reachable: r.Reachable,
		Data:      r.Data,
		Error:     errStr,
	}
}

func (a *App) resultToDevice(r snmp.ScanResult, credID, snmpVersion string) models.Device {
	hostname := strings.TrimSpace(r.Data["sysName"])
	description := strings.TrimSpace(r.Data["sysDescr"])
	location := strings.TrimSpace(r.Data["sysLocation"])
	sysObjectID := strings.TrimSpace(r.Data["sysObjectID"])
	mac := strings.TrimSpace(r.Data["sysMACAddress"])

	// Use actual version that responded (may differ from requested)
	if v, ok := r.Data["_version"]; ok && v != "" {
		snmpVersion = v
	}

	// Model: OID lookup first (most precise), then sysDescr parsing
	model := snmp.ParseModelFromOID(sysObjectID)
	vendor := snmp.ParseVendorFromOID(sysObjectID)
	if model == "" || vendor == "" {
		v2, m2 := snmp.ParseVendorModelFromDescr(description)
		if vendor == "" {
			vendor = v2
		}
		if model == "" {
			model = m2
		}
	}

	return models.Device{
		ID:           uuid.NewString(),
		IP:           r.IP,
		Hostname:     hostname,
		Description:  description,
		Location:     location,
		Vendor:       vendor,
		Model:        model,
		MACAddress:   mac,
		SNMPVersion:  snmpVersion,
		SNMPPort:     161,
		SSHPort:      22,
		CredentialID: credID,
	}
}

// ─────────────────────────────────────────────
// BACKUP
// ─────────────────────────────────────────────

// BackupRequest is the input for a backup operation
type BackupRequest struct {
	DeviceIDs  []string `json:"device_ids"`
	ConfigType string   `json:"config_type"` // running|startup
}

func (a *App) RunBackup(req BackupRequest) ([]models.Backup, error) {
	var results []models.Backup

	for _, deviceID := range req.DeviceIDs {
		var device models.Device
		if err := db.DB.First(&device, "id = ?", deviceID).Error; err != nil {
			continue
		}

		username, password, privateKey, err := a.getCredentials(device.CredentialID)
		if err != nil {
			results = append(results, models.Backup{
				DeviceID: deviceID, Status: "failed",
				ErrorMessage: "credentials: " + err.Error(),
			})
			continue
		}

		configType := req.ConfigType
		if configType == "" {
			configType = "running"
		}

		ctx, cancel := context.WithTimeout(a.ctx, 120*time.Second)
		result, err := a.backupMgr.Run(ctx, backup.BackupRequest{
			Device:     device,
			ConfigType: configType,
			Username:   username,
			Password:   password,
			PrivateKey: privateKey,
		})
		cancel()

		if result != nil {
			results = append(results, *result)
		}

		status := "success"
		if err != nil {
			status = "failed"
		}
		runtime.EventsEmit(a.ctx, "backup:progress", map[string]interface{}{
			"device_id": deviceID,
			"status":    status,
		})
	}

	return results, nil
}

func (a *App) GetBackups(deviceID string) ([]models.Backup, error) {
	return a.backupMgr.ListForDevice(deviceID)
}

func (a *App) GetBackupContent(backupID string) (string, error) {
	return a.backupMgr.GetContent(backupID)
}

func (a *App) ExportBackupsZip(backupIDs []string) (string, error) {
	destPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export Backups",
		DefaultFilename: fmt.Sprintf("backups_%s.zip", time.Now().Format("20060102")),
		Filters: []runtime.FileFilter{
			{DisplayName: "ZIP Archive", Pattern: "*.zip"},
		},
	})
	if err != nil || destPath == "" {
		return "", err
	}
	return destPath, a.backupMgr.ExportZip(backupIDs, destPath)
}

// ─────────────────────────────────────────────
// DIFF
// ─────────────────────────────────────────────

// DiffRequest is the input for a diff operation
type DiffRequest struct {
	TextA          string   `json:"text_a"`
	TextB          string   `json:"text_b"`
	IgnorePatterns []string `json:"ignore_patterns"`
	IgnoreCase     bool     `json:"ignore_case"`
}

func (a *App) CompareDiff(req DiffRequest) (*diff.DiffResult, error) {
	return diff.Compare(req.TextA, req.TextB, diff.CompareOptions{
		IgnorePatterns: req.IgnorePatterns,
		IgnoreCase:     req.IgnoreCase,
	})
}

func (a *App) CompareBackups(backupIDA, backupIDB string) (*diff.DiffResult, error) {
	textA, err := a.backupMgr.GetContent(backupIDA)
	if err != nil {
		return nil, fmt.Errorf("backup A: %w", err)
	}
	textB, err := a.backupMgr.GetContent(backupIDB)
	if err != nil {
		return nil, fmt.Errorf("backup B: %w", err)
	}
	return diff.Compare(textA, textB, diff.CompareOptions{})
}

// ─────────────────────────────────────────────
// AUDIT
// ─────────────────────────────────────────────

func (a *App) RunAudit(deviceIDs []string) ([]audit.AuditReport, error) {
	var reports []audit.AuditReport

	for _, deviceID := range deviceIDs {
		var device models.Device
		if err := db.DB.First(&device, "id = ?", deviceID).Error; err != nil {
			continue
		}

		// Get latest successful backup content
		var latestBackup models.Backup
		err := db.DB.Where("device_id = ? AND status = 'success'", deviceID).
			Order("created_at DESC").First(&latestBackup).Error
		if err != nil {
			reports = append(reports, audit.AuditReport{
				DeviceID:   deviceID,
				DeviceIP:   device.IP,
				TotalRules: 0,
			})
			continue
		}

		content, err := a.backupMgr.GetContent(latestBackup.ID)
		if err != nil {
			continue
		}

		ctx, cancel := context.WithTimeout(a.ctx, 30*time.Second)
		report, err := a.auditEngine.Run(ctx, audit.AuditRequest{
			Device: device,
			Config: content,
		})
		cancel()

		if err == nil && report != nil {
			reports = append(reports, *report)
		}
	}

	return reports, nil
}

func (a *App) GetAuditRules() ([]models.AuditRule, error) {
	var rules []models.AuditRule
	err := db.DB.Find(&rules).Error
	return rules, err
}

func (a *App) SaveAuditRule(rule models.AuditRule) (*models.AuditRule, error) {
	if rule.ID == "" {
		rule.ID = uuid.NewString()
	}
	err := db.DB.Save(&rule).Error
	return &rule, err
}

func (a *App) DeleteAuditRule(id string) error {
	return db.DB.Delete(&models.AuditRule{}, "id = ?", id).Error
}

// ─────────────────────────────────────────────
// SSH / PLAYBOOKS
// ─────────────────────────────────────────────

// SSHCommandRequest is the input for mass SSH commands
type SSHCommandRequest struct {
	DeviceIDs []string `json:"device_ids"`
	Commands  []string `json:"commands"`
}

func (a *App) RunSSHCommands(req SSHCommandRequest) ([]ssh.Result, error) {
	ctx, cancel := context.WithTimeout(a.ctx, 5*time.Minute)
	defer cancel()

	engine := ssh.NewEngine(10)
	engine.Start(ctx)

	for _, deviceID := range req.DeviceIDs {
		var device models.Device
		if err := db.DB.First(&device, "id = ?", deviceID).Error; err != nil {
			continue
		}
		username, password, privateKey, err := a.getCredentials(device.CredentialID)
		if err != nil {
			continue
		}
		engine.Submit(ssh.Job{
			DeviceID: deviceID,
			IP:       device.IP,
			Commands: req.Commands,
			Params: ssh.ConnectParams{
				Host:       device.IP,
				Port:       device.SSHPort,
				Username:   username,
				Password:   password,
				PrivateKey: privateKey,
				Vendor:     device.Vendor,
				Timeout:    60 * time.Second,
			},
		})
	}
	engine.Stop()

	var results []ssh.Result
	for r := range engine.Results() {
		results = append(results, r)
	}
	return results, nil
}

func (a *App) GetPlaybooks() ([]models.Playbook, error) {
	var pbs []models.Playbook
	err := db.DB.Order("name").Find(&pbs).Error
	return pbs, err
}

func (a *App) SavePlaybook(pb models.Playbook) (*models.Playbook, error) {
	if pb.ID == "" {
		pb.ID = uuid.NewString()
	}
	// Validate YAML
	if _, err := playbook.Parse(pb.Content); err != nil {
		return nil, fmt.Errorf("invalid playbook YAML: %w", err)
	}
	err := db.DB.Save(&pb).Error
	return &pb, err
}

func (a *App) DeletePlaybook(id string) error {
	return db.DB.Delete(&models.Playbook{}, "id = ?", id).Error
}

// PlaybookRunRequest is the input for running a playbook
type PlaybookRunRequest struct {
	PlaybookID string   `json:"playbook_id"`
	DeviceIDs  []string `json:"device_ids"`
}

func (a *App) RunPlaybook(req PlaybookRunRequest) ([]playbook.ExecutionResult, error) {
	var pb models.Playbook
	if err := db.DB.First(&pb, "id = ?", req.PlaybookID).Error; err != nil {
		return nil, fmt.Errorf("playbook not found: %w", err)
	}

	def, err := playbook.Parse(pb.Content)
	if err != nil {
		return nil, err
	}

	var results []playbook.ExecutionResult
	for _, deviceID := range req.DeviceIDs {
		var device models.Device
		if err := db.DB.First(&device, "id = ?", deviceID).Error; err != nil {
			continue
		}
		username, password, _, err := a.getCredentials(device.CredentialID)
		if err != nil {
			continue
		}

		ctx, cancel := context.WithTimeout(a.ctx, 5*time.Minute)
		result, runErr := playbook.Run(ctx, def, device, username, password)
		cancel()

		if result != nil {
			results = append(results, *result)
		}

		status := "success"
		if runErr != nil {
			status = "failed"
		}
		runtime.EventsEmit(a.ctx, "playbook:progress", map[string]interface{}{
			"device_id": deviceID,
			"status":    status,
		})
	}
	return results, nil
}

// ─────────────────────────────────────────────
// TOPOLOGY
// ─────────────────────────────────────────────

func (a *App) GetTopology() (*topology.Graph, error) {
	return topology.Build()
}

// ─────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────

func (a *App) GetScheduledJobs() ([]models.ScheduledJob, error) {
	var jobs []models.ScheduledJob
	err := db.DB.Order("name").Find(&jobs).Error
	return jobs, err
}

func (a *App) SaveScheduledJob(job models.ScheduledJob) (*models.ScheduledJob, error) {
	if job.ID == "" {
		job.ID = uuid.NewString()
	}
	err := a.sched.AddJob(a.ctx, &job)
	return &job, err
}

func (a *App) DeleteScheduledJob(id string) error {
	return a.sched.RemoveJob(id)
}

func (a *App) ToggleScheduledJob(id string, enabled bool) error {
	return a.sched.ToggleJob(a.ctx, id, enabled)
}

// ─────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────

// AuditLogQuery defines filtering for audit logs
type AuditLogQuery struct {
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
	Action string `json:"action"`
}

func (a *App) GetAuditLogs(query AuditLogQuery) ([]models.AuditLog, error) {
	if query.Limit <= 0 {
		query.Limit = 100
	}
	var logs []models.AuditLog
	q := db.DB.Order("created_at DESC").Limit(query.Limit).Offset(query.Offset)
	if query.Action != "" {
		q = q.Where("action LIKE ?", "%"+query.Action+"%")
	}
	err := q.Find(&logs).Error
	return logs, err
}

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

// AppSettings holds user preferences
type AppSettings struct {
	Theme            string `json:"theme"`
	Language         string `json:"language"`
	BackupDir        string `json:"backup_dir"`
	MaxWorkers       int    `json:"max_workers"`
	LogRetentionDays int    `json:"log_retention_days"`
}

func (a *App) GetSettings() (*AppSettings, error) {
	settingsPath := filepath.Join(a.dataDir, "settings.json")
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return &AppSettings{
			Theme:            "dark",
			Language:         "fr",
			BackupDir:        filepath.Join(a.dataDir, "backups"),
			MaxWorkers:       50,
			LogRetentionDays: 90,
		}, nil
	}
	var settings AppSettings
	json.Unmarshal(data, &settings)
	return &settings, nil
}

func (a *App) SaveSettings(settings AppSettings) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	settingsPath := filepath.Join(a.dataDir, "settings.json")
	return os.WriteFile(settingsPath, data, 0600)
}

// ─────────────────────────────────────────────
// INTERNAL SCHEDULER RUNNER
// ─────────────────────────────────────────────

func (a *App) runScheduledJob(ctx context.Context, jobType string, payload map[string]interface{}) error {
	switch jobType {
	case "backup":
		deviceIDs := extractStringSlice(payload, "device_ids")
		configType := extractString(payload, "config_type", "running")
		_, err := a.RunBackup(BackupRequest{DeviceIDs: deviceIDs, ConfigType: configType})
		return err
	case "scan":
		cidr := extractString(payload, "cidr", "")
		credID := extractString(payload, "credential_id", "")
		if cidr == "" {
			return fmt.Errorf("scan job missing cidr")
		}
		_, err := a.ScanNetwork(ScanRequest{CIDR: cidr, CredentialID: credID})
		return err
	default:
		return fmt.Errorf("unknown job type: %s", jobType)
	}
}

func extractString(m map[string]interface{}, key, def string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return def
}

func extractStringSlice(m map[string]interface{}, key string) []string {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case []string:
			return val
		case []interface{}:
			result := make([]string, 0, len(val))
			for _, item := range val {
				if s, ok := item.(string); ok {
					result = append(result, s)
				}
			}
			return result
		}
	}
	return nil
}
