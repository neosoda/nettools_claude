package snmp

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
)

// RawLLDPLink holds one LLDP neighbor entry discovered on a device,
// before any resolution against the device database.
type RawLLDPLink struct {
	LocalPortNum  int    // ifIndex-based port number from lldpLocPortTable index
	LocalPortID   string // lldpLocPortId (.3)
	LocalPortDesc string // lldpLocPortDesc (.4)

	RemoteChassisMAC string // lldpRemChassisId (.5), formatted as MAC when subtype=4
	RemotePortID     string // lldpRemPortId (.7)
	RemotePortDesc   string // lldpRemPortDesc (.8)
	RemoteSysName    string // lldpRemSysName (.9)
}

// LLDP-MIB OID prefixes (IEEE 802.1AB)
const (
	lldpRemTableBase  = "1.0.8802.1.1.2.1.4.1.1" // lldpRemTable entries
	lldpLocPortBase   = "1.0.8802.1.1.2.1.3.7.1"  // lldpLocPortTable entries
)

// lldpRemField OID suffixes within lldpRemTable
const (
	lldpRemChassisIdSubtype = 4
	lldpRemChassisId        = 5
	lldpRemPortIdSubtype    = 6
	lldpRemPortId           = 7
	lldpRemPortDesc         = 8
	lldpRemSysName          = 9
)

// lldpLocPortField OID suffixes within lldpLocPortTable
const (
	lldpLocPortId   = 3
	lldpLocPortDesc = 4
)

// CollectLLDPNeighbors performs an SNMP BulkWalk on the LLDP-MIB of a single device
// and returns the list of raw LLDP neighbors discovered.
// community and version follow the same conventions as ScanParams.
func CollectLLDPNeighbors(ip string, port uint16, community string, version string, v3 ScanParams) ([]RawLLDPLink, error) {
	if port == 0 {
		port = 161
	}

	snmpVersion := gosnmp.Version2c
	if version == "v3" {
		snmpVersion = gosnmp.Version3
	} else if version == "v1" {
		snmpVersion = gosnmp.Version1
	}

	g := &gosnmp.GoSNMP{
		Target:    ip,
		Port:      port,
		Community: community,
		Version:   snmpVersion,
		Timeout:   5 * time.Second,
		Retries:   1,
		MaxOids:   gosnmp.MaxOids,
	}

	if snmpVersion == gosnmp.Version3 {
		g.SecurityModel = gosnmp.UserSecurityModel
		g.MsgFlags = gosnmp.AuthPriv
		g.SecurityParameters = &gosnmp.UsmSecurityParameters{
			UserName:                 v3.Username,
			AuthenticationProtocol:   parseAuthProto(v3.AuthProto),
			AuthenticationPassphrase: v3.AuthKey,
			PrivacyProtocol:          parsePrivProto(v3.PrivProto),
			PrivacyPassphrase:        v3.PrivKey,
		}
	}

	if err := g.Connect(); err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	defer g.Conn.Close()

	// remEntries[localPortNum][remoteIndex][field] = value
	type remKey struct{ localPort, remoteIdx int }
	remEntries := make(map[remKey]map[int]string)

	// Walk lldpRemTable
	err := g.BulkWalk(lldpRemTableBase, func(pdu gosnmp.SnmpPDU) error {
		// OID format: lldpRemTableBase.fieldNum.timeFilter.localPortNum.remoteIndex
		suffix := strings.TrimPrefix(pdu.Name, "."+lldpRemTableBase+".")
		parts := strings.Split(suffix, ".")
		if len(parts) < 4 {
			return nil
		}
		fieldNum, err := strconv.Atoi(parts[0])
		if err != nil {
			return nil
		}
		// parts[1] = timeFilter (ignore), parts[2] = localPortNum, parts[3] = remoteIndex
		localPort, err := strconv.Atoi(parts[2])
		if err != nil {
			return nil
		}
		remoteIdx, err := strconv.Atoi(parts[3])
		if err != nil {
			return nil
		}

		key := remKey{localPort, remoteIdx}
		if remEntries[key] == nil {
			remEntries[key] = make(map[int]string)
		}
		remEntries[key][fieldNum] = pduToString(pdu, fieldNum)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("lldpRemTable walk: %w", err)
	}

	if len(remEntries) == 0 {
		return nil, nil // device has no LLDP neighbors or doesn't support LLDP
	}

	// locPorts[portNum] = {portID, portDesc}
	type locPort struct{ id, desc string }
	locPorts := make(map[int]locPort)

	// Walk lldpLocPortTable (best-effort, ignore error)
	_ = g.BulkWalk(lldpLocPortBase, func(pdu gosnmp.SnmpPDU) error {
		suffix := strings.TrimPrefix(pdu.Name, "."+lldpLocPortBase+".")
		parts := strings.Split(suffix, ".")
		if len(parts) < 2 {
			return nil
		}
		fieldNum, err := strconv.Atoi(parts[0])
		if err != nil {
			return nil
		}
		portNum, err := strconv.Atoi(parts[1])
		if err != nil {
			return nil
		}
		lp := locPorts[portNum]
		val := pduToString(pdu, fieldNum)
		switch fieldNum {
		case lldpLocPortId:
			lp.id = val
		case lldpLocPortDesc:
			lp.desc = val
		}
		locPorts[portNum] = lp
		return nil
	})

	var links []RawLLDPLink
	for key, fields := range remEntries {
		lp := locPorts[key.localPort]
		link := RawLLDPLink{
			LocalPortNum:  key.localPort,
			LocalPortID:   lp.id,
			LocalPortDesc: lp.desc,

			RemoteChassisMAC: fields[lldpRemChassisId],
			RemotePortID:     fields[lldpRemPortId],
			RemotePortDesc:   fields[lldpRemPortDesc],
			RemoteSysName:    fields[lldpRemSysName],
		}
		// Prefer the more descriptive port identifier
		if link.LocalPortID == "" {
			link.LocalPortID = fmt.Sprintf("port%d", key.localPort)
		}
		links = append(links, link)
	}
	return links, nil
}

// pduToString converts an SNMP PDU value to a human-readable string.
// For chassis ID fields (subtype 4 = MAC address), bytes are formatted as MAC.
func pduToString(pdu gosnmp.SnmpPDU, fieldNum int) string {
	switch pdu.Type {
	case gosnmp.OctetString:
		b, ok := pdu.Value.([]byte)
		if !ok {
			break
		}
		// Heuristic: if it looks like a 6-byte binary MAC, format it
		if len(b) == 6 && fieldNum == lldpRemChassisId {
			return formatMAC(b)
		}
		// Try as printable string; fall back to hex if non-printable
		if isPrintable(b) {
			return strings.TrimSpace(string(b))
		}
		// Format as colon-separated hex (e.g., for binary port IDs)
		parts := make([]string, len(b))
		for i, by := range b {
			parts[i] = fmt.Sprintf("%02x", by)
		}
		return strings.Join(parts, ":")
	case gosnmp.ObjectIdentifier:
		return fmt.Sprintf("%v", pdu.Value)
	case gosnmp.Integer:
		return fmt.Sprintf("%d", gosnmp.ToBigInt(pdu.Value))
	}
	return fmt.Sprintf("%v", pdu.Value)
}

func isPrintable(b []byte) bool {
	for _, c := range b {
		if c < 0x20 && c != '\t' && c != '\n' && c != '\r' {
			return false
		}
	}
	return true
}

// ClassifyLinkType determines whether a link is a trunk or access link.
// A link is classified as trunk if:
//   - both endpoints are known devices in the DB (switch-to-switch), OR
//   - the port name suggests a high-bandwidth/uplink interface, OR
//   - it is part of a LAG (multiple parallel links between same device pair).
func ClassifyLinkType(localPort string, remoteDeviceKnown bool, parallelCount int) string {
	if parallelCount > 1 {
		return "trunk" // LAG / port-channel
	}
	if remoteDeviceKnown {
		// Switch-to-switch link: treat as trunk by default
		// unless the port name strongly suggests an access port
		if !isAccessPort(localPort) {
			return "trunk"
		}
	}
	if isTrunkPort(localPort) {
		return "trunk"
	}
	return "access"
}

// isTrunkPort returns true if the port name indicates a high-bandwidth uplink.
func isTrunkPort(port string) bool {
	upper := strings.ToUpper(port)
	keywords := []string{"TE", "TENGIG", "FORTYGIG", "HUNDREDGIG", "XG", "UPLINK", "TRUNK", "LAG", "PO", "PORT-CHANNEL"}
	for _, kw := range keywords {
		if strings.Contains(upper, kw) {
			return true
		}
	}
	return false
}

// isAccessPort returns true if the port name strongly indicates an access/endpoint port.
func isAccessPort(port string) bool {
	upper := strings.ToUpper(port)
	// Access-tier keywords: FastEthernet, low-numbered Ethernet
	return strings.HasPrefix(upper, "FA") || strings.HasPrefix(upper, "FASTETHERNET")
}
