package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/civilware/tela"
)

var (
	telaOnce sync.Once
	mu       sync.RWMutex
	proxies  = map[string]*httputil.ReverseProxy{}
	baseURLs = map[string]string{}
)

// addSCID handles /add/<scid> requests. If the SCID is already loaded it
// returns the existing URL immediately. Otherwise it resolves the SCID from
// either a local folder or a live TELA server, registers a reverse proxy for
// it, and returns the URL.
func addSCID(w http.ResponseWriter, r *http.Request) {
	if currentNode == "" {
		http.Error(w, "node not set", 400)
		return
	}

	scid := strings.TrimPrefix(r.URL.Path, "/add/")
	scid = strings.Split(scid, "/")[0]

	mu.RLock()
	base, exists := baseURLs[scid]
	mu.RUnlock()

	if exists {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"ok": true,
			"result": map[string]any{
				"scid": scid,
				"url":  base,
			},
		})
		return
	}

	// TELA expects raw address without http://
	telaNode := strings.TrimPrefix(currentNode, "http://")

	var rawURL string
	folderPath := filepath.Join(*scidRoot, scid)
	if _, err := os.Stat(folderPath); err == nil {
		rawURL = fmt.Sprintf("http://127.0.0.1:%d/scidfiles/%s/index.html", *telaPort, scid)
		log.Printf("SCID %s: serving local folder", scid[:8])
	} else {
		u, err := tela.ServeTELA(scid, telaNode)
		if err != nil {
			http.Error(w, "Tela failed: "+err.Error(), 500)
			return
		}
		rawURL = u
		log.Printf("SCID %s: started dynamic Tela server", scid[:8])
	}

	base = strings.TrimSuffix(rawURL, "/index.html")
	if !strings.HasSuffix(base, "/") {
		base += "/"
	}

	target, _ := url.Parse(base)
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Content-Security-Policy")
		return nil
	}

	mu.Lock()
	proxies[scid] = proxy
	baseURLs[scid] = base
	mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ok": true,
		"result": map[string]any{
			"scid": scid,
			"url":  base,
		},
	})
}

// startTELA registers HTTP handlers and starts the TELA proxy server.
// Safe to call multiple times — runs only once via sync.Once.
func startTELA() {
	telaOnce.Do(func() {
		tela.AllowUpdates(true)

		http.HandleFunc("/add/", addSCID)

		http.HandleFunc("/tela/", func(w http.ResponseWriter, r *http.Request) {
			parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/tela/"), "/", 2)
			if len(parts) == 0 || parts[0] == "" {
				http.NotFound(w, r)
				return
			}

			scid := parts[0]

			mu.RLock()
			proxy, exists := proxies[scid]
			mu.RUnlock()

			if !exists {
				http.Error(w, "SCID not loaded. Visit /add/<SCID>", 404)
				return
			}

			if len(parts) == 2 {
				r.URL.Path = "/" + parts[1]
			} else {
				r.URL.Path = "/"
			}

			proxy.ServeHTTP(w, r)
		})

		go func() {
			log.Printf("TELA proxy listening on :%d", *telaPort)
			http.ListenAndServe(fmt.Sprintf("127.0.0.1:%d", *telaPort), nil)
		}()
	})
}

func resetProxies() {
    mu.Lock()
    proxies = map[string]*httputil.ReverseProxy{}
    baseURLs = map[string]string{}
    mu.Unlock()
}