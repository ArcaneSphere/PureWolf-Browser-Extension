package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/civilware/Gnomon/api"
	"github.com/civilware/Gnomon/indexer"
	"github.com/civilware/Gnomon/storage"
	"github.com/civilware/Gnomon/structures"
)

var (
	gravDB    *storage.GravitonStore
	boltDB    *storage.BboltStore
	apiServer *api.ApiServer
	myIndexer *indexer.Indexer
)

var indexerRunning bool

func initDB() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("could not find home dir: %w", err)
	}
	db := filepath.Join(home, ".purewolf", "gnomondb")
	os.MkdirAll(db, 0755)

	boltDB, err = storage.NewBBoltDB(db, "GNOMON.db")
	if err != nil {
		return fmt.Errorf("boltdb: %w", err)
	}

	gravDB, err = storage.NewGravDB(db, "1s")
	if err != nil {
		return fmt.Errorf("gravdb: %w", err)
	}

	log.Printf("DB handles reinitialized")
	return nil
}

func initStorage() error {
	if err := initDB(); err != nil {
		return err
	}

	apiCfg := &structures.APIConfig{
		Enabled: true,
		Listen:  fmt.Sprintf("127.0.0.1:%d", *gnomonPort),
	}
	apiServer = api.NewApiServer(apiCfg, gravDB, boltDB, "boltdb")
	go apiServer.Start()

	log.Printf("Storage + Gnomon API ready on :%d", *gnomonPort)
	return nil
}

var syncCancel chan struct{}

func startSync(node string) {
	if !strings.HasPrefix(node, "http://") {
		node = "http://" + node
	}

	// Cancel any previous sync goroutines
	if syncCancel != nil {
		close(syncCancel)
	}
	syncCancel = make(chan struct{})
	cancel := syncCancel

	// Get target height from daemon before starting
	targetHeight := int64(0)
	retries := 0
	for targetHeight == 0 {
		select {
		case <-cancel:
			return
		default:
		}
		targetHeight = getChainHeightFromDaemon(node)
		if targetHeight == 0 {
			retries++
			log.Printf("Sync: waiting for daemon at %s (attempt %d)...", node, retries)

			// After 2 attempts (~6s) notify the UI the node is unreachable
			if retries == 2 {
				sendMsg(map[string]any{
					"event": "node_unreachable",
					"node":  node,
				})
			}

			select {
			case <-cancel:
				return
			case <-time.After(3 * time.Second):
			}
		}
	}
	log.Printf("Sync: target locked at height %d", targetHeight)
	nodeDisconnected = false

	lastHeight, err := boltDB.GetLastIndexHeight()
	log.Printf("Resuming from lastHeight=%d err=%v", lastHeight, err)

	sf := []string{"telaVersion"}

	// Fastsync indexer
	myIndexer = indexer.NewIndexer(
		gravDB, boltDB, "boltdb",
		sf, lastHeight, node, "daemon",
		false, false, &structures.FastSyncConfig{Enabled: true}, []string{},
	)
	go myIndexer.StartDaemonMode(5)
	indexerRunning = true
	log.Printf("Indexer started with fastsync, resuming from height %d", lastHeight)

	go func() {
		for {
			select {
			case <-cancel:
				return
			case <-time.After(3 * time.Second):
			}

			indexed, err := boltDB.GetLastIndexHeight()
			if err != nil {
				log.Printf("Sync: GetLastIndexHeight error: %v", err)
				continue
			}

			log.Printf("Sync: indexed=%d target=%d", indexed, targetHeight)
			sendMsg(map[string]any{
				"event":   "sync_progress",
				"indexed": indexed,
				"chain":   targetHeight,
			})

			if indexed >= targetHeight-3 {
				log.Printf("Fastsync complete at height %d, switching to normal sync", indexed)

				finalHeight := indexed
				finalNode := node

				myIndexer = indexer.NewIndexer(
					gravDB, boltDB, "boltdb",
					[]string{"telaVersion"}, finalHeight, finalNode, "daemon",
					false, false, nil, []string{},
				)
				go myIndexer.StartDaemonMode(5)
				log.Printf("Normal sync started from height %d", finalHeight)

				sendMsg(map[string]any{
					"event":  "sync_complete",
					"height": finalHeight,
				})

				// Live poll goroutine — pass cancel explicitly and guard on currentNode
				go func(cancel chan struct{}) {
					for {
						select {
						case <-cancel:
							return
						case <-time.After(10 * time.Second):
						}

						// Stop polling if node was disconnected
						if currentNode == "" {
							return
						}

						chainHeight := getChainHeightFromDaemon(finalNode)
						dbHeight, _ := boltDB.GetLastIndexHeight()
						if dbHeight == 0 {
							dbHeight = finalHeight
						}
						log.Printf("Live poll: dbHeight=%d chainHeight=%d", dbHeight, chainHeight)
						sendMsg(map[string]any{
							"event":   "sync_progress",
							"indexed": dbHeight,
							"chain":   chainHeight,
						})
					}
				}(cancel)
				return
			}
		}
	}()
}

func stopSync() {
	if syncCancel != nil {
		close(syncCancel)
		syncCancel = nil
	}
	stopIndexer()
	if err := initDB(); err != nil {
		log.Printf("stopSync: reinit DB failed: %v", err)
		return
	}
	restartAPIServer()
}

func restartAPIServer() {
	apiCfg := &structures.APIConfig{
		Enabled: true,
		Listen:  fmt.Sprintf("127.0.0.1:%d", *gnomonPort),
	}
	apiServer = api.NewApiServer(apiCfg, gravDB, boltDB, "boltdb")
	go apiServer.Start()
	log.Printf("Gnomon API restarted on :%d", *gnomonPort)
}

func getChainHeightFromDaemon(node string) int64 {
	client := &http.Client{Timeout: 5 * time.Second}
	body := strings.NewReader(`{"jsonrpc":"2.0","id":"1","method":"DERO.GetInfo"}`)
	resp, err := client.Post(node+"/json_rpc", "application/json", body)
	if err != nil {
		log.Printf("getChainHeightFromDaemon error: %v", err)
		return 0
	}
	defer resp.Body.Close()

	var result struct {
		Result map[string]any `json:"result"`
	}
	json.NewDecoder(resp.Body).Decode(&result)

	if h, ok := result.Result["topoheight"].(float64); ok {
		return int64(h)
	}
	return 0
}

func stopIndexer() {
	if myIndexer != nil {
		myIndexer.Close()
		myIndexer = nil
	}
	indexerRunning = false
}

func closeStorage() {
	stopIndexer()
	if gravDB != nil {
		gravDB.Closing = true
	}
}