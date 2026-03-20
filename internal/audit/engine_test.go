package audit

import (
	"networktools/internal/db/models"
	"strings"
	"testing"
)

func TestEvaluateRuleAndExpandRemediation(t *testing.T) {
	rule := models.AuditRule{Name: "ssh", Pattern: `^service ssh$`, MustMatch: true}
	passed, _ := evaluateRule(rule, "service ssh\nhostname edge")
	if !passed {
		t.Fatal("expected rule to pass")
	}

	device := models.Device{Hostname: "sw-01", IP: "10.0.0.1", Vendor: "aruba"}
	got := expandRemediation("hostname {{hostname}}\n! {{ip}} {{vendor}}", device)
	if !strings.Contains(got, "sw-01") || !strings.Contains(got, "10.0.0.1") {
		t.Fatalf("unexpected remediation: %q", got)
	}
}

func TestEvaluateMultiPattern(t *testing.T) {
	rule := models.AuditRule{Pattern: `^ntp server 10\.0\.0\.1$ AND ^ntp server 10\.0\.0\.2$`, MustMatch: true}
	passed, details := evaluateMultiPattern(rule, "ntp server 10.0.0.1\nntp server 10.0.0.2")
	if !passed || !strings.Contains(details, "All 2 patterns found") {
		t.Fatalf("unexpected result: %v %s", passed, details)
	}
}
