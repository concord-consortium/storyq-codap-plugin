import { AppElements as ae } from "../support/elements/app-elements";

context("Test the overall app", () => {
  beforeEach(() => {
    cy.visit("");
  });

  describe("Desktop functionalities", () => {
    it("renders with text", () => {
      ae.getWelcome().invoke("text").should("include", "Welcome to StoryQ!");
    });

    it("renders main and text panes, which can be collapsed", () => {
      ae.getApp().should("exist");
      ae.getTextPane().should("exist");
      ae.getCollapseButtons().should("have.length", 2);

      // Collapse the main pane
      ae.getCollapseButtons().first().click();
      ae.getApp().should("not.exist");
      ae.getTextPane().should("exist");
      ae.getCollapseButtons().should("have.length", 1);

      // Restore main pane
      ae.getCollapseButtons().first().click();
      ae.getApp().should("exist");
      ae.getTextPane().should("exist");
      ae.getCollapseButtons().should("have.length", 2);

      // Collapse text pane
      ae.getCollapseButtons().last().click();
      ae.getApp().should("exist");
      ae.getTextPane().should("not.exist");
      ae.getCollapseButtons().should("have.length", 1);
    });
  });
});
