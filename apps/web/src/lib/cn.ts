import { twMerge } from "tailwind-merge";

type ClassNameInput = string | false | null | undefined;

export function cn(...inputs: ClassNameInput[]) {
  return twMerge(inputs.filter(Boolean).join(" "));
}
