//go:build windows

package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// Hand-declared Win32 entry points. Only what Final Days uses, nothing more.
var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	gdi32    = windows.NewLazySystemDLL("gdi32.dll")
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	msimg32  = windows.NewLazySystemDLL("msimg32.dll")
	wtsapi32 = windows.NewLazySystemDLL("wtsapi32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")
	ole32    = windows.NewLazySystemDLL("ole32.dll")

	pRegisterClassExW              = user32.NewProc("RegisterClassExW")
	pCreateWindowExW               = user32.NewProc("CreateWindowExW")
	pDefWindowProcW                = user32.NewProc("DefWindowProcW")
	pGetMessageW                   = user32.NewProc("GetMessageW")
	pTranslateMessage              = user32.NewProc("TranslateMessage")
	pDispatchMessageW              = user32.NewProc("DispatchMessageW")
	pPostQuitMessage               = user32.NewProc("PostQuitMessage")
	pPostMessageW                  = user32.NewProc("PostMessageW")
	pShowWindow                    = user32.NewProc("ShowWindow")
	pSetWindowPos                  = user32.NewProc("SetWindowPos")
	pMoveWindow                    = user32.NewProc("MoveWindow")
	pDestroyWindow                 = user32.NewProc("DestroyWindow")
	pInvalidateRect                = user32.NewProc("InvalidateRect")
	pBeginPaint                    = user32.NewProc("BeginPaint")
	pEndPaint                      = user32.NewProc("EndPaint")
	pFillRect                      = user32.NewProc("FillRect")
	pGetClientRect                 = user32.NewProc("GetClientRect")
	pGetSystemMetrics              = user32.NewProc("GetSystemMetrics")
	pSetTimer                      = user32.NewProc("SetTimer")
	pKillTimer                     = user32.NewProc("KillTimer")
	pLoadCursorW                   = user32.NewProc("LoadCursorW")
	pRegisterHotKey                = user32.NewProc("RegisterHotKey")
	pTrackMouseEvent               = user32.NewProc("TrackMouseEvent")
	pGetCursorPos                  = user32.NewProc("GetCursorPos")
	pCreatePopupMenu               = user32.NewProc("CreatePopupMenu")
	pAppendMenuW                   = user32.NewProc("AppendMenuW")
	pTrackPopupMenu                = user32.NewProc("TrackPopupMenu")
	pDestroyMenu                   = user32.NewProc("DestroyMenu")
	pSetForegroundWindow           = user32.NewProc("SetForegroundWindow")
	pSetFocus                      = user32.NewProc("SetFocus")
	pDrawTextW                     = user32.NewProc("DrawTextW")
	pRegisterWindowMessageW        = user32.NewProc("RegisterWindowMessageW")
	pSetProcessDpiAwarenessContext = user32.NewProc("SetProcessDpiAwarenessContext")
	pGetDpiForSystem               = user32.NewProc("GetDpiForSystem")
	pGetLastInputInfo              = user32.NewProc("GetLastInputInfo")
	pCreateIconIndirect            = user32.NewProc("CreateIconIndirect")
	pDestroyIcon                   = user32.NewProc("DestroyIcon")
	pMessageBoxW                   = user32.NewProc("MessageBoxW")
	pGetDC                         = user32.NewProc("GetDC")
	pReleaseDC                     = user32.NewProc("ReleaseDC")

	pCreateSolidBrush = gdi32.NewProc("CreateSolidBrush")
	pDeleteObject     = gdi32.NewProc("DeleteObject")
	pCreateFontW      = gdi32.NewProc("CreateFontW")
	pSelectObject     = gdi32.NewProc("SelectObject")
	pSetBkMode        = gdi32.NewProc("SetBkMode")
	pSetTextColor     = gdi32.NewProc("SetTextColor")
	pCreateDIBSection = gdi32.NewProc("CreateDIBSection")
	pCreateBitmap     = gdi32.NewProc("CreateBitmap")

	pGradientFill      = msimg32.NewProc("GradientFill")
	pSHAppBarMessage   = shell32.NewProc("SHAppBarMessage")
	pShell_NotifyIconW = shell32.NewProc("Shell_NotifyIconW")
	pShellExecuteW     = shell32.NewProc("ShellExecuteW")

	pWTSRegisterSessionNotification   = wtsapi32.NewProc("WTSRegisterSessionNotification")
	pWTSUnRegisterSessionNotification = wtsapi32.NewProc("WTSUnRegisterSessionNotification")

	pGetTickCount     = kernel32.NewProc("GetTickCount")
	pGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")

	pCoInitializeEx   = ole32.NewProc("CoInitializeEx")
	pCoCreateInstance = ole32.NewProc("CoCreateInstance")
)

const (
	wsPopup = 0x80000000

	wsExToolWindow = 0x00000080
	wsExTopmost    = 0x00000008
	wsExNoActivate = 0x08000000

	wmNull             = 0x0000
	wmDestroy          = 0x0002
	wmPaint            = 0x000F
	wmErasebkgnd       = 0x0014
	wmSettingChange    = 0x001A
	wmWindowPosChanged = 0x0047
	wmContextMenu      = 0x007B
	wmDisplayChange    = 0x007E
	wmKeyDown          = 0x0100
	wmTimer            = 0x0113
	wmMouseMove        = 0x0200
	wmLButtonDown      = 0x0201
	wmLButtonDblClk    = 0x0203
	wmRButtonDown      = 0x0204
	wmMouseLeave       = 0x02A3
	wmWTSSessionChange = 0x02B1
	wmHotkey           = 0x0312
	wmUser             = 0x0400
	wmApp              = 0x8000

	swHide           = 0
	swShowNoActivate = 4
	swShow           = 5

	swpNoSize     = 0x0001
	swpNoMove     = 0x0002
	swpNoActivate = 0x0010
	swpShowWindow = 0x0040

	smCXScreen = 0
	smCYScreen = 1
	smCXSmIcon = 49
	smCYSmIcon = 50

	abmNew              = 0
	abmRemove           = 1
	abmQueryPos         = 2
	abmSetPos           = 3
	abmWindowPosChanged = 9
	abeTop              = 1
	abnPosChanged       = 1
	abnFullScreenApp    = 2

	gradientFillRectH = 0

	nimAdd        = 0
	nimModify     = 1
	nimDelete     = 2
	nimSetVersion = 4
	nifMessage    = 0x01
	nifIcon       = 0x02
	nifTip        = 0x04
	nifShowTip    = 0x80
	notifyIconV4  = 4
	ninSelect     = wmUser + 0

	mfString    = 0x0000
	mfGrayed    = 0x0001
	mfChecked   = 0x0008
	mfSeparator = 0x0800

	tpmRightButton = 0x0002
	tpmReturnCmd   = 0x0100
	tpmNoNotify    = 0x0080

	modAlt      = 0x0001
	modControl  = 0x0002
	modNoRepeat = 0x4000

	tmeLeave = 0x00000002

	dtLeft       = 0x0000
	dtCenter     = 0x0001
	dtVCenter    = 0x0004
	dtSingleLine = 0x0020
	dtNoClip     = 0x0100
	dtCalcRect   = 0x0400

	bkTransparent = 1

	fwNormal   = 400
	fwSemibold = 600

	defaultCharset   = 1
	clearTypeQuality = 5

	wtsSessionUnlock     = 0x8
	notifyForThisSession = 0

	idcArrow = 32512

	csHRedraw = 0x0002
	csVRedraw = 0x0001
	csDblClks = 0x0008

	biRGB        = 0
	dibRGBColors = 0

	mbOK          = 0x00000000
	mbRetryCancel = 0x00000005
	mbIconInfo    = 0x00000040
	mbIconError   = 0x00000010
	idCancel      = 2

	coinitApartmentThreaded = 0x2
	clsctxInprocServer      = 0x1
)

var (
	hwndTopmost = ^uintptr(0) // (HWND)-1
	hwndBottom  = uintptr(1)  // (HWND)1
	dpiPerMonV2 = ^uintptr(3) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
)

type rect struct{ Left, Top, Right, Bottom int32 }
type point struct{ X, Y int32 }

type wndClassEx struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     uintptr
	HIcon         uintptr
	HCursor       uintptr
	HbrBackground uintptr
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       uintptr
}

type msg struct {
	HWnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      point
}

type paintStruct struct {
	Hdc         uintptr
	FErase      int32
	RcPaint     rect
	FRestore    int32
	FIncUpdate  int32
	RgbReserved [32]byte
}

type appBarData struct {
	CbSize           uint32
	HWnd             uintptr
	UCallbackMessage uint32
	UEdge            uint32
	Rc               rect
	LParam           uintptr
}

type triVertex struct {
	X, Y                    int32
	Red, Green, Blue, Alpha uint16
}

type gradientRect struct{ UpperLeft, LowerRight uint32 }

type trackMouseEvent struct {
	CbSize      uint32
	DwFlags     uint32
	HwndTrack   uintptr
	DwHoverTime uint32
}

type notifyIconData struct {
	CbSize           uint32
	HWnd             uintptr
	UID              uint32
	UFlags           uint32
	UCallbackMessage uint32
	HIcon            uintptr
	SzTip            [128]uint16
	DwState          uint32
	DwStateMask      uint32
	SzInfo           [256]uint16
	UVersion         uint32
	SzInfoTitle      [64]uint16
	DwInfoFlags      uint32
	GuidItem         windows.GUID
	HBalloonIcon     uintptr
}

type iconInfo struct {
	FIcon    int32
	XHotspot uint32
	YHotspot uint32
	HbmMask  uintptr
	HbmColor uintptr
}

type bitmapInfoHeader struct {
	BiSize          uint32
	BiWidth         int32
	BiHeight        int32
	BiPlanes        uint16
	BiBitCount      uint16
	BiCompression   uint32
	BiSizeImage     uint32
	BiXPelsPerMeter int32
	BiYPelsPerMeter int32
	BiClrUsed       uint32
	BiClrImportant  uint32
}

type bitmapInfo struct {
	Header bitmapInfoHeader
	Colors [1]uint32
}

type lastInputInfo struct {
	CbSize uint32
	DwTime uint32
}

// colorref packs r, g, b the way GDI wants them (0x00BBGGRR).
func colorref(r, g, b uint8) uintptr { return uintptr(r) | uintptr(g)<<8 | uintptr(b)<<16 }

func utf16(s string) *uint16 {
	p, err := windows.UTF16PtrFromString(s)
	if err != nil {
		p, _ = windows.UTF16PtrFromString("?")
	}
	return p
}

func registerClass(name string, proc uintptr, background uintptr, style uint32) error {
	cursor, _, _ := pLoadCursorW.Call(0, idcArrow)
	wc := wndClassEx{
		Style:         style,
		LpfnWndProc:   proc,
		HInstance:     hInstance(),
		HCursor:       cursor,
		HbrBackground: background,
		LpszClassName: utf16(name),
	}
	wc.CbSize = uint32(unsafe.Sizeof(wc))
	if r, _, err := pRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		return err
	}
	return nil
}

func hInstance() uintptr {
	h, _, _ := pGetModuleHandleW.Call(0)
	return h
}

func createWindow(exStyle uint32, class, title string, style uint32, x, y, w, h int32) (uintptr, error) {
	r, _, err := pCreateWindowExW.Call(uintptr(exStyle), uintptr(unsafe.Pointer(utf16(class))), uintptr(unsafe.Pointer(utf16(title))), uintptr(style),
		uintptr(x), uintptr(y), uintptr(w), uintptr(h), 0, 0, hInstance(), 0)
	if r == 0 {
		return 0, err
	}
	return r, nil
}

func defWindowProc(hwnd, m, wp, lp uintptr) uintptr {
	r, _, _ := pDefWindowProcW.Call(hwnd, m, wp, lp)
	return r
}

func systemMetric(i int) int32 {
	r, _, _ := pGetSystemMetrics.Call(uintptr(i))
	return int32(r)
}

func fillRect(hdc uintptr, r rect, color uintptr) {
	brush, _, _ := pCreateSolidBrush.Call(color)
	pFillRect.Call(hdc, uintptr(unsafe.Pointer(&r)), brush)
	pDeleteObject.Call(brush)
}

// paintLifeBar draws the shared gradient into r and greys out the unlived part.
// quiet paints the lived part flat grey instead of the gradient.
func paintLifeBar(hdc uintptr, r rect, fraction float64, quiet bool, restColor uintptr) {
	w := r.Right - r.Left
	if w <= 0 {
		return
	}
	if quiet {
		fillRect(hdc, r, colorref(0x6b, 0x72, 0x80))
	} else {
		mid := r.Left + w/2
		c16 := func(v uint8) uint16 { return uint16(v) << 8 }
		vs := [4]triVertex{
			{X: r.Left, Y: r.Top, Red: c16(0x16), Green: c16(0xa3), Blue: c16(0x4a)},
			{X: mid, Y: r.Bottom, Red: c16(0xea), Green: c16(0xb3), Blue: c16(0x08)},
			{X: mid, Y: r.Top, Red: c16(0xea), Green: c16(0xb3), Blue: c16(0x08)},
			{X: r.Right, Y: r.Bottom, Red: c16(0xdc), Green: c16(0x26), Blue: c16(0x26)},
		}
		gr := [2]gradientRect{{0, 1}, {2, 3}}
		pGradientFill.Call(hdc, uintptr(unsafe.Pointer(&vs[0])), 4, uintptr(unsafe.Pointer(&gr[0])), 2, gradientFillRectH)
	}
	fx := r.Left + int32(float64(w)*fraction+0.5)
	if fx < r.Right {
		fillRect(hdc, rect{fx, r.Top, r.Right, r.Bottom}, restColor)
	}
}

func createFont(height int32, weight int32, italic bool, face string) uintptr {
	it := uintptr(0)
	if italic {
		it = 1
	}
	f, _, _ := pCreateFontW.Call(uintptr(int64(-height)), 0, 0, 0, uintptr(weight), it, 0, 0,
		defaultCharset, 0, 0, clearTypeQuality, 0, uintptr(unsafe.Pointer(utf16(face))))
	return f
}

func drawText(hdc uintptr, s string, r *rect, flags uint32) {
	u, _ := windows.UTF16FromString(s)
	pDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u[0])), uintptr(len(u)-1), uintptr(unsafe.Pointer(r)), uintptr(flags))
}

func messageBox(text, caption string, flags uint32) int {
	r, _, _ := pMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16(text))), uintptr(unsafe.Pointer(utf16(caption))), uintptr(flags))
	return int(r)
}

func shellOpen(path, args string) bool {
	var a uintptr
	if args != "" {
		a = uintptr(unsafe.Pointer(utf16(args)))
	}
	r, _, _ := pShellExecuteW.Call(0, uintptr(unsafe.Pointer(utf16("open"))), uintptr(unsafe.Pointer(utf16(path))), a, 0, swShow)
	return r > 32
}

func idleMillis() uint32 {
	var lii lastInputInfo
	lii.CbSize = uint32(unsafe.Sizeof(lii))
	if r, _, _ := pGetLastInputInfo.Call(uintptr(unsafe.Pointer(&lii))); r == 0 {
		return 0
	}
	now, _, _ := pGetTickCount.Call()
	return uint32(now) - lii.DwTime
}

func systemDPI() int32 {
	if pGetDpiForSystem.Find() != nil {
		return 96
	}
	r, _, _ := pGetDpiForSystem.Call()
	if r == 0 {
		return 96
	}
	return int32(r)
}

// scale converts a 96-dpi pixel value to the current system DPI.
func scale(px int32) int32 {
	v := (px*systemDPI() + 48) / 96
	if v < 1 {
		v = 1
	}
	return v
}
