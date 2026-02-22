package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/civilware/tela"
)

var (
	telaPort   = flag.Int("tela-port", 4040, "TELA control port")
	scidRoot   = flag.String("scid-root", "scids", "Local SCID folders")
	gnomonPort = flag.Int("gnomon-api", 8099, "Gnomon API")
)

func main() {
	nativeStdout = os.Stdout

	logFile, _ := os.OpenFile("/tmp/purewolf-native.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	log.SetOutput(logFile)
	os.Stdout = logFile

	flag.Parse()

	if err := initStorage(); err != nil {
		log.Fatalf("Failed to init storage: %v", err)
	}

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-c
		closeStorage()
		tela.ShutdownTELA()
		os.Exit(0)
	}()

	log.Println("PureWolf Native started")
	nativeLoop()
}