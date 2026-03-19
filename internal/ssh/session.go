package ssh

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

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
		PaginationPattern: regexp.MustCompile(`(?i)--\s*MORE\s*--|Press any key to continue`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|continue|Press any key to continue`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "no page",
	},
	"hp": {
		PaginationPattern: regexp.MustCompile(`(?i)--\s*MORE\s*--|Press any key to continue`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|continue`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "no page",
	},
	"hpe": {
		PaginationPattern: regexp.MustCompile(`(?i)--\s*MORE\s*--|Press any key to continue`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>%]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|continue`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "display current-configuration", "startup": "display saved-configuration"},
		DisablePaging:     "screen-length disable",
	},
	"allied": {
		PaginationPattern: regexp.MustCompile(`(?i)<cr>|--More--|Press any key`),
		PaginationSend:    "\r",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|Press ENTER`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "terminal length 0",
	},
	"unknown": {
		PaginationPattern: regexp.MustCompile(`(?i)--\s*More\s*--|--\s*MORE\s*--|Press any key|<cr>`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>$%]\s*$`),
		BannerPattern:     regexp.MustCompile(`(?i)press any key|Press RETURN|continue`),
		BannerSend:        "\r",
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
		DisablePaging:     "",
	},
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

	return &Session{client: client, vendor: p.Vendor, timeout: p.Timeout}, nil
}

func (s *Session) Close() {
	if s.client != nil {
		s.client.Close()
	}
}

// RunCommand executes a command and returns cleaned output
func (s *Session) RunCommand(ctx context.Context, command string) (string, error) {
	sess, err := s.client.NewSession()
	if err != nil {
		return "", fmt.Errorf("new session: %w", err)
	}
	defer sess.Close()

	// Set terminal modes for interactive shell
	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := sess.RequestPty("xterm", 200, 200, modes); err != nil {
		// Continue without PTY for non-interactive commands
	}

	// Run with context timeout
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
			if len(result.data) == 0 {
				return "", fmt.Errorf("command failed: %w", result.err)
			}
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

	var sb strings.Builder
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
			if vc.PromptPattern.MatchString(strings.TrimSpace(current)) {
				waitReady.Stop()
				break waitLoop
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
					if stableCount >= 5 && vc.PromptPattern.MatchString(strings.TrimSpace(sb.String())) {
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
				if vc.PaginationPattern.MatchString(tail) {
					fmt.Fprint(stdin, vc.PaginationSend)
					stableCount = 0
					lastLen = currentLen
					continue
				}

				// Handle late banners (some devices show banners mid-stream)
				if vc.BannerPattern != nil && vc.BannerPattern.MatchString(tail) &&
					!vc.PromptPattern.MatchString(strings.TrimSpace(tail)) {
					fmt.Fprint(stdin, vc.BannerSend)
					stableCount = 0
					lastLen = currentLen
					continue
				}

				if currentLen == lastLen {
					stableCount++
					// Require 15 stable ticks (~1.5s) AND a prompt at end
					if stableCount >= 15 && vc.PromptPattern.MatchString(strings.TrimSpace(tail)) {
						return
					}
					// Safety: return after 50 stable ticks (~5s) even without prompt
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
