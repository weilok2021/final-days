//go:build ignore

// mkicon writes icon.png: the life bar on a dark rounded tile.
// Run from the windows/ directory: go run ./winres/mkicon.go
package main

import (
	"image"
	"image/color"
	"image/png"
	"log"
	"os"
)

func lerp(a, b uint8, t float64) uint8 { return uint8(float64(a) + (float64(b)-float64(a))*t + 0.5) }

func barColor(t float64) color.NRGBA {
	if t < 0.5 {
		u := t * 2
		return color.NRGBA{lerp(0x16, 0xea, u), lerp(0xa3, 0xb3, u), lerp(0x4a, 0x08, u), 255}
	}
	u := (t - 0.5) * 2
	return color.NRGBA{lerp(0xea, 0xdc, u), lerp(0xb3, 0x26, u), lerp(0x08, 0x26, u), 255}
}

func main() {
	const n, radius = 256, 48
	img := image.NewNRGBA(image.Rect(0, 0, n, n))
	tile := color.NRGBA{0x1f, 0x24, 0x30, 255}
	rest := color.NRGBA{0x9c, 0xa3, 0xaf, 255}
	inside := func(x, y int) bool {
		cx, cy := x, y
		if x < radius {
			cx = radius
		} else if x >= n-radius {
			cx = n - radius - 1
		}
		if y < radius {
			cy = radius
		} else if y >= n-radius {
			cy = n - radius - 1
		}
		dx, dy := x-cx, y-cy
		return dx*dx+dy*dy <= radius*radius
	}
	barTop, barBottom, pad := n*44/100, n*56/100, n*12/100
	fill := pad + (n-2*pad)*62/100
	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			if !inside(x, y) {
				continue
			}
			c := tile
			if y >= barTop && y < barBottom && x >= pad && x < n-pad {
				if x < fill {
					c = barColor(float64(x-pad) / float64(n-2*pad-1))
				} else {
					c = rest
				}
			}
			img.SetNRGBA(x, y, c)
		}
	}
	f, err := os.Create("winres/icon.png")
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		log.Fatal(err)
	}
}
