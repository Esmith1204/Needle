import { PageHeader } from "../components/PageHeader";
import { usePreferences } from "../context/PreferencesContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import type { Preferences } from "../lib/preferences";

const THEMES: Option<Preferences["theme"]>[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const COLORS: Option<Preferences["colors"]>[] = [
  { value: "standard", label: "Standard", hint: "Needle's violet and blue" },
  { value: "contrast", label: "High contrast", hint: "Stronger text and borders" },
  { value: "colorblind", label: "Color-blind friendly", hint: "Blue and orange in place of violet and red" },
  { value: "grayscale", label: "Grayscale", hint: "No color anywhere, including album art" },
];

const FONT_SIZES: Option<Preferences["fontSize"]>[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "Extra large" },
];

export function AccessibilityPage() {
  const { preferences, setPreference } = usePreferences();
  const systemReducesMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  return (
    <div>
      <PageHeader title="Accessibility options" subtitle="Changes apply right away and are saved on this device." />

      <ChoiceGroup
        name="theme"
        legend="Theme"
        columns="grid-cols-2"
        options={THEMES}
        value={preferences.theme}
        onChange={(value) => setPreference("theme", value)}
      />
      <ChoiceGroup
        name="colors"
        legend="Color options"
        columns="sm:grid-cols-2"
        options={COLORS}
        value={preferences.colors}
        onChange={(value) => setPreference("colors", value)}
      />
      <ChoiceGroup
        name="font-size"
        legend="Font size"
        columns="grid-cols-2 sm:grid-cols-4"
        options={FONT_SIZES}
        value={preferences.fontSize}
        onChange={(value) => setPreference("fontSize", value)}
      />

      <Toggle
        label="Reduce motion"
        hint={
          systemReducesMotion
            ? "On because your device is set to reduce motion."
            : "Turns off animations and transitions."
        }
        checked={systemReducesMotion || preferences.motion === "reduce"}
        disabled={systemReducesMotion}
        onChange={(checked) => setPreference("motion", checked ? "reduce" : "full")}
      />
      <Toggle
        label="Show image descriptions"
        hint="Writes out what each album cover shows, next to the cover. Screen readers always get these."
        checked={preferences.imageDescriptions}
        onChange={(checked) => setPreference("imageDescriptions", checked)}
      />
    </div>
  );
}

interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface ChoiceGroupProps<T extends string> {
  name: string;
  legend: string;
  columns: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

function ChoiceGroup<T extends string>({ name, legend, columns, options, value, onChange }: ChoiceGroupProps<T>) {
  return (
    <fieldset className="border-b border-line px-4 py-4">
      <legend className="float-left mb-2.5 w-full text-sm font-extrabold">{legend}</legend>
      <div className={`clear-both grid gap-2 ${columns}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${
              value === option.value ? "border-accent bg-accent/10" : "border-line hover:bg-tint/5"
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 accent-accent focus-visible:outline-none"
            />
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-bold">{option.label}</span>
              {option.hint && <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface ToggleProps {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, hint, checked, disabled, onChange }: ToggleProps) {
  return (
    <label
      className={`flex items-center justify-between gap-4 border-b border-line px-4 py-4 ${disabled ? "" : "cursor-pointer"}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-extrabold">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 accent-accent disabled:opacity-60"
      />
    </label>
  );
}
