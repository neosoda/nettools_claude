# Changelog

## [1.3.0] - 2026-03-20

### Added
- **Unit tests** for diff comparator, SNMP vendor parser, topology builder, and logger
- **Toast notifications** replacing browser alerts for better UX
- **Delete confirmations** on inventory devices and credentials
- **CI/CD pipeline** with GitHub Actions (CI + Release workflows)
- **Makefile** for common development tasks
- **Golangci-lint** configuration
- **Subnet-based topology edges** with heuristic root selection (core/.1/.254 preference)
- **Log retention** cleanup for old log files
- **Input validation** for CIDR ranges, IP addresses, and audit rule regex patterns
- **Backup comparison mode** in the diff page
- **Inventory page** added to navigation sidebar
- **WindowTitleSync** component for dynamic window title updates
- **SNMPv3 credential fields** (auth/priv protocol and keys) in settings
- **Hardened SNMP scan** validation and SNMPv3 credential usage

### Fixed
- `json.Unmarshal` errors silently ignored in scheduler and app
- N+1 device lookup in backup callbacks (now O(1) with IP map)
- Missing DB error handling in audit engine result persistence
- Scheduler "once" mode race condition (now +2min fallback)
- `fmt.Sprintf` format verb error in diff HTML CSS (`width:100%`)
- GORM model indexes on `Backup.CreatedAt` and `AuditLog.CreatedAt`
- One-shot scheduler behavior and log retention application

### Changed
- Error output in main.go uses `os.Stderr` instead of `println`
- Secret fallback warns on stderr when using hostname-derived key
- `parseInt` calls use radix 10 consistently
