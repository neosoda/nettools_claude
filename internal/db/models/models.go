package models

import (
	"time"
)

type Device struct {
	ID             string    `json:"id" gorm:"primaryKey"`
	IP             string    `json:"ip" gorm:"uniqueIndex;not null"`
	Hostname       string    `json:"hostname"`
	Vendor         string    `json:"vendor"` // cisco|aruba|allied|unknown
	Model          string    `json:"model"`
	OSVersion      string    `json:"os_version"`
	Location       string    `json:"location"`
	UptimeSeconds  int64     `json:"uptime_seconds"`
	MACAddress     string    `json:"mac_address"`
	SerialNumber   string    `json:"serial_number"`
	Tags           string    `json:"tags"` // JSON array string
	SNMPVersion    string    `json:"snmp_version"` // v2c|v3
	SNMPPort       int       `json:"snmp_port" gorm:"default:161"`
	SSHPort        int       `json:"ssh_port" gorm:"default:22"`
	CredentialID   string    `json:"credential_id"`
	Description    string    `json:"description"`
	LastSeenAt     *time.Time `json:"last_seen_at"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Credential struct {
	ID               string    `json:"id" gorm:"primaryKey"`
	Name             string    `json:"name" gorm:"not null"`
	Username         string    `json:"username"`
	PasswordEnc      []byte    `json:"-" gorm:"column:password_enc"`
	PrivateKeyEnc    []byte    `json:"-" gorm:"column:private_key_enc"`
	SNMPCommunityEnc []byte    `json:"-" gorm:"column:snmp_community_enc"`
	SNMPAuthEnc      []byte    `json:"-" gorm:"column:snmp_auth_enc"`
	SNMPPrivEnc      []byte    `json:"-" gorm:"column:snmp_priv_enc"`
	SNMPVersion      string    `json:"snmp_version"`
	SNMPAuthProtocol string    `json:"snmp_auth_protocol"`
	SNMPPrivProtocol string    `json:"snmp_priv_protocol"`
	SNMPUsername     string    `json:"snmp_username"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// CredentialView is the safe version without encrypted fields
type CredentialView struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	Username         string    `json:"username"`
	HasPassword      bool      `json:"has_password"`
	HasPrivateKey    bool      `json:"has_private_key"`
	HasSNMPCommunity bool      `json:"has_snmp_community"`
	SNMPVersion      string    `json:"snmp_version"`
	SNMPAuthProtocol string    `json:"snmp_auth_protocol"`
	SNMPPrivProtocol string    `json:"snmp_priv_protocol"`
	SNMPUsername     string    `json:"snmp_username"`
	CreatedAt        time.Time `json:"created_at"`
}

type Backup struct {
	ID           string    `json:"id" gorm:"primaryKey"`
	DeviceID     string    `json:"device_id" gorm:"index;not null"`
	ConfigType   string    `json:"config_type"` // running|startup
	FilePath     string    `json:"file_path"`
	FileSizeBytes int64    `json:"file_size_bytes"`
	SHA256Hash   string    `json:"sha256_hash"`
	Status       string    `json:"status"` // success|failed
	DurationMs   int64     `json:"duration_ms"`
	ErrorMessage string    `json:"error_message"`
	Content      string    `json:"content,omitempty" gorm:"-"` // transient
	CreatedAt    time.Time `json:"created_at" gorm:"index"`
}

type ScheduledJob struct {
	ID             string     `json:"id" gorm:"primaryKey"`
	Name           string     `json:"name" gorm:"not null"`
	JobType        string     `json:"job_type"` // scan|backup|audit|playbook
	CronExpression string     `json:"cron_expression" gorm:"not null"`
	Payload        string     `json:"payload"` // JSON
	Enabled        bool       `json:"enabled" gorm:"default:true"`
	LastRunAt      *time.Time `json:"last_run_at"`
	LastStatus     string     `json:"last_status"`
	CronID         int        `json:"-" gorm:"-"` // runtime only
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type AuditLog struct {
	ID         string    `json:"id" gorm:"primaryKey"`
	Action     string    `json:"action" gorm:"not null"`
	EntityType string    `json:"entity_type"`
	EntityID   string    `json:"entity_id"`
	Details    string    `json:"details"` // JSON
	Status     string    `json:"status"` // success|failure
	DurationMs int64     `json:"duration_ms"`
	CreatedAt  time.Time `json:"created_at" gorm:"index"`
}

type SchemaMigration struct {
	Version   int       `gorm:"primaryKey"`
	AppliedAt time.Time `gorm:"autoCreateTime"`
}

type AuditRule struct {
	ID          string    `json:"id" gorm:"primaryKey"`
	Name        string    `json:"name" gorm:"not null"`
	Description string    `json:"description"`
	Pattern     string    `json:"pattern" gorm:"not null"`       // regex (supports "pattern1 AND pattern2" for multi-line blocks)
	MustMatch   bool      `json:"must_match"`                    // true=must be present, false=must be absent
	Vendor      string    `json:"vendor"`                        // empty=all vendors
	Severity    string    `json:"severity"`                      // critical|high|medium|low
	Remediation string    `json:"remediation"`                   // CLI commands to fix (template with {{hostname}}, {{ip}})
	Enabled     bool      `json:"enabled" gorm:"default:true"`
	CreatedAt   time.Time `json:"created_at"`
}

type AuditResult struct {
	ID          string    `json:"id" gorm:"primaryKey"`
	DeviceID    string    `json:"device_id" gorm:"index"`
	RuleID      string    `json:"rule_id"`
	RuleName    string    `json:"rule_name"`
	Passed      bool      `json:"passed"`
	Details     string    `json:"details"`
	Severity    string    `json:"severity"`
	Remediation string    `json:"remediation"` // generated CLI fix for this specific failure
	CreatedAt   time.Time `json:"created_at"`
}

type Playbook struct {
	ID          string    `json:"id" gorm:"primaryKey"`
	Name        string    `json:"name" gorm:"not null"`
	Description string    `json:"description"`
	Content     string    `json:"content" gorm:"not null"` // YAML
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PlaybookExecution struct {
	ID         string    `json:"id" gorm:"primaryKey"`
	PlaybookID string    `json:"playbook_id" gorm:"index"`
	DeviceID   string    `json:"device_id" gorm:"index"`
	Status     string    `json:"status"` // running|success|failed
	Output     string    `json:"output"`
	DurationMs int64     `json:"duration_ms"`
	CreatedAt  time.Time `json:"created_at"`
}

// DeviceLink represents a physical link discovered via LLDP between two devices.
// LocalDeviceID is always a known device in the DB.
// RemoteDeviceID is set when the remote endpoint is also known in the DB (empty otherwise).
type DeviceLink struct {
	ID               string    `json:"id" gorm:"primaryKey"`
	LocalDeviceID    string    `json:"local_device_id" gorm:"index;not null"`
	LocalPort        string    `json:"local_port"`         // ex: "GigabitEthernet1/0/1"
	RemoteDeviceID   string    `json:"remote_device_id" gorm:"index"` // empty if remote not in DB
	RemoteChassisMAC string    `json:"remote_chassis_mac"`
	RemotePort       string    `json:"remote_port"`        // ex: "GigabitEthernet2/0/24"
	RemoteSysName    string    `json:"remote_sys_name"`
	LinkType         string    `json:"link_type"`          // "trunk"|"access"|"unknown"
	UpdatedAt        time.Time `json:"updated_at"`
}
