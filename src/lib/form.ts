/** Reads a text field from a submitted form (FormData values may also be Files). */
export function field(f: FormData, name: string): string {
  const v = f.get(name)
  return typeof v === 'string' ? v : ''
}
