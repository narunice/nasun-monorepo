import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PostHero from "../PostHero";

describe("PostHero", () => {
  const mockProps = {
    title: "Test Post Title",
    date: "January 1, 2026",
    onBack: vi.fn(),
    backButtonText: "Back to Home",
  };

  it("renders the title and date correctly", () => {
    render(<PostHero {...mockProps} />);
    expect(screen.getByText("Test Post Title")).toBeInTheDocument();
    expect(screen.getByText("January 1, 2026")).toBeInTheDocument();
  });

  it("renders the back button with correct text", () => {
    render(<PostHero {...mockProps} />);
    expect(screen.getByText("Back to Home")).toBeInTheDocument();
  });

  it("calls onBack when the back button is clicked", () => {
    render(<PostHero {...mockProps} />);
    fireEvent.click(screen.getByText("Back to Home"));
    expect(mockProps.onBack).toHaveBeenCalledTimes(1);
  });
});
