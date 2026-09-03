package main

import (
	"testing"
	"time"
)

func TestTotalDays(t *testing.T) {
	if got := TotalDays(); got != 29220 {
		t.Fatalf("TotalDays = %d, want 29220", got)
	}
}

func TestComputeLife(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Kuala_Lumpur")
	birth := time.Date(2000, 1, 1, 0, 0, 0, 0, loc)
	cases := []struct {
		now   time.Time
		lived int
	}{
		{time.Date(2000, 1, 1, 23, 59, 0, 0, loc), 0},
		{time.Date(2000, 1, 2, 0, 0, 1, 0, loc), 1},
		{time.Date(2001, 1, 1, 12, 0, 0, 0, loc), 366}, // 2000 was a leap year
		{time.Date(1999, 6, 1, 0, 0, 0, 0, loc), 0},    // before birth clamps to 0
	}
	for _, c := range cases {
		l := ComputeLife(birth, c.now)
		if l.Lived != c.lived {
			t.Errorf("now=%v lived=%d want %d", c.now, l.Lived, c.lived)
		}
		if l.Left != 29220-c.lived {
			t.Errorf("now=%v left=%d want %d", c.now, l.Left, 29220-c.lived)
		}
	}
	old := ComputeLife(birth, time.Date(2100, 1, 1, 0, 0, 0, 0, loc))
	if old.Left != 0 || old.Fraction != 1 {
		t.Errorf("past lifespan: left=%d fraction=%v, want 0 and 1", old.Left, old.Fraction)
	}
}

func TestFormatInt(t *testing.T) {
	cases := map[int]string{0: "0", 7: "7", 999: "999", 1000: "1,000", 18271: "18,271", 29220: "29,220", 1234567: "1,234,567"}
	for n, want := range cases {
		if got := FormatInt(n); got != want {
			t.Errorf("FormatInt(%d) = %q, want %q", n, got, want)
		}
	}
}

func TestQuestion(t *testing.T) {
	if got := Question(18271); got != "Is today worth one of your remaining 18,271 days?" {
		t.Fatalf("Question = %q", got)
	}
}
