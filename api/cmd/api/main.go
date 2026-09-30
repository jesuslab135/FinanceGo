package main

import (
	"log"
	"net/http"

	"financego/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte(`{"status":"ok"}`)) })
	log.Fatal(http.ListenAndServe(":"+cfg.Port, mux))
}
