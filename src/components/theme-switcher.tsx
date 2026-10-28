"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const options = [
  { value: "light", label: "Terang", icon: Sun },
  { value: "dark", label: "Gelap", icon: Moon },
  { value: "system", label: "Sistem", icon: Monitor },
] as const;
const subscribe = () => () => {};

export function ThemeSwitcher() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();
  // Server and first client render both show "Sistem": the stored preference is
  // only known after mount, so this avoids a hydration mismatch.
  const current = options.find((option) => option.value === (mounted ? theme : "system")) ?? options[2];
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Icon-only below `sm` (square 44px target); the accessible name always includes the choice. */}
        <Button variant="outline" className="size-11 gap-2 px-0 sm:w-auto sm:px-3" aria-label={`Tema tampilan: ${current.label}`}>
          <Icon aria-hidden="true" />
          <span className="hidden sm:inline">{current.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Tema tampilan</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={current.value} onValueChange={setTheme}>
          {options.map(({ value, label, icon: OptionIcon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="min-h-11">
              <OptionIcon aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
