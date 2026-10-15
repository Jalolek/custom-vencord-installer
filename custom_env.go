package main

import (
	"os"
	"path/filepath"
)

// Runs before patcher.go init (alphabetical) so BaseDir uses our data dir.
func init() {
	if customSkip() {
		return
	}

	base := os.Getenv("VENCORD_USER_DATA_DIR")
	if base == "" {
		cfg, err := os.UserConfigDir()
		if err != nil || cfg == "" {
			cfg = os.Getenv("APPDATA")
		}
		if cfg == "" {
			cfg = filepath.Join(os.Getenv("HOME"), ".config")
		}
		base = filepath.Join(cfg, "VencordCustom")
	}

	_ = os.Setenv("VENCORD_USER_DATA_DIR", base)
	_ = os.Setenv("VENCORD_DEV_INSTALL", "1")
}

func customSkip() bool {
	for _, arg := range os.Args[1:] {
		switch arg {
		case "--uninstall", "--install-openasar", "--uninstall-openasar", "--update-self", "--version", "--help":
			return true
		}
	}
	return false
}
