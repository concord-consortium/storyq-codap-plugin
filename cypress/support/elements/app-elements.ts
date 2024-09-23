export const AppElements = {
  getApp() {
    return cy.get(".storyq");
  },
  getWelcome() {
    return cy.get(".storyq .dx-tabpanel-container .sq-welcome")
  }
};
