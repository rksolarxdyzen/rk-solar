const STACK_KEY = "rk-nav-stack";
const MAX = 40;

function readStack(): string[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-MAX)));
  } catch {
    // ignore
  }
}

export function trackNavPath(pathname: string): void {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const stack = readStack();
  if (stack[stack.length - 1] === path) return;
  stack.push(path);
  writeStack(stack);
}

export function getPreviousNavPath(): string | null {
  const stack = readStack();
  if (stack.length < 2) return null;
  return stack[stack.length - 2] ?? null;
}

export function canUseHistoryBack(currentPath: string): boolean {
  const prev = getPreviousNavPath();
  if (!prev) return false;
  const cur = currentPath.split("?")[0]?.split("#")[0] ?? currentPath;
  return prev !== cur && typeof window !== "undefined" && window.history.length > 1;
}
