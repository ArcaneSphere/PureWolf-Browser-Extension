package main

import (
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"

	"github.com/civilware/Gnomon/api"
	"github.com/civilware/Gnomon/indexer"
	"github.com/civilware/Gnomon/storage"
	"github.com/civilware/Gnomon/structures"
	"github.com/civilware/tela"
)

/* ===================== STATE ===================== */
var telaOnce sync.Once

var (
	currentNode string
	myIndexer   *indexer.Indexer
	apiServer   *api.ApiServer
)

/* ===================== TELA ===================== */

var (
    mu       sync.RWMutex
    proxies  = map[string]*httputil.ReverseProxy{}
    baseURLs = map[string]string{}
)

var (
	telaPort   = flag.Int("tela-port", 4040, "TELA control port")
	scidRoot   = flag.String("scid-root", "scids", "Local SCID folders")
	gnomonPort = flag.Int("gnomon-api", 8099, "Gnomon API")
)

/* ===================== GNOMON ===================== */

func startGnomon(node string) error {
	if myIndexer != nil {
		return nil
	}

	db := "./gnomondb"
	_ = os.MkdirAll(db, 0755)

	bbs, err := storage.NewBBoltDB(db, "GNOMON.db")
	if err != nil {
		return err
	}

	grav, err := storage.NewGravDB(db, "25ms")
	if err != nil {
		return err
	}

	sf := []string{"telaVersion"}
	fs := &structures.FastSyncConfig{Enabled: true}

	if !strings.HasPrefix(node, "http://") {
		node = "http://" + node
	}

	myIndexer = indexer.NewIndexer(
		grav,
		bbs,
		"boltdb",
		sf,
		5,
		node,
		"daemon",
		false,
		false,
		fs,
		[]string{},
	)

	go myIndexer.StartDaemonMode(5)

	apiCfg := &structures.APIConfig{
		Enabled: true,
		Listen:  fmt.Sprintf("127.0.0.1:%d", *gnomonPort),
	}

	apiServer = api.NewApiServer(apiCfg, grav, bbs, "boltdb")
	go apiServer.Start()

	log.Printf("Gnomon API listening on :%d → node %s", *gnomonPort, node)
	return nil
}

func stopGnomon() {
	if myIndexer != nil {
		myIndexer.Close()
		myIndexer = nil
	}
	apiServer = nil
}

/* ===================== TELA ===================== */

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
        // Already loaded → return existing URL
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

    // Determine URL
    var rawURL string
    folderPath := filepath.Join(*scidRoot, scid)
    if _, err := os.Stat(folderPath); err == nil {
        rawURL = fmt.Sprintf("http://127.0.0.1:%d/scidfiles/%s/index.html", *telaPort, scid)
        log.Printf("SCID %s: serving local folder", scid[:8])
    } else {
        url, err := tela.ServeTELA(scid, currentNode)
        if err != nil {
            http.Error(w, "Tela failed: "+err.Error(), 500)
            return
        }
        rawURL = url
        log.Printf("SCID %s: started dynamic Tela server", scid[:8])
    }

    // Normalize base
    base = strings.TrimSuffix(rawURL, "/index.html")
    if !strings.HasSuffix(base, "/") {
        base += "/"
    }

    // Create proxy for /tela/<SCID>
    target, _ := url.Parse(base)
    proxy := httputil.NewSingleHostReverseProxy(target)
    proxy.ModifyResponse = func(r *http.Response) error {
        r.Header.Del("Content-Security-Policy")
        return nil
    }

    mu.Lock()
    proxies[scid] = proxy
    baseURLs[scid] = base
    mu.Unlock()

    // Return URL immediately
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]any{
        "ok": true,
        "result": map[string]any{
            "scid": scid,
            "url":  base,
        },
    })
}

// startTELA serves all SCIDs via /tela/<SCID> using their proxy
func startTELA() {
    telaOnce.Do(func() {
        tela.AllowUpdates(true)

        // Add endpoint
        http.HandleFunc("/add/", addSCID)

        // Proxy SCIDs
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

/* ===================== NATIVE ===================== */

var nativeStdout *os.File

func readMsg() ([]byte, error) {
	h := make([]byte, 4)
	if _, err := io.ReadFull(os.Stdin, h); err != nil {
		return nil, err
	}
	l := binary.LittleEndian.Uint32(h)
	msg := make([]byte, l)
	_, err := io.ReadFull(os.Stdin, msg)
	return msg, err
}

func sendMsg(v any) {
	b, _ := json.Marshal(v)
	h := make([]byte, 4)
	binary.LittleEndian.PutUint32(h, uint32(len(b)))
	nativeStdout.Write(h)
	nativeStdout.Write(b)
}

func nativeLoop() {
	for {
		raw, err := readMsg()
		if err != nil {
			return
		}

		var msg map[string]any
		if json.Unmarshal(raw, &msg) != nil {
			continue
		}

		cmd := msg["cmd"].(string)
		id := msg["id"]

		switch cmd {

		case "set_node":
			node := strings.TrimSpace(msg["params"].(map[string]any)["node"].(string))
			currentNode = node
			startTELA()
			startGnomon(node)

			sendMsg(map[string]any{"ok": true, "id": id})

			// Send initial SCID list to frontend
			mu.RLock()
			initialSCIDs := make([]string, 0, len(proxies))
			for scid := range proxies {
				initialSCIDs = append(initialSCIDs, scid)
			}
			mu.RUnlock()

			sendMsg(map[string]any{
				"ok":     true,
				"id":     "init_scids",
				"result": map[string]any{"scids": initialSCIDs},
			})


		case "load_scid":
			if currentNode == "" {
				sendMsg(map[string]any{"ok": false, "id": id, "error": "node not set"})
				break
			}

			scid := msg["params"].(map[string]any)["scid"].(string)
			addURL := fmt.Sprintf("http://127.0.0.1:%d/add/%s", *telaPort, scid)

			resp, err := http.Get(addURL)
			if err != nil {
				sendMsg(map[string]any{"ok": false, "id": id, "error": err.Error()})
				break
			}
			defer resp.Body.Close()

			body, _ := io.ReadAll(resp.Body)

			var res map[string]any
			json.Unmarshal(body, &res)

			sendMsg(map[string]any{
				"ok": true,
				"id": id,
				"result": map[string]any{
					"url": res["result"].(map[string]any)["url"],
				},
			})
		
		case "server_status":
			isConnected := false
			if currentNode != "" {
				resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/getinfo", *gnomonPort))
				if err == nil {
					resp.Body.Close()
					isConnected = true
				}
			}

			sendMsg(map[string]any{
				"ok": true,
				"id": id,
				"result": map[string]any{
					"connected": isConnected,
					"node":      currentNode,
				},
			})

		case "list_scids":
			mu.RLock()
			loadedSCIDs := make([]string, 0, len(proxies))
			for scid := range proxies {
				loadedSCIDs = append(loadedSCIDs, scid)
			}
			mu.RUnlock()

			sendMsg(map[string]any{
				"ok":     true,
				"id":     id,
				"result": map[string]any{"scids": loadedSCIDs},
			})
		}
	}
}

/* ===================== MAIN ===================== */

func main() {
	nativeStdout = os.Stdout

	logFile, _ := os.OpenFile("/tmp/purewolf-native.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	log.SetOutput(logFile)
	os.Stdout = logFile

	flag.Parse()

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-c
		stopGnomon()
		tela.ShutdownTELA()
		os.Exit(0)
	}()

	log.Println("PureWolf Native started")
	nativeLoop()
}