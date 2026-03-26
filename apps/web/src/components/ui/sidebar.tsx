import type { CSSProperties, ComponentPropsWithoutRef, ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  state: "expanded" | "collapsed";
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebarContext() {
  const value = useContext(SidebarContext);
  if (!value) {
    throw new Error("Sidebar components must be used inside SidebarProvider.");
  }
  return value;
}

type SidebarProviderProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SidebarProvider({
  children,
  className,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  style,
  ...props
}: SidebarProviderProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;

  const setOpen = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen);
    if (openProp === undefined) {
      setUncontrolledOpen(nextOpen);
    }
  };

  const contextValue = useMemo<SidebarContextValue>(
    () => ({
      open,
      setOpen,
      state: open ? "expanded" : "collapsed",
      toggleSidebar: () => setOpen(!open),
    }),
    [open],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        className={cn("flex h-screen min-h-screen w-full", className)}
        style={
          {
            "--sidebar-width": "16rem",
            ...style,
          } as CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

type SidebarProps = ComponentPropsWithoutRef<"aside"> & {
  collapsible?: "offcanvas" | "none";
  side?: "left" | "right";
};

export function Sidebar({
  children,
  className,
  collapsible = "offcanvas",
  side = "left",
  style,
  ...props
}: SidebarProps) {
  const { open, state } = useSidebarContext();
  const expanded = collapsible === "none" || open;

  return (
    <aside
      className={cn(
        "relative shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out",
        className,
      )}
      data-collapsible={expanded ? "" : collapsible}
      data-side={side}
      data-state={state}
      style={
        {
          width: expanded ? "var(--sidebar-width)" : "0px",
          opacity: expanded ? 1 : 0,
          ...style,
        } as CSSProperties
      }
      {...props}
    >
      <div className="flex h-full w-(--sidebar-width) min-w-(--sidebar-width) flex-col">
        {children}
      </div>
    </aside>
  );
}
