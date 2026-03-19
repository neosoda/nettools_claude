package audit

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"networktools/internal/db"
	"networktools/internal/db/models"

	"github.com/google/uuid"
)

// Engine runs compliance checks against device configurations
type Engine struct{}

func New() *Engine {
	return &Engine{}
}

type AuditRequest struct {
	Device  models.Device
	Config  string   // running-config text
	RuleIDs []string // optional: restrict to these rule IDs (empty = all)
}

type AuditReport struct {
	DeviceID      string              `json:"device_id"`
	DeviceIP      string              `json:"device_ip"`
	DeviceHost    string              `json:"device_hostname"`
	TotalRules    int                 `json:"total_rules"`
	Passed        int                 `json:"passed"`
	Failed        int                 `json:"failed"`
	Score         float64             `json:"score"`
	Results       []models.AuditResult `json:"results"`
	Remediation   string              `json:"remediation"`
	CreatedAt     time.Time           `json:"created_at"`
}

// Run executes audit rules against a device config
func (e *Engine) Run(ctx context.Context, req AuditRequest) (*AuditReport, error) {
	var rules []models.AuditRule
	query := db.DB.Where("enabled = ?", true)
	if len(req.RuleIDs) > 0 {
		query = query.Where("id IN ?", req.RuleIDs)
	} else if req.Device.Vendor != "" {
		query = query.Where("vendor = '' OR vendor = ?", req.Device.Vendor)
	}
	if err := query.Find(&rules).Error; err != nil {
		return nil, err
	}

	report := &AuditReport{
		DeviceID:   req.Device.ID,
		DeviceIP:   req.Device.IP,
		DeviceHost: req.Device.Hostname,
		TotalRules: len(rules),
		CreatedAt:  time.Now(),
	}

	var remediationLines []string

	for _, rule := range rules {
		select {
		case <-ctx.Done():
			return report, ctx.Err()
		default:
		}

		passed, details := evaluateRule(rule, req.Config)

		result := models.AuditResult{
			ID:          uuid.NewString(),
			DeviceID:    req.Device.ID,
			RuleID:      rule.ID,
			RuleName:    rule.Name,
			Passed:      passed,
			Details:     details,
			Severity:    rule.Severity,
			Remediation: "",
		}

		// Generate remediation script for failed rules
		if !passed && rule.Remediation != "" {
			remediation := expandRemediation(rule.Remediation, req.Device)
			result.Remediation = remediation
			remediationLines = append(remediationLines, fmt.Sprintf("! --- %s (severity: %s) ---", rule.Name, rule.Severity))
			remediationLines = append(remediationLines, remediation)
			remediationLines = append(remediationLines, "!")
		}

		db.DB.Create(&result)
		report.Results = append(report.Results, result)

		if passed {
			report.Passed++
		} else {
			report.Failed++
		}
	}

	if report.TotalRules > 0 {
		report.Score = float64(report.Passed) / float64(report.TotalRules) * 100
	}

	// Build full remediation script
	if len(remediationLines) > 0 {
		header := []string{
			fmt.Sprintf("! Remediation script for %s (%s)", req.Device.Hostname, req.Device.IP),
			fmt.Sprintf("! Generated: %s", time.Now().Format("2006-01-02 15:04:05")),
			fmt.Sprintf("! Score: %.0f%% (%d/%d rules passed)", report.Score, report.Passed, report.TotalRules),
			"!",
			"configure terminal",
		}
		footer := []string{
			"end",
			"write memory",
			"!",
			"! --- End of remediation script ---",
		}
		allLines := append(header, remediationLines...)
		allLines = append(allLines, footer...)
		report.Remediation = strings.Join(allLines, "\n")
	}

	return report, nil
}

// evaluateRule checks a single rule against config text
// Supports multi-line patterns with (?s) flag for block matching
func evaluateRule(rule models.AuditRule, config string) (passed bool, details string) {
	// Build regex with case-insensitive and multiline flags
	pattern := rule.Pattern

	// Check if pattern uses the special multi-line block syntax: pattern1 AND pattern2
	// This allows checking for multiple patterns that must all be present
	if strings.Contains(pattern, " AND ") {
		return evaluateMultiPattern(rule, config)
	}

	// Add case-insensitive and multiline (dotall) flags if not already present
	flags := "(?im)"
	if strings.HasPrefix(pattern, "(?") {
		flags = ""
	}

	re, err := regexp.Compile(flags + pattern)
	if err != nil {
		return false, fmt.Sprintf("Invalid regex pattern: %s — %v", pattern, err)
	}

	matches := re.MatchString(config)
	passed = (rule.MustMatch && matches) || (!rule.MustMatch && !matches)

	if !passed {
		if rule.MustMatch {
			details = fmt.Sprintf("Pattern not found: %s", rule.Pattern)
		} else {
			// Show the matching line for forbidden patterns
			loc := re.FindString(config)
			if loc != "" {
				details = fmt.Sprintf("Forbidden pattern found: %s (matched: '%s')", rule.Pattern, truncate(loc, 80))
			} else {
				details = fmt.Sprintf("Forbidden pattern found: %s", rule.Pattern)
			}
		}
	} else {
		if rule.MustMatch {
			loc := re.FindString(config)
			details = fmt.Sprintf("Found: %s", truncate(loc, 80))
		} else {
			details = "Pattern correctly absent"
		}
	}

	return passed, details
}

// evaluateMultiPattern handles rules with "pattern1 AND pattern2" syntax
// This allows verifying multi-line blocks (e.g., NTP server AND its authentication)
func evaluateMultiPattern(rule models.AuditRule, config string) (passed bool, details string) {
	parts := strings.Split(rule.Pattern, " AND ")
	allFound := true
	var missing []string
	var found []string

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		flags := "(?im)"
		if strings.HasPrefix(part, "(?") {
			flags = ""
		}

		re, err := regexp.Compile(flags + part)
		if err != nil {
			return false, fmt.Sprintf("Invalid regex in multi-pattern: %s — %v", part, err)
		}

		if re.MatchString(config) {
			loc := re.FindString(config)
			found = append(found, truncate(loc, 60))
		} else {
			allFound = false
			missing = append(missing, part)
		}
	}

	if rule.MustMatch {
		passed = allFound
		if !passed {
			details = fmt.Sprintf("Missing patterns: %s", strings.Join(missing, ", "))
		} else {
			details = fmt.Sprintf("All %d patterns found", len(parts))
		}
	} else {
		// MustNotMatch: none should be present
		passed = len(found) == 0
		if !passed {
			details = fmt.Sprintf("Forbidden patterns found: %s", strings.Join(found, ", "))
		} else {
			details = "All forbidden patterns correctly absent"
		}
	}

	return passed, details
}

// expandRemediation replaces placeholders in remediation templates
func expandRemediation(template string, device models.Device) string {
	r := strings.NewReplacer(
		"{{hostname}}", device.Hostname,
		"{{ip}}", device.IP,
		"{{vendor}}", device.Vendor,
	)
	return r.Replace(template)
}

func truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
