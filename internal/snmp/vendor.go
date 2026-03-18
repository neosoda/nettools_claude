package snmp

import "strings"

// ParseVendorModelFromDescr extracts vendor and model from sysDescr
func ParseVendorModelFromDescr(sysDescr string) (vendor, model string) {
	desc := strings.ToLower(sysDescr)
	switch {
	case strings.Contains(desc, "cisco"):
		vendor = "cisco"
	case strings.Contains(desc, "aruba") || strings.Contains(desc, "hp comware") || strings.Contains(desc, "hewlett"):
		vendor = "aruba"
	case strings.Contains(desc, "allied telesis") || strings.Contains(desc, "allied"):
		vendor = "allied"
	default:
		vendor = "unknown"
	}

	// Try to extract model from sysDescr
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
	if model == "" && len(words) > 0 {
		// Fallback: use 3rd word if available
		if len(words) >= 3 {
			model = words[2]
		} else {
			model = words[0]
		}
	}
	if len(model) > 40 {
		model = model[:40]
	}
	return vendor, model
}
