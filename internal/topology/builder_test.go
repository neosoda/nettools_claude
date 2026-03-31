package topology

import (
	"testing"

	"nettools/internal/db/models"
)

func TestGetRenderHintPoE(t *testing.T) {
	tests := []struct {
		model     string
		expectPoE bool
		expectClr string
	}{
		{"AT GS924MPX", true, "green"},
		{"AT x510L-28GP", true, "green"},
		{"Aruba 2930F 24G PoE+ PS", true, "green"},
		{"AT GS980MX28PSm", true, "green"},
	}
	for _, tt := range tests {
		t.Run(tt.model, func(t *testing.T) {
			hint := GetRenderHint(tt.model)
			if hint.ShowPoEIcon != tt.expectPoE {
				t.Errorf("GetRenderHint(%q).ShowPoEIcon = %v, want %v", tt.model, hint.ShowPoEIcon, tt.expectPoE)
			}
			if hint.TerminalColor != tt.expectClr {
				t.Errorf("GetRenderHint(%q).TerminalColor = %q, want %q", tt.model, hint.TerminalColor, tt.expectClr)
			}
		})
	}
}

func TestGetRenderHintBlue(t *testing.T) {
	tests := []string{"AT GS948MX", "ATI 8000S/24", "AT x930-28GSX"}
	for _, model := range tests {
		t.Run(model, func(t *testing.T) {
			hint := GetRenderHint(model)
			if hint.TerminalColor != "blue" {
				t.Errorf("GetRenderHint(%q).TerminalColor = %q, want blue", model, hint.TerminalColor)
			}
		})
	}
}

func TestGetRenderHintDefault(t *testing.T) {
	hint := GetRenderHint("Cisco 2911")
	if hint.TerminalColor != "blue" {
		t.Errorf("default hint should be blue, got %q", hint.TerminalColor)
	}
	if hint.ShowPoEIcon {
		t.Error("default hint should not show PoE icon")
	}
}

func TestMatchAny(t *testing.T) {
	if !matchAny("HELLO WORLD", "HELLO", "FOO") {
		t.Error("expected matchAny to find HELLO in HELLO WORLD")
	}
	if matchAny("HELLO WORLD", "FOO", "BAR") {
		t.Error("expected matchAny to not find FOO or BAR in HELLO WORLD")
	}
}

func TestDetectSubnetEdges(t *testing.T) {
	devices := []models.Device{
		{ID: "d1", IP: "192.168.1.10"},
		{ID: "d2", IP: "192.168.1.20"},
		{ID: "d3", IP: "192.168.1.30"},
		{ID: "d4", IP: "10.0.0.1"},
	}

	edges := detectSubnetEdges(devices)

	// d1, d2, d3 share 192.168.1.0/24 -> 2 edges (star from d1)
	// d4 is alone in 10.0.0.0/24 -> 0 edges
	if len(edges) != 2 {
		t.Errorf("expected 2 edges, got %d", len(edges))
	}

	// Verify edges reference correct source
	for _, e := range edges {
		if e.Source != "d1" {
			t.Errorf("expected hub d1 as source, got %s", e.Source)
		}
		if e.Target != "d2" && e.Target != "d3" {
			t.Errorf("unexpected target: %s", e.Target)
		}
	}
}

func TestDetectSubnetEdgesInvalidIP(t *testing.T) {
	devices := []models.Device{
		{ID: "d1", IP: "not-an-ip"},
		{ID: "d2", IP: "192.168.1.1"},
	}
	edges := detectSubnetEdges(devices)
	if len(edges) != 0 {
		t.Errorf("expected 0 edges with single valid device, got %d", len(edges))
	}
}

func TestDetectSubnetEdgesSingleDevice(t *testing.T) {
	devices := []models.Device{
		{ID: "d1", IP: "192.168.1.1"},
	}
	edges := detectSubnetEdges(devices)
	if len(edges) != 0 {
		t.Errorf("expected 0 edges with single device, got %d", len(edges))
	}
}

func TestDetectSubnetEdgesEmpty(t *testing.T) {
	edges := detectSubnetEdges(nil)
	if len(edges) != 0 {
		t.Errorf("expected 0 edges for nil devices, got %d", len(edges))
	}
}
