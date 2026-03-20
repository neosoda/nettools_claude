package diff

import (
	"fmt"
	"html"
	"regexp"
	"strings"
	"time"

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
	Type    string `json:"type"` // "equal"|"insert"|"delete"
	Content string `json:"content"`
	LineA   int    `json:"line_a"`
	LineB   int    `json:"line_b"`
}

type CompareOptions struct {
	IgnorePatterns   []string // regex patterns for lines to exclude entirely
	IgnoreCase       bool     // case-insensitive comparison
	IgnoreWhitespace bool     // normalize whitespace differences
	TrimTrailing     bool     // trim trailing whitespace on each line
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

// ExportHTML generates a self-contained HTML file representing the diff result.
// The generated file uses an embedded dark theme and requires no external dependencies.
func ExportHTML(result *DiffResult, nameA, nameB string) string {
	var rows strings.Builder
	for _, line := range result.Diffs {
		var cls, sign, numA, numB string
		switch line.Type {
		case "insert":
			cls, sign = "ins", "+"
			numA = "&nbsp;"
			numB = fmt.Sprintf("%d", line.LineB)
		case "delete":
			cls, sign = "del", "-"
			numA = fmt.Sprintf("%d", line.LineA)
			numB = "&nbsp;"
		default:
			cls, sign = "eq", "&nbsp;"
			numA = fmt.Sprintf("%d", line.LineA)
			numB = fmt.Sprintf("%d", line.LineB)
		}
		rows.WriteString(fmt.Sprintf(
			`<tr class="%s"><td class="n">%s</td><td class="n">%s</td><td class="s">%s</td><td class="c">%s</td></tr>`,
			cls, numA, numB, sign, html.EscapeString(line.Content),
		))
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Diff — %s vs %s</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f172a;color:#94a3b8;font-family:monospace;font-size:12px}
.hdr{background:#1e293b;border-bottom:1px solid #334155;padding:16px 24px}
.hdr h1{color:#e2e8f0;font-size:15px;margin-bottom:6px}
.hdr .meta{font-size:11px;color:#64748b;margin-bottom:8px}
.stats{display:flex;gap:20px;font-size:12px}
.add{color:#4ade80}.rem{color:#f87171}.eq{color:#475569}
table{width:100%%;border-collapse:collapse}
td{padding:1px 6px;white-space:pre}
td.n{color:#475569;text-align:right;width:44px;user-select:none;border-right:1px solid #1e293b}
td.s{color:#475569;width:16px;text-align:center;font-weight:700}
td.c{width:100%%}
tr.ins{background:rgba(34,197,94,.08);border-left:2px solid #22c55e}
tr.ins td.s{color:#4ade80}
tr.ins td.c{color:#86efac}
tr.del{background:rgba(239,68,68,.08);border-left:2px solid #ef4444}
tr.del td.s{color:#f87171}
tr.del td.c{color:#fca5a5}
tr.eq{border-left:2px solid transparent}
tr.eq td.c{color:#4b5563}
.ftr{padding:10px 24px;font-size:11px;color:#334155;border-top:1px solid #1e293b;margin-top:4px}
</style>
</head>
<body>
<div class="hdr">
  <h1>Comparaison de configurations</h1>
  <div class="meta">A&nbsp;: <strong style="color:#93c5fd">%s</strong> &nbsp;→&nbsp; B&nbsp;: <strong style="color:#93c5fd">%s</strong></div>
  <div class="stats">
    <span class="add">+%d lignes ajoutées</span>
    <span class="rem">-%d lignes supprimées</span>
    <span class="eq">=%d lignes identiques</span>
  </div>
</div>
<table>%s</table>
<div class="ftr">Généré par NetworkTools le %s</div>
</body>
</html>`,
		html.EscapeString(nameA), html.EscapeString(nameB),
		html.EscapeString(nameA), html.EscapeString(nameB),
		result.Added, result.Removed, result.Unchanged,
		rows.String(),
		time.Now().Format("02/01/2006 à 15:04"),
	)
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
