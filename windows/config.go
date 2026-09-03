package main

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Config is everything the user can set. Lifespan is deliberately absent.
type Config struct {
	Birth      time.Time
	Strip      bool
	Moment     bool
	QuietHours []HourRange
}

// HourRange is a daily window in minutes since midnight, end exclusive.
// A range that crosses midnight (22:00-06:00) is allowed.
type HourRange struct{ Start, End int }

// Contains reports whether the minute-of-day t falls inside the range.
func (r HourRange) Contains(t int) bool {
	if r.Start <= r.End {
		return t >= r.Start && t < r.End
	}
	return t >= r.Start || t < r.End
}

// DefaultConfigText is written on first run. Comments are for the user.
const DefaultConfigText = `# Final Days
# Every day left is one of your final days.
#
# birth is the only number that matters. Lifespan is fixed at 80 years.

birth = ""                  # your date of birth, YYYY-MM-DD, for example "1996-01-01"
strip = true                # the 4 px life bar along the top of the screen
moment = true               # the once-a-day full-screen reminder
quiet_hours = ""            # strip turns grey in these ranges, e.g. "09:00-12:00, 14:00-17:00"
`

// ErrNoBirth is returned while birth is still empty (first run).
var ErrNoBirth = errors.New("birth is not set")

// ParseConfig reads the flat TOML subset described in SPEC.md.
func ParseConfig(text string) (Config, error) {
	cfg := Config{Strip: true, Moment: true}
	kv, err := parseFlat(text)
	if err != nil {
		return cfg, err
	}
	if v, ok := kv["strip"]; ok {
		if cfg.Strip, err = parseBool("strip", v); err != nil {
			return cfg, err
		}
	}
	if v, ok := kv["moment"]; ok {
		if cfg.Moment, err = parseBool("moment", v); err != nil {
			return cfg, err
		}
	}
	if v, ok := kv["quiet_hours"]; ok {
		if cfg.QuietHours, err = ParseHourRanges(v); err != nil {
			return cfg, err
		}
	}
	b := strings.TrimSpace(kv["birth"])
	if b == "" {
		return cfg, ErrNoBirth
	}
	t, err := time.ParseInLocation("2006-01-02", b, time.Local)
	if err != nil {
		return cfg, fmt.Errorf("birth must be YYYY-MM-DD, got %q", b)
	}
	if t.After(time.Now()) {
		return cfg, fmt.Errorf("birth %q is in the future", b)
	}
	cfg.Birth = t
	return cfg, nil
}

// ParseHourRanges parses "09:00-12:00, 14:00-17:00". Empty means none.
func ParseHourRanges(s string) ([]HourRange, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	var out []HourRange
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		a, b, ok := strings.Cut(part, "-")
		if !ok {
			return nil, fmt.Errorf("quiet_hours: %q is not HH:MM-HH:MM", part)
		}
		start, err := parseHHMM(a)
		if err != nil {
			return nil, fmt.Errorf("quiet_hours: %w", err)
		}
		end, err := parseHHMM(b)
		if err != nil {
			return nil, fmt.Errorf("quiet_hours: %w", err)
		}
		out = append(out, HourRange{Start: start, End: end})
	}
	return out, nil
}

// InQuietHours reports whether the given time falls inside any range.
func (c Config) InQuietHours(t time.Time) bool {
	m := t.Hour()*60 + t.Minute()
	for _, r := range c.QuietHours {
		if r.Contains(m) {
			return true
		}
	}
	return false
}

func parseHHMM(s string) (int, error) {
	s = strings.TrimSpace(s)
	h, m, ok := strings.Cut(s, ":")
	if !ok {
		return 0, fmt.Errorf("%q is not HH:MM", s)
	}
	hh, err1 := strconv.Atoi(h)
	mm, err2 := strconv.Atoi(m)
	if err1 != nil || err2 != nil || hh < 0 || hh > 24 || mm < 0 || mm > 59 || (hh == 24 && mm != 0) {
		return 0, fmt.Errorf("%q is not HH:MM", s)
	}
	return hh*60 + mm, nil
}

func parseBool(key, v string) (bool, error) {
	switch strings.TrimSpace(v) {
	case "true":
		return true, nil
	case "false":
		return false, nil
	}
	return false, fmt.Errorf("%s must be true or false, got %q", key, v)
}

// parseFlat turns `key = value` lines into a map. Strings lose their quotes,
// everything else is kept verbatim. Comments start with # outside quotes.
func parseFlat(text string) (map[string]string, error) {
	kv := map[string]string{}
	for i, raw := range strings.Split(text, "\n") {
		line := stripComment(raw)
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			return nil, fmt.Errorf("line %d: expected key = value", i+1)
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if len(v) >= 2 && v[0] == '"' && v[len(v)-1] == '"' {
			v = v[1 : len(v)-1]
		}
		kv[k] = v
	}
	return kv, nil
}

func stripComment(line string) string {
	inQuote := false
	for i, ch := range line {
		switch ch {
		case '"':
			inQuote = !inQuote
		case '#':
			if !inQuote {
				return line[:i]
			}
		}
	}
	return line
}

// State is the small runtime record kept next to the executable.
type State struct {
	LastMoment string // YYYY-MM-DD of the last shown moment, "" if never
}

// ParseState reads final-days.state; a missing or broken file is an empty state.
func ParseState(text string) State {
	kv, err := parseFlat(text)
	if err != nil {
		return State{}
	}
	return State{LastMoment: strings.TrimSpace(kv["last_moment"])}
}

// Text renders the state file.
func (s State) Text() string {
	return "last_moment = \"" + s.LastMoment + "\"\n"
}

// ShownOn reports whether the moment was already shown on the given day.
func (s State) ShownOn(day time.Time) bool {
	return s.LastMoment == day.Format("2006-01-02")
}
