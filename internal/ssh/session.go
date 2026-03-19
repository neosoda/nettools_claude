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
	BackupCommand     map[string]string // "running" -> command
}

var vendorConfigs = map[string]VendorConfig{
	"cisco": {
		PaginationPattern: regexp.MustCompile(`--More--|-- more --`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
	},
	"aruba": {
		PaginationPattern: regexp.MustCompile(`-- MORE --`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
	},
	"allied": {
		PaginationPattern: regexp.MustCompile(`<cr>|Press any key`),
		PaginationSend:    "\n",
		PromptPattern:     regexp.MustCompile(`[#>]\s*$`),
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
	},
	"unknown": {
		PaginationPattern: regexp.MustCompile(`--More--|-- MORE --|Press any key`),
		PaginationSend:    " ",
		PromptPattern:     regexp.MustCompile(`[#>$]\s*$`),
		BackupCommand:     map[string]string{"running": "show running-config", "startup": "show startup-config"},
	},
}

var ansiPattern = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]|\x1b\[[?][0-9;]*[a-zA-Z]|\x0d|\x08`)

// Session represents an SSH session to a network device
type Session struct {
	client  *ssh.Client
	vendor  string
	timeout time.Duration
}

type ConnectParams struct {
	Host         string
	Port         int
	Username     string
	Password     string
	PrivateKey   string
	Vendor       string
	Timeout      time.Duration
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
	}

	addr := fmt.Sprintf("%s:%d", p.Host, p.Port)
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, fmt.Errorf("ssh dial %s: %w", addr, err)
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

	output, err := sess.CombinedOutput(command)
	if err != nil {
		// Some devices return non-zero but still produce output
		if len(output) == 0 {
			return "", fmt.Errorf("command failed: %w", err)
		}
	}

	return cleanOutput(string(output)), nil
}

// RunCommandInteractive runs a command in an interactive shell (handles pagination)
func (s *Session) RunCommandInteractive(ctx context.Context, command string) (string, error) {
	sess, err := s.client.NewSession()
	if err != nil {
		return "", fmt.Errorf("new session: %w", err)
	}
	defer sess.Close()

	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 9600,
		ssh.TTY_OP_OSPEED: 9600,
	}
	if err := sess.RequestPty("vt100", 200, 512, modes); err != nil {
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

	// Wait for shell to be ready (prompt to appear)
	vc := vendorConfigs[s.vendor]
	if _, ok := vendorConfigs[s.vendor]; !ok {
		vc = vendorConfigs["unknown"]
	}

	// Wait until we see the initial prompt before sending the command
	waitReady := time.NewTicker(100 * time.Millisecond)
	readyDeadline := time.After(10 * time.Second)
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
			if vc.PromptPattern.MatchString(strings.TrimSpace(sb.String())) {
				waitReady.Stop()
				break waitLoop
			}
		}
	}

	// Send command
	fmt.Fprintf(stdin, "%s\n", command)

	// Read with timeout and pagination handling
	done := make(chan struct{})
	go func() {
		defer close(done)
		deadline := time.After(s.timeout)
		tick := time.NewTicker(150 * time.Millisecond)
		defer tick.Stop()
		lastLen := 0
		stableCount := 0
		for {
			select {
			case <-ctx.Done():
				return
			case <-deadline:
				return
			case <-tick.C:
				current := sb.String()
				currentLen := len(current)
				// Only check new content for pagination to avoid re-matching old --More--
				if currentLen > lastLen {
					newContent := current[lastLen:]
					if vc.PaginationPattern.MatchString(newContent) {
						fmt.Fprint(stdin, vc.PaginationSend)
						stableCount = 0
						lastLen = currentLen
						continue
					}
				}
				if currentLen == lastLen {
					stableCount++
					// Require 20 stable ticks (3s) AND a prompt at end
					if stableCount >= 20 && vc.PromptPattern.MatchString(strings.TrimSpace(current)) {
						return
					}
					// Safety: return after 40 stable ticks even without prompt
					if stableCount >= 40 {
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
	sess.Wait()

	return cleanOutput(sb.String()), nil
}

func cleanOutput(raw string) string {
	cleaned := ansiPattern.ReplaceAllString(raw, "")
	lines := strings.Split(cleaned, "\n")
	var result []string
	for _, line := range lines {
		trimmed := strings.TrimRight(line, "\r\t ")
		result = append(result, trimmed)
	}
	return strings.TrimSpace(strings.Join(result, "\n"))
}
