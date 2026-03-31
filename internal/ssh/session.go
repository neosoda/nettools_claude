package ssh

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// safeBuffer is a thread-safe buffer for concurrent SSH reads and goroutine reads
type safeBuffer struct {
	mu  sync.Mutex
	buf strings.Builder
}

func (b *safeBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *safeBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func (b *safeBuffer) Len() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Len()
}

// VendorConfig defines vendor-specific SSH parameters
type VendorConfig struct {
	PaginationPattern *regexp.Regexp
	PaginationSend    string
	PromptPattern     *regexp.Regexp
	BannerPattern     *regexp.Regexp // "Press any key" style banners
	BannerSend        string
	BackupCommand     map[string]string // "running" -> command
	DisablePaging     string            // command to disable paging (sent before main command)
}

var vendorConfigs = map[string]VendorConfig{
	"cisco": {
		PaginationPattern: regexp.MustCompile(`(?i)--\s*More\s*--`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|press RETURN`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "terminal length 0",
	},
	"aruba": {
		// Aruba AOS-S (ProCurve heritage) — SSH exec channel not supported, must use interactive shell.
		PaginationPattern: regexp.MustCompile(`(?i)--\s*MORE\s*--|Press any key to continue`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press\s+any\s+key`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "no page",
	},
	"hp": {
		// HP ProCurve / ArubaOS-Switch (J-series) — same CLI family as Aruba AOS-S.
		PaginationPattern: regexp.MustCompile(`(?i)--\s*MORE\s*--|Press any key to continue`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press\s+any\s+key`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "no page",
	},
	"hpe": {
		// HPE Comware / H3C — uses 'display' commands; 'screen-length 0 temporary' disables paging for the session.
		PaginationPattern: regexp.MustCompile(`(?i)--\s*MORE\s*--`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press\s+any\s+key`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "display current-configuration", "startup": "display saved-configuration"},
		DisablePaging:     "screen-length 0 temporary",
	},
	"huawei": {
		// Huawei VRP (CloudEngine, Quidway, S-series, AR-series).
		// Shares CLI heritage with HPE Comware (H3C) — same commands apply.
		PaginationPattern: regexp.MustCompile(`(?i)--\s*More\s*--`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press\s+any\s+key`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "display current-configuration", "startup": "display saved-configuration"},
		DisablePaging:     "screen-length 0 temporary",
	},
	"allied": {
		// Allied Telesis AlliedWare Plus.
		PaginationPattern: regexp.MustCompile(`(?i)--\s*[Mm]ore\s*--`),
		PaginationSend:    "\r",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|Press ENTER`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "terminal length 0",
	},
	"fortinet": {
		// Fortinet FortiOS (FortiGate, FortiSwitch) — SSH exec channel works well; no pagination.
		PaginationPattern: nil,
		PaginationSend:    "",
		PromptPattern:     regexp.MustCompile(`[#$]\s*$`),
		BannerPattern:     nil,
		BannerSend:        "",
		BackupCommand:     map[string]string{"running": "show full-configuration", "startup": "show full-configuration"},
		DisablePaging:     "",
	},
	"unknown": {
		PaginationPattern: regexp.MustCompile(`(?i)--\s*More\s*--|--\s*MORE\s*--|Press any key`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>$%]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|press RETURN`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show running-config"},
		DisablePaging:     "",
	},
}

// GetBackupCommand returns the vendor-specific command to retrieve device configuration.
// Falls back to "show running-config" for unknown vendors or config types.
func GetBackupCommand(vendor, configType string) string {
	vc, ok := vendorConfigs[strings.ToLower(vendor)]
	if !ok {
		vc = vendorConfigs["unknown"]
	}
	if cmd, ok := vc.BackupCommand[configType]; ok {
		return cmd
	}
	return "show running-config"
}

// DetectVendorFromBanner tries to identify the device vendor from an SSH server
// version string or the initial shell banner/MOTD.
// Returns "" when the vendor cannot be determined.
func DetectVendorFromBanner(banner string) string {
	lower := strings.ToLower(banner)
	switch {
	case strings.Contains(lower, "cisco"):
		return "cisco"
	case strings.Contains(lower, "aruba"):
		return "aruba"
	case strings.Contains(lower, "alliedware") || strings.Contains(lower, "allied telesis"):
		return "allied"
	case strings.Contains(lower, "comware") || strings.Contains(lower, "h3c"):
		return "hpe"
	case strings.Contains(lower, "huawei"):
		return "huawei"
	case strings.Contains(lower, "fortinet") || strings.Contains(lower, "fortigate") || strings.Contains(lower, "fortiswitch"):
		return "fortinet"
	default:
		return ""
	}
}

// Comprehensive ANSI/terminal control sequence cleaning pattern
// Covers: CSI sequences, OSC sequences, cursor positioning, backspace,
// carriage return, DCS, PM, APC sequences, and other control chars
var ansiPattern = regexp.MustCompile(
	`\x1b\[[0-9;]*[a-zA-Z]` + // CSI sequences: \e[24;1H, \e[0m, etc.
		`|\x1b\[[?][0-9;]*[a-zA-Z]` + // CSI private: \e[?25l, etc.
		`|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)` + // OSC sequences: \e]0;title\a
		`|\x1b[PX^_][^\x1b]*\x1b\\` + // DCS/SOS/PM/APC sequences
		`|\x1b[()][A-Z0-9]` + // Character set selection
		`|\x1b[>=Nc]` + // Various escape codes
		`|\x1b\[[\d;]*m` + // SGR color/style
		`|\x08+` + // Backspace characters
		`|\x0d` + // Carriage return
		`|\x07` + // BEL
		`|\x00` + // NULL
		`|\x0f` + // Shift In
		`|\x0e`, // Shift Out
)

// Session represents an SSH session to a network device
type Session struct {
	client  *ssh.Client
	vendor  string
	timeout time.Duration
}

type ConnectParams struct {
	Host       string
	Port       int
	Username   string
	Password   string
	PrivateKey string
	Vendor     string
	Timeout    time.Duration
}

func Connect(ctx context.Context, p ConnectParams) (*Session, error) {
	if p.Timeout == 0 {
		p.Timeout = 30 * time.Second
	}
	if p.Port == 0 {
		p.Port = 22
	}
	if p.Vendor == "" {
		p.Vendor = "unknown"
	}

	var authMethods []ssh.AuthMethod
	if p.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(p.PrivateKey))
		if err == nil {
			authMethods = append(authMethods, ssh.PublicKeys(signer))
		}
	}
	if p.Password != "" {
		authMethods = append(authMethods, ssh.Password(p.Password))
		authMethods = append(authMethods, ssh.KeyboardInteractive(func(name, instruction string, questions []string, echos []bool) ([]string, error) {
			answers := make([]string, len(questions))
			for i := range questions {
				answers[i] = p.Password
			}
			return answers, nil
		}))
	}

	config := &ssh.ClientConfig{
		User:            p.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // For network devices, TOFU is standard
		Timeout:         p.Timeout,
		Config: ssh.Config{
			// Support older network devices with legacy ciphers/KEX
			KeyExchanges: []string{
				"curve25519-sha256", "curve25519-sha256@libssh.org",
				"ecdh-sha2-nistp256", "ecdh-sha2-nistp384", "ecdh-sha2-nistp521",
				"diffie-hellman-group14-sha256", "diffie-hellman-group14-sha1",
				"diffie-hellman-group1-sha1",
			},
			Ciphers: []string{
				"aes128-gcm@openssh.com", "aes256-gcm@openssh.com",
				"chacha20-poly1305@openssh.com",
				"aes128-ctr", "aes192-ctr", "aes256-ctr",
				"aes128-cbc", "aes256-cbc", "3des-cbc",
			},
		},
	}

	addr := fmt.Sprintf("%s:%d", p.Host, p.Port)

	// Dial with context support for cancellation
	dialDone := make(chan struct{})
	var client *ssh.Client
	var dialErr error
	go func() {
		defer close(dialDone)
		client, dialErr = ssh.Dial("tcp", addr, config)
	}()

	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("ssh dial %s: %w", addr, ctx.Err())
	case <-dialDone:
		if dialErr != nil {
			return nil, fmt.Errorf("ssh dial %s: %w", addr, dialErr)
		}
	}

	// Auto-detect vendor from SSH server version banner when vendor is unspecified.
	// Example server versions: "SSH-2.0-Cisco-1.25", "SSH-2.0-HuaweiSSH".
	if p.Vendor == "" || p.Vendor == "unknown" {
		if detected := DetectVendorFromBanner(string(client.ServerVersion())); detected != "" {
			p.Vendor = detected
		}
	}

	return &Session{client: client, vendor: p.Vendor, timeout: p.Timeout}, nil
}

func (s *Session) Close() {
	if s.client != nil {
		s.client.Close()
	}
}

// RunCommand executes a single command via SSH exec channel (no PTY, no interactive shell).
// This is the preferred method for backup: the device sends the full output without
// pagination because there is no terminal attached — equivalent to paramiko exec_command().
func (s *Session) RunCommand(ctx context.Context, command string) (string, error) {
	sess, err := s.client.NewSession()
	if err != nil {
		return "", fmt.Errorf("new session: %w", err)
	}
	defer sess.Close()

	// No PTY requested: exec channel without a terminal.
	// Most network devices (Cisco, Allied, HP, HPE, Aruba) will send the full
	// output without any "--More--" pagination when there is no terminal.

	outputCh := make(chan struct {
		data []byte
		err  error
	}, 1)
	go func() {
		output, err := sess.CombinedOutput(command)
		outputCh <- struct {
			data []byte
			err  error
		}{output, err}
	}()

	select {
	case <-ctx.Done():
		sess.Close()
		return "", ctx.Err()
	case result := <-outputCh:
		if result.err != nil {
			// Always propagate the error so the caller can fallback to interactive mode.
			// (Some devices like Aruba reject exec channel but include error text in data.)
			return "", result.err
		}
		return CleanOutput(string(result.data)), nil
	}
}

// RunCommandInteractive runs a command in an interactive shell (handles pagination & banners)
func (s *Session) RunCommandInteractive(ctx context.Context, command string) (string, error) {
	sess, err := s.client.NewSession()
	if err != nil {
		return "", fmt.Errorf("new session: %w", err)
	}
	defer sess.Close()

	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 115200,
		ssh.TTY_OP_OSPEED: 115200,
	}
	if err := sess.RequestPty("vt100", 512, 512, modes); err != nil {
		return "", fmt.Errorf("pty request: %w", err)
	}

	stdin, err := sess.StdinPipe()
	if err != nil {
		return "", fmt.Errorf("stdin pipe: %w", err)
	}

	var sb safeBuffer
	sess.Stdout = &sb
	sess.Stderr = &sb

	if err := sess.Shell(); err != nil {
		return "", fmt.Errorf("shell: %w", err)
	}

	vc := vendorConfigs[s.vendor]
	if _, ok := vendorConfigs[s.vendor]; !ok {
		vc = vendorConfigs["unknown"]
	}

	// Phase 1: Wait for initial prompt or banner, with banner auto-dismiss
	waitReady := time.NewTicker(100 * time.Millisecond)
	readyDeadline := time.After(15 * time.Second)
	bannerDismissed := false
waitLoop:
	for {
		select {
		case <-ctx.Done():
			waitReady.Stop()
			return "", ctx.Err()
		case <-readyDeadline:
			waitReady.Stop()
			break waitLoop
		case <-waitReady.C:
			current := sb.String()
			// Check for "Press any key" banners and auto-dismiss
			if !bannerDismissed && vc.BannerPattern != nil && vc.BannerPattern.MatchString(current) {
				fmt.Fprint(stdin, vc.BannerSend)
				bannerDismissed = true
				continue
			}
			if hasTerminalPrompt(vc.PromptPattern, current) {
				waitReady.Stop()
				break waitLoop
			}
		}
	}

	// Phase 1.5: if vendor was unknown, try to detect from the initial banner/MOTD output.
	// This allows Phase 2 (disable paging) to use the correct vendor-specific command.
	if s.vendor == "unknown" {
		if detected := DetectVendorFromBanner(sb.String()); detected != "" {
			s.vendor = detected
			if newVC, ok := vendorConfigs[s.vendor]; ok {
				vc = newVC
			}
		}
	}

	// Phase 2: Send disable-paging command if supported
	if vc.DisablePaging != "" {
		fmt.Fprintf(stdin, "%s\r", vc.DisablePaging)
		// Wait briefly for the command to be processed
		pagingWait := time.NewTicker(100 * time.Millisecond)
		pagingDeadline := time.After(5 * time.Second)
		prevLen := sb.Len()
		stableCount := 0
	pagingLoop:
		for {
			select {
			case <-ctx.Done():
				pagingWait.Stop()
				return "", ctx.Err()
			case <-pagingDeadline:
				pagingWait.Stop()
				break pagingLoop
			case <-pagingWait.C:
				if sb.Len() == prevLen {
					stableCount++
					if stableCount >= 5 && hasTerminalPrompt(vc.PromptPattern, sb.String()) {
						pagingWait.Stop()
						break pagingLoop
					}
				} else {
					stableCount = 0
					prevLen = sb.Len()
				}
			}
		}
	}

	// Phase 3: Send the actual command
	fmt.Fprintf(stdin, "%s\r", command)

	// Phase 4: Read output with pagination handling (non-blocking)
	done := make(chan struct{})
	go func() {
		defer close(done)
		deadline := time.After(s.timeout)
		tick := time.NewTicker(100 * time.Millisecond)
		defer tick.Stop()
		lastLen := -1
		stableCount := 0

		for {
			select {
			case <-ctx.Done():
				return
			case <-deadline:
				return
			case <-tick.C:
				currentLen := sb.Len()
				// Only check the tail of the buffer for pagination/prompt (performance)
				tailStart := currentLen - 200
				if tailStart < 0 {
					tailStart = 0
				}
				tail := sb.String()[tailStart:]

				// Handle pagination prompts — check tail only
				if vc.PaginationPattern != nil && vc.PaginationPattern.MatchString(tail) {
					fmt.Fprint(stdin, vc.PaginationSend)
					stableCount = 0
					lastLen = currentLen
					continue
				}

				// Note: banner detection is intentionally NOT done here (Phase 4).
				// Banners are only dismissed in Phase 1 (initial connection).
				// Checking BannerPattern during command output can cause false-positive
				// matches on config lines that happen to contain banner-like words.

				if currentLen == lastLen {
					stableCount++
					if stableCount >= 10 && hasTerminalPrompt(vc.PromptPattern, tail) {
						return
					}
					if stableCount >= 30 && configOutputLooksComplete(command, tail) {
						return
					}
					if stableCount >= 50 {
						return
					}
				} else {
					stableCount = 0
					lastLen = currentLen
				}
			}
		}
	}()
	<-done

	stdin.Close()
	// Don't block on sess.Wait() — some devices don't cleanly close
	waitDone := make(chan error, 1)
	go func() { waitDone <- sess.Wait() }()
	select {
	case <-waitDone:
	case <-time.After(3 * time.Second):
	}

	return CleanOutput(sb.String()), nil
}

// CleanOutput removes ANSI codes, control characters, and normalizes line endings
func CleanOutput(raw string) string {
	// Remove all ANSI/terminal control sequences
	cleaned := ansiPattern.ReplaceAllString(raw, "")

	// Normalize line endings
	cleaned = strings.ReplaceAll(cleaned, "\r\n", "\n")
	cleaned = strings.ReplaceAll(cleaned, "\r", "\n")

	// Clean each line: remove trailing whitespace and invisible chars
	lines := strings.Split(cleaned, "\n")
	var result []string
	for _, line := range lines {
		trimmed := strings.TrimRight(line, " \t\x00\x0f\x0e")
		result = append(result, trimmed)
	}

	// Remove pagination artifacts (lines that are just spaces from "-- MORE --" clearing)
	var finalLines []string
	emptyRun := 0
	for _, line := range result {
		if strings.TrimSpace(line) == "" {
			emptyRun++
			// Collapse runs of more than 2 blank lines
			if emptyRun <= 2 {
				finalLines = append(finalLines, line)
			}
		} else {
			emptyRun = 0
			finalLines = append(finalLines, line)
		}
	}

	return strings.TrimSpace(strings.Join(finalLines, "\n"))
}

func hasTerminalPrompt(re *regexp.Regexp, text string) bool {
	if re == nil {
		return false
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}
	lines := strings.Split(trimmed, "\n")
	last := strings.TrimSpace(lines[len(lines)-1])
	return re.MatchString(last)
}

func configOutputLooksComplete(command, tail string) bool {
	last := strings.TrimSpace(tail)
	if last == "" {
		return false
	}
	lower := strings.ToLower(last)
	if strings.Contains(lower, strings.ToLower(command)) {
		return false
	}
	markers := []string{"\nend", "\nreturn", "\nexit", "\n#", "\n>"}
	for _, marker := range markers {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}
