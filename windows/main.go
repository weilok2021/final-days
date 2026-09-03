//go:build windows

package main

import (
	"errors"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	configFile = "final-days.toml"
	stateFile  = "final-days.state"
	logFile    = "final-days.log"
)

var version = "dev"

var instanceMutex windows.Handle

func main() {
	runtime.LockOSThread()
	dir := exeDir()
	setupLog(dir)
	log.Println("Final Days", version, "starting")

	if !singleInstance() {
		return
	}
	pSetProcessDpiAwarenessContext.Call(dpiPerMonV2)

	cfg, ok := loadConfigInteractive(dir)
	if !ok {
		return
	}
	app := &App{dir: dir, cfg: cfg}
	if text, err := os.ReadFile(filepath.Join(dir, stateFile)); err == nil {
		app.state = ParseState(string(text))
	}
	app.recompute()
	app.lastQuiet = app.quietNow()

	if err := registerClass("FinalDaysMain", syscall.NewCallback(app.proc), 0, 0); err != nil {
		fatal("could not register window class: " + err.Error())
	}
	var err error
	app.hwnd, err = createWindow(0, "FinalDaysMain", "Final Days", 0, 0, 0, 0, 0)
	if err != nil {
		fatal("could not create window: " + err.Error())
	}
	if r, _, _ := pRegisterWindowMessageW.Call(uintptr(unsafe.Pointer(utf16("TaskbarCreated")))); r != 0 {
		app.taskbarCreated = uint32(r)
	}

	app.tray = &tray{app: app, hwnd: app.hwnd}
	app.tray.add()
	if cfg.Strip {
		if _, err := newStrip(app); err != nil {
			log.Println("strip:", err)
		}
	}
	if _, err := newMoment(app); err != nil {
		log.Println("moment:", err)
	}
	pRegisterHotKey.Call(app.hwnd, hotkeyStrip, modControl|modAlt|modNoRepeat, 'F')
	pWTSRegisterSessionNotification.Call(app.hwnd, notifyForThisSession)
	pSetTimer.Call(app.hwnd, timerTick, 30_000, 0)
	if cfg.Moment && !app.state.ShownOn(time.Now()) {
		pSetTimer.Call(app.hwnd, timerFirstMoment, 1200, 0)
	}

	var m msg
	for {
		r, _, _ := pGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			break
		}
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		pDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}

	pWTSUnRegisterSessionNotification.Call(app.hwnd)
	if app.strip != nil {
		app.strip.unregister()
	}
	app.tray.remove()
	log.Println("Final Days stopped")
}

func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	if real, err := filepath.EvalSymlinks(exe); err == nil {
		exe = real
	}
	return filepath.Dir(exe)
}

func setupLog(dir string) {
	f, err := os.OpenFile(filepath.Join(dir, logFile), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		log.SetOutput(io.Discard)
		return
	}
	log.SetOutput(f)
}

func singleInstance() bool {
	h, err := windows.CreateMutex(nil, false, utf16("Local\\FinalDays"))
	if err != nil && errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		messageBox("Final Days is already running. Look for it in the tray.", "Final Days", mbOK|mbIconInfo)
		return false
	}
	instanceMutex = h
	return true
}

func fatal(text string) {
	log.Println(text)
	messageBox(text, "Final Days", mbOK|mbIconError)
	os.Exit(1)
}

// loadConfigInteractive reads final-days.toml, creating and opening it on first
// run, and keeps asking until it parses or the user gives up.
func loadConfigInteractive(dir string) (Config, bool) {
	path := filepath.Join(dir, configFile)
	opened := false
	openIt := func() {
		if opened {
			return
		}
		opened = true
		if !shellOpen(path, "") {
			shellOpen("notepad.exe", path)
		}
	}
	for {
		text, err := os.ReadFile(path)
		if errors.Is(err, fs.ErrNotExist) {
			if werr := os.WriteFile(path, []byte(DefaultConfigText), 0o644); werr != nil {
				fatal("Could not create " + path + ":\n" + werr.Error())
			}
			openIt()
			messageBox("Final Days needs one thing: your date of birth.\n\n"+
				"final-days.toml has been created next to the program and opened for you. Set\n\n"+
				"    birth = \"YYYY-MM-DD\"\n\n"+
				"save the file, then click OK.", "Final Days", mbOK|mbIconInfo)
			continue
		}
		if err != nil {
			fatal("Could not read " + path + ":\n" + err.Error())
		}
		cfg, perr := ParseConfig(string(text))
		if perr == nil {
			return cfg, true
		}
		text2 := "final-days.toml: " + perr.Error() + "\n\nFix the file, save it, then click Retry."
		if errors.Is(perr, ErrNoBirth) {
			text2 = "birth is still empty in final-days.toml.\n\nSet birth = \"YYYY-MM-DD\", save the file, then click Retry."
			openIt()
		}
		if messageBox(text2, "Final Days", mbRetryCancel|mbIconInfo) == idCancel {
			return cfg, false
		}
	}
}
