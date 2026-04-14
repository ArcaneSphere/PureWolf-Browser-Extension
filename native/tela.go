package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/civilware/tela"
)

var (
	telaOnce sync.Once
	mu       sync.RWMutex
	proxies  = map[string]*httputil.ReverseProxy{}
	baseURLs = map[string]string{}
	entries  = map[string]string{}
	sharded  = map[string]bool{}
)

// -------------------- UTIL --------------------

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

// -------------------- ENTRYPOINT --------------------

func findEntrypoint(folder string) (string, error) {
	ents, err := os.ReadDir(folder)
	if err != nil {
		return "", err
	}

	var htmlFiles []string
	for _, e := range ents {
		if e.IsDir() {
			continue
		}
		if strings.HasSuffix(e.Name(), ".html") {
			htmlFiles = append(htmlFiles, e.Name())
		}
	}

	for _, f := range htmlFiles {
		if f == "index.html" {
			return f, nil
		}
	}

	if len(htmlFiles) > 0 {
		return htmlFiles[0], nil
	}

	return "", fmt.Errorf("no HTML entrypoint found")
}

// -------------------- SHARDS --------------------

func detectShard(nameHdr, compression string) (int, string) {
	name := strings.TrimSuffix(nameHdr, compression)

	lastDash := strings.LastIndex(name, "-")
	if lastDash < 0 {
		return 0, tela.TrimCompressedExt(nameHdr)
	}

	var idx int
	if _, err := fmt.Sscanf(name[lastDash+1:], "%d", &idx); err != nil || idx < 1 {
		return 0, tela.TrimCompressedExt(nameHdr)
	}

	return idx, name[:lastDash]
}

func parseShardRawBytes(doc tela.DOC) ([]byte, error) {
	code := doc.Code
	start := strings.Index(code, "/*")
	end := strings.LastIndex(code, "*/")
	if start == -1 || end == -1 {
		return nil, fmt.Errorf("no shard data found")
	}
	return []byte(code[start+3 : end]), nil
}

func downloadAndReconstructShards(scid string, index tela.INDEX, telaNode string) (string, error) {
	log.Printf("[SHARDS] Reconstructing SCID: %s", scid)

	baseName := strings.TrimSuffix(index.DURL, tela.TAG_DOC_SHARDS)
	appDir := filepath.Join(tela.GetClonePath(), baseName)
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return "", err
	}

	type shard struct {
		idx  int
		data []byte
	}
	type group struct {
		shards      []shard
		compression string
		isSharded   bool
	}

	groups := map[string]*group{}

	for _, docSCID := range index.DOCs {
		doc, err := tela.GetDOCInfo(docSCID, telaNode)
		if err != nil {
			return "", err
		}

		raw, err := parseShardRawBytes(doc)
		if err != nil {
			return "", err
		}

		idx, base := detectShard(doc.Headers.NameHdr, doc.Compression)
		key := base
		if doc.SubDir != "" {
			key = filepath.Join(doc.SubDir, base)
		}

		if _, ok := groups[key]; !ok {
			groups[key] = &group{}
		}
		g := groups[key]
		g.compression = doc.Compression
		if idx > 0 {
			g.isSharded = true
		}
		g.shards = append(g.shards, shard{idx, raw})
	}

	for key, g := range groups {
		dst := filepath.Join(appDir, key)
		if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
			return "", err
		}

		var data []byte
		if g.isSharded {
			sort.Slice(g.shards, func(i, j int) bool { return g.shards[i].idx < g.shards[j].idx })
			buf := []byte{}
			for _, s := range g.shards {
				buf = append(buf, s.data...)
			}
			if g.compression != "" {
				var err error
				data, err = tela.Decompress(buf, g.compression)
				if err != nil {
					return "", err
				}
			} else {
				data = buf
			}
		} else {
			data = g.shards[0].data
			if g.compression != "" {
				var err error
				data, err = tela.Decompress(data, g.compression)
				if err != nil {
					return "", err
				}
			}
		}

		if err := os.WriteFile(dst, data, 0644); err != nil {
			return "", err
		}
	}

	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()

	go http.ListenAndServe(
		fmt.Sprintf("127.0.0.1:%d", port),
		http.FileServer(http.Dir(appDir)),
	)

	entry, err := findEntrypoint(appDir)
	if err != nil {
		return "", err
	}

	return fmt.Sprintf("http://127.0.0.1:%d/%s", port, entry), nil
}

// -------------------- ADD SCID --------------------

func addSCID(w http.ResponseWriter, r *http.Request) {
	scid := strings.TrimPrefix(r.URL.Path, "/add/")
	scid = strings.Split(scid, "/")[0]

	log.Printf("[ADD] %s", scid)

	if currentNode == "" {
		http.Error(w, "node not set", 400)
		return
	}

	mu.RLock()
	if base, ok := baseURLs[scid]; ok {
		mu.RUnlock()
		writeJSON(w, scid, base)
		return
	}
	mu.RUnlock()

	telaNode := strings.TrimPrefix(currentNode, "http://")
	var rawURL string
	isShardedSCID := false

	index, err := tela.GetINDEXInfo(scid, telaNode)
	if err == nil && strings.HasSuffix(index.DURL, tela.TAG_DOC_SHARDS) {
		rawURL, err = downloadAndReconstructShards(scid, index, telaNode)
		isShardedSCID = true
	} else {
		rawURL, err = tela.ServeTELA(scid, telaNode)
	}

	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	// For shards: split off the entry filename from the base URL.
	// For ServeTELA: always treat the whole URL as the base directory so that
	// sibling pages (algo4.html, Snake Deluxe.html, …) remain reachable via
	// the proxy without an extra redirect.
	var base, entry string
	if isShardedSCID && strings.HasSuffix(rawURL, ".html") {
		base = rawURL[:strings.LastIndex(rawURL, "/")+1]
		entry = rawURL[strings.LastIndex(rawURL, "/")+1:]
	} else {
		base = strings.TrimSuffix(rawURL, "/index.html")
		if !strings.HasSuffix(base, "/") {
			base += "/"
		}
	}

	log.Printf("[MAP] base=%s entry=%s sharded=%v", base, entry, isShardedSCID)

	target, _ := url.Parse(base)
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.Director = func(req *http.Request) {
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		req.Host = target.Host
	}
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Content-Security-Policy")
		return nil
	}

	mu.Lock()
	proxies[scid] = proxy
	baseURLs[scid] = base
	entries[scid] = entry
	sharded[scid] = isShardedSCID
	mu.Unlock()

	writeJSON(w, scid, base)
}

// -------------------- HTTP --------------------

func writeJSON(w http.ResponseWriter, scid, base string) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ok": true,
		"result": map[string]any{
			"scid": scid,
			"url":  base,
		},
	})
}

// -------------------- START TELA --------------------

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
			proxy := proxies[scid]
			entry := entries[scid]
			isSharded := sharded[scid]
			mu.RUnlock()

			if proxy == nil {
				http.Error(w, "SCID not loaded", 404)
				return
			}

			subPath := ""
			if len(parts) == 2 {
				subPath = parts[1]
			}

			// Shards have no index.html so we redirect to the discovered entry
			// file. ServeTELA always serves a full directory, so we let / fall
			// through naturally — redirecting it would break sibling navigation.
			if isSharded && subPath == "" && entry != "" {
				http.Redirect(w, r, "/tela/"+scid+"/"+url.PathEscape(entry), http.StatusFound)
				return
			}

			if subPath == "" {
				r.URL.Path = "/"
			} else {
				r.URL.Path = "/" + subPath
			}

			log.Printf("[PROXY] %s -> %s", scid, r.URL.Path)
			proxy.ServeHTTP(w, r)
		})

		go func() {
			log.Printf("TELA proxy listening on :%d", *telaPort)
			http.ListenAndServe(fmt.Sprintf("127.0.0.1:%d", *telaPort), nil)
		}()
	})
}

// -------------------- CLEANUP --------------------

func cleanupTelaCloneFromError(err error) bool {
	if err == nil || !strings.Contains(err.Error(), "already exists") {
		return false
	}
	return true
}

func resetProxies() {
	mu.Lock()
	proxies = map[string]*httputil.ReverseProxy{}
	baseURLs = map[string]string{}
	entries = map[string]string{}
	sharded = map[string]bool{}
	mu.Unlock()
}