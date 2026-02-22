package main

// currentNode holds the active DERO daemon address (e.g. "http://127.0.0.1:10102").
// Set by the set_node command, read by TELA and native handlers.
var currentNode string