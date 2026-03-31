package snmp

import (
	"fmt"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
)

// DeviceInfo holds the collected device information
type DeviceInfo struct {
	IP           string
	Hostname     string
	Description  string
	Location     string
	Contact      string
	ObjectID     string
	UptimeMs     int64
	Vendor       string
	Model        string
}

// CollectDeviceInfo performs SNMP GET to collect device metadata
func CollectDeviceInfo(ip string, community string, version string, port uint16, timeout time.Duration) (*DeviceInfo, error) {
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	if port == 0 {
		port = 161
	}

	var v gosnmp.SnmpVersion
	if version == "v3" {
		v = gosnmp.Version3
	} else {
		v = gosnmp.Version2c
	}

	g := &gosnmp.GoSNMP{
		Target:    ip,
		Port:      port,
		Community: community,
		Version:   v,
		Timeout:   timeout,
		Retries:   2,
	}

	if err := g.Connect(); err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	defer g.Conn.Close()

	oids := []string{
		"1.3.6.1.2.1.1.1.0", // sysDescr
		"1.3.6.1.2.1.1.2.0", // sysObjectID
		"1.3.6.1.2.1.1.3.0", // sysUpTime (timeticks)
		"1.3.6.1.2.1.1.4.0", // sysContact
		"1.3.6.1.2.1.1.5.0", // sysName
		"1.3.6.1.2.1.1.6.0", // sysLocation
	}

	result, err := g.Get(oids)
	if err != nil {
		return nil, fmt.Errorf("get: %w", err)
	}

	info := &DeviceInfo{IP: ip}
	for _, pdu := range result.Variables {
		if pdu.Type == gosnmp.NoSuchObject || pdu.Type == gosnmp.NoSuchInstance || pdu.Type == gosnmp.Null {
			continue
		}
		// gosnmp prefixes OID names with a leading dot — strip it for lookup
		oidKey := strings.TrimPrefix(pdu.Name, ".")
		val := fmt.Sprintf("%v", pdu.Value)
		if pdu.Type == gosnmp.OctetString {
			if b, ok := pdu.Value.([]byte); ok {
				val = string(b)
			}
		}
		switch oidKey {
		case "1.3.6.1.2.1.1.1.0":
			info.Description = strings.TrimSpace(val)
			info.Vendor, info.Model = parseVendorModel(info.Description)
		case "1.3.6.1.2.1.1.2.0":
			info.ObjectID = val
		case "1.3.6.1.2.1.1.3.0":
			if ticks, ok := pdu.Value.(uint32); ok {
				info.UptimeMs = int64(ticks) * 10 // centiseconds to ms
			}
		case "1.3.6.1.2.1.1.5.0":
			info.Hostname = strings.TrimSpace(val)
		case "1.3.6.1.2.1.1.6.0":
			info.Location = strings.TrimSpace(val)
		case "1.3.6.1.2.1.1.4.0":
			info.Contact = strings.TrimSpace(val)
		}
	}

	return info, nil
}

func parseVendorModel(sysDescr string) (vendor, model string) {
	desc := strings.ToLower(sysDescr)
	switch {
	case strings.Contains(desc, "cisco"):
		vendor = "cisco"
	case strings.Contains(desc, "aruba") || strings.Contains(desc, "hp comware"):
		vendor = "aruba"
	case strings.Contains(desc, "allied telesis") || strings.Contains(desc, "allied"):
		vendor = "allied"
	default:
		vendor = "unknown"
	}

	// Extract model from description
	words := strings.Fields(sysDescr)
	if len(words) > 2 {
		model = words[len(words)-1]
		if len(model) > 30 {
			model = model[:30]
		}
	}

	return vendor, model
}
