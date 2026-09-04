//go:build windows

package main

import (
	"syscall"
	"time"
	"unsafe"
)

// countdown is the once-a-day full-screen reminder.
type countdown struct {
	app     *App
	hwnd    uintptr
	showing bool
}

var countdownProcPtr uintptr

func newCountdown(app *App) (*countdown, error) {
	m := &countdown{app: app}
	if countdownProcPtr == 0 {
		countdownProcPtr = syscall.NewCallback(func(hwnd, msg, wp, lp uintptr) uintptr {
			if app.countdown == nil {
				return defWindowProc(hwnd, msg, wp, lp)
			}
			return app.countdown.proc(hwnd, msg, wp, lp)
		})
		bg, _, _ := pCreateSolidBrush.Call(colorref(0x0b, 0x0d, 0x12))
		if err := registerClass("FinalDaysCountdown", countdownProcPtr, bg, csHRedraw|csVRedraw); err != nil {
			return nil, err
		}
	}
	app.countdown = m
	var err error
	m.hwnd, err = createWindow(wsExToolWindow|wsExTopmost, "FinalDaysCountdown", "Final Days", wsPopup, 0, 0, 10, 10)
	if err != nil {
		app.countdown = nil
		return nil, err
	}
	return m, nil
}

func (m *countdown) show() {
	w, h := systemMetric(smCXScreen), systemMetric(smCYScreen)
	pSetWindowPos.Call(m.hwnd, hwndTopmost, 0, 0, uintptr(w), uintptr(h), swpShowWindow)
	pSetForegroundWindow.Call(m.hwnd)
	pSetFocus.Call(m.hwnd)
	pInvalidateRect.Call(m.hwnd, 0, 1)
	m.showing = true
	m.app.markCountdownShown(time.Now())
}

func (m *countdown) hide() {
	pShowWindow.Call(m.hwnd, swHide)
	m.showing = false
}

func (m *countdown) proc(hwnd, msg, wp, lp uintptr) uintptr {
	switch msg {
	case wmPaint:
		var ps paintStruct
		hdc, _, _ := pBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		m.paint(hdc)
		pEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		return 0
	case wmLButtonDown, wmRButtonDown, wmKeyDown:
		m.hide()
		return 0
	}
	return defWindowProc(hwnd, msg, wp, lp)
}

func (m *countdown) paint(hdc uintptr) {
	var rc rect
	pGetClientRect.Call(m.hwnd, uintptr(unsafe.Pointer(&rc)))
	w, h := rc.Right, rc.Bottom
	l := m.app.life

	paintLifeBar(hdc, rect{0, 0, w, scale(3)}, l.Fraction, false, colorref(0x27, 0x27, 0x2a))

	pSetBkMode.Call(hdc, bkTransparent)
	line := func(text string, centerY, height int32, weight int32, italic bool, color uintptr) {
		font := createFont(height, weight, italic, "Segoe UI")
		old, _, _ := pSelectObject.Call(hdc, font)
		pSetTextColor.Call(hdc, color)
		r := rect{0, centerY - height, w, centerY + height}
		drawText(hdc, text, &r, dtCenter|dtVCenter|dtSingleLine|dtNoClip)
		pSelectObject.Call(hdc, old)
		pDeleteObject.Call(font)
	}

	big := h * 16 / 100
	line(FormatInt(l.Left), h*42/100, big, fwSemibold, false, colorref(0xff, 0xff, 0xff))
	line("days left  ·  day "+FormatInt(l.Lived)+" of "+FormatInt(l.Total), h*42/100+big*68/100, h*2/100, fwNormal, false, colorref(0xa1, 0xa1, 0xa9))
	line(Question(l.Left), h*64/100, h*23/1000, fwNormal, true, colorref(0xe4, 0xe4, 0xe7))
	line("click anywhere to continue", h-h*4/100, h*12/1000, fwNormal, false, colorref(0x52, 0x52, 0x5b))
}
