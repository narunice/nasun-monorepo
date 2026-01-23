import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CountingNumber } from "./CountingNumber";

describe("CountingNumber", () => {
  it("renders correctly", () => {
    render(<CountingNumber value="100+" />);
    expect(screen.getByText(/0/i)).toBeInTheDocument(); // Initial value
  });

  // Note: Testing animations often requires more complex setup or E2E tests.
  // This simple test verifies that the component mounts without crashing.
});
