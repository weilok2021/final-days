//go:build windows

package main

import (
	"log"
	"os"
	"path/filepath"
	"time"
)

const (
	timerTick           = 1
	timerFirstCountdown = 2
	hotkeyStrip         = 1
)

// App owns the hidden message window and the three visible pieces.
type App struct {
	dir   string
	cfg   Config
	state State
	life  Life
	hwnd  uintptr

	strip     *strip
	countdown *countdown
	tray      *tray

	today          string
	lastQuiet      bool
	wasIdle        bool
	taskbarCreated uint32
}

func (a *App) quietNow() bool { return a.cfg.InQuietHours(time.Now()) }

func (a *App) recompute() {
	now := time.Now()
	a.life = ComputeLife(a.cfg.Birth, now)
	a.today = now.Format("2006-01-02")
}

func (a *App) markCountdownShown(t time.Time) {
	a.state.LastCountdown = t.Format("2006-01-02")
	if err := os.WriteFile(filepath.Join(a.dir, stateFile), []byte(a.state.Text()), 0o644); err != nil {
		log.Println("state:", err)
	}
}

// showCountdown shows the daily reminder. force bypasses the once-a-day rule.
func (a *App) showCountdown(force bool) {
	if a.countdown == nil {
		return
	}
	if !force && (!a.cfg.Countdown || a.state.ShownOn(time.Now())) {
		return
	}
	a.recompute()
	a.countdown.show()
}

// tick runs every 30 s: day rollover, quiet-hour edges, return-from-idle.
func (a *App) tick() {
	now := time.Now()
	changed := false
	if d := now.Format("2006-01-02"); d != a.today {
		a.recompute()
		changed = true
	}
	if q := a.quietNow(); q != a.lastQuiet {
		a.lastQuiet = q
		changed = true
	}
	if changed {
		if a.strip != nil {
			a.strip.repaint()
		}
		a.tray.update()
	}
	idle := idleMillis()
	switch {
	case idle >= 5*60*1000:
		a.wasIdle = true
	case a.wasIdle && idle < 30*1000:
		a.wasIdle = false
		a.showCountdown(false)
	}
}

func (a *App) toggleStrip() {
	if a.strip == nil {
		s, err := newStrip(a)
		if err != nil {
			log.Println("strip:", err)
			return
		}
		a.strip = s
		return
	}
	a.strip.toggle()
}

func (a *App) openConfig() {
	openTextFile(filepath.Join(a.dir, configFile))
}

func (a *App) command(id int) {
	switch id {
	case menuCountdown:
		a.showCountdown(true)
	case menuStrip:
		a.toggleStrip()
	case menuStartup:
		if err := setStartup(!startupEnabled()); err != nil {
			messageBox(err.Error(), "Final Days", mbOK|mbIconError)
		}
	case menuConfig:
		a.openConfig()
	case menuQuit:
		pDestroyWindow.Call(a.hwnd)
	}
}

func (a *App) proc(hwnd, m, wp, lp uintptr) uintptr {
	switch m {
	case wmTray:
		a.tray.event(wp, lp)
		return 0
	case wmHotkey:
		if wp == hotkeyStrip {
			a.toggleStrip()
		}
		return 0
	case wmTimer:
		switch wp {
		case timerTick:
			a.tick()
		case timerFirstCountdown:
			pKillTimer.Call(hwnd, timerFirstCountdown)
			a.showCountdown(false)
		}
		return 0
	case wmWTSSessionChange:
		if wp == wtsSessionUnlock {
			// Give the desktop a moment to come back before covering it.
			pSetTimer.Call(hwnd, timerFirstCountdown, 1500, 0)
		}
		return 0
	case wmDestroy:
		pPostQuitMessage.Call(0)
		return 0
	}
	if a.taskbarCreated != 0 && m == uintptr(a.taskbarCreated) {
		// Explorer restarted: the icon is gone, put it back. Any process can
		// broadcast this message, so remove first: a spoofed one then re-adds
		// cleanly instead of failing NIM_ADD and disabling the tray for good.
		a.tray.remove()
		a.tray.add()
		return 0
	}
	return defWindowProc(hwnd, m, wp, lp)
}
