package main

import (
	"net/http"
)

func main() {
	http.HandleFunc("/create", createFns)
	http.HandleFunc("/status", fnStatus)
	http.HandleFunc("/delete", deleteFns)
	http.HandleFunc("/logs", fnLogs)
	if err := http.ListenAndServe(":8080", nil); err != nil {
		panic(err)
	}
}
