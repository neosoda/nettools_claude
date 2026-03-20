package topology

import (
	"fmt"
	"net"
	"sort"
	"strings"

	"networktools/internal/db"
	"networktools/internal/db/models"
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
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label"`
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

// Build constructs the topology graph from the device inventory
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

	graph.Edges = buildHeuristicEdges(devices)
	return graph, nil
}

func buildHeuristicEdges(devices []models.Device) []Edge {
	subnets := map[string][]models.Device{}
	for _, device := range devices {
		subnet := subnetKey(device.IP)
		if subnet == "" {
			continue
		}
		subnets[subnet] = append(subnets[subnet], device)
	}

	edges := make([]Edge, 0)
	seen := map[string]struct{}{}
	for subnet, group := range subnets {
		if len(group) < 2 {
			continue
		}
		sort.Slice(group, func(i, j int) bool { return group[i].IP < group[j].IP })
		root := selectSubnetRoot(group)
		for _, device := range group {
			if device.ID == root.ID {
				continue
			}
			key := root.ID + ":" + device.ID
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			edges = append(edges, Edge{ID: fmt.Sprintf("%s-%s", root.ID, device.ID), Source: root.ID, Target: device.ID, Label: subnet})
		}
	}
	return edges
}

func selectSubnetRoot(group []models.Device) models.Device {
	best := group[0]
	bestScore := heuristicRootScore(best)
	for _, device := range group[1:] {
		score := heuristicRootScore(device)
		if score > bestScore || (score == bestScore && device.IP < best.IP) {
			best = device
			bestScore = score
		}
	}
	return best
}

func heuristicRootScore(device models.Device) int {
	score := 0
	if strings.Contains(strings.ToLower(device.Model), "core") || strings.Contains(strings.ToLower(device.Hostname), "core") {
		score += 10
	}
	parsed := net.ParseIP(device.IP)
	if parsed != nil {
		if ipv4 := parsed.To4(); ipv4 != nil {
			last := int(ipv4[3])
			if last == 254 || last == 1 {
				score += 5
			}
		}
	}
	return score
}

func subnetKey(ip string) string {
	parsed := net.ParseIP(strings.TrimSpace(ip))
	if parsed == nil {
		return ""
	}
	if ipv4 := parsed.To4(); ipv4 != nil {
		return fmt.Sprintf("%d.%d.%d.0/24", ipv4[0], ipv4[1], ipv4[2])
	}
	return parsed.Mask(net.CIDRMask(64, 128)).String() + "/64"
}
