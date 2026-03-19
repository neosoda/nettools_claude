package diff

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/sergi/go-diff/diffmatchpatch"
)

type DiffResult struct {
	Diffs     []DiffLine `json:"diffs"`
	Added     int        `json:"added"`
	Removed   int        `json:"removed"`
	Unchanged int        `json:"unchanged"`
	Summary   string     `json:"summary"`
}

type DiffLine struct {
	Type    string `json:"type"`    // "equal"|"insert"|"delete"
	Content string `json:"content"`
	LineA   int    `json:"line_a"`
	LineB   int    `json:"line_b"`
}

type CompareOptions struct {
	IgnorePatterns    []string // regex patterns for lines to exclude entirely
	IgnoreCase        bool     // case-insensitive comparison
	IgnoreWhitespace  bool     // normalize whitespace differences
	TrimTrailing      bool     // trim trailing whitespace on each line
}

// Compare performs a line-based diff between two texts
func Compare(textA, textB string, opts CompareOptions) (*DiffResult, error) {
	// Normalize line endings
	textA = strings.ReplaceAll(textA, "\r\n", "\n")
	textB = strings.ReplaceAll(textB, "\r\n", "\n")
	textA = strings.ReplaceAll(textA, "\r", "\n")
	textB = strings.ReplaceAll(textB, "\r", "\n")

	// Split into lines for processing
	linesA := strings.Split(textA, "\n")
	linesB := strings.Split(textB, "\n")

	// Apply trim trailing whitespace
	if opts.TrimTrailing {
		linesA = trimLines(linesA)
		linesB = trimLines(linesB)
	}

	// Apply ignore patterns
	linesA = applyIgnore(linesA, opts.IgnorePatterns)
	linesB = applyIgnore(linesB, opts.IgnorePatterns)

	// Normalize whitespace: collapse multiple spaces/tabs to single space
	if opts.IgnoreWhitespace {
		linesA = normalizeWhitespace(linesA)
		linesB = normalizeWhitespace(linesB)
	}

	// Apply case-insensitive comparison
	if opts.IgnoreCase {
		linesA = toLowerLines(linesA)
		linesB = toLowerLines(linesB)
	}

	cleanA := strings.Join(linesA, "\n")
	cleanB := strings.Join(linesB, "\n")

	dmp := diffmatchpatch.New()
	runesA, runesB, lineArray := dmp.DiffLinesToRunes(cleanA, cleanB)
	diffs := dmp.DiffMainRunes(runesA, runesB, false)
	diffs = dmp.DiffCharsToLines(diffs, lineArray)
	diffs = dmp.DiffCleanupSemantic(diffs)

	result := &DiffResult{}
	lineA := 1
	lineB := 1

	for _, d := range diffs {
		lines := strings.Split(d.Text, "\n")
		// Remove trailing empty from split
		if len(lines) > 0 && lines[len(lines)-1] == "" {
			lines = lines[:len(lines)-1]
		}
		for _, line := range lines {
			switch d.Type {
			case diffmatchpatch.DiffEqual:
				result.Unchanged++
				result.Diffs = append(result.Diffs, DiffLine{Type: "equal", Content: line, LineA: lineA, LineB: lineB})
				lineA++
				lineB++
			case diffmatchpatch.DiffInsert:
				result.Added++
				result.Diffs = append(result.Diffs, DiffLine{Type: "insert", Content: line, LineB: lineB})
				lineB++
			case diffmatchpatch.DiffDelete:
				result.Removed++
				result.Diffs = append(result.Diffs, DiffLine{Type: "delete", Content: line, LineA: lineA})
				lineA++
			}
		}
	}

	result.Summary = fmt.Sprintf("+%d -%d =%d lines", result.Added, result.Removed, result.Unchanged)
	return result, nil
}

func applyIgnore(lines []string, patterns []string) []string {
	if len(patterns) == 0 {
		return lines
	}
	compiled := make([]*regexp.Regexp, 0, len(patterns))
	for _, p := range patterns {
		r, err := regexp.Compile(p)
		if err == nil {
			compiled = append(compiled, r)
		}
	}
	var result []string
	for _, line := range lines {
		ignored := false
		for _, r := range compiled {
			if r.MatchString(line) {
				ignored = true
				break
			}
		}
		if !ignored {
			result = append(result, line)
		}
	}
	return result
}

func trimLines(lines []string) []string {
	result := make([]string, len(lines))
	for i, line := range lines {
		result[i] = strings.TrimRight(line, " \t")
	}
	return result
}

func normalizeWhitespace(lines []string) []string {
	wsRe := regexp.MustCompile(`\s+`)
	result := make([]string, len(lines))
	for i, line := range lines {
		result[i] = strings.TrimSpace(wsRe.ReplaceAllString(line, " "))
	}
	return result
}

func toLowerLines(lines []string) []string {
	result := make([]string, len(lines))
	for i, line := range lines {
		result[i] = strings.ToLower(line)
	}
	return result
}
