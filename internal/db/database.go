package db

import (
	"fmt"
	"os"
	"path/filepath"

	"networktools/internal/db/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// Ready returns true if the database is initialized and ready
func Ready() bool { return DB != nil }

func Init(appDataDir string) error {
	dbPath := filepath.Join(appDataDir, "networktools.db")

	// Ensure directory exists
	if err := os.MkdirAll(appDataDir, 0700); err != nil {
		return fmt.Errorf("failed to create data dir: %w", err)
	}

	db, err := gorm.Open(sqlite.Open(dbPath+"?_journal_mode=WAL&_busy_timeout=5000"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Enable foreign keys
	db.Exec("PRAGMA foreign_keys = ON")

	// Auto-migrate all models
	if err := db.AutoMigrate(
		&models.Device{},
		&models.Credential{},
		&models.Backup{},
		&models.ScheduledJob{},
		&models.AuditLog{},
		&models.AuditRule{},
		&models.AuditResult{},
		&models.Playbook{},
		&models.PlaybookExecution{},
		&models.SchemaMigration{},
		&models.DeviceLink{},
	); err != nil {
		return fmt.Errorf("failed to migrate database: %w", err)
	}

	DB = db

	// Seed default audit rules
	seedAuditRules(db)

	return nil
}

func seedAuditRules(db *gorm.DB) {
	// v1 — règles génériques pour une nouvelle installation
	var count int64
	db.Model(&models.AuditRule{}).Count(&count)
	if count == 0 {
		seedV1GenericRules(db)
	}

	// v2 — règles spécifiques à l'environnement Aruba/HPE
	// Utilise SchemaMigration pour n'appliquer qu'une seule fois, même sur les installs existantes.
	const v2 = 2
	var m models.SchemaMigration
	if db.Where("version = ?", v2).First(&m).Error == nil {
		return
	}
	seedV2ArubaRules(db)
	db.Create(&models.SchemaMigration{Version: v2})
}

func seedV1GenericRules(db *gorm.DB) {
	rules := []models.AuditRule{
		{ID: "rule-ntp-1", Name: "NTP configured", Description: "Device must have NTP server configured",
			Pattern: `ntp server`, MustMatch: true, Severity: "high", Enabled: true,
			Remediation: "ntp server 10.0.0.1\nntp server 10.0.0.2"},
		{ID: "rule-telnet-1", Name: "Telnet disabled", Description: "Telnet must not be enabled",
			Pattern: `transport input telnet`, MustMatch: false, Severity: "critical", Vendor: "cisco", Enabled: true,
			Remediation: "line vty 0 15\n transport input ssh\n exit"},
		{ID: "rule-ssh-1", Name: "SSHv2 enforced", Description: "SSH version 2 must be configured",
			Pattern: `ip ssh version 2`, MustMatch: true, Severity: "critical", Vendor: "cisco", Enabled: true,
			Remediation: "ip ssh version 2\nip ssh time-out 60\nip ssh authentication-retries 3"},
		{ID: "rule-banner-1", Name: "Login banner set", Description: "Login banner must be configured",
			Pattern: `banner (login|motd)`, MustMatch: true, Severity: "medium", Enabled: true,
			Remediation: "banner motd ^C\n*** WARNING: Authorized access only ***\n^C"},
		{ID: "rule-password-1", Name: "Password encryption", Description: "Service password-encryption must be enabled",
			Pattern: `service password-encryption`, MustMatch: true, Severity: "high", Vendor: "cisco", Enabled: true,
			Remediation: "service password-encryption"},
		{ID: "rule-logging-1", Name: "Remote logging", Description: "Syslog server must be configured",
			Pattern: `logging \d+\.\d+\.\d+\.\d+`, MustMatch: true, Severity: "medium", Enabled: true,
			Remediation: "logging host 10.0.0.10\nlogging trap informational\nlogging facility local7"},
	}
	for _, r := range rules {
		db.FirstOrCreate(&r, models.AuditRule{ID: r.ID})
	}
}

// seedV2ArubaRules ajoute les règles de conformité spécifiques à l'environnement
// Aruba/HPE de la Région Grand Est (issues du config.json de l'ancienne version Python).
func seedV2ArubaRules(db *gorm.DB) {
	rules := []models.AuditRule{
		// ── Sécurité de base ──────────────────────────────────────────
		{ID: "aruba-pwd-enc", Name: "Chiffrement des mots de passe",
			Description: "Les mots de passe doivent être chiffrés (service password-encryption)",
			Pattern: `^service password-encryption`, MustMatch: true, Severity: "high",
			Vendor: "aruba", Enabled: true,
			Remediation: "service password-encryption"},

		{ID: "aruba-manager-del", Name: "Compte 'manager' supprimé",
			Description: "Le compte par défaut 'manager' doit être désactivé",
			Pattern: `^no username manager`, MustMatch: true, Severity: "high",
			Vendor: "aruba", Enabled: true,
			Remediation: "no username manager"},

		{ID: "aruba-http-off", Name: "Interface HTTP désactivée",
			Description: "L'interface web HTTP doit être désactivée",
			Pattern: `^no service http`, MustMatch: true, Severity: "high",
			Vendor: "aruba", Enabled: true,
			Remediation: "no service http"},

		{ID: "aruba-dhcp-off", Name: "Serveur DHCP désactivé",
			Description: "Le switch ne doit pas agir comme serveur DHCP",
			Pattern: `^no service dhcp-server`, MustMatch: true, Severity: "medium",
			Vendor: "aruba", Enabled: true,
			Remediation: "no service dhcp-server"},

		// ── SSH / Accès ───────────────────────────────────────────────
		{ID: "aruba-ssh-svc", Name: "Service SSH activé",
			Description: "Le service SSH doit être activé",
			Pattern: `^service ssh`, MustMatch: true, Severity: "critical",
			Vendor: "aruba", Enabled: true,
			Remediation: "service ssh"},

		{ID: "aruba-ssh-users", Name: "SSH — utilisateurs autorisés",
			Description: "L'accès SSH doit être restreint à des utilisateurs spécifiques",
			Pattern: `^ssh server allow-users`, MustMatch: true, Severity: "high",
			Vendor: "aruba", Enabled: true,
			Remediation: "ssh server allow-users manager"},

		// ── Journalisation ────────────────────────────────────────────
		{ID: "aruba-log-local", Name: "Syslog facility local0",
			Description: "La facilité de log doit être local0",
			Pattern: `^log facility local0`, MustMatch: true, Severity: "medium",
			Vendor: "aruba", Enabled: true,
			Remediation: "log facility local0"},

		{ID: "aruba-log-host", Name: "Serveur syslog 10.113.x.x",
			Description: "Un serveur syslog académique (10.113.x.x) doit être configuré",
			Pattern: `^log host 10\.113\.`, MustMatch: true, Severity: "medium",
			Vendor: "aruba", Enabled: true,
			Remediation: "log host 10.113.0.1"},

		// ── Heure / NTP ───────────────────────────────────────────────
		{ID: "aruba-tz-paris", Name: "Timezone Paris",
			Description: "Le fuseau horaire doit être configuré sur Paris",
			Pattern: `^clock timezone Paris`, MustMatch: true, Severity: "low",
			Vendor: "aruba", Enabled: true,
			Remediation: "clock timezone Paris"},

		{ID: "aruba-ntp-acad", Name: "Serveur NTP académique",
			Description: "Le serveur NTP de Numérique Éducatif doit être configuré",
			Pattern: `^ntp server ntp\.lor\.numerique-educatif\.fr`, MustMatch: true, Severity: "medium",
			Vendor: "aruba", Enabled: true,
			Remediation: "ntp server ntp.lor.numerique-educatif.fr"},

		// ── SNMP ──────────────────────────────────────────────────────
		{ID: "aruba-snmp-tice", Name: "SNMP community 'TICE'",
			Description: "La communauté SNMP doit être 'TICE'",
			Pattern: `^snmp-server community TICE`, MustMatch: true, Severity: "high",
			Vendor: "aruba", Enabled: true,
			Remediation: "snmp-server community TICE"},

		// ── AAA / Radius ──────────────────────────────────────────────
		{ID: "aruba-radius", Name: "Serveur Radius configuré",
			Description: "Un serveur Radius doit être configuré",
			Pattern: `^radius-server host`, MustMatch: true, Severity: "high",
			Vendor: "aruba", Enabled: true,
			Remediation: "radius-server host 10.113.0.10 key <secret>"},

		{ID: "aruba-aaa-enable", Name: "AAA enable — locale",
			Description: "Authentification enable locale (aaa authentication enable default local)",
			Pattern: `^aaa authentication enable default local`, MustMatch: true, Severity: "high",
			Vendor: "aruba", Enabled: true,
			Remediation: "aaa authentication enable default local"},

		{ID: "aruba-aaa-login", Name: "AAA login — Radius puis local",
			Description: "Authentification login via Radius puis repli local",
			Pattern: `^aaa authentication login default group .* local`, MustMatch: true, Severity: "high",
			Vendor: "aruba", Enabled: true,
			Remediation: "aaa authentication login default group radius local"},

		// ── Réseau / L2 ───────────────────────────────────────────────
		{ID: "aruba-lldp", Name: "LLDP activé",
			Description: "LLDP doit être actif pour la découverte automatique",
			Pattern: `^lldp run`, MustMatch: true, Severity: "low",
			Vendor: "aruba", Enabled: true,
			Remediation: "lldp run"},

		{ID: "aruba-stp-rstp", Name: "Spanning-Tree RSTP",
			Description: "Le mode Spanning-Tree doit être RSTP",
			Pattern: `^spanning-tree mode rstp`, MustMatch: true, Severity: "medium",
			Vendor: "aruba", Enabled: true,
			Remediation: "spanning-tree mode rstp"},

		{ID: "aruba-loop-protect", Name: "Loop Protection activée",
			Description: "La protection contre les boucles doit être activée globalement",
			Pattern: `^loop-protection loop-detect`, MustMatch: true, Severity: "medium",
			Vendor: "aruba", Enabled: true,
			Remediation: "loop-protection loop-detect"},

		{ID: "aruba-multicast", Name: "Multicast routing activé",
			Description: "Le routage multicast doit être activé",
			Pattern: `^ip multicast-routing`, MustMatch: true, Severity: "low",
			Vendor: "aruba", Enabled: true,
			Remediation: "ip multicast-routing"},

		{ID: "aruba-pvlan-999", Name: "Private VLAN 999 isolé",
			Description: "Le VLAN 999 doit être configuré en private VLAN isolé",
			Pattern: `^private-vlan 999 isolated`, MustMatch: true, Severity: "medium",
			Vendor: "aruba", Enabled: true,
			Remediation: "private-vlan 999 isolated"},

		// ── VLANs métier ─────────────────────────────────────────────
		{ID: "aruba-vlan1-admin", Name: "VLAN 1 — Administratif",
			Description: "Le VLAN 1 doit être nommé 'Administratif'",
			Pattern: `vlan 1 name Administratif`, MustMatch: true, Severity: "low",
			Vendor: "aruba", Enabled: true,
			Remediation: "vlan 1\n name Administratif"},

		{ID: "aruba-vlan401-pedago", Name: "VLAN 401 — PEDAGO",
			Description: "Le VLAN 401 doit être nommé PEDAGO",
			Pattern: `vlan\s+401\s+name\s+PEDAGO`, MustMatch: true, Severity: "low",
			Vendor: "aruba", Enabled: true,
			Remediation: "vlan 401\n name PEDAGO"},

		{ID: "aruba-vlan502-dmzpriv", Name: "VLAN 502 — DMZ-PRIV",
			Description: "Le VLAN 502 doit être nommé DMZ-PRIV",
			Pattern: `vlan\s+502\s+name\s+DMZ-PRIV`, MustMatch: true, Severity: "low",
			Vendor: "aruba", Enabled: true,
			Remediation: "vlan 502\n name DMZ-PRIV"},

		{ID: "aruba-vlan504-dmzpedago", Name: "VLAN 504 — DMZ-PEDAGO",
			Description: "Le VLAN 504 doit être nommé DMZ-PEDAGO",
			Pattern: `vlan\s+504\s+name\s+DMZ-PEDAGO`, MustMatch: true, Severity: "low",
			Vendor: "aruba", Enabled: true,
			Remediation: "vlan 504\n name DMZ-PEDAGO"},

		{ID: "aruba-vlan517-srvpeda", Name: "VLAN 517 — SERVEURS-PEDA",
			Description: "Le VLAN 517 doit être nommé SERVEURS-PEDA",
			Pattern: `vlan\s+517\s+name\s+SERVEURS-PEDA`, MustMatch: true, Severity: "low",
			Vendor: "aruba", Enabled: true,
			Remediation: "vlan 517\n name SERVEURS-PEDA"},
	}

	for _, r := range rules {
		db.FirstOrCreate(&r, models.AuditRule{ID: r.ID})
	}
}
