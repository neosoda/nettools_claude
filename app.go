package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
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
	"github.com/xuri/excelize/v2"
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

	mu          sync.Mutex
	scanCancel  context.CancelFunc // cancel running scan
	lastScanIDs []string           // device IDs from last scan
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

	// Backup dir: Windows Downloads folder by default
	backupDir := filepath.Join(a.dataDir, "backups") // fallback
	if homeDir, err := os.UserHomeDir(); err == nil {
		dl := filepath.Join(homeDir, "Downloads", "NetworkTools_Backups")
		backupDir = dl
	}
	a.backupMgr = backup.New(backupDir)
	a.auditEngine = audit.New()

	// Initialize scheduler
	a.sched = scheduler.Init(func(ctx context.Context, jobType string, payload map[string]interface{}) error {
		return a.runScheduledJob(ctx, jobType, payload)
	})
	a.sched.Start(ctx)

	logger.Info("NetworkTools démarré")
}

func (a *App) shutdown(ctx context.Context) {
	if a.sched != nil {
		a.sched.Stop()
	}
	logger.Close()
}

// ─────────────────────────────────────────────
// STOP ALL TASKS
// ─────────────────────────────────────────────

// StopAllTasks cancels any running scan or background task
func (a *App) StopAllTasks() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.scanCancel != nil {
		a.scanCancel()
		a.scanCancel = nil
		runtime.EventsEmit(a.ctx, "tasks:stopped", map[string]interface{}{"message": "Tâches arrêtées"})
		logger.Info("Toutes les tâches ont été arrêtées par l'utilisateur")
		return "stopped"
	}
	return "nothing_running"
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

// ClearInventory removes all devices from the inventory
func (a *App) ClearInventory() error {
	if err := db.DB.Where("1 = 1").Delete(&models.Device{}).Error; err != nil {
		return err
	}
	logger.AuditAction(a.ctx, "clear_inventory", "device", "all", "", "success", 0)
	return nil
}

// GetDevicesByIPs returns devices matching a list of IP addresses
func (a *App) GetDevicesByIPs(ips []string) []models.Device {
	if len(ips) == 0 {
		return []models.Device{}
	}
	var devices []models.Device
	db.DB.Where("ip IN ?", ips).Order("hostname, ip").Find(&devices)
	return devices
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
	CIDR         string   `json:"cidr"`
	IPList       []string `json:"ip_list"`    // Manual list of IPs (alternative to CIDR)
	Community    string   `json:"community"`
	CredentialID string   `json:"credential_id"`
	Workers      int      `json:"workers"`
	TimeoutSec   int      `json:"timeout_sec"`
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

	// Cancel any existing scan and create new cancellable context
	a.mu.Lock()
	if a.scanCancel != nil {
		a.scanCancel()
	}
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Minute)
	a.scanCancel = cancel
	a.mu.Unlock()

	defer func() {
		a.mu.Lock()
		a.scanCancel = nil
		a.mu.Unlock()
		cancel()
	}()

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
		IPs:       req.IPList,
		Community: community,
		Version:   version,
		Workers:   workers,
		Timeout:   time.Duration(timeoutSec) * time.Second,
		RateDelay: 50 * time.Millisecond,
	}

	start := time.Now()
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
		logger.AuditAction(a.ctx, "network_scan", "scan", req.CIDR,
			fmt.Sprintf(`{"error":"%s"}`, err.Error()), "failed", time.Since(start).Milliseconds())
		return nil, err
	}

	// Persist discovered devices
	var discovered []models.Device
	var discoveredIDs []string
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
			discoveredIDs = append(discoveredIDs, device.ID)
		} else {
			existing.Hostname = device.Hostname
			existing.Description = device.Description
			existing.Vendor = device.Vendor
			existing.Model = device.Model
			existing.Location = device.Location
			existing.MACAddress = device.MACAddress
			existing.OSVersion = device.OSVersion
			existing.UptimeSeconds = device.UptimeSeconds
			existing.LastSeenAt = &now
			db.DB.Save(&existing)
			discovered = append(discovered, existing)
			discoveredIDs = append(discoveredIDs, existing.ID)
		}
	}

	// Save last scan device IDs
	a.mu.Lock()
	a.lastScanIDs = discoveredIDs
	a.mu.Unlock()

	scanTarget := req.CIDR
	if len(req.IPList) > 0 {
		scanTarget = fmt.Sprintf("%d IPs manuelles", len(req.IPList))
	}
	logger.AuditAction(a.ctx, "network_scan", "scan", scanTarget,
		fmt.Sprintf(`{"found":%d,"duration_ms":%d}`, len(discovered), time.Since(start).Milliseconds()),
		"success", time.Since(start).Milliseconds())
	runtime.EventsEmit(a.ctx, "scan:complete", map[string]interface{}{
		"found":    len(discovered),
		"duration": time.Since(start).Milliseconds(),
	})

	return discovered, nil
}

// GetLastScanDevices returns devices discovered during the last scan
func (a *App) GetLastScanDevices() []models.Device {
	a.mu.Lock()
	ids := make([]string, len(a.lastScanIDs))
	copy(ids, a.lastScanIDs)
	a.mu.Unlock()

	if len(ids) == 0 {
		return []models.Device{}
	}
	var devices []models.Device
	db.DB.Where("id IN ?", ids).Order("hostname, ip").Find(&devices)
	return devices
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

var firmwareRe = []*regexp.Regexp{
	regexp.MustCompile(`(?i)Version\s+([0-9][^\s,;]+)`),
	regexp.MustCompile(`(?i)revision\s+([A-Z0-9][^\s,;]+)`),
	regexp.MustCompile(`(?i)SW:\s*([^\s,;]+)`),
	regexp.MustCompile(`(?i)firmware[:\s]+([^\s,;]+)`),
}

func parseFirmwareFromDescr(descr string) string {
	for _, re := range firmwareRe {
		if m := re.FindStringSubmatch(descr); len(m) > 1 {
			return m[1]
		}
	}
	return ""
}

func formatUptime(ticks uint64) string {
	totalSec := ticks / 100
	days := totalSec / 86400
	hours := (totalSec % 86400) / 3600
	minutes := (totalSec % 3600) / 60
	if days > 0 {
		return fmt.Sprintf("%dj %dh%02dm", days, hours, minutes)
	}
	return fmt.Sprintf("%dh%02dm", hours, minutes)
}

func (a *App) resultToDevice(r snmp.ScanResult, credID, snmpVersion string) models.Device {
	hostname := strings.TrimSpace(r.Data["sysName"])
	description := strings.TrimSpace(r.Data["sysDescr"])
	location := strings.TrimSpace(r.Data["sysLocation"])
	sysObjectID := strings.TrimSpace(r.Data["sysObjectID"])
	mac := strings.TrimSpace(r.Data["sysMACAddress"])

	// Uptime from TimeTicks (hundredths of seconds)
	var uptimeSec int64
	if uptimeStr, ok := r.Data["sysUpTime"]; ok && uptimeStr != "" {
		if ticks, err := strconv.ParseUint(uptimeStr, 10, 64); err == nil {
			uptimeSec = int64(ticks / 100)
		}
	}

	// Firmware version: try SNMP-provided first, then parse from sysDescr
	firmware := ""
	if fw, ok := r.Data["firmware"]; ok && fw != "" {
		firmware = fw
	} else {
		firmware = parseFirmwareFromDescr(description)
	}

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
		ID:            uuid.NewString(),
		IP:            r.IP,
		Hostname:      hostname,
		Description:   description,
		Location:      location,
		Vendor:        vendor,
		Model:         model,
		MACAddress:    mac,
		OSVersion:     firmware,
		UptimeSeconds: uptimeSec,
		SNMPVersion:   snmpVersion,
		SNMPPort:      161,
		SSHPort:       22,
		CredentialID:  credID,
	}
}

// ExportScanToExcel exports scan results to an Excel file
func (a *App) ExportScanToExcel(deviceIDs []string) (string, error) {
	destPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Exporter le scan vers Excel",
		DefaultFilename: fmt.Sprintf("scan_%s.xlsx", time.Now().Format("20060102_150405")),
		Filters: []runtime.FileFilter{
			{DisplayName: "Fichier Excel (*.xlsx)", Pattern: "*.xlsx"},
		},
	})
	if err != nil || destPath == "" {
		return "", err
	}

	var devices []models.Device
	if len(deviceIDs) > 0 {
		db.DB.Where("id IN ?", deviceIDs).Order("ip").Find(&devices)
	} else {
		db.DB.Order("ip").Find(&devices)
	}

	f := excelize.NewFile()
	defer f.Close()

	sheet := "Scan réseau"
	f.SetSheetName("Sheet1", sheet)

	// Styles
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF", Size: 11},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"1E3A5F"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: false},
		Border: []excelize.Border{
			{Type: "bottom", Color: "4472C4", Style: 2},
		},
	})
	evenStyle, _ := f.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Color: []string{"EBF0FA"}, Pattern: 1},
		Font: &excelize.Font{Size: 10},
		Border: []excelize.Border{
			{Type: "left", Color: "D0D8EC", Style: 1},
			{Type: "right", Color: "D0D8EC", Style: 1},
		},
	})
	oddStyle, _ := f.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Color: []string{"FFFFFF"}, Pattern: 1},
		Font: &excelize.Font{Size: 10},
		Border: []excelize.Border{
			{Type: "left", Color: "D0D8EC", Style: 1},
			{Type: "right", Color: "D0D8EC", Style: 1},
		},
	})
	ipStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "1F4E79", Size: 10, Family: "Courier New"},
		Alignment: &excelize.Alignment{Horizontal: "left"},
	})

	// Headers
	headers := []string{"#", "Adresse IP", "Hostname", "Adresse MAC", "Fabricant", "Modèle", "Version Firmware", "Uptime", "Location", "Découvert le"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
		f.SetCellStyle(sheet, cell, cell, headerStyle)
	}

	// Column widths
	colWidths := []float64{5, 16, 22, 20, 14, 18, 18, 12, 22, 22}
	cols := []string{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J"}
	for i, col := range cols {
		f.SetColWidth(sheet, col, col, colWidths[i])
	}
	f.SetRowHeight(sheet, 1, 22)

	// Data rows
	for i, d := range devices {
		row := i + 2
		style := oddStyle
		if i%2 == 0 {
			style = evenStyle
		}

		uptime := ""
		if d.UptimeSeconds > 0 {
			days := d.UptimeSeconds / 86400
			hours := (d.UptimeSeconds % 86400) / 3600
			minutes := (d.UptimeSeconds % 3600) / 60
			if days > 0 {
				uptime = fmt.Sprintf("%dj %dh%02dm", days, hours, minutes)
			} else {
				uptime = fmt.Sprintf("%dh%02dm", hours, minutes)
			}
		}

		lastSeen := ""
		if d.LastSeenAt != nil {
			lastSeen = d.LastSeenAt.Format("02/01/2006 15:04")
		}

		values := []interface{}{
			i + 1,
			d.IP,
			d.Hostname,
			d.MACAddress,
			d.Vendor,
			d.Model,
			d.OSVersion,
			uptime,
			d.Location,
			lastSeen,
		}

		for j, v := range values {
			cell, _ := excelize.CoordinatesToCellName(j+1, row)
			f.SetCellValue(sheet, cell, v)
			if j == 1 { // IP column
				f.SetCellStyle(sheet, cell, cell, ipStyle)
			} else {
				f.SetCellStyle(sheet, cell, cell, style)
			}
		}
		f.SetRowHeight(sheet, row, 18)
	}

	// Freeze header row
	f.SetPanes(sheet, &excelize.Panes{
		Freeze:      true,
		Split:       false,
		XSplit:      0,
		YSplit:      1,
		TopLeftCell: "A2",
		ActivePane:  "bottomLeft",
	})

	// Summary sheet
	summarySheet := "Résumé"
	f.NewSheet(summarySheet)
	summaryStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Size: 12},
	})
	f.SetCellValue(summarySheet, "A1", "Rapport de scan réseau")
	f.SetCellStyle(summarySheet, "A1", "A1", summaryStyle)
	f.SetCellValue(summarySheet, "A3", "Date d'exportation")
	f.SetCellValue(summarySheet, "B3", time.Now().Format("02/01/2006 15:04:05"))
	f.SetCellValue(summarySheet, "A4", "Total équipements")
	f.SetCellValue(summarySheet, "B4", len(devices))

	// Count vendors
	vendorCount := map[string]int{}
	for _, d := range devices {
		v := d.Vendor
		if v == "" {
			v = "inconnu"
		}
		vendorCount[v]++
	}
	row := 6
	f.SetCellValue(summarySheet, "A5", "Fabricant")
	f.SetCellValue(summarySheet, "B5", "Nombre")
	for vendor, count := range vendorCount {
		f.SetCellValue(summarySheet, fmt.Sprintf("A%d", row), vendor)
		f.SetCellValue(summarySheet, fmt.Sprintf("B%d", row), count)
		row++
	}
	f.SetColWidth(summarySheet, "A", "A", 25)
	f.SetColWidth(summarySheet, "B", "B", 15)

	f.SetActiveSheet(0)

	if err := f.SaveAs(destPath); err != nil {
		return "", fmt.Errorf("save excel: %w", err)
	}

	logger.AuditAction(a.ctx, "export_excel", "scan", destPath,
		fmt.Sprintf(`{"devices":%d}`, len(devices)), "success", 0)

	return destPath, nil
}

// ─────────────────────────────────────────────
// BACKUP
// ─────────────────────────────────────────────

// BackupRequest is the input for a backup operation
type BackupRequest struct {
	DeviceIDs    []string `json:"device_ids"`
	ConfigType   string   `json:"config_type"`   // running|startup
	CredentialID string   `json:"credential_id"` // global fallback credential
	Username     string   `json:"username"`      // inline override (no credential needed)
	Password     string   `json:"password"`      // inline override
	IPList       []string `json:"ip_list"`       // backup by IP directly (no inventory needed)
}

func (a *App) RunBackup(req BackupRequest) ([]models.Backup, error) {
	configType := req.ConfigType
	if configType == "" {
		configType = "running"
	}

	// Collect devices from IDs
	var devices []models.Device
	for _, deviceID := range req.DeviceIDs {
		var device models.Device
		if err := db.DB.First(&device, "id = ?", deviceID).Error; err != nil {
			logger.Error(fmt.Sprintf("device not found: %s", deviceID), err)
			continue
		}
		devices = append(devices, device)
	}

	// Also collect from direct IP list (no inventory required)
	for _, ip := range req.IPList {
		ip = strings.TrimSpace(ip)
		if ip == "" {
			continue
		}
		var existing models.Device
		if db.DB.Where("ip = ?", ip).First(&existing).Error == nil {
			devices = append(devices, existing)
		} else {
			devices = append(devices, models.Device{
				ID:      uuid.NewString(),
				IP:      ip,
				SSHPort: 22,
				Vendor:  "unknown",
			})
		}
	}

	// Build backup requests with credential resolution
	var backupReqs []backup.BackupRequest
	var failedResults []models.Backup
	for _, device := range devices {
		if device.SSHPort == 0 {
			device.SSHPort = 22
		}

		var username, password, privateKey string
		if req.Username != "" {
			username = req.Username
			password = req.Password
		} else {
			credID := device.CredentialID
			if credID == "" {
				credID = req.CredentialID
			}
			var err error
			username, password, privateKey, err = a.getCredentials(credID)
			if err != nil {
				errMsg := fmt.Sprintf("credentials manquants pour %s: %v", device.IP, err)
				logger.Error(errMsg, err)
				failedResults = append(failedResults, models.Backup{
					DeviceID:     device.ID,
					Status:       "failed",
					ErrorMessage: errMsg,
				})
				runtime.EventsEmit(a.ctx, "backup:progress", map[string]interface{}{
					"device_id": device.ID,
					"device_ip": device.IP,
					"status":    "failed",
					"error":     errMsg,
				})
				continue
			}
		}

		runtime.EventsEmit(a.ctx, "backup:progress", map[string]interface{}{
			"device_id": device.ID,
			"device_ip": device.IP,
			"status":    "running",
			"message":   fmt.Sprintf("Connexion SSH à %s...", device.IP),
		})

		backupReqs = append(backupReqs, backup.BackupRequest{
			Device:     device,
			ConfigType: configType,
			Username:   username,
			Password:   password,
			PrivateKey: privateKey,
		})
	}

	// Run backups concurrently (5 workers by default)
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Minute)
	defer cancel()

	start := time.Now()
	concurrentResults := a.backupMgr.RunConcurrent(ctx, backupReqs, 5, func(br backup.BackupResult, done, total int) {
		status := "success"
		errMsg := ""
		deviceIP := ""
		deviceID := ""
		if br.Backup != nil {
			deviceID = br.Backup.DeviceID
			if br.Backup.Status == "failed" {
				status = "failed"
				errMsg = br.Backup.ErrorMessage
			}
		}
		if br.Error != nil {
			status = "failed"
			errMsg = br.Error.Error()
		}

		// Find device IP for the event
		for _, d := range devices {
			if d.ID == deviceID {
				deviceIP = d.IP
				break
			}
		}

		runtime.EventsEmit(a.ctx, "backup:progress", map[string]interface{}{
			"device_id": deviceID,
			"device_ip": deviceIP,
			"status":    status,
			"error":     errMsg,
			"done":      done,
			"total":     total,
			"percent":   done * 100 / total,
		})
	})

	// Collect results
	var results []models.Backup
	results = append(results, failedResults...)
	for _, br := range concurrentResults {
		if br.Backup != nil {
			results = append(results, *br.Backup)
		}
		status := "success"
		if br.Error != nil {
			status = "failed"
		}
		deviceIP := ""
		deviceID := ""
		if br.Backup != nil {
			deviceID = br.Backup.DeviceID
		}
		for _, d := range devices {
			if d.ID == deviceID {
				deviceIP = d.IP
				break
			}
		}
		logger.AuditAction(a.ctx, "backup", "device", deviceID,
			fmt.Sprintf(`{"ip":"%s","config_type":"%s","result":"%s"}`, deviceIP, configType, status),
			status, time.Since(start).Milliseconds())
	}

	runtime.EventsEmit(a.ctx, "backup:complete", map[string]interface{}{
		"total":    len(results),
		"success":  countStatus(results, "success"),
		"failed":   countStatus(results, "failed"),
		"duration": time.Since(start).Milliseconds(),
	})

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
// TERMINAL SSH
// ─────────────────────────────────────────────

// RunTerminalCommand executes a command on a device via SSH and streams output
func (a *App) RunTerminalCommand(deviceID string, command string) (string, error) {
	var device models.Device
	if err := db.DB.First(&device, "id = ?", deviceID).Error; err != nil {
		return "", fmt.Errorf("équipement introuvable: %w", err)
	}

	if device.SSHPort == 0 {
		device.SSHPort = 22
	}

	emitLine := func(line string, isError bool) {
		runtime.EventsEmit(a.ctx, "terminal:output", map[string]interface{}{
			"device_id": deviceID,
			"line":      line,
			"error":     isError,
		})
	}

	username, password, privateKey, err := a.getCredentials(device.CredentialID)
	if err != nil {
		emitLine(fmt.Sprintf("ERREUR credentials: %v\n", err), true)
		return "", err
	}

	emitLine(fmt.Sprintf("Connexion SSH à %s (%s) port %d...\n", device.Hostname, device.IP, device.SSHPort), false)

	ctx, cancel := context.WithTimeout(a.ctx, 120*time.Second)
	defer cancel()

	sess, err := ssh.Connect(ctx, ssh.ConnectParams{
		Host:       device.IP,
		Port:       device.SSHPort,
		Username:   username,
		Password:   password,
		PrivateKey: privateKey,
		Vendor:     device.Vendor,
		Timeout:    30 * time.Second,
	})
	if err != nil {
		emitLine(fmt.Sprintf("ERREUR connexion: %v\n", err), true)
		logger.AuditAction(a.ctx, "terminal_command", "device", deviceID,
			fmt.Sprintf(`{"ip":"%s","command":"%s","error":"%v"}`, device.IP, command, err),
			"failed", 0)
		return "", err
	}
	defer sess.Close()

	emitLine(fmt.Sprintf("Connecté. Exécution: %s\n", command), false)
	emitLine(strings.Repeat("─", 60)+"\n", false)

	start := time.Now()
	output, err := sess.RunCommandInteractive(ctx, command)
	duration := time.Since(start)

	if err != nil {
		emitLine(fmt.Sprintf("\nERREUR: %v\n", err), true)
		logger.AuditAction(a.ctx, "terminal_command", "device", deviceID,
			fmt.Sprintf(`{"ip":"%s","command":"%s","error":"%v"}`, device.IP, command, err),
			"failed", duration.Milliseconds())
		return "", err
	}

	emitLine(output+"\n", false)
	emitLine(fmt.Sprintf("\n%s\nTerminé en %s\n", strings.Repeat("─", 60), duration.Round(time.Millisecond)), false)

	logger.AuditAction(a.ctx, "terminal_command", "device", deviceID,
		fmt.Sprintf(`{"ip":"%s","command":"%s","output_len":%d}`, device.IP, command, len(output)),
		"success", duration.Milliseconds())

	return output, nil
}

// ─────────────────────────────────────────────
// DIFF
// ─────────────────────────────────────────────

// DiffRequest is the input for a diff operation
type DiffRequest struct {
	TextA            string   `json:"text_a"`
	TextB            string   `json:"text_b"`
	IgnorePatterns   []string `json:"ignore_patterns"`
	IgnoreCase       bool     `json:"ignore_case"`
	IgnoreWhitespace bool     `json:"ignore_whitespace"`
	TrimTrailing     bool     `json:"trim_trailing"`
}

func (a *App) CompareDiff(req DiffRequest) (*diff.DiffResult, error) {
	return diff.Compare(req.TextA, req.TextB, diff.CompareOptions{
		IgnorePatterns:   req.IgnorePatterns,
		IgnoreCase:       req.IgnoreCase,
		IgnoreWhitespace: req.IgnoreWhitespace,
		TrimTrailing:     req.TrimTrailing,
	})
}

// ExportDiffHTML generates a diff, opens a save-file dialog, and writes a standalone HTML file.
// Returns the saved file path on success.
func (a *App) ExportDiffHTML(req DiffRequest, nameA, nameB string) (string, error) {
	result, err := diff.Compare(req.TextA, req.TextB, diff.CompareOptions{
		IgnorePatterns:   req.IgnorePatterns,
		IgnoreCase:       req.IgnoreCase,
		IgnoreWhitespace: req.IgnoreWhitespace,
		TrimTrailing:     req.TrimTrailing,
	})
	if err != nil {
		return "", err
	}

	htmlContent := diff.ExportHTML(result, nameA, nameB)

	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: "diff.html",
		Filters: []runtime.FileFilter{
			{DisplayName: "HTML (*.html)", Pattern: "*.html"},
		},
	})
	if err != nil || path == "" {
		return "", err
	}

	if err := os.WriteFile(path, []byte(htmlContent), 0644); err != nil {
		return "", fmt.Errorf("écriture fichier: %w", err)
	}
	return path, nil
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
			logger.AuditAction(a.ctx, "audit", "device", deviceID,
				fmt.Sprintf(`{"ip":"%s","error":"no_backup"}`, device.IP), "failed", 0)
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
			logger.AuditAction(a.ctx, "audit", "device", deviceID,
				fmt.Sprintf(`{"ip":"%s","score":%.0f,"passed":%d,"total":%d}`,
					device.IP, report.Score, report.Passed, report.TotalRules),
				"success", 0)
		}
	}

	return reports, nil
}

// RunAuditFiltered runs audit with specific device IDs and rule IDs (empty ruleIDs = all enabled rules)
func (a *App) RunAuditFiltered(deviceIDs []string, ruleIDs []string) ([]audit.AuditReport, error) {
	var reports []audit.AuditReport

	for _, deviceID := range deviceIDs {
		var device models.Device
		if err := db.DB.First(&device, "id = ?", deviceID).Error; err != nil {
			continue
		}

		var latestBackup models.Backup
		err := db.DB.Where("device_id = ? AND status = 'success'", deviceID).
			Order("created_at DESC").First(&latestBackup).Error
		if err != nil {
			reports = append(reports, audit.AuditReport{
				DeviceID: deviceID,
				DeviceIP: device.IP,
			})
			continue
		}

		content, err := a.backupMgr.GetContent(latestBackup.ID)
		if err != nil {
			continue
		}

		ctx, cancel := context.WithTimeout(a.ctx, 30*time.Second)
		report, err := a.auditEngine.Run(ctx, audit.AuditRequest{
			Device:  device,
			Config:  content,
			RuleIDs: ruleIDs,
		})
		cancel()

		if err == nil && report != nil {
			reports = append(reports, *report)
			logger.AuditAction(a.ctx, "audit", "device", deviceID,
				fmt.Sprintf(`{"ip":"%s","score":%.0f,"passed":%d,"total":%d,"rules":%d}`,
					device.IP, report.Score, report.Passed, report.TotalRules, len(ruleIDs)),
				"success", 0)
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
		if device.SSHPort == 0 {
			device.SSHPort = 22
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
		logger.AuditAction(a.ctx, "playbook_run", "device", deviceID,
			fmt.Sprintf(`{"ip":"%s","playbook":"%s","status":"%s"}`, device.IP, pb.Name, status),
			status, 0)
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
// AUDIT LOGS & JOURNAUX
// ─────────────────────────────────────────────

// AuditLogQuery defines filtering for audit logs
type AuditLogQuery struct {
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
	Action string `json:"action"`
}

func (a *App) GetAuditLogs(query AuditLogQuery) ([]models.AuditLog, error) {
	if query.Limit <= 0 {
		query.Limit = 500
	}
	var logs []models.AuditLog
	q := db.DB.Order("created_at DESC").Limit(query.Limit).Offset(query.Offset)
	if query.Action != "" {
		q = q.Where("action LIKE ? OR entity_type LIKE ? OR details LIKE ?",
			"%"+query.Action+"%", "%"+query.Action+"%", "%"+query.Action+"%")
	}
	err := q.Find(&logs).Error
	return logs, err
}

// GetLogFiles lists available log files in the logs directory
func (a *App) GetLogFiles() []string {
	logDir := filepath.Join(a.dataDir, "logs")
	entries, err := os.ReadDir(logDir)
	if err != nil {
		return []string{}
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".log") {
			files = append(files, e.Name())
		}
	}
	return files
}

// GetLogFileContent reads the content of a log file (security: only log files allowed)
func (a *App) GetLogFileContent(filename string) (string, error) {
	// Security: reject path traversal attempts
	clean := filepath.Base(filename)
	if clean != filename || strings.Contains(filename, "..") {
		return "", fmt.Errorf("nom de fichier invalide")
	}
	if !strings.HasSuffix(clean, ".log") {
		return "", fmt.Errorf("seuls les fichiers .log sont accessibles")
	}
	logDir := filepath.Join(a.dataDir, "logs")
	content, err := os.ReadFile(filepath.Join(logDir, clean))
	if err != nil {
		return "", fmt.Errorf("lecture du journal: %w", err)
	}
	return string(content), nil
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
	logger.AuditAction(a.ctx, "scheduled_job_start", "scheduler", jobType,
		fmt.Sprintf(`{"job_type":"%s"}`, jobType), "running", 0)

	start := time.Now()
	var err error

	switch jobType {
	case "backup":
		deviceIDs := extractStringSlice(payload, "device_ids")
		configType := extractString(payload, "config_type", "running")
		credID := extractString(payload, "credential_id", "")
		_, err = a.RunBackup(BackupRequest{DeviceIDs: deviceIDs, ConfigType: configType, CredentialID: credID})
	case "scan":
		cidr := extractString(payload, "cidr", "")
		credID := extractString(payload, "credential_id", "")
		if cidr == "" {
			err = fmt.Errorf("scan job missing cidr")
		} else {
			_, err = a.ScanNetwork(ScanRequest{CIDR: cidr, CredentialID: credID})
		}
	case "audit":
		deviceIDs := extractStringSlice(payload, "device_ids")
		if len(deviceIDs) == 0 {
			err = fmt.Errorf("audit job missing device_ids")
		} else {
			_, err = a.RunAudit(deviceIDs)
		}
	case "playbook":
		playbookID := extractString(payload, "playbook_id", "")
		deviceIDs := extractStringSlice(payload, "device_ids")
		if playbookID == "" || len(deviceIDs) == 0 {
			err = fmt.Errorf("playbook job missing playbook_id or device_ids")
		} else {
			_, err = a.RunPlaybook(PlaybookRunRequest{PlaybookID: playbookID, DeviceIDs: deviceIDs})
		}
	default:
		err = fmt.Errorf("unknown job type: %s", jobType)
	}

	status := "success"
	details := fmt.Sprintf(`{"job_type":"%s","duration_ms":%d}`, jobType, time.Since(start).Milliseconds())
	if err != nil {
		status = "failed"
		details = fmt.Sprintf(`{"job_type":"%s","error":"%v","duration_ms":%d}`, jobType, err, time.Since(start).Milliseconds())
	}
	logger.AuditAction(a.ctx, "scheduled_job_end", "scheduler", jobType, details, status, time.Since(start).Milliseconds())
	return err
}

func countStatus(backups []models.Backup, status string) int {
	n := 0
	for _, b := range backups {
		if b.Status == status {
			n++
		}
	}
	return n
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
