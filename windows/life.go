package main

import (
	"math"
	"strconv"
	"time"
)

// LifespanYears is fixed by the spec. It is a constant, not a setting.
const LifespanYears = 80

// TotalDays is 80 years expressed in days: 80 × 365.25, rounded.
func TotalDays() int { return int(math.Round(LifespanYears * 365.25)) }

// Life is the state of one person's bar on a given day.
type Life struct {
	Lived    int
	Left     int
	Total    int
	Fraction float64
}

// ComputeLife counts whole calendar days from birth to now, both taken as local
// dates, so daylight-saving shifts never produce an off-by-one.
func ComputeLife(birth, now time.Time) Life {
	b := time.Date(birth.Year(), birth.Month(), birth.Day(), 0, 0, 0, 0, time.UTC)
	n := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	lived := int(n.Sub(b).Hours() / 24)
	if lived < 0 {
		lived = 0
	}
	total := TotalDays()
	left := total - lived
	if left < 0 {
		left = 0
	}
	frac := float64(lived) / float64(total)
	if frac > 1 {
		frac = 1
	}
	return Life{Lived: lived, Left: left, Total: total, Fraction: frac}
}

// FormatInt renders 18271 as "18,271".
func FormatInt(n int) string {
	s := strconv.Itoa(n)
	if n < 0 {
		return "-" + FormatInt(-n)
	}
	if len(s) <= 3 {
		return s
	}
	out := make([]byte, 0, len(s)+len(s)/3)
	pre := len(s) % 3
	if pre > 0 {
		out = append(out, s[:pre]...)
	}
	for i := pre; i < len(s); i += 3 {
		if len(out) > 0 {
			out = append(out, ',')
		}
		out = append(out, s[i:i+3]...)
	}
	return string(out)
}

// Question is the one sentence the moment asks. Ports share this wording.
func Question(left int) string {
	return "Is today worth one of your remaining " + FormatInt(left) + " days?"
}
