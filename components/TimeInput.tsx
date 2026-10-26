"use client";

import { useState } from "react";
import { parseTimeText } from "@/lib/timeText";

/** A typeable 24-hour time field ("17:30"); also understands 5pm / 1730. */
export function TimeInput({ value, onChange, className, placeholder = "17:00", "aria-label": ariaLabel }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; "aria-label"?: string }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  // Follow the parent when it changes the value from outside (e.g. a reload).
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }
  const invalid = text.trim() !== "" && parseTimeText(text) === null;
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      aria-invalid={invalid}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseTimeText(e.target.value);
        if (parsed) {
          setPrev(parsed);
          onChange(parsed);
        } else if (e.target.value.trim() === "") {
          setPrev("");
          onChange("");
        }
      }}
      onBlur={() => {
        const parsed = parseTimeText(text);
        if (parsed) setText(parsed);
        else if (text.trim() === "") setText("");
        else setText(value); // not a time: put back the last good value
      }}
      className={(className ?? "") + (invalid ? " border-live" : "")}
    />
  );
}
