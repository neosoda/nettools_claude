package mib

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"
)

// Cache maps OID strings to human-readable names
type Cache struct {
	mu      sync.RWMutex
	oidMap  map[string]string // oid -> name
	nameMap map[string]string // name -> oid
}

var defaultCache = &Cache{
	oidMap:  make(map[string]string),
	nameMap: make(map[string]string),
}

func init() {
	// Seed with well-known OIDs
	wellKnown := map[string]string{
		"1.3.6.1.2.1.1.1.0": "sysDescr",
		"1.3.6.1.2.1.1.2.0": "sysObjectID",
		"1.3.6.1.2.1.1.3.0": "sysUpTime",
		"1.3.6.1.2.1.1.4.0": "sysContact",
		"1.3.6.1.2.1.1.5.0": "sysName",
		"1.3.6.1.2.1.1.6.0": "sysLocation",
		"1.3.6.1.2.1.1.7.0": "sysServices",
		"1.3.6.1.2.1.2.1.0": "ifNumber",
		"1.3.6.1.2.1.2.2":   "ifTable",
		"1.3.6.1.2.1.2.2.1.1": "ifIndex",
		"1.3.6.1.2.1.2.2.1.2": "ifDescr",
		"1.3.6.1.2.1.2.2.1.5": "ifSpeed",
		"1.3.6.1.2.1.2.2.1.8": "ifOperStatus",
		"1.3.6.1.2.1.4.1.0":   "ipForwarding",
	}
	for oid, name := range wellKnown {
		defaultCache.oidMap[oid] = name
		defaultCache.nameMap[name] = oid
	}
}

// Translate converts an OID to its name, or returns the OID if unknown
func Translate(oid string) string {
	defaultCache.mu.RLock()
	defer defaultCache.mu.RUnlock()
	if name, ok := defaultCache.oidMap[oid]; ok {
		return name
	}
	return oid
}

// LoadMIBFile parses a MIB file and populates the cache
func LoadMIBFile(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, fmt.Errorf("open mib file: %w", err)
	}
	defer f.Close()

	// Simplified MIB parser - extracts OBJECT IDENTIFIER definitions
	objectPattern := regexp.MustCompile(`(\w+)\s+OBJECT IDENTIFIER\s*::=\s*\{\s*([\w\s]+)\s+(\d+)\s*\}`)
	added := 0

	defaultCache.mu.Lock()
	defer defaultCache.mu.Unlock()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		matches := objectPattern.FindStringSubmatch(line)
		if len(matches) == 4 {
			name := matches[1]
			parent := strings.TrimSpace(matches[2])
			_ = parent // for a full parser, we'd resolve the parent OID
			// Store name with placeholder - full resolution requires multi-pass
			defaultCache.nameMap[name] = name
			added++
		}
	}

	return added, nil
}

// GetAll returns a copy of the entire OID map
func GetAll() map[string]string {
	defaultCache.mu.RLock()
	defer defaultCache.mu.RUnlock()
	result := make(map[string]string, len(defaultCache.oidMap))
	for k, v := range defaultCache.oidMap {
		result[k] = v
	}
	return result
}
