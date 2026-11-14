import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

export function Tabs({
  value,
  onValueChange,
  direction,
  label,
  items,
}: {
  value: string;
  onValueChange: (value: string) => void;
  direction: "rtl" | "ltr";
  label: string;
  items: Array<{ value: string; label: string; content: ReactNode }>;
}) {
  return (
    <RadixTabs.Root
      className="ui-tabs"
      value={value}
      onValueChange={onValueChange}
      dir={direction}
    >
      <RadixTabs.List className="ui-tabs-list" aria-label={label}>
        {items.map((item) => (
          <RadixTabs.Trigger
            className="ui-tabs-trigger"
            key={item.value}
            value={item.value}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content
          className="ui-tabs-panel"
          key={item.value}
          value={item.value}
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
