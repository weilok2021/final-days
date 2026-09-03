//go:build windows

package main

import (
	"log"
	"syscall"
	"unsafe"
)

// strip is the 4 px life bar reserved along the top edge of the primary display.
// It registers as an AppBar so maximised windows start below it.
type strip struct {
	app        *App
	hwnd       uintptr
	tip        uintptr
	height     int32
	registered bool
	tracking   bool
}

const abCallbackMsg = wmUser + 1

var stripProcPtr, tipProcPtr uintptr

func newStrip(app *App) (*strip, error) {
	s := &strip{app: app, height: scale(4)}
	if stripProcPtr == 0 {
		stripProcPtr = syscall.NewCallback(func(hwnd, m, wp, lp uintptr) uintptr {
			if app.strip == nil {
				return defWindowProc(hwnd, m, wp, lp)
			}
			return app.strip.proc(hwnd, m, wp, lp)
		})
		tipProcPtr = syscall.NewCallback(func(hwnd, m, wp, lp uintptr) uintptr {
			if app.strip == nil {
				return defWindowProc(hwnd, m, wp, lp)
			}
			return app.strip.tipProc(hwnd, m, wp, lp)
		})
		if err := registerClass("FinalDaysStrip", stripProcPtr, 0, csHRedraw|csVRedraw); err != nil {
			return nil, err
		}
		if err := registerClass("FinalDaysTip", tipProcPtr, 0, 0); err != nil {
			return nil, err
		}
	}
	// The window procedure runs during CreateWindowExW, so it must find s here.
	app.strip = s
	var err error
	s.hwnd, err = createWindow(wsExToolWindow|wsExTopmost|wsExNoActivate, "FinalDaysStrip", "Final Days", wsPopup, 0, 0, 10, s.height)
	if err == nil {
		s.tip, err = createWindow(wsExToolWindow|wsExTopmost|wsExNoActivate, "FinalDaysTip", "", wsPopup, 0, 0, 10, 10)
	}
	if err != nil {
		if s.hwnd != 0 {
			pDestroyWindow.Call(s.hwnd)
		}
		app.strip = nil
		return nil, err
	}
	s.register()
	return s, nil
}

func (s *strip) abd() appBarData {
	a := appBarData{HWnd: s.hwnd, UCallbackMessage: abCallbackMsg}
	a.CbSize = uint32(unsafe.Sizeof(a))
	return a
}

// register asks the shell to reserve the top edge and shows the bar.
func (s *strip) register() {
	if s.registered {
		return
	}
	a := s.abd()
	if r, _, _ := pSHAppBarMessage.Call(abmNew, uintptr(unsafe.Pointer(&a))); r == 0 {
		log.Println("SHAppBarMessage(ABM_NEW) failed; strip will float instead")
	}
	s.registered = true
	s.place()
	pShowWindow.Call(s.hwnd, swShowNoActivate)
	pSetWindowPos.Call(s.hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
}

// unregister gives the space back and hides the bar.
func (s *strip) unregister() {
	if !s.registered {
		return
	}
	a := s.abd()
	pSHAppBarMessage.Call(abmRemove, uintptr(unsafe.Pointer(&a)))
	s.registered = false
	pShowWindow.Call(s.hwnd, swHide)
	s.hideTip()
}

func (s *strip) toggle() {
	if s.registered {
		s.unregister()
	} else {
		s.register()
	}
}

// place negotiates the exact rectangle with the shell and moves the window there.
func (s *strip) place() {
	w := systemMetric(smCXScreen)
	a := s.abd()
	a.UEdge = abeTop
	a.Rc = rect{0, 0, w, s.height}
	pSHAppBarMessage.Call(abmQueryPos, uintptr(unsafe.Pointer(&a)))
	a.Rc.Bottom = a.Rc.Top + s.height
	pSHAppBarMessage.Call(abmSetPos, uintptr(unsafe.Pointer(&a)))
	pMoveWindow.Call(s.hwnd, uintptr(a.Rc.Left), uintptr(a.Rc.Top), uintptr(a.Rc.Right-a.Rc.Left), uintptr(a.Rc.Bottom-a.Rc.Top), 1)
	s.repaint()
}

func (s *strip) repaint() { pInvalidateRect.Call(s.hwnd, 0, 1) }

func (s *strip) proc(hwnd, m, wp, lp uintptr) uintptr {
	switch m {
	case wmPaint:
		var ps paintStruct
		hdc, _, _ := pBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		var rc rect
		pGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&rc)))
		paintLifeBar(hdc, rc, s.app.life.Fraction, s.app.quietNow(), colorref(0xe7, 0xe5, 0xe4))
		pEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		return 0
	case wmErasebkgnd:
		return 1
	case abCallbackMsg:
		switch wp {
		case abnPosChanged:
			s.place()
		case abnFullScreenApp:
			// A full-screen app is in front: drop behind it, like the taskbar does.
			if lp != 0 {
				pSetWindowPos.Call(hwnd, hwndBottom, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
			} else {
				pSetWindowPos.Call(hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
			}
		}
		return 0
	case wmWindowPosChanged:
		if s.registered {
			a := s.abd()
			pSHAppBarMessage.Call(abmWindowPosChanged, uintptr(unsafe.Pointer(&a)))
		}
	case wmDisplayChange, wmSettingChange:
		if s.registered {
			s.place()
		}
	case wmMouseMove:
		if !s.tracking {
			t := trackMouseEvent{DwFlags: tmeLeave, HwndTrack: hwnd}
			t.CbSize = uint32(unsafe.Sizeof(t))
			pTrackMouseEvent.Call(uintptr(unsafe.Pointer(&t)))
			s.tracking = true
			s.showTip()
		}
		return 0
	case wmMouseLeave:
		s.tracking = false
		s.hideTip()
		return 0
	case wmLButtonDown:
		s.app.showMoment(true)
		return 0
	}
	return defWindowProc(hwnd, m, wp, lp)
}

// The hover label: "Day 11,201 of 29,220 · 18,019 days left".

func (s *strip) tipText() string {
	l := s.app.life
	return "Day " + FormatInt(l.Lived) + " of " + FormatInt(l.Total) + "  ·  " + FormatInt(l.Left) + " days left"
}

func (s *strip) showTip() {
	var pt point
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	hdc, _, _ := pGetDC.Call(s.tip)
	font := createFont(scale(13), fwNormal, false, "Segoe UI")
	old, _, _ := pSelectObject.Call(hdc, font)
	rc := rect{}
	drawText(hdc, s.tipText(), &rc, dtCalcRect|dtSingleLine)
	pSelectObject.Call(hdc, old)
	pDeleteObject.Call(font)
	pReleaseDC.Call(s.tip, hdc)
	padX, padY := scale(10), scale(6)
	w, h := rc.Right+2*padX, rc.Bottom+2*padY
	x := pt.X - w/2
	if x < 0 {
		x = 0
	}
	if maxX := systemMetric(smCXScreen) - w; x > maxX {
		x = maxX
	}
	y := s.height + scale(6)
	pSetWindowPos.Call(s.tip, hwndTopmost, uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoActivate|swpShowWindow)
	pInvalidateRect.Call(s.tip, 0, 1)
}

func (s *strip) hideTip() { pShowWindow.Call(s.tip, swHide) }

func (s *strip) tipProc(hwnd, m, wp, lp uintptr) uintptr {
	switch m {
	case wmPaint:
		var ps paintStruct
		hdc, _, _ := pBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		var rc rect
		pGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&rc)))
		fillRect(hdc, rc, colorref(0x1f, 0x24, 0x30))
		font := createFont(scale(13), fwNormal, false, "Segoe UI")
		old, _, _ := pSelectObject.Call(hdc, font)
		pSetBkMode.Call(hdc, bkTransparent)
		pSetTextColor.Call(hdc, colorref(0xff, 0xff, 0xff))
		drawText(hdc, s.tipText(), &rc, dtCenter|dtVCenter|dtSingleLine)
		pSelectObject.Call(hdc, old)
		pDeleteObject.Call(font)
		pEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		return 0
	case wmErasebkgnd:
		return 1
	}
	return defWindowProc(hwnd, m, wp, lp)
}
