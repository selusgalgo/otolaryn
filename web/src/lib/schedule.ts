// Plain utility, deliberately NOT in a "use server" file — every exported
// function in one of those must be async, and this one is a synchronous
// FormData reader used by two different Server Action files.
export function scheduleFromFormData(formData: FormData): boolean[] {
  return Array.from({ length: 7 }, (_, i) => formData.get(`day${i}`) === "true");
}
