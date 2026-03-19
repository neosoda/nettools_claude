package snmp

import "strings"

// sysObjectID suffix (after 1.3.6.1.4.1.) → human model name
var oidModelMap = map[string]string{
	// Cisco
	"9.1.576":  "Cisco 2811",
	"9.1.1045": "Cisco 2911",
	"9.6.1.82.24.1": "Cisco SF300-24",
	// HPE / Aruba
	"11.2.3.7.8.5.5":    "Aruba Stack 2930",
	"11.2.3.7.11.88":    "HPE 2510 24G J9279A",
	"11.2.3.7.11.89":    "HPE 2510 48G J9280A",
	"11.2.3.7.11.103":   "HPE 1810 8G J9449A",
	"11.2.3.7.11.104":   "HPE 1810 24G J9450A",
	"11.2.3.7.11.137":   "Aruba 2530 24G PoE J9773A",
	"11.2.3.7.11.139":   "Aruba 2530 48G J9775A",
	"11.2.3.7.11.140":   "Aruba 2530 24G J9776A",
	"11.2.3.7.11.145":   "Aruba 2530 48G J9781A",
	"11.2.3.7.11.150":   "HPE 1810 8G V2 J9802A",
	"11.2.3.7.11.181.18": "Aruba 2930F 24",
	"11.2.3.7.11.181.19": "Aruba 2930F 48",
	"11.2.3.7.11.181.20": "Aruba 2930F 24 PoE",
	"11.2.3.7.11.182.18": "Aruba 2540 24G JL354A",
	"11.2.3.7.11.160":    "Aruba 2930F 24G",
	"11.2.3.7.11.161":    "Aruba 2930F 48G",
	"11.2.3.7.11.162":    "Aruba 2930F 24G PoE+",
	"11.2.3.7.11.163":    "Aruba 2930F 48G PoE+",
	// Aruba 6300 / 6200 series (enterprise prefix 47196)
	"47196.4.1.1.1.11": "Aruba 6300M 24G 4SFP56",
	"47196.4.1.1.1.12": "Aruba 6300M 48G 4SFP56",
	"47196.4.1.1.1.41": "Aruba 6200F 24G 4SFP+",
	"47196.4.1.1.1.42": "Aruba 6200F 48G 4SFP+",
	// H3C
	"43.1.16.4.3.22": "H3C 4550 50",
	// DLink
	"171.10.63.3": "DLink DES-3026",
	"171.10.63.6": "DLink DES-3028",
	"171.10.63.8": "DLink DES-3052",
	"171.10.64.1": "DLink DES-3526",
	"171.10.64.2": "DLink DES-3550",
	// Allied Telesis
	"207.1.4.37":     "AT 8324",
	"207.1.4.72":     "AT 8326GB",
	"207.1.4.74":     "AT 8350GB",
	"207.1.4.126":    "ATI 8000S/24",
	"207.1.4.127":    "ATI 8000S/24 PoE",
	"207.1.4.128":    "ATI 8000S/48",
	"207.1.4.143":    "ATI 8000GS/24",
	"207.1.4.144":    "ATI 8000GS/24 PoE",
	"207.1.4.228":    "AT x230-10GP",
	"207.1.4.253":    "AT GS924MX",
	"207.1.4.254":    "AT GS924MPX",
	"207.1.4.255":    "AT GS948MX",
	"207.1.4.314":    "AT GS970M-10PS",
	"207.1.14.80":    "AT x600-24Ts",
	"207.1.14.81":    "AT x600-24TsXP",
	"207.1.14.120":   "AT x930-28GSX",
	"207.1.14.127":   "AT x510L-28GT",
	"207.1.14.129":   "AT x510L-28GP",
	"207.1.14.154":   "AT GS980MX28",
	"207.1.14.155":   "AT GS980MX28PSm",
	"207.1.14.156":   "AT GS980MX52",
	"207.1.14.157":   "AT GS980MX52PSm",
	// NetGear
	"4526.100.4.32": "NetGear GS724Tv4",
	// H3C / Huawei
	"25506.11.1.215": "5510 24G 4SFP+ HI",
	"25506.11.1.216": "5510 48G 4SFP+ HI",
	"25506.11.1.217": "5510 24G PoE+ 4SFP+ HI",
	"25506.11.1.218": "5510 48G PoE+ 4SFP+ HI",
	"25506.11.1.219": "5510 24G SFP 4SFP+ HI",
	"25506.11.1.244": "5130 24G 4SFP+ 1-slot HI",
	"25506.11.1.245": "5130 48G 4SFP+ 1-slot HI",
	"25506.11.1.246": "5130 24G PoE+ 4SFP+ 1-slot HI",
	"25506.11.1.247": "5130 48G PoE+ 4SFP+ 1-slot HI",
}

// enterprisePrefix is the sysObjectID prefix for enterprise OIDs
const enterprisePrefix = "1.3.6.1.4.1."

// ParseModelFromOID returns a human-readable model name from sysObjectID.
// sysObjectID is a dotted OID string like "1.3.6.1.4.1.9.1.576".
func ParseModelFromOID(sysObjectID string) string {
	suffix := strings.TrimPrefix(sysObjectID, ".")
	suffix = strings.TrimPrefix(suffix, enterprisePrefix)
	if name, ok := oidModelMap[suffix]; ok {
		return name
	}
	return ""
}

// ParseVendorFromOID returns a vendor string from sysObjectID enterprise prefix.
func ParseVendorFromOID(sysObjectID string) string {
	suffix := strings.TrimPrefix(sysObjectID, ".")
	suffix = strings.TrimPrefix(suffix, enterprisePrefix)
	switch {
	case strings.HasPrefix(suffix, "9."):
		return "cisco"
	case strings.HasPrefix(suffix, "11."):
		return "aruba"
	case strings.HasPrefix(suffix, "207."):
		return "allied"
	case strings.HasPrefix(suffix, "171."):
		return "dlink"
	case strings.HasPrefix(suffix, "43."):
		return "h3c"
	case strings.HasPrefix(suffix, "4526."):
		return "netgear"
	case strings.HasPrefix(suffix, "25506."):
		return "huawei"
	case strings.HasPrefix(suffix, "47196."):
		return "aruba"
	default:
		return ""
	}
}

// ParseVendorModelFromDescr extracts vendor and model from sysDescr (fallback).
func ParseVendorModelFromDescr(sysDescr string) (vendor, model string) {
	desc := strings.ToLower(sysDescr)
	switch {
	case strings.Contains(desc, "cisco"):
		vendor = "cisco"
	case strings.Contains(desc, "aruba") || strings.Contains(desc, "hp comware") || strings.Contains(desc, "hewlett"):
		vendor = "aruba"
	case strings.Contains(desc, "allied telesis") || strings.Contains(desc, "alliedware"):
		vendor = "allied"
	case strings.Contains(desc, "h3c"):
		vendor = "h3c"
	case strings.Contains(desc, "dlink") || strings.Contains(desc, "d-link"):
		vendor = "dlink"
	default:
		vendor = "unknown"
	}

	words := strings.Fields(sysDescr)
	for i, w := range words {
		wl := strings.ToLower(w)
		if wl == "version" || wl == "software" || wl == "ios" || wl == "nx-os" {
			if i > 0 {
				model = words[i-1]
			}
			break
		}
	}
	if model == "" && len(words) >= 3 {
		model = words[2]
	} else if model == "" && len(words) > 0 {
		model = words[0]
	}
	if len(model) > 40 {
		model = model[:40]
	}
	return vendor, model
}
