package main

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	path "path/filepath"
)

// Prebuilt Vencord + userplugins (filled by buildInstaller.mjs).
//
//go:embed all:vencord_dist
var customDist embed.FS

// Runs after patcher.go init so FilesDir is already set.
func init() {
	if customSkip() {
		return
	}

	if FilesDir == "" {
		fmt.Println("[Custom] ERROR: FilesDir is empty")
		os.Exit(1)
	}

	fmt.Println("[Custom] Extracting embedded Vencord+plugins to", FilesDir)
	if err := os.MkdirAll(FilesDir, 0755); err != nil {
		fmt.Println("[Custom] ERROR: mkdir failed:", err)
		os.Exit(1)
	}

	err := fs.WalkDir(customDist, "vencord_dist", func(name string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}

		rel, err := path.Rel("vencord_dist", name)
		if err != nil {
			return err
		}
		if rel == "." || rel == "" {
			return nil
		}

		data, err := customDist.ReadFile(name)
		if err != nil {
			return err
		}

		out := path.Join(FilesDir, rel)
		if err := os.MkdirAll(path.Dir(out), 0755); err != nil {
			return err
		}
		return os.WriteFile(out, data, 0644)
	})
	if err != nil {
		fmt.Println("[Custom] ERROR: extract failed:", err)
		os.Exit(1)
	}

	patcher := path.Join(FilesDir, "patcher.js")
	if _, err := os.Stat(patcher); err != nil {
		fmt.Println("[Custom] ERROR: embedded patcher.js missing after extract")
		os.Exit(1)
	}

	// Empty package.json prevents Node walking up and picking a bad parent package.json
	_ = os.WriteFile(path.Join(FilesDir, "package.json"), []byte("{}"), 0644)

	fmt.Println("[Custom] Ready - single-exe install of Vencord + all plugins")
}
