package topology

import (
	"fmt"
	"net"
	"sort"
	"strings"

	"nettools/internal/db"
	"nettools/internal/db/models"
)

// Node represents a device in the topology graph
type Node struct {
	ID       string     `json:"id"`
	Label    string     `json:"label"`
	IP       string     `json:"ip"`
	Vendor   string     `json:"vendor"`
	Model    string     `json:"model"`
	Hint     RenderHint `json:"hint"`
	Location string     `json:"location"`
	Status   string     `json:"status"` // "online"|"offline"|"unknown"
}

// Edge represents a connection between two nodes
type Edge struct {
	ID         string `json:"id"`
	Source     string `json:"source"`
	Target     string `json:"target"`
	Label      string `json:"label"`
	LinkType   string `json:"link_type"`   // "trunk"|"access"|"unknown"|"subnet"
	LocalPort  string `json:"local_port"`
	RemotePort string `json:"remote_port"`
}

// Graph holds the full topology
type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

// RenderHint provides rendering instructions for the topology UI
type RenderHint struct {
	TerminalColor string `json:"terminal_color"` // "green"|"blue"|"none"
	ShowPoEIcon   bool   `json:"show_poe_icon"`
	TerminalIndex int    `json:"terminal_index"` // 43=PoE, -1=classic
}

// GetRenderHint returns the visual rendering hint for a device model
func GetRenderHint(model string) RenderHint {
	upper := strings.ToUpper(model)
	switch {
	case matchAny(upper, "MPX", "GP", " PS", "PSM"):
		return RenderHint{TerminalColor: "green", ShowPoEIcon: true, TerminalIndex: 43}
	case matchAny(upper, " MX", "8000S", "GSX"):
		return RenderHint{TerminalColor: "blue", ShowPoEIcon: false, TerminalIndex: -1}
	case matchAny(upper, "EX1-1-1-CDR", "EX1-1-2"):
		return RenderHint{TerminalColor: "none", ShowPoEIcon: false, TerminalIndex: -1}
	case matchAny(upper, "EX1-2-3", "EX1-3-1"):
		return RenderHint{TerminalColor: "blue", ShowPoEIcon: true, TerminalIndex: 43}
	default:
		return RenderHint{TerminalColor: "blue", ShowPoEIcon: false, TerminalIndex: -1}
	}
}

func matchAny(s string, patterns ...string) bool {
	for _, p := range patterns {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}

// Build constructs the topology graph from the device inventory.
// It uses LLDP-discovered links (DeviceLink table) as the primary source,
// falling back to the subnet heuristic for devices that have no LLDP data.
func Build() (*Graph, error) {
	var devices []models.Device
	if err := db.DB.Find(&devices).Error; err != nil {
		return nil, err
	}

	graph := &Graph{
		Nodes: make([]Node, 0, len(devices)),
		Edges: make([]Edge, 0),
	}

	for _, d := range devices {
		label := d.Hostname
		if label == "" {
			label = d.IP
		}
		node := Node{
			ID:       d.ID,
			Label:    label,
			IP:       d.IP,
			Vendor:   d.Vendor,
			Model:    d.Model,
			Hint:     GetRenderHint(d.Model),
			Location: d.Location,
			Status:   "unknown",
		}
		if d.LastSeenAt != nil {
			node.Status = "online"
		}
		graph.Nodes = append(graph.Nodes, node)
	}

	// Load LLDP-discovered links
	var lldpLinks []models.DeviceLink
	_ = db.DB.Find(&lldpLinks).Error // non-fatal if table is empty

	lldpEdges, devicesWithLLDP := buildLLDPEdges(lldpLinks)
	graph.Edges = lldpEdges

	// Fallback: for devices that have no LLDP data at all, add subnet edges
	// so they still appear connected (shown as dashed "subnet" links).
	var orphans []models.Device
	for _, d := range devices {
		if !devicesWithLLDP[d.ID] {
			orphans = append(orphans, d)
		}
	}
	if len(orphans) > 1 {
		subnetEdges := detectSubnetEdges(orphans, len(lldpEdges))
		graph.Edges = append(graph.Edges, subnetEdges...)
	}

	return graph, nil
}

// buildLLDPEdges converts DeviceLink records into deduplicated topology edges.
// Returns the edges and the set of device IDs that had at least one LLDP link.
func buildLLDPEdges(links []models.DeviceLink) ([]Edge, map[string]bool) {
	// canonical edge key: sorted pair of (localDeviceID, remoteDeviceID)
	// Only create an edge if both ends are known devices.
	type edgeKey struct{ a, b string }
	seen := make(map[edgeKey]bool)
	devicesWithLLDP := make(map[string]bool)

	var edges []Edge
	edgeID := 0

	for _, l := range links {
		devicesWithLLDP[l.LocalDeviceID] = true

		// Only draw an edge when the remote is a known device in the DB
		if l.RemoteDeviceID == "" {
			continue
		}
		devicesWithLLDP[l.RemoteDeviceID] = true

		// Deduplicate bidirectional links (A→B == B→A)
		src, dst := l.LocalDeviceID, l.RemoteDeviceID
		key := edgeKey{a: src, b: dst}
		if src > dst {
			key = edgeKey{a: dst, b: src}
		}
		if seen[key] {
			continue
		}
		seen[key] = true

		edgeID++
		localPort := l.LocalPort
		remotePort := l.RemotePort
		label := buildPortLabel(localPort, remotePort)

		edges = append(edges, Edge{
			ID:         fmt.Sprintf("lldp-%d", edgeID),
			Source:     src,
			Target:     dst,
			Label:      label,
			LinkType:   l.LinkType,
			LocalPort:  localPort,
			RemotePort: remotePort,
		})
	}

	// Sort for deterministic output
	sort.Slice(edges, func(i, j int) bool { return edges[i].ID < edges[j].ID })
	return edges, devicesWithLLDP
}

// buildPortLabel builds a human-readable label from two port names.
func buildPortLabel(local, remote string) string {
	local = shortenPort(local)
	remote = shortenPort(remote)
	if local == "" && remote == "" {
		return ""
	}
	if remote == "" {
		return local
	}
	if local == "" {
		return remote
	}
	return local + " ↔ " + remote
}

// shortenPort converts long interface names to abbreviated forms.
// e.g. "GigabitEthernet1/0/1" → "Gi1/0/1", "TenGigabitEthernet1/1" → "Te1/1"
func shortenPort(name string) string {
	replacements := []struct{ from, to string }{
		{"HundredGigabitEthernet", "Hu"},
		{"FortyGigabitEthernet", "Fo"},
		{"TenGigabitEthernet", "Te"},
		{"GigabitEthernet", "Gi"},
		{"FastEthernet", "Fa"},
		{"Ethernet", "Et"},
	}
	for _, r := range replacements {
		if strings.HasPrefix(strings.ToLower(name), strings.ToLower(r.from)) {
			return r.to + name[len(r.from):]
		}
	}
	return name
}

// detectSubnetEdges creates edges between devices on the same /24 subnet.
// This is a fallback heuristic used only for devices without LLDP data.
// edgeOffset is used to avoid ID collisions with LLDP edges.
func detectSubnetEdges(devices []models.Device, edgeOffset int) []Edge {
	subnets := make(map[string][]string) // /24 prefix -> device IDs
	for _, d := range devices {
		ip := net.ParseIP(d.IP)
		if ip == nil {
			continue
		}
		ip4 := ip.To4()
		if ip4 == nil {
			continue
		}
		prefix := fmt.Sprintf("%d.%d.%d.0/24", ip4[0], ip4[1], ip4[2])
		subnets[prefix] = append(subnets[prefix], d.ID)
	}

	var edges []Edge
	edgeID := edgeOffset
	for prefix, ids := range subnets {
		if len(ids) < 2 {
			continue
		}
		// Star topology: first device is the "hub", others connect to it
		hub := ids[0]
		for _, id := range ids[1:] {
			edgeID++
			edges = append(edges, Edge{
				ID:       fmt.Sprintf("subnet-%d", edgeID),
				Source:   hub,
				Target:   id,
				Label:    prefix,
				LinkType: "subnet",
			})
		}
	}
	return edges
}
