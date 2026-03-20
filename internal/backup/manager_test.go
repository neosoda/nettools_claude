package backup

import "testing"

func TestExtractConfigContentPreservesLegitimateConfigLines(t *testing.T) {
	raw := "show running-config\nBuilding configuration...\n!\nhostname SW-01\ninterface vlan 1\n ip address 10.0.0.1 255.255.255.0\nend\nSW-01#\n"
	got := extractConfigContent(raw, "show running-config")
	want := "Building configuration...\n!\nhostname SW-01\ninterface vlan 1\n ip address 10.0.0.1 255.255.255.0\nend"
	if got != want {
		t.Fatalf("unexpected config:\n%s", got)
	}
}

func TestDeepCleanConfigRemovesPaginationArtifacts(t *testing.T) {
	raw := "line1\n-- More --\nline2\r\n\x1b[0mline3"
	got := deepCleanConfig(raw)
	if got != "line1\nline2\nline3" {
		t.Fatalf("unexpected cleaned config: %q", got)
	}
}
