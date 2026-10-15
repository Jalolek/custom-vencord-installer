//go:build !cli

package main

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	path "path/filepath"
	"runtime"
	"strings"
	"time"

	g "github.com/AllenDang/giu"
)

const PublicPluginsAPI = "https://jalolek.pro/public-plugins.php"

type apiPlugin struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Repo        string  `json:"repo"`
	Pack        *string `json:"pack"`
}

type apiResponse struct {
	OK      bool        `json:"ok"`
	Plugins []apiPlugin `json:"plugins"`
}

type packManifest struct {
	Format      string `json:"format"`
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Version     string `json:"version"`
}

type selectablePlugin struct {
	ID          string
	Name        string
	Description string
	Repo        string
	PackPath    string // local .vencordpack path when custom
	Custom      bool
	On          bool
}

var (
	pluginChoices   []selectablePlugin
	pluginsReady    bool
	pluginsLoadErr  string
	pluginsFetching bool
	customPackMsg   string
)

func init() {
	if customSkip() {
		return
	}
	pluginsFetching = true
	go loadPublicPlugins()
}

func loadPublicPlugins() {
	defer func() {
		pluginsFetching = false
		g.Update()
	}()

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest(http.MethodGet, PublicPluginsAPI, nil)
	if err != nil {
		pluginsLoadErr = err.Error()
		pluginsReady = true
		return
	}
	host, _ := os.Hostname()
	if host == "" {
		host = "unknown"
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Vencord installer/"+host)
	req.Header.Set("X-Client", "Vencord installer")
	req.Header.Set("X-Client-Version", host)

	res, err := client.Do(req)
	if err != nil {
		pluginsLoadErr = err.Error()
		pluginsReady = true
		return
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		pluginsLoadErr = err.Error()
		pluginsReady = true
		return
	}

	var data apiResponse
	if err := json.Unmarshal(body, &data); err != nil {
		pluginsLoadErr = "bad JSON from plugins API"
		pluginsReady = true
		return
	}
	if !data.OK || len(data.Plugins) == 0 {
		pluginsLoadErr = "plugins API returned no plugins"
		pluginsReady = true
		return
	}

	list := make([]selectablePlugin, 0, len(data.Plugins))
	for _, p := range data.Plugins {
		name := p.Name
		if name == "" {
			name = p.ID
		}
		list = append(list, selectablePlugin{
			ID:          p.ID,
			Name:        name,
			Description: p.Description,
			Repo:        p.Repo,
			On:          true,
		})
	}
	pluginChoices = list
	pluginsLoadErr = ""
	pluginsReady = true
}

func pickVencordPackFile() (string, error) {
	if runtime.GOOS != "windows" {
		return "", fmt.Errorf("file picker is Windows-only for now; drop the path in later")
	}

	ps := `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Filter = 'Vencord pack (*.vencordpack)|*.vencordpack|Zip (*.zip)|*.zip|All files (*.*)|*.*'
$d.Title = 'Select a .vencordpack file'
$d.Multiselect = $false
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $d.FileName
}
`
	cmd := exec.Command("powershell", "-NoProfile", "-STA", "-Command", ps)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	p := strings.TrimSpace(string(out))
	if p == "" {
		return "", nil // cancelled
	}
	return p, nil
}

func readPackManifest(packPath string) (*packManifest, error) {
	zr, err := zip.OpenReader(packPath)
	if err != nil {
		return nil, fmt.Errorf("not a valid pack zip: %w", err)
	}
	defer zr.Close()

	for _, f := range zr.File {
		name := strings.ReplaceAll(f.Name, "\\", "/")
		if name != "vencordpack.json" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		raw, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			return nil, err
		}
		var m packManifest
		if err := json.Unmarshal(raw, &m); err != nil {
			return nil, err
		}
		if m.Format != "" && m.Format != "vencordpack" {
			return nil, fmt.Errorf("unsupported pack format %q", m.Format)
		}
		if m.ID == "" {
			base := path.Base(packPath)
			m.ID = strings.TrimSuffix(base, path.Ext(base))
		}
		if m.Name == "" {
			m.Name = m.ID
		}
		return &m, nil
	}
	return nil, fmt.Errorf("vencordpack.json missing inside pack")
}

func addCustomPackFromPath(packPath string) {
	customPackMsg = ""
	m, err := readPackManifest(packPath)
	if err != nil {
		customPackMsg = "Pack error: " + err.Error()
		ShowModal("Invalid pack", customPackMsg, "")
		return
	}

	desc := m.Description
	if desc == "" {
		desc = "Custom pack from " + path.Base(packPath)
	} else {
		desc = desc + "  [custom: " + path.Base(packPath) + "]"
	}

	for i := range pluginChoices {
		if pluginChoices[i].ID == m.ID {
			pluginChoices[i].Name = m.Name
			pluginChoices[i].Description = desc
			pluginChoices[i].PackPath = packPath
			pluginChoices[i].Custom = true
			pluginChoices[i].On = true
			customPackMsg = "Updated " + m.Name + " from custom pack"
			pluginsReady = true
			return
		}
	}

	pluginChoices = append(pluginChoices, selectablePlugin{
		ID:          m.ID,
		Name:        m.Name,
		Description: desc,
		PackPath:    packPath,
		Custom:      true,
		On:          true,
	})
	customPackMsg = "Added " + m.Name
	pluginsReady = true
}

func unpackCustomPack(packPath, destDir string) error {
	_ = os.RemoveAll(destDir)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	zr, err := zip.OpenReader(packPath)
	if err != nil {
		return err
	}
	defer zr.Close()

	for _, f := range zr.File {
		name := strings.ReplaceAll(f.Name, "\\", "/")
		if name == "vencordpack.json" || strings.HasSuffix(name, "/") {
			continue
		}
		if !strings.HasPrefix(name, "plugin/") {
			continue
		}
		rel := strings.TrimPrefix(name, "plugin/")
		if rel == "" || strings.Contains(rel, "..") {
			continue
		}
		out := path.Join(destDir, rel)
		if err := os.MkdirAll(path.Dir(out), 0755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		data, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			return err
		}
		if err := os.WriteFile(out, data, 0644); err != nil {
			return err
		}
	}
	return nil
}

func RenderPluginSelect() g.Widget {
	return g.Column(
		g.Style().SetFontSize(30).To(
			g.Label("Select plugins to enable"),
		),
		g.Dummy(0, 6),
		g.Style().SetFontSize(18).To(
			g.Row(
				g.Button("Select all").OnClick(func() {
					for i := range pluginChoices {
						pluginChoices[i].On = true
					}
				}),
				g.Button("Select none").OnClick(func() {
					for i := range pluginChoices {
						pluginChoices[i].On = false
					}
				}),
				g.Button("Add custom pack").OnClick(func() {
					go func() {
						p, err := pickVencordPackFile()
						if err != nil {
							customPackMsg = err.Error()
							ShowModal("Browse failed", err.Error(), "")
							g.Update()
							return
						}
						if p == "" {
							return
						}
						addCustomPackFromPath(p)
						g.Update()
					}()
				}),
			),
			g.Dummy(0, 6),
			&CondWidget{pluginsFetching && len(pluginChoices) == 0, func() g.Widget {
				return g.Label("Loading plugin list from jalolek.pro...")
			}, nil},
			&CondWidget{pluginsLoadErr != "" && len(pluginChoices) == 0, func() g.Widget {
				return g.Label("API: " + pluginsLoadErr + "  (you can still Add custom pack)")
			}, nil},
			&CondWidget{customPackMsg != "", func() g.Widget {
				return g.Label(customPackMsg)
			}, nil},
			g.Dummy(0, 8),
			&CondWidget{len(pluginChoices) > 0, func() g.Widget {
				widgets := make([]g.Widget, 0, len(pluginChoices)*2)
				for i := range pluginChoices {
					idx := i
					label := pluginChoices[idx].Name
					if pluginChoices[idx].Custom {
						label = label + "  [custom pack]"
					}
					desc := pluginChoices[idx].Description
					widgets = append(widgets, g.Checkbox(label, &pluginChoices[idx].On))
					if desc != "" {
						widgets = append(widgets,
							g.Style().SetFontSize(15).To(
								g.Label("    "+desc).Wrapped(true),
							),
							g.Dummy(0, 6),
						)
					} else {
						widgets = append(widgets, g.Dummy(0, 4))
					}
				}
				return g.Column(widgets...)
			}, nil},
		),
	)
}

func ApplySelectedPluginSettings() {
	if len(pluginChoices) == 0 {
		return
	}
	if BaseDir == "" {
		fmt.Println("[Custom] skip plugin settings: BaseDir empty")
		return
	}

	packsDir := path.Join(BaseDir, "custom-packs")
	_ = os.MkdirAll(packsDir, 0755)

	for _, p := range pluginChoices {
		if !p.Custom || !p.On || p.PackPath == "" {
			continue
		}
		dest := path.Join(packsDir, p.ID)
		if err := unpackCustomPack(p.PackPath, dest); err != nil {
			fmt.Println("[Custom] unpack failed for", p.ID, err)
			continue
		}
		fmt.Println("[Custom] Unpacked custom pack to", dest)
	}

	settingsDir := path.Join(BaseDir, "settings")
	settingsFile := path.Join(settingsDir, "settings.json")
	_ = os.MkdirAll(settingsDir, 0755)

	root := map[string]any{}
	if raw, err := os.ReadFile(settingsFile); err == nil && len(raw) > 0 {
		_ = json.Unmarshal(raw, &root)
	}

	pluginsMap, _ := root["plugins"].(map[string]any)
	if pluginsMap == nil {
		pluginsMap = map[string]any{}
	}

	for _, p := range pluginChoices {
		entry, _ := pluginsMap[p.Name].(map[string]any)
		if entry == nil {
			entry = map[string]any{}
		}
		entry["enabled"] = p.On
		pluginsMap[p.Name] = entry
	}
	root["plugins"] = pluginsMap

	out, err := json.MarshalIndent(root, "", "    ")
	if err != nil {
		fmt.Println("[Custom] failed to encode settings:", err)
		return
	}
	if err := os.WriteFile(settingsFile, out, 0644); err != nil {
		fmt.Println("[Custom] failed to write settings:", err)
		return
	}
	fmt.Println("[Custom] Wrote plugin enable flags to", settingsFile)
}
