"use client";

/** Case « tout cocher » d'un tableau dont les cases appartiennent au formulaire `form` (actions groupées). */
export function SelectAll({ form, label }: { form: string; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      onChange={(e) => {
        const boxes = document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="ids"][form="${form}"]`);
        boxes.forEach((b) => { b.checked = e.currentTarget.checked; });
      }}
    />
  );
}
