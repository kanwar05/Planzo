import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MobileNavigation from "./MobileNavigation";

const { auth } = vi.hoisted(() => ({ auth: { current: {} } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth.current }));

const renderNavigation = (path = "/") => render(
  <MemoryRouter initialEntries={[path]}><MobileNavigation /></MemoryRouter>
);

describe("customer mobile navigation", () => {
  beforeEach(() => {
    auth.current = { user: { role: "customer" }, isAuthenticated: true };
  });
  afterEach(() => vi.unstubAllGlobals());

  it("links customers to the actual supported marketplace and account routes", () => {
    renderNavigation();
    const navigation = screen.getByRole("navigation", { name: "Customer navigation" });
    const links = within(navigation).getAllByRole("link");
    expect(links).toHaveLength(5);
    for (const [label, destination] of [
      ["Home", "/"], ["Explore", "/vendors"], ["Services", "/services"],
      ["Bookings", "/customer/dashboard"], ["Profile", "/settings"]
    ]) {
      expect(within(navigation).getByRole("link", { name: label })).toHaveAttribute("href", destination);
    }
  });

  it.each([
    ["/", "Home"], ["/vendors", "Explore"], ["/vendors/vendor-1", "Explore"],
    ["/services", "Services"], ["/customer/dashboard", "Bookings"], ["/settings", "Profile"]
  ])("marks only %s's matching %s destination as current", (path, label) => {
    renderNavigation(path);
    const current = screen.getByRole("link", { name: label });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page")).toEqual([current]);
  });

  it("lets guests reach login through Profile", () => {
    auth.current = { user: null, isAuthenticated: false };
    renderNavigation();
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/login");
  });

  it("keeps navigation out of the immersive booking form", () => {
    renderNavigation("/booking/vendor-1");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it.each(["vendor", "admin"])("keeps the customer navigation out of a %s account", role => {
    auth.current = { user: { role }, isAuthenticated: true };
    renderNavigation("/settings");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("hides when the software keyboard opens and restores when it closes", () => {
    const viewport = new EventTarget();
    viewport.height = window.innerHeight;
    vi.stubGlobal("visualViewport", viewport);
    renderNavigation();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    act(() => {
      viewport.height = window.innerHeight - 300;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    act(() => {
      viewport.height = window.innerHeight;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("hides when Android resizes both the layout and visual viewports", () => {
    const viewport = new EventTarget();
    const height = window.innerHeight;
    viewport.height = height;
    vi.stubGlobal("visualViewport", viewport);
    renderNavigation();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    act(() => {
      vi.stubGlobal("innerHeight", height - 300);
      viewport.height = height - 300;
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    act(() => {
      vi.stubGlobal("innerHeight", height);
      viewport.height = height;
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    input.remove();
  });

  it("detects an already-open visual keyboard when navigation mounts", () => {
    const viewport = new EventTarget();
    viewport.height = window.innerHeight - 300;
    viewport.scale = 1;
    vi.stubGlobal("visualViewport", viewport);
    renderNavigation();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("preserves navigation when the visual viewport shrinks because of pinch zoom", () => {
    const viewport = new EventTarget();
    viewport.height = window.innerHeight;
    viewport.scale = 1;
    vi.stubGlobal("visualViewport", viewport);
    renderNavigation();
    act(() => {
      viewport.scale = 2;
      viewport.height = window.innerHeight / 2;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("still detects a keyboard while the page is zoomed", () => {
    const viewport = new EventTarget();
    viewport.height = window.innerHeight;
    viewport.scale = 1;
    vi.stubGlobal("visualViewport", viewport);
    renderNavigation();
    act(() => {
      viewport.scale = 2;
      viewport.height = (window.innerHeight - 300) / 2;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("handles layout-resizing keyboards when VisualViewport is unavailable", () => {
    const height = window.innerHeight;
    vi.stubGlobal("visualViewport", undefined);
    render(<MemoryRouter><label>Event notes<textarea /></label><MobileNavigation /></MemoryRouter>);
    act(() => screen.getByRole("textbox", { name: "Event notes" }).focus());
    act(() => {
      vi.stubGlobal("innerHeight", height - 300);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    act(() => {
      vi.stubGlobal("innerHeight", height);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("does not mistake a readonly field or checkbox for keyboard entry", () => {
    const height = window.innerHeight;
    vi.stubGlobal("visualViewport", undefined);
    render(<MemoryRouter><label>Current email<input type="email" value="customer@example.test" readOnly /></label><label>Confirm<input type="checkbox" /></label><MobileNavigation /></MemoryRouter>);
    act(() => screen.getByRole("textbox", { name: "Current email" }).focus());
    act(() => {
      vi.stubGlobal("innerHeight", height - 200);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    act(() => screen.getByRole("checkbox", { name: "Confirm" }).focus());
    act(() => {
      vi.stubGlobal("innerHeight", height - 400);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("does not mistake a landscape rotation for the keyboard", () => {
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    const viewport = new EventTarget();
    viewport.height = 844;
    viewport.scale = 1;
    vi.stubGlobal("visualViewport", viewport);
    render(<MemoryRouter><label>Event city<input /></label><MobileNavigation /></MemoryRouter>);
    act(() => screen.getByRole("textbox", { name: "Event city" }).focus());
    act(() => {
      vi.stubGlobal("innerWidth", 844);
      vi.stubGlobal("innerHeight", 390);
      viewport.height = 390;
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});
