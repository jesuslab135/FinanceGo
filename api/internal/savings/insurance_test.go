package savings

import (
	"reflect"
	"testing"
)

func TestLimitCents(t *testing.T) {
	if got := LimitCents(SofipoUDIs, 8.70); got != 21_750_000 {
		t.Fatalf("SOFIPO limit = %d, want 21750000 ($217,500)", got)
	}
	if got := LimitCents(BankUDIs, 8.70); got != 348_000_000 {
		t.Fatalf("bank limit = %d, want 348000000 ($3,480,000)", got)
	}
}

func TestInsuranceWarningsGroupsByInstitutionIgnoringCaseAndSpaces(t *testing.T) {
	hs := []Holding{
		{Kind: "sofipo", Institution: "Klar", Balance: 15_000_000},
		{Kind: "sofipo", Institution: "  klar ", Balance: 10_000_000},     // same institution: 250000 pesos total
		{Kind: "bank", Institution: "Klar", Balance: 10_000_000},          // different kind: its own group
		{Kind: "sofipo", Institution: "Stori", Balance: 21_750_000},       // exactly at the limit: no warning
		{Kind: "fund", Institution: "Mercado Pago", Balance: 999_000_000}, // not insured: never warns
	}
	got := InsuranceWarnings(hs, 8.70)
	want := []Warning{{Institution: "Klar", Kind: "sofipo", Total: 25_000_000, Limit: 21_750_000, Excess: 3_250_000}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("warnings = %+v, want %+v", got, want)
	}
	if got := InsuranceWarnings(nil, 8.70); got == nil || len(got) != 0 {
		t.Fatalf("no holdings must give an empty, non-nil slice: %#v", got)
	}
}

func TestAllocation(t *testing.T) {
	got := Allocation([]Holding{
		{Kind: "bank", Balance: 50_000}, {Kind: "government", Balance: 30_000},
		{Kind: "bank", Balance: 20_000}, {Kind: "crypto", Balance: -5}, {Kind: "fund", Balance: 0},
	})
	want := []Slice{{Kind: "bank", Amount: 70_000, Pct: 70}, {Kind: "government", Amount: 30_000, Pct: 30}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("allocation = %+v, want %+v", got, want)
	}
}
