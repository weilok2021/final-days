//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// "Start with Windows" is one shortcut in the user's Startup folder, nothing else.

// startupShortcutPath asks the shell for the Startup folder rather than
// building it from %APPDATA%: the environment can be empty or redirected, and
// this is the folder Windows actually runs at sign-in.
func startupShortcutPath() (string, error) {
	dir, err := windows.KnownFolderPath(windows.FOLDERID_Startup, 0)
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Final Days.lnk"), nil
}

func startupEnabled() bool {
	p, err := startupShortcutPath()
	if err != nil {
		return false
	}
	_, err = os.Stat(p)
	return err == nil
}

func setStartup(on bool) error {
	p, err := startupShortcutPath()
	if err != nil {
		return fmt.Errorf("could not find the Startup folder: %w", err)
	}
	if !on {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return createShortcut(p, exe, filepath.Dir(exe), "Final Days")
}

var (
	clsidShellLink  = windows.GUID{Data1: 0x00021401, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidIShellLinkW  = windows.GUID{Data1: 0x000214F9, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidIPersistFile = windows.GUID{Data1: 0x0000010b, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
)

// comObject is the first word of any COM interface pointer: its vtable.
type comObject struct{ vtbl *[64]uintptr }

// comCall invokes a vtable slot. uintptrescapes keeps any pointer arguments
// converted in the call expression alive and pinned until the call returns.
//
//go:uintptrescapes
func comCall(obj *comObject, index int, args ...uintptr) uintptr {
	all := append([]uintptr{uintptr(unsafe.Pointer(obj))}, args...)
	r, _, _ := syscall.SyscallN(obj.vtbl[index], all...)
	return r
}

func failed(hr uintptr) bool { return int32(hr) < 0 }

// createShortcut writes a .lnk via IShellLinkW and IPersistFile.
func createShortcut(lnk, target, workDir, desc string) error {
	pCoInitializeEx.Call(0, coinitApartmentThreaded)
	var psl *comObject
	hr, _, _ := pCoCreateInstance.Call(uintptr(unsafe.Pointer(&clsidShellLink)), 0, clsctxInprocServer, uintptr(unsafe.Pointer(&iidIShellLinkW)), uintptr(unsafe.Pointer(&psl)))
	if failed(hr) || psl == nil {
		return fmt.Errorf("could not create shell link (0x%08x)", uint32(hr))
	}
	defer comCall(psl, 2)                                                           // Release
	if hr := comCall(psl, 20, uintptr(unsafe.Pointer(utf16(target)))); failed(hr) { // SetPath
		return fmt.Errorf("could not set shortcut target (0x%08x)", uint32(hr))
	}
	comCall(psl, 9, uintptr(unsafe.Pointer(utf16(workDir)))) // SetWorkingDirectory
	comCall(psl, 7, uintptr(unsafe.Pointer(utf16(desc))))    // SetDescription
	var ppf *comObject
	if hr := comCall(psl, 0, uintptr(unsafe.Pointer(&iidIPersistFile)), uintptr(unsafe.Pointer(&ppf))); failed(hr) || ppf == nil { // QueryInterface
		return fmt.Errorf("could not get IPersistFile (0x%08x)", uint32(hr))
	}
	defer comCall(ppf, 2)
	if hr := comCall(ppf, 6, uintptr(unsafe.Pointer(utf16(lnk))), 1); failed(hr) { // Save
		return fmt.Errorf("could not save shortcut (0x%08x)", uint32(hr))
	}
	return nil
}
