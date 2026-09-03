package main

import (
	"errors"
	"testing"
	"time"
)

func TestDefaultConfigNeedsBirth(t *testing.T) {
	_, err := ParseConfig(DefaultConfigText)
	if !errors.Is(err, ErrNoBirth) {
		t.Fatalf("want ErrNoBirth, got %v", err)
	}
}

func TestParseConfig(t *testing.T) {
	text := `# comment
birth = "1996-01-01"   # trailing comment
strip = false
moment = true
quiet_hours = "09:00-12:00, 22:00-06:00"
`
	cfg, err := ParseConfig(text)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Birth.Year() != 1996 || cfg.Birth.Month() != 1 || cfg.Birth.Day() != 1 {
		t.Errorf("birth = %v", cfg.Birth)
	}
	if cfg.Strip || !cfg.Moment {
		t.Errorf("strip=%v moment=%v", cfg.Strip, cfg.Moment)
	}
	if len(cfg.QuietHours) != 2 {
		t.Fatalf("quiet hours = %v", cfg.QuietHours)
	}
	at := func(h, m int) time.Time { return time.Date(2026, 9, 3, h, m, 0, 0, time.Local) }
	if !cfg.InQuietHours(at(10, 30)) || cfg.InQuietHours(at(12, 0)) || cfg.InQuietHours(at(13, 0)) {
		t.Error("daytime range wrong")
	}
	if !cfg.InQuietHours(at(23, 0)) || !cfg.InQuietHours(at(3, 0)) || cfg.InQuietHours(at(6, 0)) {
		t.Error("overnight range wrong")
	}
}

func TestParseConfigErrors(t *testing.T) {
	bad := []string{
		`birth = "01/01/1996"`,
		`birth = "2999-01-01"`,
		"birth = \"1996-01-01\"\nstrip = maybe",
		"birth = \"1996-01-01\"\nquiet_hours = \"9-12\"",
		"birth = \"1996-01-01\"\nquiet_hours = \"25:00-26:00\"",
		"birth = \"1996-01-01\"\nnot a pair",
	}
	for _, b := range bad {
		if _, err := ParseConfig(b); err == nil {
			t.Errorf("expected error for %q", b)
		}
	}
}

func TestState(t *testing.T) {
	s := ParseState("last_moment = \"2026-09-03\"\n")
	day := time.Date(2026, 9, 3, 15, 0, 0, 0, time.Local)
	if !s.ShownOn(day) || s.ShownOn(day.AddDate(0, 0, 1)) {
		t.Error("ShownOn wrong")
	}
	if ParseState("").ShownOn(day) {
		t.Error("empty state should not be shown")
	}
	if got := (State{LastMoment: "2026-09-04"}).Text(); got != "last_moment = \"2026-09-04\"\n" {
		t.Errorf("Text = %q", got)
	}
}
