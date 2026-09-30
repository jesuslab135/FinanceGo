"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories } from "@/lib/query/hooks";

export function CategorySelect({ kind, value, onChange, id, invalid, placeholder }: {
  kind: "expense" | "income"; value: number | null | undefined; onChange: (v: number) => void; id?: string; invalid?: boolean; placeholder?: string;
}) {
  const { data = [] } = useCategories(kind);
  return (
    <Select value={value ? String(value) : undefined} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {data.map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>
            <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
