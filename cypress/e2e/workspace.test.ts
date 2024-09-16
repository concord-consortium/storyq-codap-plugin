import { AppElements as ae } from "../support/elements/app-elements";

context("Test the overall app", () => {
  beforeEach(() => {
    cy.visit("");
  });

  describe("Desktop functionalities", () => {
    it("renders with text", () => {
      ae.getWelcome().invoke("text").should("include", "Welcome to StoryQ!");
    });
  });
});
