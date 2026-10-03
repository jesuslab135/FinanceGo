"use client";
import { CategoryTile } from "@/components/common/category-tile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories } from "@/lib/query/hooks";

export function CategorySelect({ kind, value, onChange, id, invalid, placeholder, exclude }: {
  kind: "expense" | "income"; value: number | null | undefined; onChange: (v: number) => void; id?: string; invalid?: boolean; placeholder?: string; exclude?: number;
}) {
  const { data = [] } = useCategories(kind);
  return (
    <Select value={value ? String(value) : undefined} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {data.filter((c) => c.id !== exclude).map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>
            <span className="flex items-center gap-2">
              <CategoryTile icon={c.icon} color={c.color} size="sm" />
              {c.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
