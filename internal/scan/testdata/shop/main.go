package main

import (
	"fmt"

	"example.com/shop/internal/checkout"
	_ "example.com/shop/internal/missing"
)

func main() {
	fmt.Println(checkout.Total(nil))
}
