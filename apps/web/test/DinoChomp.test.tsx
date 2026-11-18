import { render, screen } from "@testing-library/react";

import { DinoChomp } from "../src/components/DinoChomp";

describe("DinoChomp", () => {
  it("renders as an accessible image with a descriptive label by default", () => {
    render(<DinoChomp />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("aria-label") ?? "").toContain("T-rex");
  });

  it("is hidden from assistive tech when aria-hidden is set", () => {
    const { container } = render(<DinoChomp aria-hidden />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("applies card chrome unless bare", () => {
    const { container: withChrome } = render(<DinoChomp />);
    expect((withChrome.firstChild as HTMLElement).className).toMatch(/border/);

    const { container: bare } = render(<DinoChomp bare />);
    expect((bare.firstChild as HTMLElement).className).not.toMatch(/border-slate/);
  });
});
