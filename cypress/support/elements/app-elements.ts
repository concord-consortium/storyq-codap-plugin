export const AppElements = {
  getApp() {
    return cy.get(".storyq");
  },
  getWelcome() {
    return cy.get(".storyq .ui-tabpanel-container .sq-welcome")
  },
  getTextPane() {
    return cy.get(".text-pane");
  },
  getCollapseButtons() {
    return cy.get(".collapse-button");
  }
};
