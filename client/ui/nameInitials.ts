export function nameInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words.length >= 2
      ? (Array.from(words[0])[0] ?? "") + (Array.from(words[1])[0] ?? "")
      : Array.from(words[0] ?? "")
          .slice(0, 2)
          .join("")
  ).toUpperCase();
}
