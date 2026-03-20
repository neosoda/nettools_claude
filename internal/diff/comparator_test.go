package diff

import "testing"

func TestCompareHonorsOptions(t *testing.T) {
	result, err := Compare("hostname SW1\nntp clock-period 1\n", "HOSTNAME   sw1\nntp clock-period 2\n", CompareOptions{
		IgnoreCase: true, IgnoreWhitespace: true, IgnorePatterns: []string{"^ntp clock-period"}, TrimTrailing: true,
	})
	if err != nil {
		t.Fatalf("compare failed: %v", err)
	}
	if result.Added != 0 || result.Removed != 0 {
		t.Fatalf("expected no diff, got %+v", result)
	}
}
