//go:build windows

package main

import (
	"log"
	"unsafe"

	"golang.org/x/sys/windows"
)

const wmTray = wmApp + 1

const (
	menuTitle = iota + 1
	menuMoment
	menuStrip
	menuStartup
	menuConfig
	menuQuit
)

// tray is the notification-area icon: a miniature of the strip plus a menu.
type tray struct {
	app   *App
	hwnd  uintptr
	icon  uintptr
	added bool
}

func (t *tray) data() notifyIconData {
	var n notifyIconData
	n.CbSize = uint32(unsafe.Sizeof(n))
	n.HWnd = t.hwnd
	n.UID = 1
	return n
}

func (t *tray) tipText() string {
	return "Final Days  ·  " + FormatInt(t.app.life.Left) + " days left"
}

func copyTip(dst *[128]uint16, s string) {
	u, _ := windows.UTF16FromString(s)
	copy(dst[:127], u)
}

func (t *tray) refreshIcon() {
	if t.icon != 0 {
		pDestroyIcon.Call(t.icon)
	}
	t.icon = makeIcon(t.app.life.Fraction, t.app.quietNow())
}

func (t *tray) add() {
	t.refreshIcon()
	n := t.data()
	n.UFlags = nifMessage | nifIcon | nifTip | nifShowTip
	n.UCallbackMessage = wmTray
	n.HIcon = t.icon
	copyTip(&n.SzTip, t.tipText())
	if r, _, _ := pShell_NotifyIconW.Call(nimAdd, uintptr(unsafe.Pointer(&n))); r == 0 {
		log.Println("tray icon could not be added")
		return
	}
	n.UVersion = notifyIconV4
	pShell_NotifyIconW.Call(nimSetVersion, uintptr(unsafe.Pointer(&n)))
	t.added = true
}

func (t *tray) update() {
	if !t.added {
		return
	}
	t.refreshIcon()
	n := t.data()
	n.UFlags = nifIcon | nifTip | nifShowTip
	n.HIcon = t.icon
	copyTip(&n.SzTip, t.tipText())
	pShell_NotifyIconW.Call(nimModify, uintptr(unsafe.Pointer(&n)))
}

func (t *tray) remove() {
	if t.added {
		n := t.data()
		pShell_NotifyIconW.Call(nimDelete, uintptr(unsafe.Pointer(&n)))
		t.added = false
	}
	if t.icon != 0 {
		pDestroyIcon.Call(t.icon)
		t.icon = 0
	}
}

// event decodes a NOTIFYICON_VERSION_4 callback.
func (t *tray) event(wp, lp uintptr) {
	ev := uint32(lp & 0xffff)
	x := int32(int16(wp & 0xffff))
	y := int32(int16((wp >> 16) & 0xffff))
	switch ev {
	case wmContextMenu, ninSelect, ninSelect + 1:
		t.showMenu(x, y)
	case wmLButtonDblClk:
		t.app.showMoment(true)
	}
}

func (t *tray) showMenu(x, y int32) {
	menu, _, _ := pCreatePopupMenu.Call()
	if menu == 0 {
		return
	}
	add := func(id uintptr, flags uintptr, text string) {
		pAppendMenuW.Call(menu, mfString|flags, id, uintptr(unsafe.Pointer(utf16(text))))
	}
	sep := func() { pAppendMenuW.Call(menu, mfSeparator, 0, 0) }
	checked := func(on bool) uintptr {
		if on {
			return mfChecked
		}
		return 0
	}
	add(menuTitle, mfGrayed, FormatInt(t.app.life.Left)+" days left")
	sep()
	add(menuMoment, 0, "Show today's moment")
	add(menuStrip, checked(t.app.strip != nil && t.app.strip.registered), "Life bar\tCtrl+Alt+F")
	add(menuStartup, checked(startupEnabled()), "Start with Windows")
	add(menuConfig, 0, "Open config file")
	sep()
	add(menuQuit, 0, "Quit")

	pSetForegroundWindow.Call(t.hwnd)
	cmd, _, _ := pTrackPopupMenu.Call(menu, tpmRightButton|tpmReturnCmd|tpmNoNotify, uintptr(x), uintptr(y), 0, t.hwnd, 0)
	pPostMessageW.Call(t.hwnd, wmNull, 0, 0)
	pDestroyMenu.Call(menu)
	if cmd != 0 {
		t.app.command(int(cmd))
	}
}

// makeIcon draws the strip in miniature into a 32-bit icon with alpha.
func makeIcon(fraction float64, quiet bool) uintptr {
	cx, cy := systemMetric(smCXSmIcon), systemMetric(smCYSmIcon)
	if cx <= 0 || cy <= 0 {
		cx, cy = 16, 16
	}
	var bmi bitmapInfo
	bmi.Header = bitmapInfoHeader{BiSize: uint32(unsafe.Sizeof(bmi.Header)), BiWidth: cx, BiHeight: -cy, BiPlanes: 1, BiBitCount: 32, BiCompression: biRGB}
	var bits unsafe.Pointer
	hbm, _, _ := pCreateDIBSection.Call(0, uintptr(unsafe.Pointer(&bmi)), dibRGBColors, uintptr(unsafe.Pointer(&bits)), 0, 0)
	if hbm == 0 || bits == nil {
		return 0
	}
	px := unsafe.Slice((*uint32)(bits), int(cx*cy))
	top, bottom := cy*5/16, cy*11/16
	if bottom <= top {
		bottom = top + 1
	}
	fx := int32(float64(cx)*fraction + 0.5)
	for y := int32(0); y < cy; y++ {
		for x := int32(0); x < cx; x++ {
			var c uint32
			if y >= top && y < bottom {
				if x < fx {
					c = barColor(float64(x)/float64(cx-1), quiet)
				} else {
					c = 0xff9ca3af
				}
			}
			px[y*cx+x] = c
		}
	}
	rowBytes := ((cx + 15) / 16) * 2
	maskBits := make([]byte, rowBytes*cy)
	mask, _, _ := pCreateBitmap.Call(uintptr(cx), uintptr(cy), 1, 1, uintptr(unsafe.Pointer(&maskBits[0])))
	ii := iconInfo{FIcon: 1, HbmMask: mask, HbmColor: hbm}
	icon, _, _ := pCreateIconIndirect.Call(uintptr(unsafe.Pointer(&ii)))
	pDeleteObject.Call(hbm)
	pDeleteObject.Call(mask)
	return icon
}

// barColor samples the shared gradient at t in [0,1] as 0xAARRGGBB.
func barColor(t float64, quiet bool) uint32 {
	if quiet {
		return 0xff6b7280
	}
	lerp := func(a, b uint8, u float64) uint32 { return uint32(float64(a) + (float64(b)-float64(a))*u + 0.5) }
	var r, g, b uint32
	if t < 0.5 {
		u := t * 2
		r, g, b = lerp(0x16, 0xea, u), lerp(0xa3, 0xb3, u), lerp(0x4a, 0x08, u)
	} else {
		u := (t - 0.5) * 2
		r, g, b = lerp(0xea, 0xdc, u), lerp(0xb3, 0x26, u), lerp(0x08, 0x26, u)
	}
	return 0xff000000 | r<<16 | g<<8 | b
}
