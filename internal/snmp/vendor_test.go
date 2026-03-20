package snmp

import "testing"

func TestParseModelFromOID(t *testing.T) {
	if got := ParseModelFromOID("1.3.6.1.4.1.207.1.4.254"); got != "AT GS924MPX" {
		t.Fatalf("unexpected model: %q", got)
	}
}

func TestParseVendorFromOID(t *testing.T) {
	if got := ParseVendorFromOID(".1.3.6.1.4.1.47196.4.1.1.1.12"); got != "aruba" {
		t.Fatalf("unexpected vendor: %q", got)
	}
}
