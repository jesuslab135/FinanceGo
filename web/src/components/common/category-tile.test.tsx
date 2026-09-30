import { render } from "@testing-library/react";
import { Wallet } from "lucide-react";
import { describe, expect, it } from "vitest";
import { CategoryTile } from "./category-tile";

describe("CategoryTile", () => {
  it("renders an explicit Icon override on the tinted tile", () => {
    const { container } = render(<CategoryTile Icon={Wallet} icon="utensils" color="#0a8a74" />);
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.querySelector("svg")).toHaveClass("lucide-wallet");
    expect(tile.style.getPropertyValue("--tile")).toBe("#0a8a74");
  });
});
